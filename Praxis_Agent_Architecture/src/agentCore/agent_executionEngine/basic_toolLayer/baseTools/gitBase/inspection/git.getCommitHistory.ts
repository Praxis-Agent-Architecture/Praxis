/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / Git 基础工具 / Git 检查。
 * 核心目的：提供 Git 基础工具 / Git 检查 中的“读取提交历史”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type GitGetCommitHistoryPermission = "git:read" | "filesystem:read";

export type GitGetCommitHistoryErrorBoundary = "input" | "scope" | "permission" | "contract";

export type GitGetCommitHistoryContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  allowedRepositoryRoots?: readonly string[];
  grantedPermissions?: readonly GitGetCommitHistoryPermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type GitGetCommitHistoryTarget = {
  repositoryPath: string;
  maxCount: number;
  ref?: string;
  pathFilter?: string;
};

export type GitGetCommitHistoryRequest = {
  target?: Partial<GitGetCommitHistoryTarget>;
  context?: GitGetCommitHistoryContext;
};

export type GitCommitHistoryEntryEnvelope = {
  fullHash: string;
  shortHash: string;
  authorName: string;
  authorEmail: string;
  authoredAt: string;
  subject: string;
};

export type GitGetCommitHistoryErrorCode =
  | "MISSING_REPOSITORY_PATH"
  | "INVALID_MAX_COUNT"
  | "UNSAFE_REF"
  | "UNSAFE_PATH_FILTER"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "REAL_EXECUTION_BLOCKED";

export type GitGetCommitHistoryError = {
  code: GitGetCommitHistoryErrorCode;
  message: string;
  boundary: GitGetCommitHistoryErrorBoundary;
  publicSafe: true;
};

export type GitGetCommitHistoryAuditEvent = {
  type: string;
  toolId: "git.getCommitHistory";
  invocationId: string;
  dryRun: boolean;
  repositoryPath?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type GitGetCommitHistoryOutput = {
  kind: "agentCore.basicTool.git.getCommitHistory";
  target: GitGetCommitHistoryTarget;
  commandPreview: readonly string[];
  dryRun: true;
  executionBlocked: true;
  permissionsRequired: readonly GitGetCommitHistoryPermission[];
  unsafeSideEffects: false;
  resultEnvelope: {
    parser: "git-log-unit-separator-v1";
    entries: readonly GitCommitHistoryEntryEnvelope[];
  };
};

export type GitGetCommitHistoryResult =
  | {
      ok: true;
      toolId: "git.getCommitHistory";
      output: GitGetCommitHistoryOutput;
      audit: readonly GitGetCommitHistoryAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "git.getCommitHistory";
      error: GitGetCommitHistoryError;
      audit: readonly GitGetCommitHistoryAuditEvent[];
      events: readonly string[];
    };

export const gitGetCommitHistoryDescriptor = {
  toolId: "git.getCommitHistory",
  capability: "get-commit-history",
  route: "agent_executionEngine.basic_toolLayer.baseTools.gitBase.inspection",
  defaultDryRun: true,
  tapOwnsApproval: true,
  permissionsRequired: ["git:read", "filesystem:read"],
  defaultMaxCount: 20,
  maxAllowedCount: 200,
} as const;

function cleanList<T extends string>(values: readonly T[] | undefined): readonly T[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean) as T[])];
}

function dryRunEnabled(context: GitGetCommitHistoryContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: GitGetCommitHistoryContext | undefined): string {
  return context?.invocationId?.trim() || "git.getCommitHistory:dry-run";
}

