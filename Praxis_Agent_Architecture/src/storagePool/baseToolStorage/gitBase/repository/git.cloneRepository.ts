/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / Git 基础工具 / 仓库操作。
 * 核心目的：提供 Git 基础工具 / 仓库操作 中的“克隆仓库”基础能力原语。
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
  type GitToolContext,
  type GitToolPermission,
  type GitToolResult,
} from "../branch/git.manageBranch.js";

export type GitCloneRepositoryTarget = {
  remoteUrl: string;
  destinationPath: string;
  branch?: string;
  depth?: number;
  singleBranch?: boolean;
  bare?: boolean;
  mirror?: boolean;
};

export type GitCloneRepositoryRequest = {
  target?: Partial<GitCloneRepositoryTarget>;
  context?: GitToolContext;
};

export type GitCloneRepositoryOutput = {
  kind: "agentCore.basicTool.git.cloneRepository";
  target: GitCloneRepositoryTarget;
  commandPreview: readonly string[];
  dryRun: true;
  executionBlocked: true;
  permissionsRequired: readonly GitToolPermission[];
  unsafeSideEffects: true;
  mayUseNetwork: true;
};

export const gitCloneRepositoryDescriptor = {
  toolId: "git.cloneRepository",
  capability: "clone-repository",
  route: "agent_executionEngine.basic_toolLayer.baseTools.gitBase.repository",
  permissionsRequired: ["git:read", "filesystem:write"],
  defaultDryRun: true,
  unsafeSideEffects: true,
  tapOwnsApproval: true,
} as const;

function normalizeCloneTarget(
  target: Partial<GitCloneRepositoryTarget> | undefined,
  context: GitToolContext | undefined,
): GitCloneRepositoryTarget | GitToolResult<GitCloneRepositoryOutput> {
  const toolId = gitCloneRepositoryDescriptor.toolId;
  const remoteUrl = target?.remoteUrl?.trim() ?? "";
  if (isBlankGitValue(remoteUrl)) {
    return createGitToolFailure(
      toolId,
      "MISSING_REQUIRED_FIELD",
      "git.cloneRepository requires target.remoteUrl",
      "input",
      context,
    );
  }

  const destinationPath = target?.destinationPath?.trim() ?? "";
  if (isBlankGitValue(destinationPath)) {
    return createGitToolFailure(
      toolId,
      "MISSING_TARGET_PATH",
      "git.cloneRepository requires target.destinationPath",
      "input",
      context,
      target?.destinationPath,
    );
  }

  const depth = target?.depth;
  if (depth !== undefined && (!Number.isInteger(depth) || depth < 1)) {
    return createGitToolFailure(
      toolId,
      "MISSING_REQUIRED_FIELD",
      "git.cloneRepository target.depth must be a positive integer when provided",
      "input",
      context,
      destinationPath,
    );
  }

  return {
    remoteUrl,
    destinationPath,
    branch: target?.branch?.trim() || undefined,
    depth,
    singleBranch: target?.singleBranch === true,
    bare: target?.bare === true,
    mirror: target?.mirror === true,
  };
}

function cloneCommandPreview(target: GitCloneRepositoryTarget): readonly string[] {
  return [
    "git",
    "clone",
    ...(target.branch === undefined ? [] : ["--branch", target.branch]),
    ...(target.depth === undefined ? [] : ["--depth", String(target.depth)]),
    ...(target.singleBranch ? ["--single-branch"] : []),
    ...(target.bare ? ["--bare"] : []),
    ...(target.mirror ? ["--mirror"] : []),
    target.remoteUrl,
    target.destinationPath,
  ];
}

export function planGitRepositoryClone(
  request: GitCloneRepositoryRequest = {},
): GitToolResult<GitCloneRepositoryOutput> {
  const toolId = gitCloneRepositoryDescriptor.toolId;
  const target = normalizeCloneTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  const scopeFailure = ensureGitToolScope<GitCloneRepositoryOutput>(
    toolId,
    target.destinationPath,
    request.context,
  );
  if (scopeFailure !== undefined) {
    return scopeFailure;
  }

  const permissionFailure = ensureGitToolPermissions<GitCloneRepositoryOutput>(
    toolId,
    gitCloneRepositoryDescriptor.permissionsRequired,
    request.context,
    target.destinationPath,
  );
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const realExecutionFailure = blockRealGitExecution<GitCloneRepositoryOutput>(
    toolId,
    request.context,
    target.destinationPath,
  );
  if (realExecutionFailure !== undefined) {
    return realExecutionFailure;
  }

  return {
    ok: true,
    toolId,
    output: {
      kind: "agentCore.basicTool.git.cloneRepository",
      target,
      commandPreview: cloneCommandPreview(target),
      dryRun: true,
      executionBlocked: true,
      permissionsRequired: gitCloneRepositoryDescriptor.permissionsRequired,
      unsafeSideEffects: true,
      mayUseNetwork: true,
    },
    audit: [
      createGitAuditEvent(toolId, "agentCore.basicTool.git.cloneRepository.dryRun", request.context, target.destinationPath, {
        remoteUrl: target.remoteUrl,
      }),
    ],
    events: ["basicTool.git.cloneRepository.dryRun"],
  };
}
