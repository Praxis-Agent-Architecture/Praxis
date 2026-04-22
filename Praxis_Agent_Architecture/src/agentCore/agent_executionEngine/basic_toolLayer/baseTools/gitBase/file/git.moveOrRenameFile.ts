/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / Git 基础工具 / Git 文件操作。
 * 核心目的：提供 Git 基础工具 / Git 文件操作 中的“移动或重命名文件”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type GitMoveOrRenameFilePermission = "git:read" | "git:write" | "filesystem:read" | "filesystem:write";

export type GitMoveOrRenameFileErrorBoundary = "input" | "scope" | "permission" | "contract";

export type GitMoveOrRenameFileContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  allowedRepositoryRoots?: readonly string[];
  grantedPermissions?: readonly GitMoveOrRenameFilePermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type GitMoveOrRenameFileTarget = {
  repositoryPath: string;
  sourcePath: string;
  destinationPath: string;
  force?: boolean;
};

export type GitMoveOrRenameFileRequest = {
  target?: Partial<GitMoveOrRenameFileTarget>;
  context?: GitMoveOrRenameFileContext;
};

export type GitMoveOrRenameFileErrorCode =
  | "MISSING_REPOSITORY_PATH"
  | "MISSING_SOURCE_PATH"
  | "MISSING_DESTINATION_PATH"
  | "UNSAFE_FILE_PATH"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "REAL_EXECUTION_BLOCKED";

export type GitMoveOrRenameFileError = {
  code: GitMoveOrRenameFileErrorCode;
  message: string;
  boundary: GitMoveOrRenameFileErrorBoundary;
  publicSafe: true;
};

export type GitMoveOrRenameFileAuditEvent = {
  type: string;
  toolId: "git.moveOrRenameFile";
  invocationId: string;
  dryRun: boolean;
  repositoryPath?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type GitMoveOrRenameFileOutput = {
  kind: "agentCore.basicTool.git.moveOrRenameFile";
  target: GitMoveOrRenameFileTarget;
  commandPreview: readonly string[];
  dryRun: true;
  executionBlocked: true;
  permissionsRequired: readonly GitMoveOrRenameFilePermission[];
  unsafeSideEffects: true;
};

export type GitMoveOrRenameFileResult =
  | {
      ok: true;
      toolId: "git.moveOrRenameFile";
      output: GitMoveOrRenameFileOutput;
      audit: readonly GitMoveOrRenameFileAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "git.moveOrRenameFile";
      error: GitMoveOrRenameFileError;
      audit: readonly GitMoveOrRenameFileAuditEvent[];
      events: readonly string[];
    };

export const gitMoveOrRenameFileDescriptor = {
  toolId: "git.moveOrRenameFile",
  capability: "move-or-rename-file",
  route: "agent_executionEngine.basic_toolLayer.baseTools.gitBase.file",
  defaultDryRun: true,
  tapOwnsApproval: true,
  permissionsRequired: ["git:read", "git:write", "filesystem:read", "filesystem:write"],
} as const;

function cleanList<T extends string>(values: readonly T[] | undefined): readonly T[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean) as T[])];
}

function dryRunEnabled(context: GitMoveOrRenameFileContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: GitMoveOrRenameFileContext | undefined): string {
  return context?.invocationId?.trim() || "git.moveOrRenameFile:dry-run";
}

