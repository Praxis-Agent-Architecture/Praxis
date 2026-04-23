/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / Git 基础工具 / Git 检查。
 * 核心目的：提供 Git 基础工具 / Git 检查 中的“读取仓库状态”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type GitGetRepositoryStatusPermission = "git:read" | "filesystem:read";

export type GitGetRepositoryStatusErrorBoundary = "input" | "scope" | "permission" | "contract";

export type GitGetRepositoryStatusContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  allowedRepositoryRoots?: readonly string[];
  grantedPermissions?: readonly GitGetRepositoryStatusPermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type GitGetRepositoryStatusTarget = {
  repositoryPath: string;
  includeBranch?: boolean;
  includeUntracked?: boolean;
  porcelainVersion?: "v1" | "v2";
};

export type GitGetRepositoryStatusRequest = {
  target?: Partial<GitGetRepositoryStatusTarget>;
  context?: GitGetRepositoryStatusContext;
};

export type GitRepositoryStatusEnvelope = {
  branch?: string;
  upstream?: string;
  ahead?: number;
  behind?: number;
  entries: readonly {
    path: string;
    indexStatus: string;
    workingTreeStatus: string;
    originalPath?: string;
  }[];
};

export type GitGetRepositoryStatusErrorCode =
  | "MISSING_REPOSITORY_PATH"
  | "INVALID_PORCELAIN_VERSION"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "REAL_EXECUTION_BLOCKED";

export type GitGetRepositoryStatusError = {
  code: GitGetRepositoryStatusErrorCode;
  message: string;
  boundary: GitGetRepositoryStatusErrorBoundary;
  publicSafe: true;
};

export type GitGetRepositoryStatusAuditEvent = {
  type: string;
  toolId: "git.getRepositoryStatus";
  invocationId: string;
  dryRun: boolean;
  repositoryPath?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type GitGetRepositoryStatusOutput = {
  kind: "agentCore.basicTool.git.getRepositoryStatus";
  target: GitGetRepositoryStatusTarget;
  commandPreview: readonly string[];
  dryRun: true;
  executionBlocked: true;
  permissionsRequired: readonly GitGetRepositoryStatusPermission[];
  unsafeSideEffects: false;
  resultEnvelope: GitRepositoryStatusEnvelope;
};

export type GitGetRepositoryStatusResult =
  | {
      ok: true;
      toolId: "git.getRepositoryStatus";
      output: GitGetRepositoryStatusOutput;
      audit: readonly GitGetRepositoryStatusAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "git.getRepositoryStatus";
      error: GitGetRepositoryStatusError;
      audit: readonly GitGetRepositoryStatusAuditEvent[];
      events: readonly string[];
    };

export const gitGetRepositoryStatusDescriptor = {
  toolId: "git.getRepositoryStatus",
  capability: "get-repository-status",
  route: "agent_executionEngine.basic_toolLayer.baseTools.gitBase.inspection",
  defaultDryRun: true,
  tapOwnsApproval: true,
  permissionsRequired: ["git:read", "filesystem:read"],
} as const;

function cleanList<T extends string>(values: readonly T[] | undefined): readonly T[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean) as T[])];
}

function dryRunEnabled(context: GitGetRepositoryStatusContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: GitGetRepositoryStatusContext | undefined): string {
  return context?.invocationId?.trim() || "git.getRepositoryStatus:dry-run";
}

