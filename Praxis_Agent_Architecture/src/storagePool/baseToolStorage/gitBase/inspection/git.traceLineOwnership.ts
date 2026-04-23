/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / Git 基础工具 / Git 检查。
 * 核心目的：提供 Git 基础工具 / Git 检查 中的“追踪代码行归属”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import path from "node:path";

export type TraceLineOwnershipBoundary = "input" | "contract" | "governance" | "scope";

export type TraceLineOwnershipGate = {
  accepted: boolean;
  reason?: string;
};

export type TraceLineOwnershipRange = {
  startLine: number;
  endLine: number;
};

export type TraceLineOwnershipRequest = {
  runtimeId?: string;
  invocationId?: string;
  repositoryPath?: string;
  filePath?: string;
  range?: TraceLineOwnershipRange;
  revision?: string;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  dryRun?: boolean;
  contract?: TraceLineOwnershipGate;
  governance?: TraceLineOwnershipGate;
  metadata?: Readonly<Record<string, unknown>>;
};

export type TraceLineOwnershipErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_REPOSITORY_PATH"
  | "REPOSITORY_PATH_OUTSIDE_SCOPE"
  | "NUL_BYTE_IN_PATH"
  | "MISSING_FILE_PATH"
  | "FILE_PATH_OUTSIDE_SCOPE"
  | "INVALID_LINE_RANGE"
  | "INVALID_REVISION"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "REAL_SIDE_EFFECT_NOT_ALLOWED";

export type TraceLineOwnershipError = {
  code: TraceLineOwnershipErrorCode;
  message: string;
  boundary: TraceLineOwnershipBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type TraceLineOwnershipPlan = {
  toolKind: "git.traceLineOwnership";
  runtimeId: string;
  invocationId: string;
  repositoryPath: string;
  filePath: string;
  range: TraceLineOwnershipRange;
  revision?: string;
  commandPreview: readonly string[];
  requiredPermissions: readonly ["git:history:read", "filesystem:read"];
  acceptedScopes: readonly string[];
  dispatch: "dry-run";
  dryRun: true;
  wouldReadBlameMetadata: true;
  unsafeSideEffects: false;
  audit: {
    guard: "repo-scope-file-range-and-blame-audit";
    event: "basicTool.git.traceLineOwnership.planned";
    governanceRequired: true;
    tapCanWrap: true;
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type TraceLineOwnershipResult =
  | {
      ok: true;
      plan: TraceLineOwnershipPlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: TraceLineOwnershipError;
      events: readonly string[];
    };

export const traceLineOwnershipDescriptor = {
  toolKind: "git.traceLineOwnership",
  capability: "trace-line-ownership",
  layer: "agent_executionEngine.basic_toolLayer.baseTools.gitBase.inspection",
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
  code: TraceLineOwnershipErrorCode,
  message: string,
  boundary: TraceLineOwnershipBoundary,
): TraceLineOwnershipResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["basicTool.git.traceLineOwnership.rejected"],
  };
}

function normalizeRepositoryPath(repositoryPath: string): string | TraceLineOwnershipResult {
  if (repositoryPath.includes("\0")) {
    return failure("NUL_BYTE_IN_PATH", "git.traceLineOwnership repositoryPath cannot contain NUL bytes", "input");
  }

  const trimmed = repositoryPath.trim();
  if (path.isAbsolute(trimmed)) {
    return failure(
      "REPOSITORY_PATH_OUTSIDE_SCOPE",
      "git.traceLineOwnership repositoryPath must be workspace-relative",
      "scope",
    );
  }

  const normalized = path.posix.normalize(trimmed.replaceAll("\\", "/"));
  if (normalized === ".." || normalized.startsWith("../")) {
    return failure(
      "REPOSITORY_PATH_OUTSIDE_SCOPE",
      "git.traceLineOwnership repositoryPath must stay inside the workspace scope",
      "scope",
    );
  }

  return normalized === "." ? "." : normalized.replace(/\/$/, "");
}

function normalizeFilePath(filePath: string | undefined): string | TraceLineOwnershipResult {
  if (!hasText(filePath)) {
    return failure("MISSING_FILE_PATH", "git.traceLineOwnership requires filePath", "input");
  }

  if (filePath.includes("\0")) {
    return failure("NUL_BYTE_IN_PATH", "git.traceLineOwnership filePath cannot contain NUL bytes", "input");
  }

  const trimmed = filePath.trim();
  if (path.isAbsolute(trimmed)) {
    return failure("FILE_PATH_OUTSIDE_SCOPE", "git.traceLineOwnership filePath must be repository-relative", "scope");
  }

  const normalized = path.posix.normalize(trimmed.replaceAll("\\", "/"));
  if (normalized === "." || normalized === ".." || normalized.startsWith("../")) {
    return failure("FILE_PATH_OUTSIDE_SCOPE", "git.traceLineOwnership filePath must stay inside the repository", "scope");
  }

  return normalized.replace(/\/$/, "");
}

function normalizeRange(range: TraceLineOwnershipRange | undefined): TraceLineOwnershipRange | TraceLineOwnershipResult {
  if (
    range === undefined ||
    !Number.isInteger(range.startLine) ||
    !Number.isInteger(range.endLine) ||
    range.startLine < 1 ||
    range.endLine < range.startLine
  ) {
    return failure("INVALID_LINE_RANGE", "git.traceLineOwnership requires a positive inclusive line range", "input");
  }

  return { startLine: range.startLine, endLine: range.endLine };
}

function normalizeRevision(revision: string | undefined): string | undefined | TraceLineOwnershipResult {
  const ref = revision?.trim();
  if (ref === undefined || ref.length === 0) {
    return undefined;
  }

  if (ref.includes("\0") || /\s/.test(ref) || ref.startsWith("-")) {
    return failure("INVALID_REVISION", "git.traceLineOwnership revision must be a safe git ref", "input");
  }

  return ref;
}

function resolveScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): string[] | TraceLineOwnershipResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);

  if (requested.length === 0) {
    return [];
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure("SCOPE_DENIED", `git.traceLineOwnership scope ${denied[0]} is outside runtime governance`, "scope");
  }

  return requested;
}

