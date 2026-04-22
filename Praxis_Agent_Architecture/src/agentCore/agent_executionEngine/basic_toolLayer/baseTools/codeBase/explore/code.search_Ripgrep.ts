/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 代码基础工具 / 代码探索工具。
 * 核心目的：提供 代码基础工具 / 代码探索工具 中的“使用 ripgrep 做高速文本检索”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import path from "node:path";

export type CodeSearchRipgrepBoundary = "input" | "contract" | "governance" | "scope" | "execution";

export type CodeSearchRipgrepGate = {
  accepted: boolean;
  reason?: string;
};

export type CodeSearchRipgrepMatch = {
  path: string;
  line: number;
  column?: number;
  text: string;
};

export type CodeSearchRipgrepExecution = {
  exitCode: number;
  matches: readonly CodeSearchRipgrepMatch[];
  stderr?: string;
};

export type CodeSearchRipgrepExecutor = (request: {
  command: readonly string[];
  query: string;
  directoryPath: string;
  maxMatches: number;
}) => CodeSearchRipgrepExecution | Promise<CodeSearchRipgrepExecution>;

export type CodeSearchRipgrepRequest = {
  toolCallId?: string;
  workspaceRoot?: string;
  query?: string;
  directoryPath?: string;
  fileGlob?: string;
  maxMatches?: number;
  literal?: boolean;
  caseSensitive?: boolean;
  includeHidden?: boolean;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  governance?: CodeSearchRipgrepGate;
  dryRun?: boolean;
  executor?: CodeSearchRipgrepExecutor;
  metadata?: Readonly<Record<string, unknown>>;
};

export type CodeSearchRipgrepErrorCode =
  | "MISSING_QUERY"
  | "MISSING_DIRECTORY_PATH"
  | "ABSOLUTE_DIRECTORY_PATH"
  | "DIRECTORY_PATH_OUTSIDE_SCOPE"
  | "NUL_BYTE_IN_PATH"
  | "INVALID_MAX_MATCHES"
  | "SCOPE_DENIED"
  | "GOVERNANCE_REJECTED"
  | "EXECUTOR_NOT_INJECTED"
  | "EXECUTOR_REJECTED"
  | "RIPGREP_FAILED";

export type CodeSearchRipgrepError = {
  code: CodeSearchRipgrepErrorCode;
  message: string;
  boundary: CodeSearchRipgrepBoundary;
  safeForRuntimeInspection: true;
};

export type CodeSearchRipgrepAudit = {
  tool: "code.search_Ripgrep";
  toolCallId: string;
  directoryPath: string;
  workspaceRoot?: string;
  requestedScopes: readonly string[];
  acceptedScopes: readonly string[];
  dryRun: boolean;
  unsafeSideEffects: false;
  metadata: Readonly<Record<string, unknown>>;
};

export type CodeSearchRipgrepPlan = {
  kind: "agentCore.basicTool.code.search_Ripgrep.plan";
  operation: "ripgrep-text-search";
  query: string;
  directoryPath: string;
  fileGlob?: string;
  maxMatches: number;
  command: readonly string[];
  dispatch: "dry-run" | "injected-executor";
  spawnsProcessDirectly: false;
};

export type CodeSearchRipgrepOutput = {
  kind: "agentCore.basicTool.code.search_Ripgrep.output";
  matches: readonly CodeSearchRipgrepMatch[];
  exitCode: number;
  stderr?: string;
  unsafeSideEffects: false;
};

export type CodeSearchRipgrepResult =
  | {
      ok: true;
      plan: CodeSearchRipgrepPlan;
      audit: CodeSearchRipgrepAudit;
      output?: CodeSearchRipgrepOutput;
      events: readonly string[];
    }
  | {
      ok: false;
      error: CodeSearchRipgrepError;
      events: readonly string[];
    };

export const codeSearchRipgrepDescriptor = {
  tool: "code.search_Ripgrep",
  route: "agent_executionEngine.basic_toolLayer.baseTools.codeBase.explore",
  purpose: "prepare or run a governed ripgrep search through an injected process envelope",
  defaultDispatch: "dry-run",
  unsafeSideEffects: false,
} as const;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(
  code: CodeSearchRipgrepErrorCode,
  message: string,
  boundary: CodeSearchRipgrepBoundary,
): CodeSearchRipgrepResult {
  return {
    ok: false,
    error: { code, message, boundary, safeForRuntimeInspection: true },
    events: ["code.search_Ripgrep.rejected"],
  };
}

function normalizeRelativeDirectory(directoryPath: string): string | CodeSearchRipgrepResult {
  if (directoryPath.includes("\0")) {
    return failure("NUL_BYTE_IN_PATH", "code.search_Ripgrep directoryPath cannot contain NUL bytes", "input");
  }

  const trimmed = directoryPath.trim();
  if (path.isAbsolute(trimmed)) {
    return failure(
      "ABSOLUTE_DIRECTORY_PATH",
      "code.search_Ripgrep only accepts workspace-relative directoryPath",
      "scope",
    );
  }

  const normalized = path.posix.normalize(trimmed.replaceAll("\\", "/"));
  if (normalized === ".." || normalized.startsWith("../")) {
    return failure(
      "DIRECTORY_PATH_OUTSIDE_SCOPE",
      "code.search_Ripgrep directoryPath must stay inside the workspace scope",
      "scope",
    );
  }

  return normalized === "." ? "." : normalized;
}

