/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / Git 基础工具 / 分支操作。
 * 核心目的：提供 Git 基础工具 / 分支操作 中的“合并分支”基础能力原语。
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

export type GitMergeBranchMode = "default" | "ff-only" | "no-ff" | "squash";

export type GitMergeBranchTarget = {
  repositoryPath: string;
  sourceBranch: string;
  mode?: GitMergeBranchMode;
  commitMessage?: string;
  noCommit?: boolean;
  allowUnrelatedHistories?: boolean;
};

export type GitMergeBranchRequest = {
  target?: Partial<GitMergeBranchTarget>;
  context?: GitToolContext;
};

export type GitMergeBranchOutput = {
  kind: "agentCore.basicTool.git.mergeBranch";
  target: GitMergeBranchTarget;
  commandPreview: readonly string[];
  dryRun: true;
  executionBlocked: true;
  permissionsRequired: readonly GitToolPermission[];
  unsafeSideEffects: true;
};

export const gitMergeBranchDescriptor = {
  toolId: "git.mergeBranch",
  capability: "merge-branch",
  route: "agent_executionEngine.basic_toolLayer.baseTools.gitBase.branch",
  permissionsRequired: ["git:read", "git:write", "filesystem:write"],
  defaultDryRun: true,
  unsafeSideEffects: true,
  tapOwnsApproval: true,
} as const;

function normalizeMergeMode(mode: GitMergeBranchMode | undefined): GitMergeBranchMode {
  return mode === "ff-only" || mode === "no-ff" || mode === "squash" ? mode : "default";
}

function normalizeMergeTarget(
  target: Partial<GitMergeBranchTarget> | undefined,
  context: GitToolContext | undefined,
): GitMergeBranchTarget | GitToolResult<GitMergeBranchOutput> {
  const toolId = gitMergeBranchDescriptor.toolId;
  const repositoryPath = normalizeGitRepositoryPath(toolId, target?.repositoryPath, context);
  if (typeof repositoryPath !== "string") {
    return repositoryPath;
  }

  const sourceBranch = target?.sourceBranch?.trim() ?? "";
  if (isBlankGitValue(sourceBranch)) {
    return createGitToolFailure(
      toolId,
      "MISSING_BRANCH_NAME",
      "git.mergeBranch requires target.sourceBranch",
      "input",
      context,
      repositoryPath,
    );
  }

  return {
    repositoryPath,
    sourceBranch,
    mode: normalizeMergeMode(target?.mode),
    commitMessage: target?.commitMessage?.trim() || undefined,
    noCommit: target?.noCommit === true,
    allowUnrelatedHistories: target?.allowUnrelatedHistories === true,
  };
}

function mergeCommandPreview(target: GitMergeBranchTarget): readonly string[] {
  return [
    "git",
    "-C",
    target.repositoryPath,
    "merge",
    ...(target.mode === "ff-only" ? ["--ff-only"] : []),
    ...(target.mode === "no-ff" ? ["--no-ff"] : []),
    ...(target.mode === "squash" ? ["--squash"] : []),
    ...(target.noCommit ? ["--no-commit"] : []),
    ...(target.allowUnrelatedHistories ? ["--allow-unrelated-histories"] : []),
    ...(target.commitMessage === undefined ? [] : ["-m", target.commitMessage]),
    target.sourceBranch,
  ];
}

export function planGitBranchMerge(request: GitMergeBranchRequest = {}): GitToolResult<GitMergeBranchOutput> {
  const toolId = gitMergeBranchDescriptor.toolId;
  const target = normalizeMergeTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  const scopeFailure = ensureGitToolScope<GitMergeBranchOutput>(toolId, target.repositoryPath, request.context);
  if (scopeFailure !== undefined) {
    return scopeFailure;
  }

  const permissionFailure = ensureGitToolPermissions<GitMergeBranchOutput>(
    toolId,
    gitMergeBranchDescriptor.permissionsRequired,
    request.context,
    target.repositoryPath,
  );
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const realExecutionFailure = blockRealGitExecution<GitMergeBranchOutput>(
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
      kind: "agentCore.basicTool.git.mergeBranch",
      target,
      commandPreview: mergeCommandPreview(target),
      dryRun: true,
      executionBlocked: true,
      permissionsRequired: gitMergeBranchDescriptor.permissionsRequired,
      unsafeSideEffects: true,
    },
    audit: [
      createGitAuditEvent(toolId, "agentCore.basicTool.git.mergeBranch.dryRun", request.context, target.repositoryPath, {
        sourceBranch: target.sourceBranch,
        mode: target.mode,
      }),
    ],
    events: ["basicTool.git.mergeBranch.dryRun"],
  };
}
