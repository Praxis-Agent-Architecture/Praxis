/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 代码基础工具 / 代码探索工具。
 * 核心目的：提供 代码基础工具 / 代码探索工具 中的“扫描目录或代码结构”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import path from "node:path";

export type CodeScanBoundary = "input" | "contract" | "governance" | "scope" | "execution";

export type CodeScanGate = {
  accepted: boolean;
  reason?: string;
};

export type CodeScanEntry = {
  path: string;
  kind: "file" | "directory" | "symbol" | "unknown";
  sizeBytes?: number;
  language?: string;
};

export type CodeScanProvider = (request: {
  directoryPath: string;
  maxEntries: number;
  includeGlobs: readonly string[];
  excludeGlobs: readonly string[];
}) => readonly CodeScanEntry[] | Promise<readonly CodeScanEntry[]>;

export type CodeScanRequest = {
  toolCallId?: string;
  workspaceRoot?: string;
  directoryPath?: string;
  maxEntries?: number;
  includeGlobs?: readonly string[];
  excludeGlobs?: readonly string[];
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  governance?: CodeScanGate;
  dryRun?: boolean;
  scanner?: CodeScanProvider;
  metadata?: Readonly<Record<string, unknown>>;
};

export type CodeScanErrorCode =
  | "MISSING_DIRECTORY_PATH"
  | "ABSOLUTE_DIRECTORY_PATH"
  | "DIRECTORY_PATH_OUTSIDE_SCOPE"
  | "NUL_BYTE_IN_PATH"
  | "INVALID_MAX_ENTRIES"
  | "SCOPE_DENIED"
  | "GOVERNANCE_REJECTED"
  | "SCANNER_NOT_INJECTED"
  | "SCANNER_REJECTED";

export type CodeScanError = {
  code: CodeScanErrorCode;
  message: string;
  boundary: CodeScanBoundary;
  safeForRuntimeInspection: true;
};

export type CodeScanAudit = {
  tool: "code.scan";
  toolCallId: string;
  directoryPath: string;
  workspaceRoot?: string;
  requestedScopes: readonly string[];
  acceptedScopes: readonly string[];
  dryRun: boolean;
  unsafeSideEffects: false;
  metadata: Readonly<Record<string, unknown>>;
};

export type CodeScanPlan = {
  kind: "agentCore.basicTool.code.scan.plan";
  operation: "scan-directory-or-code-structure";
  directoryPath: string;
  maxEntries: number;
  includeGlobs: readonly string[];
  excludeGlobs: readonly string[];
  dispatch: "dry-run" | "injected-scanner";
  scansFileSystemDirectly: false;
};

export type CodeScanOutput = {
  kind: "agentCore.basicTool.code.scan.output";
  directoryPath: string;
  entries: readonly CodeScanEntry[];
  truncated: boolean;
  unsafeSideEffects: false;
};

export type CodeScanResult =
  | {
      ok: true;
      plan: CodeScanPlan;
      audit: CodeScanAudit;
      output?: CodeScanOutput;
      events: readonly string[];
    }
  | {
      ok: false;
      error: CodeScanError;
      events: readonly string[];
    };

export const codeScanDescriptor = {
  tool: "code.scan",
  route: "agent_executionEngine.basic_toolLayer.baseTools.codeBase.explore",
  purpose: "prepare or run a governed directory/code-structure scan through an injected scanner envelope",
  defaultDispatch: "dry-run",
  unsafeSideEffects: false,
} as const;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(code: CodeScanErrorCode, message: string, boundary: CodeScanBoundary): CodeScanResult {
  return {
    ok: false,
    error: { code, message, boundary, safeForRuntimeInspection: true },
    events: ["code.scan.rejected"],
  };
}