function normalizeMaxMatches(maxMatches: number | undefined): number | CodeSearchRipgrepResult {
  const resolved = maxMatches ?? 50;
  if (!Number.isInteger(resolved) || resolved < 1) {
    return failure("INVALID_MAX_MATCHES", "code.search_Ripgrep maxMatches must be a positive integer", "input");
  }

  return resolved;
}

function resolveAcceptedScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): readonly string[] | CodeSearchRipgrepResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);

  if (requested.length === 0) {
    return [];
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure("SCOPE_DENIED", `code.search_Ripgrep scope ${denied[0]} is outside runtime governance`, "scope");
  }

  return requested;
}

function buildRipgrepCommand(request: {
  query: string;
  directoryPath: string;
  fileGlob?: string;
  maxMatches: number;
  literal: boolean;
  caseSensitive: boolean;
  includeHidden: boolean;
}): readonly string[] {
  const command = ["rg", "--json", "--max-count", String(request.maxMatches)];

  if (request.literal) {
    command.push("--fixed-strings");
  }

  if (!request.caseSensitive) {
    command.push("--ignore-case");
  }

  if (request.includeHidden) {
    command.push("--hidden");
  }

  if (request.fileGlob !== undefined) {
    command.push("--glob", request.fileGlob);
  }

  command.push("--", request.query, request.directoryPath);
  return command;
}

export async function planCodeSearchRipgrep(
  request: CodeSearchRipgrepRequest = {},
): Promise<CodeSearchRipgrepResult> {
  if (isBlank(request.query)) {
    return failure("MISSING_QUERY", "code.search_Ripgrep requires a query", "input");
  }

  if (isBlank(request.directoryPath)) {
    return failure("MISSING_DIRECTORY_PATH", "code.search_Ripgrep requires a directoryPath", "input");
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "code.search_Ripgrep was rejected by runtime governance",
      "governance",
    );
  }

  const query = request.query?.trim() ?? "";
  const directoryPath = normalizeRelativeDirectory(request.directoryPath ?? "");
  if (typeof directoryPath !== "string") {
    return directoryPath;
  }

  const maxMatches = normalizeMaxMatches(request.maxMatches);
  if (typeof maxMatches !== "number") {
    return maxMatches;
  }

  const acceptedScopes = resolveAcceptedScopes(request.requestedScopes, request.allowedScopes);
  if ("ok" in acceptedScopes) {
    return acceptedScopes;
  }

  const dispatch = request.dryRun === false ? "injected-executor" : "dry-run";
  if (dispatch === "injected-executor" && request.executor === undefined) {
    return failure(
      "EXECUTOR_NOT_INJECTED",
      "code.search_Ripgrep requires an injected executor when dryRun is false",
      "execution",
    );
  }

  const fileGlob = request.fileGlob?.trim() || undefined;
  const command = buildRipgrepCommand({
    query,
    directoryPath,
    fileGlob,
    maxMatches,
    literal: request.literal ?? true,
    caseSensitive: request.caseSensitive ?? true,
    includeHidden: request.includeHidden ?? false,
  });
  const audit: CodeSearchRipgrepAudit = {
    tool: "code.search_Ripgrep",
    toolCallId: request.toolCallId?.trim() || "code.search_Ripgrep:dry-run",
    directoryPath,
    workspaceRoot: request.workspaceRoot?.trim() || undefined,
    requestedScopes: cleanList(request.requestedScopes),
    acceptedScopes,
    dryRun: dispatch === "dry-run",
    unsafeSideEffects: false,
    metadata: request.metadata ?? {},
  };
  const plan: CodeSearchRipgrepPlan = {
    kind: "agentCore.basicTool.code.search_Ripgrep.plan",
    operation: "ripgrep-text-search",
    query,
    directoryPath,
    fileGlob,
    maxMatches,
    command,
    dispatch,
    spawnsProcessDirectly: false,
  };

  if (dispatch === "dry-run") {
    return { ok: true, plan, audit, events: ["code.search_Ripgrep.planned"] };
  }

  try {
    const execution = await request.executor?.({ command, query, directoryPath, maxMatches });
    if (execution === undefined) {
      return failure("EXECUTOR_REJECTED", "code.search_Ripgrep injected executor returned no execution envelope", "execution");
    }

    if (execution.exitCode > 1) {
      return failure(
        "RIPGREP_FAILED",
        execution.stderr ?? `ripgrep exited with code ${execution.exitCode}`,
        "execution",
      );
    }

    return {
      ok: true,
      plan,
      audit,
      output: {
        kind: "agentCore.basicTool.code.search_Ripgrep.output",
        matches: execution.matches.slice(0, maxMatches),
        exitCode: execution.exitCode,
        stderr: execution.stderr,
        unsafeSideEffects: false,
      },
      events: ["code.search_Ripgrep.injectedExecutorCompleted"],
    };
  } catch (error) {
    return failure(
      "EXECUTOR_REJECTED",
      error instanceof Error ? error.message : "code.search_Ripgrep injected executor rejected the request",
      "execution",
    );
  }
}
