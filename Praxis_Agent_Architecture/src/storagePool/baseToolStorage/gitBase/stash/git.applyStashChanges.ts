/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / Git 基础工具 / stash 操作。
 * 核心目的：提供 Git 基础工具 / stash 操作 中的“应用 stash”基础能力原语。
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

export type GitApplyStashChangesTarget = {
  repositoryPath: string;
  stashRef: string;
  reinstateIndex?: boolean;
};

export type GitApplyStashChangesRequest = {
  target?: Partial<GitApplyStashChangesTarget>;
  context?: GitToolContext;
};

export type GitApplyStashChangesOutput = {
  kind: "agentCore.basicTool.git.applyStashChanges";
  target: GitApplyStashChangesTarget;
  commandPreview: readonly string[];
  dryRun: true;
  executionBlocked: true;
  permissionsRequired: readonly GitToolPermission[];
  unsafeSideEffects: true;
};

export const gitApplyStashChangesDescriptor = {
  toolId: "git.applyStashChanges",
  capability: "apply-stash-changes",
  route: "agent_executionEngine.basic_toolLayer.baseTools.gitBase.stash",
  permissionsRequired: ["git:read", "git:write", "filesystem:write"],
  defaultDryRun: true,
  unsafeSideEffects: true,
  tapOwnsApproval: true,
} as const;

function normalizeApplyStashChangesTarget(
  target: Partial<GitApplyStashChangesTarget> | undefined,
  context: GitToolContext | undefined,
): GitApplyStashChangesTarget | GitToolResult<GitApplyStashChangesOutput> {
  const toolId = gitApplyStashChangesDescriptor.toolId;
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

function applyStashChangesCommandPreview(target: GitApplyStashChangesTarget): readonly string[] {
  return [
    "git",
    "-C",
    target.repositoryPath,
    "stash",
    "apply",
    ...(target.reinstateIndex ? ["--index"] : []),
    target.stashRef,
  ];
}

export function planGitApplyStashChanges(
  request: GitApplyStashChangesRequest = {},
): GitToolResult<GitApplyStashChangesOutput> {
  const toolId = gitApplyStashChangesDescriptor.toolId;
  const target = normalizeApplyStashChangesTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  const scopeFailure = ensureGitToolScope<GitApplyStashChangesOutput>(toolId, target.repositoryPath, request.context);
  if (scopeFailure !== undefined) {
    return scopeFailure;
  }

  const permissionFailure = ensureGitToolPermissions<GitApplyStashChangesOutput>(
    toolId,
    gitApplyStashChangesDescriptor.permissionsRequired,
    request.context,
    target.repositoryPath,
  );
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const realExecutionFailure = blockRealGitExecution<GitApplyStashChangesOutput>(
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
      kind: "agentCore.basicTool.git.applyStashChanges",
      target,
      commandPreview: applyStashChangesCommandPreview(target),
      dryRun: true,
      executionBlocked: true,
      permissionsRequired: gitApplyStashChangesDescriptor.permissionsRequired,
      unsafeSideEffects: true,
    },
    audit: [
      createGitAuditEvent(
        toolId,
        "agentCore.basicTool.git.applyStashChanges.dryRun",
        request.context,
        target.repositoryPath,
        { stashRef: target.stashRef, reinstateIndex: target.reinstateIndex },
      ),
    ],
    events: ["basicTool.git.applyStashChanges.dryRun"],
  };
}