function normalizeRelativeDirectory(directoryPath: string): string | CodeScanResult {
  if (directoryPath.includes("\0")) {
    return failure("NUL_BYTE_IN_PATH", "code.scan directoryPath cannot contain NUL bytes", "input");
  }

  const trimmed = directoryPath.trim();
  if (path.isAbsolute(trimmed)) {
    return failure("ABSOLUTE_DIRECTORY_PATH", "code.scan only accepts workspace-relative directoryPath", "scope");
  }

  const normalized = path.posix.normalize(trimmed.replaceAll("\\", "/"));
  if (normalized === ".." || normalized.startsWith("../")) {
    return failure("DIRECTORY_PATH_OUTSIDE_SCOPE", "code.scan directoryPath must stay inside the workspace scope", "scope");
  }

  return normalized === "." ? "." : normalized;
}

function normalizeMaxEntries(maxEntries: number | undefined): number | CodeScanResult {
  const resolved = maxEntries ?? 200;
  if (!Number.isInteger(resolved) || resolved < 1) {
    return failure("INVALID_MAX_ENTRIES", "code.scan maxEntries must be a positive integer", "input");
  }

  return resolved;
}

function resolveAcceptedScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): readonly string[] | CodeScanResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);

  if (requested.length === 0) {
    return [];
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure("SCOPE_DENIED", `code.scan scope ${denied[0]} is outside runtime governance`, "scope");
  }

  return requested;
}

export async function planCodeScan(request: CodeScanRequest = {}): Promise<CodeScanResult> {
  if (isBlank(request.directoryPath)) {
    return failure("MISSING_DIRECTORY_PATH", "code.scan requires a directoryPath", "input");
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "code.scan was rejected by runtime governance",
      "governance",
    );
  }

  const directoryPath = normalizeRelativeDirectory(request.directoryPath ?? "");
  if (typeof directoryPath !== "string") {
    return directoryPath;
  }

  const maxEntries = normalizeMaxEntries(request.maxEntries);
  if (typeof maxEntries !== "number") {
    return maxEntries;
  }

  const acceptedScopes = resolveAcceptedScopes(request.requestedScopes, request.allowedScopes);
  if ("ok" in acceptedScopes) {
    return acceptedScopes;
  }

  const dispatch = request.dryRun === false ? "injected-scanner" : "dry-run";
  if (dispatch === "injected-scanner" && request.scanner === undefined) {
    return failure("SCANNER_NOT_INJECTED", "code.scan requires an injected scanner when dryRun is false", "execution");
  }

  const includeGlobs = cleanList(request.includeGlobs);
  const excludeGlobs = cleanList(request.excludeGlobs);
  const audit: CodeScanAudit = {
    tool: "code.scan",
    toolCallId: request.toolCallId?.trim() || "code.scan:dry-run",
    directoryPath,
    workspaceRoot: request.workspaceRoot?.trim() || undefined,
    requestedScopes: cleanList(request.requestedScopes),
    acceptedScopes,
    dryRun: dispatch === "dry-run",
    unsafeSideEffects: false,
    metadata: request.metadata ?? {},
  };
  const plan: CodeScanPlan = {
    kind: "agentCore.basicTool.code.scan.plan",
    operation: "scan-directory-or-code-structure",
    directoryPath,
    maxEntries,
    includeGlobs,
    excludeGlobs,
    dispatch,
    scansFileSystemDirectly: false,
  };

  if (dispatch === "dry-run") {
    return { ok: true, plan, audit, events: ["code.scan.planned"] };
  }

  try {
    const entries = [...((await request.scanner?.({ directoryPath, maxEntries, includeGlobs, excludeGlobs })) ?? [])];
    return {
      ok: true,
      plan,
      audit,
      output: {
        kind: "agentCore.basicTool.code.scan.output",
        directoryPath,
        entries: entries.slice(0, maxEntries),
        truncated: entries.length > maxEntries,
        unsafeSideEffects: false,
      },
      events: ["code.scan.injectedScannerCompleted"],
    };
  } catch (error) {
    return failure(
      "SCANNER_REJECTED",
      error instanceof Error ? error.message : "code.scan injected scanner rejected the request",
      "execution",
    );
  }
}
