/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / Git 基础工具 / stash 操作。
 * 核心目的：提供 Git 基础工具 / stash 操作 中的“清理未跟踪文件”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import {
  blockRealGitExecution,
  cleanGitList,
  createGitAuditEvent,
  ensureGitToolPermissions,
  ensureGitToolScope,
  normalizeGitRepositoryPath,
  type GitToolContext,
  type GitToolPermission,
  type GitToolResult,
} from "../branch/git.manageBranch.js";

export type GitCleanUntrackedFilesIgnoredMode = "tracked-ignored" | "ignored-only" | "none";

export type GitCleanUntrackedFilesTarget = {
  repositoryPath: string;
  paths: readonly string[];
  includeDirectories?: boolean;
  ignoredMode?: GitCleanUntrackedFilesIgnoredMode;
};

export type GitCleanUntrackedFilesRequest = {
  target?: Partial<GitCleanUntrackedFilesTarget>;
  context?: GitToolContext;
};

export type GitCleanUntrackedFilesOutput = {
  kind: "agentCore.basicTool.git.cleanUntrackedFiles";
  target: GitCleanUntrackedFilesTarget;
  commandPreview: readonly string[];
  dryRun: true;
  executionBlocked: true;
  permissionsRequired: readonly GitToolPermission[];
  unsafeSideEffects: true;
};

export const gitCleanUntrackedFilesDescriptor = {
  toolId: "git.cleanUntrackedFiles",
  capability: "clean-untracked-files",
  route: "agent_executionEngine.basic_toolLayer.baseTools.gitBase.stash",
  permissionsRequired: ["git:read", "git:write", "filesystem:write"],
  defaultDryRun: true,
  unsafeSideEffects: true,
  tapOwnsApproval: true,
} as const;

function normalizeIgnoredMode(
  ignoredMode: GitCleanUntrackedFilesIgnoredMode | undefined,
): GitCleanUntrackedFilesIgnoredMode {
  if (ignoredMode === "tracked-ignored" || ignoredMode === "ignored-only") {
    return ignoredMode;
  }

  return "none";
}

function normalizeCleanUntrackedFilesTarget(
  target: Partial<GitCleanUntrackedFilesTarget> | undefined,
  context: GitToolContext | undefined,
): GitCleanUntrackedFilesTarget | GitToolResult<GitCleanUntrackedFilesOutput> {
  const toolId = gitCleanUntrackedFilesDescriptor.toolId;
  const repositoryPath = normalizeGitRepositoryPath(toolId, target?.repositoryPath, context);
  if (typeof repositoryPath !== "string") {
    return repositoryPath;
  }

  return {
    repositoryPath,
    paths: cleanGitList(target?.paths),
    includeDirectories: target?.includeDirectories !== false,
    ignoredMode: normalizeIgnoredMode(target?.ignoredMode),
  };
}

function cleanUntrackedFilesCommandPreview(target: GitCleanUntrackedFilesTarget): readonly string[] {
  return [
    "git",
    "-C",
    target.repositoryPath,
    "clean",
    "--dry-run",
    "-f",
    ...(target.includeDirectories === false ? [] : ["-d"]),
    ...(target.ignoredMode === "tracked-ignored" ? ["-x"] : []),
    ...(target.ignoredMode === "ignored-only" ? ["-X"] : []),
    ...(target.paths.length === 0 ? [] : ["--", ...target.paths]),
  ];
}

export function planGitCleanUntrackedFiles(
  request: GitCleanUntrackedFilesRequest = {},
): GitToolResult<GitCleanUntrackedFilesOutput> {
  const toolId = gitCleanUntrackedFilesDescriptor.toolId;
  const target = normalizeCleanUntrackedFilesTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  const scopeFailure = ensureGitToolScope<GitCleanUntrackedFilesOutput>(
    toolId,
    target.repositoryPath,
    request.context,
  );
  if (scopeFailure !== undefined) {
    return scopeFailure;
  }

  const permissionFailure = ensureGitToolPermissions<GitCleanUntrackedFilesOutput>(
    toolId,
    gitCleanUntrackedFilesDescriptor.permissionsRequired,
    request.context,
    target.repositoryPath,
  );
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const realExecutionFailure = blockRealGitExecution<GitCleanUntrackedFilesOutput>(
    toolId,
    request.context,
    target.repositoryPath,
  );
  if (realExecutionFailure !== undefined) {
    return realExecutionFailure;
  }

  return {
    ok: true,
    toolId,
    output: {
      kind: "agentCore.basicTool.git.cleanUntrackedFiles",
      target,
      commandPreview: cleanUntrackedFilesCommandPreview(target),
      dryRun: true,
      executionBlocked: true,
      permissionsRequired: gitCleanUntrackedFilesDescriptor.permissionsRequired,
      unsafeSideEffects: true,
    },
    audit: [
      createGitAuditEvent(
        toolId,
        "agentCore.basicTool.git.cleanUntrackedFiles.dryRun",
        request.context,
        target.repositoryPath,
        {
          pathCount: target.paths.length,
          includeDirectories: target.includeDirectories,
          ignoredMode: target.ignoredMode,
        },
      ),
    ],
    events: ["basicTool.git.cleanUntrackedFiles.dryRun"],
  };
}