function buildBlameCommand(plan: {
  repositoryPath: string;
  filePath: string;
  range: TraceLineOwnershipRange;
  revision?: string;
}): readonly string[] {
  return [
    "git",
    "-C",
    plan.repositoryPath,
    "blame",
    "--line-porcelain",
    "-L",
    `${plan.range.startLine},${plan.range.endLine}`,
    ...(plan.revision === undefined ? [] : [plan.revision]),
    "--",
    plan.filePath,
  ];
}

export function planTraceLineOwnership(
  request: TraceLineOwnershipRequest = {},
): TraceLineOwnershipResult {
  if (!hasText(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "git.traceLineOwnership requires runtimeId", "input");
  }

  if (!hasText(request.repositoryPath)) {
    return failure("MISSING_REPOSITORY_PATH", "git.traceLineOwnership requires repositoryPath", "input");
  }

  if (request.dryRun === false) {
    return failure(
      "REAL_SIDE_EFFECT_NOT_ALLOWED",
      "first-round git.traceLineOwnership only creates a guarded dry-run blame plan",
      "governance",
    );
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "git.traceLineOwnership was rejected by runtime contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "git.traceLineOwnership was rejected by runtime governance",
      "governance",
    );
  }

  const repositoryPath = normalizeRepositoryPath(request.repositoryPath);
  if (typeof repositoryPath !== "string") {
    return repositoryPath;
  }

  const filePath = normalizeFilePath(request.filePath);
  if (typeof filePath !== "string") {
    return filePath;
  }

  const range = normalizeRange(request.range);
  if ("ok" in range) {
    return range;
  }

  const revision = normalizeRevision(request.revision);
  if (revision !== undefined && typeof revision !== "string") {
    return revision;
  }

  const acceptedScopes = resolveScopes(request.requestedScopes, request.allowedScopes);
  if (!Array.isArray(acceptedScopes)) {
    return acceptedScopes;
  }

  const runtimeId = request.runtimeId.trim();
  const planBase = { repositoryPath, filePath, range, revision };

  return {
    ok: true,
    plan: {
      toolKind: "git.traceLineOwnership",
      runtimeId,
      invocationId: request.invocationId?.trim() || `${runtimeId}:git.traceLineOwnership:${filePath}`,
      ...planBase,
      commandPreview: buildBlameCommand(planBase),
      requiredPermissions: ["git:history:read", "filesystem:read"],
      acceptedScopes,
      dispatch: "dry-run",
      dryRun: true,
      wouldReadBlameMetadata: true,
      unsafeSideEffects: false,
      audit: {
        guard: "repo-scope-file-range-and-blame-audit",
        event: "basicTool.git.traceLineOwnership.planned",
        governanceRequired: true,
        tapCanWrap: true,
        metadata: request.metadata ?? {},
      },
    },
    events: ["basicTool.git.traceLineOwnership.planned"],
  };
}