function auditEvent(
  type: string,
  context: GitMoveOrRenameFileContext | undefined,
  repositoryPath?: string,
  metadata?: Readonly<Record<string, unknown>>,
): GitMoveOrRenameFileAuditEvent {
  return {
    type,
    toolId: gitMoveOrRenameFileDescriptor.toolId,
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
  code: GitMoveOrRenameFileErrorCode,
  message: string,
  boundary: GitMoveOrRenameFileErrorBoundary,
  context: GitMoveOrRenameFileContext | undefined,
  repositoryPath?: string,
): GitMoveOrRenameFileResult {
  return {
    ok: false,
    toolId: gitMoveOrRenameFileDescriptor.toolId,
    error: { code, message, boundary, publicSafe: true },
    audit: [auditEvent("agentCore.basicTool.git.moveOrRenameFile.rejected", context, repositoryPath, { code })],
    events: ["basicTool.git.moveOrRenameFile.rejected"],
  };
}

function normalizeRepositoryPath(
  repositoryPath: string | undefined,
  context: GitMoveOrRenameFileContext | undefined,
): string | GitMoveOrRenameFileResult {
  const normalized = repositoryPath?.trim() ?? "";
  if (normalized.length === 0) {
    return failure(
      "MISSING_REPOSITORY_PATH",
      "git.moveOrRenameFile requires target.repositoryPath",
      "input",
      context,
      repositoryPath,
    );
  }

  return normalized;
}

function normalizeRelativeFilePath(
  rawPath: string | undefined,
  missingCode: "MISSING_SOURCE_PATH" | "MISSING_DESTINATION_PATH",
  fieldName: "sourcePath" | "destinationPath",
  context: GitMoveOrRenameFileContext | undefined,
  repositoryPath: string,
): string | GitMoveOrRenameFileResult {
  const normalized = rawPath?.trim() ?? "";
  if (normalized.length === 0) {
    return failure(missingCode, `git.moveOrRenameFile requires target.${fieldName}`, "input", context, repositoryPath);
  }

  const parts = normalized.split(/[\\/]+/).filter(Boolean);
  const isAbsolute = normalized.startsWith("/") || /^[A-Za-z]:[\\/]/.test(normalized);
  if (isAbsolute || parts.includes("..")) {
    return failure(
      "UNSAFE_FILE_PATH",
      `git.moveOrRenameFile target.${fieldName} must stay relative to the repository root`,
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

function ensureScope(repositoryPath: string, context: GitMoveOrRenameFileContext | undefined): GitMoveOrRenameFileResult | undefined {
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
    "git.moveOrRenameFile target repository is outside the allowed repository roots",
    "scope",
    context,
    repositoryPath,
  );
}

function ensurePermissions(
  repositoryPath: string,
  context: GitMoveOrRenameFileContext | undefined,
): GitMoveOrRenameFileResult | undefined {
  const granted = cleanList(context?.grantedPermissions);
  if (granted.length === 0) {
    return undefined;
  }

  const missing = gitMoveOrRenameFileDescriptor.permissionsRequired.filter((permission) => !granted.includes(permission));
  if (missing.length === 0) {
    return undefined;
  }

  return failure(
    "PERMISSION_DENIED",
    `git.moveOrRenameFile is missing permissions: ${missing.join(", ")}`,
    "permission",
    context,
    repositoryPath,
  );
}

function ensureDryRunOnly(
  repositoryPath: string,
  context: GitMoveOrRenameFileContext | undefined,
): GitMoveOrRenameFileResult | undefined {
  if (dryRunEnabled(context)) {
    return undefined;
  }

  return failure(
    "REAL_EXECUTION_BLOCKED",
    "git.moveOrRenameFile only returns a guarded dry-run plan in the first implementation",
    "contract",
    context,
    repositoryPath,
  );
}

function normalizeTarget(
  target: Partial<GitMoveOrRenameFileTarget> | undefined,
  context: GitMoveOrRenameFileContext | undefined,
): GitMoveOrRenameFileTarget | GitMoveOrRenameFileResult {
  const repositoryPath = normalizeRepositoryPath(target?.repositoryPath, context);
  if (typeof repositoryPath !== "string") {
    return repositoryPath;
  }

  const sourcePath = normalizeRelativeFilePath(
    target?.sourcePath,
    "MISSING_SOURCE_PATH",
    "sourcePath",
    context,
    repositoryPath,
  );
  if (typeof sourcePath !== "string") {
    return sourcePath;
  }

  const destinationPath = normalizeRelativeFilePath(
    target?.destinationPath,
    "MISSING_DESTINATION_PATH",
    "destinationPath",
    context,
    repositoryPath,
  );
  if (typeof destinationPath !== "string") {
    return destinationPath;
  }

  return {
    repositoryPath,
    sourcePath,
    destinationPath,
    force: target?.force === true,
  };
}

function commandPreview(target: GitMoveOrRenameFileTarget): readonly string[] {
  return [
    "git",
    "-C",
    target.repositoryPath,
    "mv",
    ...(target.force === true ? ["--force"] : []),
    "--",
    target.sourcePath,
    target.destinationPath,
  ];
}

export function planGitMoveOrRenameFile(request: GitMoveOrRenameFileRequest = {}): GitMoveOrRenameFileResult {
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
    toolId: gitMoveOrRenameFileDescriptor.toolId,
    output: {
      kind: "agentCore.basicTool.git.moveOrRenameFile",
      target,
      commandPreview: commandPreview(target),
      dryRun: true,
      executionBlocked: true,
      permissionsRequired: gitMoveOrRenameFileDescriptor.permissionsRequired,
      unsafeSideEffects: true,
    },
    audit: [
      auditEvent("agentCore.basicTool.git.moveOrRenameFile.dryRun", request.context, target.repositoryPath, {
        sourcePath: target.sourcePath,
        destinationPath: target.destinationPath,
      }),
    ],
    events: ["basicTool.git.moveOrRenameFile.dryRun"],
  };
}
