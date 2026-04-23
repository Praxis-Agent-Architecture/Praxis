/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / Git 基础工具 / 分支操作。
 * 核心目的：提供 Git 基础工具 / 分支操作 中的“变基分支”基础能力原语。
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
} from "./git.manageBranch.js";

export type GitRebaseBranchTarget = {
  repositoryPath: string;
  upstreamRef: string;
  branchName?: string;
  ontoRef?: string;
  keepBase?: boolean;
  autosquash?: boolean;
  interactive?: boolean;
};

export type GitRebaseBranchRequest = {
  target?: Partial<GitRebaseBranchTarget>;
  context?: GitToolContext;
};

export type GitRebaseBranchOutput = {
  kind: "agentCore.basicTool.git.rebaseBranch";
  target: GitRebaseBranchTarget;
  commandPreview: readonly string[];
  dryRun: true;
  executionBlocked: true;
  permissionsRequired: readonly GitToolPermission[];
  unsafeSideEffects: true;
};

export const gitRebaseBranchDescriptor = {
  toolId: "git.rebaseBranch",
  capability: "rebase-branch",
  route: "agent_executionEngine.basic_toolLayer.baseTools.gitBase.branch",
  permissionsRequired: ["git:read", "git:write", "filesystem:write"],
  defaultDryRun: true,
  unsafeSideEffects: true,
  tapOwnsApproval: true,
} as const;

function normalizeRebaseTarget(
  target: Partial<GitRebaseBranchTarget> | undefined,
  context: GitToolContext | undefined,
): GitRebaseBranchTarget | GitToolResult<GitRebaseBranchOutput> {
  const toolId = gitRebaseBranchDescriptor.toolId;
  const repositoryPath = normalizeGitRepositoryPath(toolId, target?.repositoryPath, context);
  if (typeof repositoryPath !== "string") {
    return repositoryPath;
  }

  const upstreamRef = target?.upstreamRef?.trim() ?? "";
  if (isBlankGitValue(upstreamRef)) {
    return createGitToolFailure(
      toolId,
      "MISSING_TARGET_REF",
      "git.rebaseBranch requires target.upstreamRef",
      "input",
      context,
      repositoryPath,
    );
  }

  return {
    repositoryPath,
    upstreamRef,
    branchName: target?.branchName?.trim() || undefined,
    ontoRef: target?.ontoRef?.trim() || undefined,
    keepBase: target?.keepBase === true,
    autosquash: target?.autosquash === true,
    interactive: target?.interactive === true,
  };
}

function rebaseCommandPreview(target: GitRebaseBranchTarget): readonly string[] {
  return [
    "git",
    "-C",
    target.repositoryPath,
    "rebase",
    ...(target.interactive ? ["--interactive"] : []),
    ...(target.autosquash ? ["--autosquash"] : []),
    ...(target.keepBase ? ["--keep-base"] : []),
    ...(target.ontoRef === undefined ? [] : ["--onto", target.ontoRef]),
    target.upstreamRef,
    ...(target.branchName === undefined ? [] : [target.branchName]),
  ];
}

export function planGitBranchRebase(request: GitRebaseBranchRequest = {}): GitToolResult<GitRebaseBranchOutput> {
  const toolId = gitRebaseBranchDescriptor.toolId;
  const target = normalizeRebaseTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  const scopeFailure = ensureGitToolScope<GitRebaseBranchOutput>(toolId, target.repositoryPath, request.context);
  if (scopeFailure !== undefined) {
    return scopeFailure;
  }

  const permissionFailure = ensureGitToolPermissions<GitRebaseBranchOutput>(
    toolId,
    gitRebaseBranchDescriptor.permissionsRequired,
    request.context,
    target.repositoryPath,
  );
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const realExecutionFailure = blockRealGitExecution<GitRebaseBranchOutput>(
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
      kind: "agentCore.basicTool.git.rebaseBranch",
      target,
      commandPreview: rebaseCommandPreview(target),
      dryRun: true,
      executionBlocked: true,
      permissionsRequired: gitRebaseBranchDescriptor.permissionsRequired,
      unsafeSideEffects: true,
    },
    audit: [
      createGitAuditEvent(toolId, "agentCore.basicTool.git.rebaseBranch.dryRun", request.context, target.repositoryPath, {
        upstreamRef: target.upstreamRef,
        branchName: target.branchName,
      }),
    ],
    events: ["basicTool.git.rebaseBranch.dryRun"],
  };
}
