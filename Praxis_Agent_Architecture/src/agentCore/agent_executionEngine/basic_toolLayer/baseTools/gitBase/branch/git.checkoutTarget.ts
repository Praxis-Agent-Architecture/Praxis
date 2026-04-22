/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / Git 基础工具 / 分支操作。
 * 核心目的：提供 Git 基础工具 / 分支操作 中的“检出目标引用”基础能力原语。
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

export type GitCheckoutTarget = {
  repositoryPath: string;
  targetRef: string;
  newBranchName?: string;
  detach?: boolean;
  force?: boolean;
};

export type GitCheckoutTargetRequest = {
  target?: Partial<GitCheckoutTarget>;
  context?: GitToolContext;
};

export type GitCheckoutTargetOutput = {
  kind: "agentCore.basicTool.git.checkoutTarget";
  target: GitCheckoutTarget;
  commandPreview: readonly string[];
  dryRun: true;
  executionBlocked: true;
  permissionsRequired: readonly GitToolPermission[];
  unsafeSideEffects: true;
};

export const gitCheckoutTargetDescriptor = {
  toolId: "git.checkoutTarget",
  capability: "checkout-target",
  route: "agent_executionEngine.basic_toolLayer.baseTools.gitBase.branch",
  permissionsRequired: ["git:read", "git:write", "filesystem:write"],
  defaultDryRun: true,
  unsafeSideEffects: true,
  tapOwnsApproval: true,
} as const;

function normalizeCheckoutTarget(
  target: Partial<GitCheckoutTarget> | undefined,
  context: GitToolContext | undefined,
): GitCheckoutTarget | GitToolResult<GitCheckoutTargetOutput> {
  const toolId = gitCheckoutTargetDescriptor.toolId;
  const repositoryPath = normalizeGitRepositoryPath(toolId, target?.repositoryPath, context);
  if (typeof repositoryPath !== "string") {
    return repositoryPath;
  }

  const targetRef = target?.targetRef?.trim() ?? "";
  if (isBlankGitValue(targetRef)) {
    return createGitToolFailure(
      toolId,
      "MISSING_TARGET_REF",
      "git.checkoutTarget requires target.targetRef",
      "input",
      context,
      repositoryPath,
    );
  }

  return {
    repositoryPath,
    targetRef,
    newBranchName: target?.newBranchName?.trim() || undefined,
    detach: target?.detach === true,
    force: target?.force === true,
  };
}

function checkoutCommandPreview(target: GitCheckoutTarget): readonly string[] {
  return [
    "git",
    "-C",
    target.repositoryPath,
    "checkout",
    ...(target.force ? ["--force"] : []),
    ...(target.detach ? ["--detach"] : []),
    ...(target.newBranchName === undefined ? [] : ["-b", target.newBranchName]),
    target.targetRef,
  ];
}

export function planGitTargetCheckout(
  request: GitCheckoutTargetRequest = {},
): GitToolResult<GitCheckoutTargetOutput> {
  const toolId = gitCheckoutTargetDescriptor.toolId;
  const target = normalizeCheckoutTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  const scopeFailure = ensureGitToolScope<GitCheckoutTargetOutput>(toolId, target.repositoryPath, request.context);
  if (scopeFailure !== undefined) {
    return scopeFailure;
  }

  const permissionFailure = ensureGitToolPermissions<GitCheckoutTargetOutput>(
    toolId,
    gitCheckoutTargetDescriptor.permissionsRequired,
    request.context,
    target.repositoryPath,
  );
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const realExecutionFailure = blockRealGitExecution<GitCheckoutTargetOutput>(
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
      kind: "agentCore.basicTool.git.checkoutTarget",
      target,
      commandPreview: checkoutCommandPreview(target),
      dryRun: true,
      executionBlocked: true,
      permissionsRequired: gitCheckoutTargetDescriptor.permissionsRequired,
      unsafeSideEffects: true,
    },
    audit: [
      createGitAuditEvent(toolId, "agentCore.basicTool.git.checkoutTarget.dryRun", request.context, target.repositoryPath, {
        targetRef: target.targetRef,
      }),
    ],
    events: ["basicTool.git.checkoutTarget.dryRun"],
  };
}
