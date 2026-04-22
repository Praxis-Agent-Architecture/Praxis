/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / Git 基础工具 / Git 检查。
 * 核心目的：提供 Git 基础工具 / Git 检查 中的“读取工作树差异”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import path from "node:path";

export type GetWorkingTreeDiffBoundary = "input" | "contract" | "governance" | "scope" | "resource";

export type GetWorkingTreeDiffGate = {
  accepted: boolean;
  reason?: string;
};

export type WorkingTreeDiffMode = "unstaged" | "staged" | "combined";

export type GetWorkingTreeDiffRequest = {
  runtimeId?: string;
  invocationId?: string;
  repositoryPath?: string;
  mode?: WorkingTreeDiffMode;
  compareRef?: string;
  pathspecs?: readonly string[];
  contextLines?: number;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  dryRun?: boolean;
  contract?: GetWorkingTreeDiffGate;
  governance?: GetWorkingTreeDiffGate;
  metadata?: Readonly<Record<string, unknown>>;
};

export type GetWorkingTreeDiffErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_REPOSITORY_PATH"
  | "REPOSITORY_PATH_OUTSIDE_SCOPE"
  | "NUL_BYTE_IN_PATH"
  | "INVALID_DIFF_MODE"
  | "INVALID_COMPARE_REF"
  | "PATHSPEC_OUTSIDE_SCOPE"
  | "INVALID_CONTEXT_LINES"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "REAL_SIDE_EFFECT_NOT_ALLOWED";

export type GetWorkingTreeDiffError = {
  code: GetWorkingTreeDiffErrorCode;
  message: string;
  boundary: GetWorkingTreeDiffBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type GetWorkingTreeDiffPlan = {
  toolKind: "git.getWorkingTreeDiff";
  runtimeId: string;
  invocationId: string;
  repositoryPath: string;
  mode: WorkingTreeDiffMode;
  compareRef?: string;
  pathspecs: readonly string[];
  contextLines?: number;
  commandPreview: readonly string[];
  requiredPermissions: readonly ["git:diff:read", "filesystem:read"];
  acceptedScopes: readonly string[];
  dispatch: "dry-run";
  dryRun: true;
  wouldReadWorkingTree: true;
  unsafeSideEffects: false;
  audit: {
    guard: "repo-scope-and-diff-audit";
    event: "basicTool.git.getWorkingTreeDiff.planned";
    governanceRequired: true;
    tapCanWrap: true;
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type GetWorkingTreeDiffResult =
  | {
      ok: true;
      plan: GetWorkingTreeDiffPlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: GetWorkingTreeDiffError;
      events: readonly string[];
    };

export const getWorkingTreeDiffDescriptor = {
  toolKind: "git.getWorkingTreeDiff",
  capability: "read-working-tree-diff",
  layer: "agent_executionEngine.basic_toolLayer.baseTools.gitBase.inspection",
  supportedModes: ["unstaged", "staged", "combined"],
  defaultMode: "unstaged",
  defaultDispatch: "dry-run",
  requiresTapApproval: true,
  unsafeSideEffects: false,
} as const;

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function cleanList(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(
  code: GetWorkingTreeDiffErrorCode,
  message: string,
  boundary: GetWorkingTreeDiffBoundary,
): GetWorkingTreeDiffResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["basicTool.git.getWorkingTreeDiff.rejected"],
  };
}

function normalizeRepositoryPath(value: string): string | GetWorkingTreeDiffResult {
  if (value.includes("\0")) {
    return failure("NUL_BYTE_IN_PATH", "git.getWorkingTreeDiff repositoryPath cannot contain NUL bytes", "input");
  }

  const trimmed = value.trim();
  if (path.isAbsolute(trimmed)) {
    return failure(
      "REPOSITORY_PATH_OUTSIDE_SCOPE",
      "git.getWorkingTreeDiff repositoryPath must be workspace-relative",
      "scope",
    );
  }

  const normalized = path.posix.normalize(trimmed.replaceAll("\\", "/"));
  if (normalized === ".." || normalized.startsWith("../")) {
    return failure(
      "REPOSITORY_PATH_OUTSIDE_SCOPE",
      "git.getWorkingTreeDiff repositoryPath must stay inside the workspace scope",
      "scope",
    );
  }

  return normalized.length === 0 ? "." : normalized;
}

function normalizePathspec(value: string): string | GetWorkingTreeDiffResult {
  if (value.includes("\0")) {
    return failure("NUL_BYTE_IN_PATH", "git.getWorkingTreeDiff pathspecs cannot contain NUL bytes", "input");
  }

  const trimmed = value.trim();
  if (path.isAbsolute(trimmed)) {
    return failure("PATHSPEC_OUTSIDE_SCOPE", "git.getWorkingTreeDiff pathspecs must be repository-relative", "scope");
  }

  const normalized = path.posix.normalize(trimmed.replaceAll("\\", "/"));
  if (normalized === ".." || normalized.startsWith("../")) {
    return failure("PATHSPEC_OUTSIDE_SCOPE", "git.getWorkingTreeDiff pathspecs must stay inside the repository", "scope");
  }

  return normalized === "." ? "." : normalized.replace(/\/$/, "");
}

function normalizePathspecs(pathspecs: readonly string[] | undefined): string[] | GetWorkingTreeDiffResult {
  const normalized: string[] = [];
  for (const pathspec of cleanList(pathspecs)) {
    const safePathspec = normalizePathspec(pathspec);
    if (typeof safePathspec !== "string") {
      return safePathspec;
    }

    normalized.push(safePathspec);
  }

  return [...new Set(normalized)];
}

function normalizeMode(mode: WorkingTreeDiffMode | undefined): WorkingTreeDiffMode | GetWorkingTreeDiffResult {
  const resolved = mode ?? getWorkingTreeDiffDescriptor.defaultMode;
  if (!getWorkingTreeDiffDescriptor.supportedModes.includes(resolved)) {
    return failure("INVALID_DIFF_MODE", "git.getWorkingTreeDiff mode is not supported", "input");
  }

  return resolved;
}

function normalizeCompareRef(compareRef: string | undefined): string | undefined | GetWorkingTreeDiffResult {
  const ref = compareRef?.trim();
  if (ref === undefined || ref.length === 0) {
    return undefined;
  }

  if (ref.includes("\0") || /\s/.test(ref) || ref.startsWith("-")) {
    return failure("INVALID_COMPARE_REF", "git.getWorkingTreeDiff compareRef must be a safe git ref", "input");
  }

  return ref;
}

function normalizeContextLines(contextLines: number | undefined): number | undefined | GetWorkingTreeDiffResult {
  if (contextLines === undefined) {
    return undefined;
  }

  if (!Number.isInteger(contextLines) || contextLines < 0 || contextLines > 1000) {
    return failure("INVALID_CONTEXT_LINES", "git.getWorkingTreeDiff contextLines must be an integer from 0 to 1000", "resource");
  }

  return contextLines;
}

function resolveScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): string[] | GetWorkingTreeDiffResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);

  if (requested.length === 0) {
    return [];
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure("SCOPE_DENIED", `git.getWorkingTreeDiff scope ${denied[0]} is outside runtime governance`, "scope");
  }

  return requested;
}

