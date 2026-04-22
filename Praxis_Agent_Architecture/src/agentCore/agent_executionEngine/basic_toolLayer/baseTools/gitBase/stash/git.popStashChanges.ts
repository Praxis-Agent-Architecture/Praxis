/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / Git 基础工具 / stash 操作。
 * 核心目的：提供 Git 基础工具 / stash 操作 中的“弹出 stash”基础能力原语。
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

export type GitPopStashChangesTarget = {
  repositoryPath: string;
  stashRef: string;
  reinstateIndex?: boolean;
};

export type GitPopStashChangesRequest = {
  target?: Partial<GitPopStashChangesTarget>;
  context?: GitToolContext;
};

export type GitPopStashChangesOutput = {
  kind: "agentCore.basicTool.git.popStashChanges";
  target: GitPopStashChangesTarget;
  commandPreview: readonly string[];
  dryRun: true;
  executionBlocked: true;
  permissionsRequired: readonly GitToolPermission[];
  unsafeSideEffects: true;
  dropsStashOnSuccess: true;
};

export const gitPopStashChangesDescriptor = {
  toolId: "git.popStashChanges",
  capability: "pop-stash-changes",
  route: "agent_executionEngine.basic_toolLayer.baseTools.gitBase.stash",
  permissionsRequired: ["git:read", "git:write", "filesystem:write"],
  defaultDryRun: true,
  unsafeSideEffects: true,
  tapOwnsApproval: true,
} as const;

function normalizePopStashChangesTarget(
  target: Partial<GitPopStashChangesTarget> | undefined,
  context: GitToolContext | undefined,
): GitPopStashChangesTarget | GitToolResult<GitPopStashChangesOutput> {
  const toolId = gitPopStashChangesDescriptor.toolId;
  const repositoryPath = normalizeGitRepositoryPath(toolId, target?.repositoryPath, context);
  if (typeof repositoryPath !== "string") {
    return repositoryPath;
  }

  return {
    repositoryPath,
    stashRef: target?.stashRef?.trim() || "stash@{0}",
    reinstateIndex: target?.reinstateIndex === true,
  };
}

function popStashChangesCommandPreview(target: GitPopStashChangesTarget): readonly string[] {
  return [
    "git",
    "-C",
    target.repositoryPath,
    "stash",
    "pop",
    ...(target.reinstateIndex ? ["--index"] : []),
    target.stashRef,
  ];
}

export function planGitPopStashChanges(
  request: GitPopStashChangesRequest = {},
): GitToolResult<GitPopStashChangesOutput> {
  const toolId = gitPopStashChangesDescriptor.toolId;
  const target = normalizePopStashChangesTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  const scopeFailure = ensureGitToolScope<GitPopStashChangesOutput>(toolId, target.repositoryPath, request.context);
  if (scopeFailure !== undefined) {
    return scopeFailure;
  }

  const permissionFailure = ensureGitToolPermissions<GitPopStashChangesOutput>(
    toolId,
    gitPopStashChangesDescriptor.permissionsRequired,
    request.context,
    target.repositoryPath,
  );
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const realExecutionFailure = blockRealGitExecution<GitPopStashChangesOutput>(
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
      kind: "agentCore.basicTool.git.popStashChanges",
      target,
      commandPreview: popStashChangesCommandPreview(target),
      dryRun: true,
      executionBlocked: true,
      permissionsRequired: gitPopStashChangesDescriptor.permissionsRequired,
      unsafeSideEffects: true,
      dropsStashOnSuccess: true,
    },
    audit: [
      createGitAuditEvent(
        toolId,
        "agentCore.basicTool.git.popStashChanges.dryRun",
        request.context,
        target.repositoryPath,
        { stashRef: target.stashRef, reinstateIndex: target.reinstateIndex, dropsStashOnSuccess: true },
      ),
    ],
    events: ["basicTool.git.popStashChanges.dryRun"],
  };
}
