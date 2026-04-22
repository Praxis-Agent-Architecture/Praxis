/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / Git 基础工具 / Git 文件操作。
 * 核心目的：提供 Git 基础工具 / Git 文件操作 中的“移除已跟踪文件”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type GitRemoveTrackedFilePermission = "git:read" | "git:write" | "filesystem:read" | "filesystem:write";

export type GitRemoveTrackedFileErrorBoundary = "input" | "scope" | "permission" | "contract";

export type GitRemoveTrackedFileContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  allowedRepositoryRoots?: readonly string[];
  grantedPermissions?: readonly GitRemoveTrackedFilePermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type GitRemoveTrackedFileTarget = {
  repositoryPath: string;
  filePath: string;
  keepWorkingTree?: boolean;
  force?: boolean;
};

export type GitRemoveTrackedFileRequest = {
  target?: Partial<GitRemoveTrackedFileTarget>;
  context?: GitRemoveTrackedFileContext;
};

export type GitRemoveTrackedFileErrorCode =
  | "MISSING_REPOSITORY_PATH"
  | "MISSING_FILE_PATH"
  | "UNSAFE_FILE_PATH"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "REAL_EXECUTION_BLOCKED";

export type GitRemoveTrackedFileError = {
  code: GitRemoveTrackedFileErrorCode;
  message: string;
  boundary: GitRemoveTrackedFileErrorBoundary;
  publicSafe: true;
};

export type GitRemoveTrackedFileAuditEvent = {
  type: string;
  toolId: "git.removeTrackedFile";
  invocationId: string;
  dryRun: boolean;
  repositoryPath?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type GitRemoveTrackedFileOutput = {
  kind: "agentCore.basicTool.git.removeTrackedFile";
  target: GitRemoveTrackedFileTarget;
  commandPreview: readonly string[];
  dryRun: true;
  executionBlocked: true;
  permissionsRequired: readonly GitRemoveTrackedFilePermission[];
  unsafeSideEffects: true;
};

export type GitRemoveTrackedFileResult =
  | {
      ok: true;
      toolId: "git.removeTrackedFile";
      output: GitRemoveTrackedFileOutput;
      audit: readonly GitRemoveTrackedFileAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "git.removeTrackedFile";
      error: GitRemoveTrackedFileError;
      audit: readonly GitRemoveTrackedFileAuditEvent[];
      events: readonly string[];
    };

export const gitRemoveTrackedFileDescriptor = {
  toolId: "git.removeTrackedFile",
  capability: "remove-tracked-file",
  route: "agent_executionEngine.basic_toolLayer.baseTools.gitBase.file",
  defaultDryRun: true,
  tapOwnsApproval: true,
  permissionsRequired: ["git:read", "git:write", "filesystem:read", "filesystem:write"],
} as const;

function cleanList<T extends string>(values: readonly T[] | undefined): readonly T[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean) as T[])];
}

function dryRunEnabled(context: GitRemoveTrackedFileContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: GitRemoveTrackedFileContext | undefined): string {
  return context?.invocationId?.trim() || "git.removeTrackedFile:dry-run";
}