function buildDiffCommand(plan: {
  repositoryPath: string;
  mode: WorkingTreeDiffMode;
  compareRef?: string;
  pathspecs: readonly string[];
  contextLines?: number;
}): readonly string[] {
  const command = ["git", "-C", plan.repositoryPath, "diff"];

  if (plan.contextLines !== undefined) {
    command.push(`--unified=${plan.contextLines}`);
  }

  if (plan.compareRef !== undefined) {
    command.push(plan.compareRef);
  } else if (plan.mode === "staged") {
    command.push("--staged");
  } else if (plan.mode === "combined") {
    command.push("HEAD");
  }

  if (plan.pathspecs.length > 0) {
    command.push("--", ...plan.pathspecs);
  }

  return command;
}

export function planGetWorkingTreeDiff(request: GetWorkingTreeDiffRequest = {}): GetWorkingTreeDiffResult {
  if (!hasText(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "git.getWorkingTreeDiff requires runtimeId", "input");
  }

  if (!hasText(request.repositoryPath)) {
    return failure("MISSING_REPOSITORY_PATH", "git.getWorkingTreeDiff requires repositoryPath", "input");
  }

  if (request.dryRun === false) {
    return failure(
      "REAL_SIDE_EFFECT_NOT_ALLOWED",
      "first-round git.getWorkingTreeDiff only creates a guarded dry-run diff plan",
      "governance",
    );
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "git.getWorkingTreeDiff was rejected by runtime contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "git.getWorkingTreeDiff was rejected by runtime governance",
      "governance",
    );
  }

  const repositoryPath = normalizeRepositoryPath(request.repositoryPath);
  if (typeof repositoryPath !== "string") {
    return repositoryPath;
  }

  const mode = normalizeMode(request.mode);
  if (typeof mode !== "string") {
    return mode;
  }

  const compareRef = normalizeCompareRef(request.compareRef);
  if (compareRef !== undefined && typeof compareRef !== "string") {
    return compareRef;
  }

  const pathspecs = normalizePathspecs(request.pathspecs);
  if (!Array.isArray(pathspecs)) {
    return pathspecs;
  }

  const contextLines = normalizeContextLines(request.contextLines);
  if (contextLines !== undefined && typeof contextLines !== "number") {
    return contextLines;
  }

  const acceptedScopes = resolveScopes(request.requestedScopes, request.allowedScopes);
  if (!Array.isArray(acceptedScopes)) {
    return acceptedScopes;
  }

  const runtimeId = request.runtimeId.trim();
  const planBase = {
    repositoryPath,
    mode,
    compareRef,
    pathspecs,
    contextLines,
  };

  return {
    ok: true,
    plan: {
      toolKind: "git.getWorkingTreeDiff",
      runtimeId,
      invocationId: request.invocationId?.trim() || `${runtimeId}:git.getWorkingTreeDiff:${mode}`,
      ...planBase,
      commandPreview: buildDiffCommand(planBase),
      requiredPermissions: ["git:diff:read", "filesystem:read"],
      acceptedScopes,
      dispatch: "dry-run",
      dryRun: true,
      wouldReadWorkingTree: true,
      unsafeSideEffects: false,
      audit: {
        guard: "repo-scope-and-diff-audit",
        event: "basicTool.git.getWorkingTreeDiff.planned",
        governanceRequired: true,
        tapCanWrap: true,
        metadata: request.metadata ?? {},
      },
    },
    events: ["basicTool.git.getWorkingTreeDiff.planned"],
  };
}
