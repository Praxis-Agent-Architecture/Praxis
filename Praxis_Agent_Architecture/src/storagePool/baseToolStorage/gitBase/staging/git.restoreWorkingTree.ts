/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / Git 基础工具 / 暂存区操作。
 * 核心目的：提供 Git 基础工具 / 暂存区操作 中的“恢复工作树文件”基础能力原语。
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

export type GitRestoreWorkingTreeTarget = {
  repositoryPath: string;
  paths: readonly string[];
  sourceRef?: string;
};

export type GitRestoreWorkingTreeRequest = {
  target?: Partial<GitRestoreWorkingTreeTarget>;
  context?: GitToolContext;
};

export type GitRestoreWorkingTreeOutput = {
  kind: "agentCore.basicTool.git.restoreWorkingTree";
  target: GitRestoreWorkingTreeTarget;
  commandPreview: readonly string[];
  dryRun: true;
  executionBlocked: true;
  permissionsRequired: readonly GitToolPermission[];
  unsafeSideEffects: true;
};

export const gitRestoreWorkingTreeDescriptor = {
  toolId: "git.restoreWorkingTree",
  capability: "restore-working-tree",
  route: "agent_executionEngine.basic_toolLayer.baseTools.gitBase.staging",
  permissionsRequired: ["git:read", "git:write", "filesystem:write"],
  defaultDryRun: true,
  unsafeSideEffects: true,
  tapOwnsApproval: true,
} as const;

function normalizeRestoreWorkingTreeTarget(
  target: Partial<GitRestoreWorkingTreeTarget> | undefined,
  context: GitToolContext | undefined,
): GitRestoreWorkingTreeTarget | GitToolResult<GitRestoreWorkingTreeOutput> {
  const toolId = gitRestoreWorkingTreeDescriptor.toolId;
  const repositoryPath = normalizeGitRepositoryPath(toolId, target?.repositoryPath, context);
  if (typeof repositoryPath !== "string") {
    return repositoryPath;
  }

  const paths = cleanGitList(target?.paths);
  if (paths.length === 0) {
    return createGitToolFailure(
      toolId,
      "MISSING_TARGET_PATH",
      "git.restoreWorkingTree requires at least one target path",
      "input",
      context,
      repositoryPath,
    );
  }

  return {
    repositoryPath,
    paths,
    sourceRef: target?.sourceRef?.trim() || undefined,
  };
}

function restoreWorkingTreeCommandPreview(target: GitRestoreWorkingTreeTarget): readonly string[] {
  return [
    "git",
    "-C",
    target.repositoryPath,
    "restore",
    ...(target.sourceRef === undefined ? [] : ["--source", target.sourceRef]),
    "--worktree",
    "--",
    ...target.paths,
  ];
}

export function planGitRestoreWorkingTree(
  request: GitRestoreWorkingTreeRequest = {},
): GitToolResult<GitRestoreWorkingTreeOutput> {
  const toolId = gitRestoreWorkingTreeDescriptor.toolId;
  const target = normalizeRestoreWorkingTreeTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  const scopeFailure = ensureGitToolScope<GitRestoreWorkingTreeOutput>(
    toolId,
    target.repositoryPath,
    request.context,
  );
  if (scopeFailure !== undefined) {
    return scopeFailure;
  }

  const permissionFailure = ensureGitToolPermissions<GitRestoreWorkingTreeOutput>(
    toolId,
    gitRestoreWorkingTreeDescriptor.permissionsRequired,
    request.context,
    target.repositoryPath,
  );
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const realExecutionFailure = blockRealGitExecution<GitRestoreWorkingTreeOutput>(
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
      kind: "agentCore.basicTool.git.restoreWorkingTree",
      target,
      commandPreview: restoreWorkingTreeCommandPreview(target),
      dryRun: true,
      executionBlocked: true,
      permissionsRequired: gitRestoreWorkingTreeDescriptor.permissionsRequired,
      unsafeSideEffects: true,
    },
    audit: [
      createGitAuditEvent(
        toolId,
        "agentCore.basicTool.git.restoreWorkingTree.dryRun",
        request.context,
        target.repositoryPath,
        { pathCount: target.paths.length, sourceRef: target.sourceRef },
      ),
    ],
    events: ["basicTool.git.restoreWorkingTree.dryRun"],
  };
}