function auditEvent(
  type: string,
  context: GitGetCommitHistoryContext | undefined,
  repositoryPath?: string,
  metadata?: Readonly<Record<string, unknown>>,
): GitGetCommitHistoryAuditEvent {
  return {
    type,
    toolId: gitGetCommitHistoryDescriptor.toolId,
    invocationId: invocationId(context),
    dryRun: dryRunEnabled(context),
    repositoryPath,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: GitGetCommitHistoryErrorCode,
  message: string,
  boundary: GitGetCommitHistoryErrorBoundary,
  context: GitGetCommitHistoryContext | undefined,
  repositoryPath?: string,
): GitGetCommitHistoryResult {
  return {
    ok: false,
    toolId: gitGetCommitHistoryDescriptor.toolId,
    error: { code, message, boundary, publicSafe: true },
    audit: [auditEvent("agentCore.basicTool.git.getCommitHistory.rejected", context, repositoryPath, { code })],
    events: ["basicTool.git.getCommitHistory.rejected"],
  };
}

function normalizeRepositoryPath(
  repositoryPath: string | undefined,
  context: GitGetCommitHistoryContext | undefined,
): string | GitGetCommitHistoryResult {
  const normalized = repositoryPath?.trim() ?? "";
  if (normalized.length === 0) {
    return failure(
      "MISSING_REPOSITORY_PATH",
      "git.getCommitHistory requires target.repositoryPath",
      "input",
      context,
      repositoryPath,
    );
  }

  return normalized;
}

function normalizeMaxCount(
  maxCount: number | undefined,
  context: GitGetCommitHistoryContext | undefined,
  repositoryPath: string,
): number | GitGetCommitHistoryResult {
  const normalized = maxCount ?? gitGetCommitHistoryDescriptor.defaultMaxCount;
  if (!Number.isInteger(normalized) || normalized < 1 || normalized > gitGetCommitHistoryDescriptor.maxAllowedCount) {
    return failure(
      "INVALID_MAX_COUNT",
      `git.getCommitHistory target.maxCount must be an integer from 1 to ${gitGetCommitHistoryDescriptor.maxAllowedCount}`,
      "input",
      context,
      repositoryPath,
    );
  }

  return normalized;
}

function normalizePathFilter(
  rawPath: string | undefined,
  context: GitGetCommitHistoryContext | undefined,
  repositoryPath: string,
): string | undefined | GitGetCommitHistoryResult {
  const normalized = rawPath?.trim() ?? "";
  if (normalized.length === 0) {
    return undefined;
  }

  const parts = normalized.split(/[\\/]+/).filter(Boolean);
  const isAbsolute = normalized.startsWith("/") || /^[A-Za-z]:[\\/]/.test(normalized);
  if (isAbsolute || parts.includes("..")) {
    return failure(
      "UNSAFE_PATH_FILTER",
      "git.getCommitHistory target.pathFilter must stay relative to the repository root",
      "scope",
      context,
      repositoryPath,
    );
  }

  return normalized;
}

function normalizeRef(
  rawRef: string | undefined,
  context: GitGetCommitHistoryContext | undefined,
  repositoryPath: string,
): string | undefined | GitGetCommitHistoryResult {
  const normalized = rawRef?.trim() ?? "";
  if (normalized.length === 0) {
    return undefined;
  }

  if (normalized.startsWith("-")) {
    return failure(
      "UNSAFE_REF",
      "git.getCommitHistory target.ref must be a revision or ref name, not a git option",
      "scope",
      context,
      repositoryPath,
    );
  }

  return normalized;
}

function normalizeAllowedRoot(root: string): string {
  const trimmed = root.trim();
  return trimmed === "/" ? trimmed : trimmed.replace(/\/+$/, "");
}

function ensureScope(repositoryPath: string, context: GitGetCommitHistoryContext | undefined): GitGetCommitHistoryResult | undefined {
  const allowedRoots = cleanList(context?.allowedRepositoryRoots).map(normalizeAllowedRoot);
  if (allowedRoots.length === 0) {
    return undefined;
  }

  const allowed = allowedRoots.some((root) => repositoryPath === root || repositoryPath.startsWith(`${root}/`));
  if (allowed) {
    return undefined;
  }

  return failure(
    "SCOPE_REJECTED",
    "git.getCommitHistory target repository is outside the allowed repository roots",
    "scope",
    context,
    repositoryPath,
  );
}

function ensurePermissions(
  repositoryPath: string,
  context: GitGetCommitHistoryContext | undefined,
): GitGetCommitHistoryResult | undefined {
  const granted = cleanList(context?.grantedPermissions);
  if (granted.length === 0) {
    return undefined;
  }

  const missing = gitGetCommitHistoryDescriptor.permissionsRequired.filter((permission) => !granted.includes(permission));
  if (missing.length === 0) {
    return undefined;
  }

  return failure(
    "PERMISSION_DENIED",
    `git.getCommitHistory is missing permissions: ${missing.join(", ")}`,
    "permission",
    context,
    repositoryPath,
  );
}

function ensureDryRunOnly(
  repositoryPath: string,
  context: GitGetCommitHistoryContext | undefined,
): GitGetCommitHistoryResult | undefined {
  if (dryRunEnabled(context)) {
    return undefined;
  }

  return failure(
    "REAL_EXECUTION_BLOCKED",
    "git.getCommitHistory only returns a guarded dry-run plan in the first implementation",
    "contract",
    context,
    repositoryPath,
  );
}

function normalizeTarget(
  target: Partial<GitGetCommitHistoryTarget> | undefined,
  context: GitGetCommitHistoryContext | undefined,
): GitGetCommitHistoryTarget | GitGetCommitHistoryResult {
  const repositoryPath = normalizeRepositoryPath(target?.repositoryPath, context);
  if (typeof repositoryPath !== "string") {
    return repositoryPath;
  }

  const maxCount = normalizeMaxCount(target?.maxCount, context, repositoryPath);
  if (typeof maxCount !== "number") {
    return maxCount;
  }

  const pathFilter = normalizePathFilter(target?.pathFilter, context, repositoryPath);
  if (typeof pathFilter === "object") {
    return pathFilter;
  }

  const ref = normalizeRef(target?.ref, context, repositoryPath);
  if (typeof ref === "object") {
    return ref;
  }

  return {
    repositoryPath,
    maxCount,
    ref,
    pathFilter,
  };
}

function commandPreview(target: GitGetCommitHistoryTarget): readonly string[] {
  return [
    "git",
    "-C",
    target.repositoryPath,
    "log",
    "--format=%H%x1f%h%x1f%an%x1f%ae%x1f%aI%x1f%s",
    "--max-count",
    String(target.maxCount),
    ...(target.ref === undefined ? [] : [target.ref]),
    ...(target.pathFilter === undefined ? [] : ["--", target.pathFilter]),
  ];
}

export function planGitCommitHistoryRead(request: GitGetCommitHistoryRequest = {}): GitGetCommitHistoryResult {
  const target = normalizeTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  const scopeFailure = ensureScope(target.repositoryPath, request.context);
  if (scopeFailure !== undefined) {
    return scopeFailure;
  }

  const permissionFailure = ensurePermissions(target.repositoryPath, request.context);
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const realExecutionFailure = ensureDryRunOnly(target.repositoryPath, request.context);
  if (realExecutionFailure !== undefined) {
    return realExecutionFailure;
  }

  return {
    ok: true,
    toolId: gitGetCommitHistoryDescriptor.toolId,
    output: {
      kind: "agentCore.basicTool.git.getCommitHistory",
      target,
      commandPreview: commandPreview(target),
      dryRun: true,
      executionBlocked: true,
      permissionsRequired: gitGetCommitHistoryDescriptor.permissionsRequired,
      unsafeSideEffects: false,
      resultEnvelope: {
        parser: "git-log-unit-separator-v1",
        entries: [],
      },
    },
    audit: [
      auditEvent("agentCore.basicTool.git.getCommitHistory.dryRun", request.context, target.repositoryPath, {
        maxCount: target.maxCount,
        ref: target.ref,
        pathFilter: target.pathFilter,
      }),
    ],
    events: ["basicTool.git.getCommitHistory.dryRun"],
  };
}