function auditEvent(
  type: string,
  context: GitRemoveTrackedFileContext | undefined,
  repositoryPath?: string,
  metadata?: Readonly<Record<string, unknown>>,
): GitRemoveTrackedFileAuditEvent {
  return {
    type,
    toolId: gitRemoveTrackedFileDescriptor.toolId,
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
  code: GitRemoveTrackedFileErrorCode,
  message: string,
  boundary: GitRemoveTrackedFileErrorBoundary,
  context: GitRemoveTrackedFileContext | undefined,
  repositoryPath?: string,
): GitRemoveTrackedFileResult {
  return {
    ok: false,
    toolId: gitRemoveTrackedFileDescriptor.toolId,
    error: { code, message, boundary, publicSafe: true },
    audit: [auditEvent("agentCore.basicTool.git.removeTrackedFile.rejected", context, repositoryPath, { code })],
    events: ["basicTool.git.removeTrackedFile.rejected"],
  };
}

function normalizeRepositoryPath(
  repositoryPath: string | undefined,
  context: GitRemoveTrackedFileContext | undefined,
): string | GitRemoveTrackedFileResult {
  const normalized = repositoryPath?.trim() ?? "";
  if (normalized.length === 0) {
    return failure(
      "MISSING_REPOSITORY_PATH",
      "git.removeTrackedFile requires target.repositoryPath",
      "input",
      context,
      repositoryPath,
    );
  }

  return normalized;
}

function normalizeFilePath(
  rawPath: string | undefined,
  context: GitRemoveTrackedFileContext | undefined,
  repositoryPath: string,
): string | GitRemoveTrackedFileResult {
  const normalized = rawPath?.trim() ?? "";
  if (normalized.length === 0) {
    return failure("MISSING_FILE_PATH", "git.removeTrackedFile requires target.filePath", "input", context, repositoryPath);
  }

  const parts = normalized.split(/[\\/]+/).filter(Boolean);
  const isAbsolute = normalized.startsWith("/") || /^[A-Za-z]:[\\/]/.test(normalized);
  if (isAbsolute || parts.includes("..")) {
    return failure(
      "UNSAFE_FILE_PATH",
      "git.removeTrackedFile target.filePath must stay relative to the repository root",
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

function ensureScope(repositoryPath: string, context: GitRemoveTrackedFileContext | undefined): GitRemoveTrackedFileResult | undefined {
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
    "git.removeTrackedFile target repository is outside the allowed repository roots",
    "scope",
    context,
    repositoryPath,
  );
}

function permissionsForTarget(target: GitRemoveTrackedFileTarget): readonly GitRemoveTrackedFilePermission[] {
  return target.keepWorkingTree === true
    ? ["git:read", "git:write", "filesystem:read"]
    : ["git:read", "git:write", "filesystem:read", "filesystem:write"];
}

function ensurePermissions(
  repositoryPath: string,
  permissionsRequired: readonly GitRemoveTrackedFilePermission[],
  context: GitRemoveTrackedFileContext | undefined,
): GitRemoveTrackedFileResult | undefined {
  const granted = cleanList(context?.grantedPermissions);
  if (granted.length === 0) {
    return undefined;
  }

  const missing = permissionsRequired.filter((permission) => !granted.includes(permission));
  if (missing.length === 0) {
    return undefined;
  }

  return failure(
    "PERMISSION_DENIED",
    `git.removeTrackedFile is missing permissions: ${missing.join(", ")}`,
    "permission",
    context,
    repositoryPath,
  );
}

function ensureDryRunOnly(
  repositoryPath: string,
  context: GitRemoveTrackedFileContext | undefined,
): GitRemoveTrackedFileResult | undefined {
  if (dryRunEnabled(context)) {
    return undefined;
  }

  return failure(
    "REAL_EXECUTION_BLOCKED",
    "git.removeTrackedFile only returns a guarded dry-run plan in the first implementation",
    "contract",
    context,
    repositoryPath,
  );
}

function normalizeTarget(
  target: Partial<GitRemoveTrackedFileTarget> | undefined,
  context: GitRemoveTrackedFileContext | undefined,
): GitRemoveTrackedFileTarget | GitRemoveTrackedFileResult {
  const repositoryPath = normalizeRepositoryPath(target?.repositoryPath, context);
  if (typeof repositoryPath !== "string") {
    return repositoryPath;
  }

  const filePath = normalizeFilePath(target?.filePath, context, repositoryPath);
  if (typeof filePath !== "string") {
    return filePath;
  }

  return {
    repositoryPath,
    filePath,
    keepWorkingTree: target?.keepWorkingTree === true,
    force: target?.force === true,
  };
}

function commandPreview(target: GitRemoveTrackedFileTarget): readonly string[] {
  return [
    "git",
    "-C",
    target.repositoryPath,
    "rm",
    ...(target.keepWorkingTree === true ? ["--cached"] : []),
    ...(target.force === true ? ["--force"] : []),
    "--",
    target.filePath,
  ];
}

export function planGitRemoveTrackedFile(request: GitRemoveTrackedFileRequest = {}): GitRemoveTrackedFileResult {
  const target = normalizeTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  const scopeFailure = ensureScope(target.repositoryPath, request.context);
  if (scopeFailure !== undefined) {
    return scopeFailure;
  }

  const permissionsRequired = permissionsForTarget(target);
  const permissionFailure = ensurePermissions(target.repositoryPath, permissionsRequired, request.context);
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const realExecutionFailure = ensureDryRunOnly(target.repositoryPath, request.context);
  if (realExecutionFailure !== undefined) {
    return realExecutionFailure;
  }

  return {
    ok: true,
    toolId: gitRemoveTrackedFileDescriptor.toolId,
    output: {
      kind: "agentCore.basicTool.git.removeTrackedFile",
      target,
      commandPreview: commandPreview(target),
      dryRun: true,
      executionBlocked: true,
      permissionsRequired,
      unsafeSideEffects: true,
    },
    audit: [
      auditEvent("agentCore.basicTool.git.removeTrackedFile.dryRun", request.context, target.repositoryPath, {
        filePath: target.filePath,
        keepWorkingTree: target.keepWorkingTree === true,
      }),
    ],
    events: ["basicTool.git.removeTrackedFile.dryRun"],
  };
}
