/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / Git 基础工具 / 分支操作。
 * 核心目的：提供 Git 基础工具 / 分支操作 中的“切换分支”基础能力原语。
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

export type GitSwitchBranchTarget = {
  repositoryPath: string;
  branchName: string;
  create?: boolean;
  startPoint?: string;
  track?: boolean;
  discardChanges?: boolean;
};

export type GitSwitchBranchRequest = {
  target?: Partial<GitSwitchBranchTarget>;
  context?: GitToolContext;
};

export type GitSwitchBranchOutput = {
  kind: "agentCore.basicTool.git.switchBranch";
  target: GitSwitchBranchTarget;
  commandPreview: readonly string[];
  dryRun: true;
  executionBlocked: true;
  permissionsRequired: readonly GitToolPermission[];
  unsafeSideEffects: true;
};

export const gitSwitchBranchDescriptor = {
  toolId: "git.switchBranch",
  capability: "switch-branch",
  route: "agent_executionEngine.basic_toolLayer.baseTools.gitBase.branch",
  permissionsRequired: ["git:read", "git:write", "filesystem:write"],
  defaultDryRun: true,
  unsafeSideEffects: true,
  tapOwnsApproval: true,
} as const;

function normalizeSwitchTarget(
  target: Partial<GitSwitchBranchTarget> | undefined,
  context: GitToolContext | undefined,
): GitSwitchBranchTarget | GitToolResult<GitSwitchBranchOutput> {
  const toolId = gitSwitchBranchDescriptor.toolId;
  const repositoryPath = normalizeGitRepositoryPath(toolId, target?.repositoryPath, context);
  if (typeof repositoryPath !== "string") {
    return repositoryPath;
  }

  const branchName = target?.branchName?.trim() ?? "";
  if (isBlankGitValue(branchName)) {
    return createGitToolFailure(
      toolId,
      "MISSING_BRANCH_NAME",
      "git.switchBranch requires target.branchName",
      "input",
      context,
      repositoryPath,
    );
  }

  return {
    repositoryPath,
    branchName,
    create: target?.create === true,
    startPoint: target?.startPoint?.trim() || undefined,
    track: target?.track === true,
    discardChanges: target?.discardChanges === true,
  };
}

function switchCommandPreview(target: GitSwitchBranchTarget): readonly string[] {
  return [
    "git",
    "-C",
    target.repositoryPath,
    "switch",
    ...(target.discardChanges ? ["--discard-changes"] : []),
    ...(target.track ? ["--track"] : []),
    ...(target.create ? ["-c", target.branchName] : [target.branchName]),
    ...(target.create && target.startPoint !== undefined ? [target.startPoint] : []),
  ];
}

export function planGitBranchSwitch(request: GitSwitchBranchRequest = {}): GitToolResult<GitSwitchBranchOutput> {
  const toolId = gitSwitchBranchDescriptor.toolId;
  const target = normalizeSwitchTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  const scopeFailure = ensureGitToolScope<GitSwitchBranchOutput>(toolId, target.repositoryPath, request.context);
  if (scopeFailure !== undefined) {
    return scopeFailure;
  }

  const permissionFailure = ensureGitToolPermissions<GitSwitchBranchOutput>(
    toolId,
    gitSwitchBranchDescriptor.permissionsRequired,
    request.context,
    target.repositoryPath,
  );
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const realExecutionFailure = blockRealGitExecution<GitSwitchBranchOutput>(
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
      kind: "agentCore.basicTool.git.switchBranch",
      target,
      commandPreview: switchCommandPreview(target),
      dryRun: true,
      executionBlocked: true,
      permissionsRequired: gitSwitchBranchDescriptor.permissionsRequired,
      unsafeSideEffects: true,
    },
    audit: [
      createGitAuditEvent(toolId, "agentCore.basicTool.git.switchBranch.dryRun", request.context, target.repositoryPath, {
        branchName: target.branchName,
        create: target.create,
      }),
    ],
    events: ["basicTool.git.switchBranch.dryRun"],
  };
}
