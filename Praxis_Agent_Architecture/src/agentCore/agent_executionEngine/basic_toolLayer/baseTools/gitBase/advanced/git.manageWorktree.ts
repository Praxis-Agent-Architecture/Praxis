/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / Git 基础工具 / 高级 Git 操作。
 * 核心目的：提供 Git 基础工具 / 高级 Git 操作 中的“管理 Git worktree”基础能力原语。
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

export type GitManageWorktreeAction = "list" | "add" | "remove" | "prune";

export type GitManageWorktreeTarget = {
  repositoryPath: string;
  action: GitManageWorktreeAction;
  worktreePath?: string;
  targetRef?: string;
  branchName?: string;
  detach?: boolean;
  force?: boolean;
};

export type GitManageWorktreeRequest = {
  target?: Partial<GitManageWorktreeTarget>;
  context?: GitToolContext;
};

export type GitManageWorktreeOutput = {
  kind: "agentCore.basicTool.git.manageWorktree";
  target: GitManageWorktreeTarget;
  commandPreview: readonly string[];
  dryRun: true;
  executionBlocked: true;
  permissionsRequired: readonly GitToolPermission[];
  unsafeSideEffects: boolean;
};

export const gitManageWorktreeDescriptor = {
  toolId: "git.manageWorktree",
  capability: "manage-worktree",
  route: "agent_executionEngine.basic_toolLayer.baseTools.gitBase.advanced",
  defaultDryRun: true,
  tapOwnsApproval: true,
} as const;

function normalizeWorktreeAction(action: string | undefined): GitManageWorktreeAction {
  if (action === "add" || action === "remove" || action === "prune") {
    return action;
  }

  return "list";
}

function worktreePermissions(action: GitManageWorktreeAction): readonly GitToolPermission[] {
  return action === "list" ? ["git:read", "filesystem:read"] : ["git:read", "git:write", "filesystem:write"];
}

function normalizeWorktreeTarget(
  target: Partial<GitManageWorktreeTarget> | undefined,
  context: GitToolContext | undefined,
): GitManageWorktreeTarget | GitToolResult<GitManageWorktreeOutput> {
  const toolId = gitManageWorktreeDescriptor.toolId;
  const repositoryPath = normalizeGitRepositoryPath(toolId, target?.repositoryPath, context);
  if (typeof repositoryPath !== "string") {
    return repositoryPath;
  }

  const action = normalizeWorktreeAction(target?.action);
  const worktreePath = target?.worktreePath?.trim() || undefined;
  const targetRef = target?.targetRef?.trim() || undefined;
  const branchName = target?.branchName?.trim() || undefined;

  if ((action === "add" || action === "remove") && isBlankGitValue(worktreePath)) {
    return createGitToolFailure(
      toolId,
      "MISSING_TARGET_PATH",
      `${toolId} action ${action} requires target.worktreePath`,
      "input",
      context,
      repositoryPath,
    );
  }

  if (action === "add" && targetRef === undefined && branchName === undefined) {
    return createGitToolFailure(
      toolId,
      "MISSING_TARGET_REF",
      "git.manageWorktree action add requires target.targetRef or target.branchName",
      "input",
      context,
      repositoryPath,
    );
  }

  return {
    repositoryPath,
    action,
    worktreePath,
    targetRef,
    branchName,
    detach: target?.detach === true,
    force: target?.force === true,
  };
}

function worktreeCommandPreview(target: GitManageWorktreeTarget): readonly string[] {
  if (target.action === "list") {
    return ["git", "-C", target.repositoryPath, "worktree", "list", "--porcelain"];
  }

  if (target.action === "remove") {
    return ["git", "-C", target.repositoryPath, "worktree", "remove", ...(target.force ? ["--force"] : []), target.worktreePath ?? ""];
  }

  if (target.action === "prune") {
    return ["git", "-C", target.repositoryPath, "worktree", "prune", ...(target.force ? ["--force"] : [])];
  }

  return [
    "git",
    "-C",
    target.repositoryPath,
    "worktree",
    "add",
    ...(target.force ? ["--force"] : []),
    ...(target.detach ? ["--detach"] : []),
    ...(target.branchName === undefined ? [] : ["-b", target.branchName]),
    target.worktreePath ?? "",
    target.targetRef ?? "",
  ].filter((part) => part.length > 0);
}

export function planGitWorktreeManagement(
  request: GitManageWorktreeRequest = {},
): GitToolResult<GitManageWorktreeOutput> {
  const toolId = gitManageWorktreeDescriptor.toolId;
  const target = normalizeWorktreeTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  const scopeFailure = ensureGitToolScope<GitManageWorktreeOutput>(toolId, target.repositoryPath, request.context);
  if (scopeFailure !== undefined) {
    return scopeFailure;
  }

  const permissionsRequired = worktreePermissions(target.action);
  const permissionFailure = ensureGitToolPermissions<GitManageWorktreeOutput>(
    toolId,
    permissionsRequired,
    request.context,
    target.repositoryPath,
  );
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const realExecutionFailure = blockRealGitExecution<GitManageWorktreeOutput>(
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
      kind: "agentCore.basicTool.git.manageWorktree",
      target,
      commandPreview: worktreeCommandPreview(target),
      dryRun: true,
      executionBlocked: true,
      permissionsRequired,
      unsafeSideEffects: target.action !== "list",
    },
    audit: [
      createGitAuditEvent(toolId, "agentCore.basicTool.git.manageWorktree.dryRun", request.context, target.repositoryPath, {
        action: target.action,
      }),
    ],
    events: ["basicTool.git.manageWorktree.dryRun"],
  };
}
