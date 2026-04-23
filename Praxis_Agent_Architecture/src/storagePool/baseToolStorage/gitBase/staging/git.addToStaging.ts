/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / Git 基础工具 / 暂存区操作。
 * 核心目的：提供 Git 基础工具 / 暂存区操作 中的“加入暂存区”基础能力原语。
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
  createGitToolFailure,
  ensureGitToolPermissions,
  ensureGitToolScope,
  normalizeGitRepositoryPath,
  type GitToolContext,
  type GitToolPermission,
  type GitToolResult,
} from "../branch/git.manageBranch.js";

export type GitAddToStagingTarget = {
  repositoryPath: string;
  pathspecs: readonly string[];
  all?: boolean;
  update?: boolean;
  intentToAdd?: boolean;
  patch?: boolean;
  force?: boolean;
};

export type GitAddToStagingRequest = {
  target?: Partial<GitAddToStagingTarget>;
  context?: GitToolContext;
};

export type GitAddToStagingOutput = {
  kind: "agentCore.basicTool.git.addToStaging";
  target: GitAddToStagingTarget;
  commandPreview: readonly string[];
  dryRun: true;
  executionBlocked: true;
  permissionsRequired: readonly GitToolPermission[];
  unsafeSideEffects: true;
};

export const gitAddToStagingDescriptor = {
  toolId: "git.addToStaging",
  capability: "add-to-staging",
  route: "agent_executionEngine.basic_toolLayer.baseTools.gitBase.staging",
  permissionsRequired: ["git:read", "git:write", "filesystem:read", "filesystem:write"],
  defaultDryRun: true,
  unsafeSideEffects: true,
  tapOwnsApproval: true,
} as const;

function normalizeAddToStagingTarget(
  target: Partial<GitAddToStagingTarget> | undefined,
  context: GitToolContext | undefined,
): GitAddToStagingTarget | GitToolResult<GitAddToStagingOutput> {
  const toolId = gitAddToStagingDescriptor.toolId;
  const repositoryPath = normalizeGitRepositoryPath(toolId, target?.repositoryPath, context);
  if (typeof repositoryPath !== "string") {
    return repositoryPath;
  }

  const pathspecs = cleanGitList(target?.pathspecs);
  if (pathspecs.length === 0 && target?.all !== true && target?.update !== true) {
    return createGitToolFailure(
      toolId,
      "MISSING_TARGET_PATH",
      "git.addToStaging requires target.pathspecs unless target.all or target.update is true",
      "input",
      context,
      repositoryPath,
    );
  }

  return {
    repositoryPath,
    pathspecs,
    all: target?.all === true,
    update: target?.update === true,
    intentToAdd: target?.intentToAdd === true,
    patch: target?.patch === true,
    force: target?.force === true,
  };
}

function addToStagingCommandPreview(target: GitAddToStagingTarget): readonly string[] {
  return [
    "git",
    "-C",
    target.repositoryPath,
    "add",
    ...(target.all ? ["--all"] : []),
    ...(target.update ? ["--update"] : []),
    ...(target.intentToAdd ? ["--intent-to-add"] : []),
    ...(target.patch ? ["--patch"] : []),
    ...(target.force ? ["--force"] : []),
    ...(target.pathspecs.length === 0 ? [] : ["--", ...target.pathspecs]),
  ];
}

export function planGitAddToStaging(request: GitAddToStagingRequest = {}): GitToolResult<GitAddToStagingOutput> {
  const toolId = gitAddToStagingDescriptor.toolId;
  const target = normalizeAddToStagingTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  const scopeFailure = ensureGitToolScope<GitAddToStagingOutput>(toolId, target.repositoryPath, request.context);
  if (scopeFailure !== undefined) {
    return scopeFailure;
  }

  const permissionFailure = ensureGitToolPermissions<GitAddToStagingOutput>(
    toolId,
    gitAddToStagingDescriptor.permissionsRequired,
    request.context,
    target.repositoryPath,
  );
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const realExecutionFailure = blockRealGitExecution<GitAddToStagingOutput>(
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
      kind: "agentCore.basicTool.git.addToStaging",
      target,
      commandPreview: addToStagingCommandPreview(target),
      dryRun: true,
      executionBlocked: true,
      permissionsRequired: gitAddToStagingDescriptor.permissionsRequired,
      unsafeSideEffects: true,
    },
    audit: [
      createGitAuditEvent(toolId, "agentCore.basicTool.git.addToStaging.dryRun", request.context, target.repositoryPath, {
        pathspecCount: target.pathspecs.length,
        all: target.all,
        update: target.update,
      }),
    ],
    events: ["basicTool.git.addToStaging.dryRun"],
  };
}
