/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / Git 基础工具 / 远端操作。
 * 核心目的：提供 Git 基础工具 / 远端操作 中的“拉取远端变更”基础能力原语。
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
  normalizeGitRepositoryPath,
  type GitToolContext,
  type GitToolPermission,
  type GitToolResult,
} from "../branch/git.manageBranch.js";

export type GitPullIntegrationMode = "merge" | "rebase" | "ff-only";

export type GitPullRemoteChangesTarget = {
  repositoryPath: string;
  remoteName?: string;
  branchName?: string;
  integrationMode: GitPullIntegrationMode;
  autostash?: boolean;
  prune?: boolean;
};

export type GitPullRemoteChangesRequest = {
  target?: Partial<GitPullRemoteChangesTarget>;
  context?: GitToolContext;
};

export type GitPullRemoteChangesOutput = {
  kind: "agentCore.basicTool.git.pullRemoteChanges";
  target: GitPullRemoteChangesTarget;
  commandPreview: readonly string[];
  dryRun: true;
  executionBlocked: true;
  permissionsRequired: readonly GitToolPermission[];
  unsafeSideEffects: true;
};

export const gitPullRemoteChangesDescriptor = {
  toolId: "git.pullRemoteChanges",
  capability: "pull-remote-changes",
  route: "agent_executionEngine.basic_toolLayer.baseTools.gitBase.remote",
  permissionsRequired: ["git:read", "git:write", "filesystem:write"],
  defaultDryRun: true,
  unsafeSideEffects: true,
  tapOwnsApproval: true,
} as const;

function normalizePullIntegrationMode(mode: GitPullIntegrationMode | undefined): GitPullIntegrationMode {
  if (mode === "rebase" || mode === "ff-only") {
    return mode;
  }

  return "merge";
}

function normalizePullTarget(
  target: Partial<GitPullRemoteChangesTarget> | undefined,
  context: GitToolContext | undefined,
): GitPullRemoteChangesTarget | GitToolResult<GitPullRemoteChangesOutput> {
  const toolId = gitPullRemoteChangesDescriptor.toolId;
  const repositoryPath = normalizeGitRepositoryPath(toolId, target?.repositoryPath, context);
  if (typeof repositoryPath !== "string") {
    return repositoryPath;
  }

  const remoteName = target?.remoteName?.trim() || undefined;
  const branchName = target?.branchName?.trim() || undefined;
  if ((remoteName === undefined) !== (branchName === undefined)) {
    return createGitToolFailure(
      toolId,
      "MISSING_REQUIRED_FIELD",
      "git.pullRemoteChanges requires target.remoteName and target.branchName to be provided together",
      "input",
      context,
      repositoryPath,
    );
  }

  return {
    repositoryPath,
    remoteName,
    branchName,
    integrationMode: normalizePullIntegrationMode(target?.integrationMode),
    autostash: target?.autostash === true,
    prune: target?.prune === true,
  };
}

function pullCommandPreview(target: GitPullRemoteChangesTarget): readonly string[] {
  return [
    "git",
    "-C",
    target.repositoryPath,
    "pull",
    ...(target.prune ? ["--prune"] : []),
    ...(target.autostash ? ["--autostash"] : []),
    ...(target.integrationMode === "rebase" ? ["--rebase"] : []),
    ...(target.integrationMode === "ff-only" ? ["--ff-only"] : []),
    ...(target.remoteName === undefined ? [] : [target.remoteName]),
    ...(target.branchName === undefined ? [] : [target.branchName]),
  ];
}

export function planGitRemotePull(
  request: GitPullRemoteChangesRequest = {},
): GitToolResult<GitPullRemoteChangesOutput> {
  const toolId = gitPullRemoteChangesDescriptor.toolId;
  const target = normalizePullTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  const scopeFailure = ensureGitToolScope<GitPullRemoteChangesOutput>(toolId, target.repositoryPath, request.context);
  if (scopeFailure !== undefined) {
    return scopeFailure;
  }

  const permissionFailure = ensureGitToolPermissions<GitPullRemoteChangesOutput>(
    toolId,
    gitPullRemoteChangesDescriptor.permissionsRequired,
    request.context,
    target.repositoryPath,
  );
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const realExecutionFailure = blockRealGitExecution<GitPullRemoteChangesOutput>(
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
      kind: "agentCore.basicTool.git.pullRemoteChanges",
      target,
      commandPreview: pullCommandPreview(target),
      dryRun: true,
      executionBlocked: true,
      permissionsRequired: gitPullRemoteChangesDescriptor.permissionsRequired,
      unsafeSideEffects: true,
    },
    audit: [
      createGitAuditEvent(
        toolId,
        "agentCore.basicTool.git.pullRemoteChanges.dryRun",
        request.context,
        target.repositoryPath,
        { remoteName: target.remoteName, branchName: target.branchName, integrationMode: target.integrationMode },
      ),
    ],
    events: ["basicTool.git.pullRemoteChanges.dryRun"],
  };
}