function auditEvent(
  type: string,
  context: GitGetRepositoryStatusContext | undefined,
  repositoryPath?: string,
  metadata?: Readonly<Record<string, unknown>>,
): GitGetRepositoryStatusAuditEvent {
  return {
    type,
    toolId: gitGetRepositoryStatusDescriptor.toolId,
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
  code: GitGetRepositoryStatusErrorCode,
  message: string,
  boundary: GitGetRepositoryStatusErrorBoundary,
  context: GitGetRepositoryStatusContext | undefined,
  repositoryPath?: string,
): GitGetRepositoryStatusResult {
  return {
    ok: false,
    toolId: gitGetRepositoryStatusDescriptor.toolId,
    error: { code, message, boundary, publicSafe: true },
    audit: [auditEvent("agentCore.basicTool.git.getRepositoryStatus.rejected", context, repositoryPath, { code })],
    events: ["basicTool.git.getRepositoryStatus.rejected"],
  };
}

function normalizeRepositoryPath(
  repositoryPath: string | undefined,
  context: GitGetRepositoryStatusContext | undefined,
): string | GitGetRepositoryStatusResult {
  const normalized = repositoryPath?.trim() ?? "";
  if (normalized.length === 0) {
    return failure(
      "MISSING_REPOSITORY_PATH",
      "git.getRepositoryStatus requires target.repositoryPath",
      "input",
      context,
      repositoryPath,
    );
  }

  return normalized;
}

function normalizePorcelainVersion(
  porcelainVersion: string | undefined,
  context: GitGetRepositoryStatusContext | undefined,
  repositoryPath: string,
): "v1" | "v2" | GitGetRepositoryStatusResult {
  if (porcelainVersion === undefined || porcelainVersion === "v1" || porcelainVersion.trim() === "") {
    return "v1";
  }

  if (porcelainVersion === "v2") {
    return "v2";
  }

  return failure(
    "INVALID_PORCELAIN_VERSION",
    "git.getRepositoryStatus target.porcelainVersion must be v1 or v2",
    "input",
    context,
    repositoryPath,
  );
}

function normalizeAllowedRoot(root: string): string {
  const trimmed = root.trim();
  return trimmed === "/" ? trimmed : trimmed.replace(/\/+$/, "");
}

function ensureScope(repositoryPath: string, context: GitGetRepositoryStatusContext | undefined): GitGetRepositoryStatusResult | undefined {
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
    "git.getRepositoryStatus target repository is outside the allowed repository roots",
    "scope",
    context,
    repositoryPath,
  );
}

function ensurePermissions(
  repositoryPath: string,
  context: GitGetRepositoryStatusContext | undefined,
): GitGetRepositoryStatusResult | undefined {
  const granted = cleanList(context?.grantedPermissions);
  if (granted.length === 0) {
    return undefined;
  }

  const missing = gitGetRepositoryStatusDescriptor.permissionsRequired.filter((permission) => !granted.includes(permission));
  if (missing.length === 0) {
    return undefined;
  }

  return failure(
    "PERMISSION_DENIED",
    `git.getRepositoryStatus is missing permissions: ${missing.join(", ")}`,
    "permission",
    context,
    repositoryPath,
  );
}

function ensureDryRunOnly(
  repositoryPath: string,
  context: GitGetRepositoryStatusContext | undefined,
): GitGetRepositoryStatusResult | undefined {
  if (dryRunEnabled(context)) {
    return undefined;
  }

  return failure(
    "REAL_EXECUTION_BLOCKED",
    "git.getRepositoryStatus only returns a guarded dry-run plan in the first implementation",
    "contract",
    context,
    repositoryPath,
  );
}

function normalizeTarget(
  target: Partial<GitGetRepositoryStatusTarget> | undefined,
  context: GitGetRepositoryStatusContext | undefined,
): GitGetRepositoryStatusTarget | GitGetRepositoryStatusResult {
  const repositoryPath = normalizeRepositoryPath(target?.repositoryPath, context);
  if (typeof repositoryPath !== "string") {
    return repositoryPath;
  }

  const porcelainVersion = normalizePorcelainVersion(target?.porcelainVersion, context, repositoryPath);
  if (typeof porcelainVersion === "object") {
    return porcelainVersion;
  }

  return {
    repositoryPath,
    includeBranch: target?.includeBranch !== false,
    includeUntracked: target?.includeUntracked !== false,
    porcelainVersion,
  };
}

function commandPreview(target: GitGetRepositoryStatusTarget): readonly string[] {
  return [
    "git",
    "-C",
    target.repositoryPath,
    "status",
    `--porcelain=${target.porcelainVersion ?? "v1"}`,
    ...(target.includeBranch === false ? [] : ["--branch"]),
    ...(target.includeUntracked === false ? ["--untracked-files=no"] : []),
  ];
}

export function planGitRepositoryStatusRead(request: GitGetRepositoryStatusRequest = {}): GitGetRepositoryStatusResult {
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
    toolId: gitGetRepositoryStatusDescriptor.toolId,
    output: {
      kind: "agentCore.basicTool.git.getRepositoryStatus",
      target,
      commandPreview: commandPreview(target),
      dryRun: true,
      executionBlocked: true,
      permissionsRequired: gitGetRepositoryStatusDescriptor.permissionsRequired,
      unsafeSideEffects: false,
      resultEnvelope: {
        entries: [],
      },
    },
    audit: [
      auditEvent("agentCore.basicTool.git.getRepositoryStatus.dryRun", request.context, target.repositoryPath, {
        includeBranch: target.includeBranch,
        includeUntracked: target.includeUntracked,
        porcelainVersion: target.porcelainVersion,
      }),
    ],
    events: ["basicTool.git.getRepositoryStatus.dryRun"],
  };
}
