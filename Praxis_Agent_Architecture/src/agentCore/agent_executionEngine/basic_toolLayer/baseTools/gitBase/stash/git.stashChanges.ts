/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / Git 基础工具 / stash 操作。
 * 核心目的：提供 Git 基础工具 / stash 操作 中的“保存 stash”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import {
  blockRealGitExecution,
  createGitAuditEvent,
  ensureGitToolPermissions,
  ensureGitToolScope,
  normalizeGitRepositoryPath,
  type GitToolContext,
  type GitToolPermission,
  type GitToolResult,
} from "../branch/git.manageBranch.js";

export type GitStashChangesTarget = {
  repositoryPath: string;
  message?: string;
  includeUntracked?: boolean;
  keepIndex?: boolean;
  pathspecs?: readonly string[];
};

export type GitStashChangesRequest = {
  target?: Partial<GitStashChangesTarget>;
  context?: GitToolContext;
};

export type GitStashChangesOutput = {
  kind: "agentCore.basicTool.git.stashChanges";
  target: GitStashChangesTarget;
  commandPreview: readonly string[];
  dryRun: true;
  executionBlocked: true;
  permissionsRequired: readonly GitToolPermission[];
  unsafeSideEffects: true;
  createsStashEntry: true;
};

export const gitStashChangesDescriptor = {
  toolId: "git.stashChanges",
  capability: "stash-changes",
  route: "agent_executionEngine.basic_toolLayer.baseTools.gitBase.stash",
  permissionsRequired: ["git:read", "git:write", "filesystem:write"],
  defaultDryRun: true,
  unsafeSideEffects: true,
  tapOwnsApproval: true,
} as const;

function cleanPathspecs(pathspecs: readonly string[] | undefined): readonly string[] {
  return [...new Set((pathspecs ?? []).map((pathspec) => pathspec.trim()).filter(Boolean))];
}

function normalizeStashChangesTarget(
  target: Partial<GitStashChangesTarget> | undefined,
  context: GitToolContext | undefined,
): GitStashChangesTarget | GitToolResult<GitStashChangesOutput> {
  const toolId = gitStashChangesDescriptor.toolId;
  const repositoryPath = normalizeGitRepositoryPath(toolId, target?.repositoryPath, context);
  if (typeof repositoryPath !== "string") {
    return repositoryPath;
  }

  const message = target?.message?.trim() || undefined;
  const pathspecs = cleanPathspecs(target?.pathspecs);

  return {
    repositoryPath,
    message,
    includeUntracked: target?.includeUntracked === true,
    keepIndex: target?.keepIndex === true,
    pathspecs,
  };
}

function stashChangesCommandPreview(target: GitStashChangesTarget): readonly string[] {
  return [
    "git",
    "-C",
    target.repositoryPath,
    "stash",
    "push",
    ...(target.includeUntracked === true ? ["--include-untracked"] : []),
    ...(target.keepIndex === true ? ["--keep-index"] : []),
    ...(target.message === undefined ? [] : ["-m", target.message]),
    ...((target.pathspecs?.length ?? 0) === 0 ? [] : ["--", ...(target.pathspecs ?? [])]),
  ];
}

export function planGitStashChanges(request: GitStashChangesRequest = {}): GitToolResult<GitStashChangesOutput> {
  const toolId = gitStashChangesDescriptor.toolId;
  const target = normalizeStashChangesTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  const scopeFailure = ensureGitToolScope<GitStashChangesOutput>(toolId, target.repositoryPath, request.context);
  if (scopeFailure !== undefined) {
    return scopeFailure;
  }

  const permissionFailure = ensureGitToolPermissions<GitStashChangesOutput>(
    toolId,
    gitStashChangesDescriptor.permissionsRequired,
    request.context,
    target.repositoryPath,
  );
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const realExecutionFailure = blockRealGitExecution<GitStashChangesOutput>(
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
      kind: "agentCore.basicTool.git.stashChanges",
      target,
      commandPreview: stashChangesCommandPreview(target),
      dryRun: true,
      executionBlocked: true,
      permissionsRequired: gitStashChangesDescriptor.permissionsRequired,
      unsafeSideEffects: true,
      createsStashEntry: true,
    },
    audit: [
      createGitAuditEvent(
        toolId,
        "agentCore.basicTool.git.stashChanges.dryRun",
        request.context,
        target.repositoryPath,
        {
          includeUntracked: target.includeUntracked,
          keepIndex: target.keepIndex,
          pathspecCount: target.pathspecs?.length ?? 0,
        },
      ),
    ],
    events: ["basicTool.git.stashChanges.dryRun"],
  };
}
