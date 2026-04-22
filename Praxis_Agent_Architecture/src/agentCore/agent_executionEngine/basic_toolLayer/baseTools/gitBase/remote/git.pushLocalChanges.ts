/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / Git 基础工具 / 远端操作。
 * 核心目的：提供 Git 基础工具 / 远端操作 中的“推送本地变更”基础能力原语。
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
  createGitToolFailure,
  ensureGitToolPermissions,
  ensureGitToolScope,
  isBlankGitValue,
  normalizeGitRepositoryPath,
  type GitToolContext,
  type GitToolPermission,
  type GitToolResult,
} from "../branch/git.manageBranch.js";

export type GitPushLocalChangesTarget = {
  repositoryPath: string;
  remoteName: string;
  branchName?: string;
  setUpstream?: boolean;
  forceWithLease?: boolean;
  pushTags?: boolean;
  deleteRemoteBranch?: boolean;
};

export type GitPushLocalChangesRequest = {
  target?: Partial<GitPushLocalChangesTarget>;
  context?: GitToolContext;
};

export type GitPushLocalChangesOutput = {
  kind: "agentCore.basicTool.git.pushLocalChanges";
  target: GitPushLocalChangesTarget;
  commandPreview: readonly string[];
  dryRun: true;
  executionBlocked: true;
  permissionsRequired: readonly GitToolPermission[];
  unsafeSideEffects: true;
};

export const gitPushLocalChangesDescriptor = {
  toolId: "git.pushLocalChanges",
  capability: "push-local-changes",
  route: "agent_executionEngine.basic_toolLayer.baseTools.gitBase.remote",
  permissionsRequired: ["git:read", "git:write"],
  defaultDryRun: true,
  unsafeSideEffects: true,
  tapOwnsApproval: true,
} as const;

function normalizePushTarget(
  target: Partial<GitPushLocalChangesTarget> | undefined,
  context: GitToolContext | undefined,
): GitPushLocalChangesTarget | GitToolResult<GitPushLocalChangesOutput> {
  const toolId = gitPushLocalChangesDescriptor.toolId;
  const repositoryPath = normalizeGitRepositoryPath(toolId, target?.repositoryPath, context);
  if (typeof repositoryPath !== "string") {
    return repositoryPath;
  }

  const remoteName = target?.remoteName?.trim() ?? "";
  if (isBlankGitValue(remoteName)) {
    return createGitToolFailure(
      toolId,
      "MISSING_REQUIRED_FIELD",
      "git.pushLocalChanges requires target.remoteName",
      "input",
      context,
      repositoryPath,
    );
  }

  const branchName = target?.branchName?.trim() || undefined;
  const pushTags = target?.pushTags === true;
  const deleteRemoteBranch = target?.deleteRemoteBranch === true;
  if (!pushTags && isBlankGitValue(branchName)) {
    return createGitToolFailure(
      toolId,
      "MISSING_BRANCH_NAME",
      "git.pushLocalChanges requires target.branchName unless target.pushTags is true",
      "input",
      context,
      repositoryPath,
    );
  }

  if (deleteRemoteBranch && isBlankGitValue(branchName)) {
    return createGitToolFailure(
      toolId,
      "MISSING_BRANCH_NAME",
      "git.pushLocalChanges deleteRemoteBranch requires target.branchName",
      "input",
      context,
      repositoryPath,
    );
  }

  return {
    repositoryPath,
    remoteName,
    branchName,
    setUpstream: target?.setUpstream === true,
    forceWithLease: target?.forceWithLease === true,
    pushTags,
    deleteRemoteBranch,
  };
}

function pushCommandPreview(target: GitPushLocalChangesTarget): readonly string[] {
  return [
    "git",
    "-C",
    target.repositoryPath,
    "push",
    ...(target.setUpstream ? ["--set-upstream"] : []),
    ...(target.forceWithLease ? ["--force-with-lease"] : []),
    target.remoteName,
    ...(target.pushTags ? ["--tags"] : []),
    ...(target.branchName === undefined ? [] : [target.deleteRemoteBranch ? `:${target.branchName}` : target.branchName]),
  ];
}

export function planGitLocalPush(
  request: GitPushLocalChangesRequest = {},
): GitToolResult<GitPushLocalChangesOutput> {
  const toolId = gitPushLocalChangesDescriptor.toolId;
  const target = normalizePushTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  const scopeFailure = ensureGitToolScope<GitPushLocalChangesOutput>(toolId, target.repositoryPath, request.context);
  if (scopeFailure !== undefined) {
    return scopeFailure;
  }

  const permissionFailure = ensureGitToolPermissions<GitPushLocalChangesOutput>(
    toolId,
    gitPushLocalChangesDescriptor.permissionsRequired,
    request.context,
    target.repositoryPath,
  );
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const realExecutionFailure = blockRealGitExecution<GitPushLocalChangesOutput>(
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
      kind: "agentCore.basicTool.git.pushLocalChanges",
      target,
      commandPreview: pushCommandPreview(target),
      dryRun: true,
      executionBlocked: true,
      permissionsRequired: gitPushLocalChangesDescriptor.permissionsRequired,
      unsafeSideEffects: true,
    },
    audit: [
      createGitAuditEvent(
        toolId,
        "agentCore.basicTool.git.pushLocalChanges.dryRun",
        request.context,
        target.repositoryPath,
        { remoteName: target.remoteName, branchName: target.branchName, pushTags: target.pushTags },
      ),
    ],
    events: ["basicTool.git.pushLocalChanges.dryRun"],
  };
}
