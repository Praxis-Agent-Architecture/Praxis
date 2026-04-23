/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / Git 基础工具 / 提交操作。
 * 核心目的：提供 Git 基础工具 / 提交操作 中的“反向回滚提交”基础能力原语。
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

export type GitRevertCommitTarget = {
  repositoryPath: string;
  commitRef: string;
  noCommit?: boolean;
  mainlineParent?: number;
};

export type GitRevertCommitRequest = {
  target?: Partial<GitRevertCommitTarget>;
  context?: GitToolContext;
};

export type GitRevertCommitOutput = {
  kind: "agentCore.basicTool.git.revertCommit";
  target: GitRevertCommitTarget;
  commandPreview: readonly string[];
  dryRun: true;
  executionBlocked: true;
  permissionsRequired: readonly GitToolPermission[];
  unsafeSideEffects: true;
};

export const gitRevertCommitDescriptor = {
  toolId: "git.revertCommit",
  capability: "revert-commit",
  route: "agent_executionEngine.basic_toolLayer.baseTools.gitBase.commit",
  permissionsRequired: ["git:read", "git:write", "filesystem:write"],
  defaultDryRun: true,
  unsafeSideEffects: true,
  tapOwnsApproval: true,
} as const;

function normalizeRevertTarget(
  target: Partial<GitRevertCommitTarget> | undefined,
  context: GitToolContext | undefined,
): GitRevertCommitTarget | GitToolResult<GitRevertCommitOutput> {
  const toolId = gitRevertCommitDescriptor.toolId;
  const repositoryPath = normalizeGitRepositoryPath(toolId, target?.repositoryPath, context);
  if (typeof repositoryPath !== "string") {
    return repositoryPath;
  }

  const commitRef = target?.commitRef?.trim() ?? "";
  if (isBlankGitValue(commitRef)) {
    return createGitToolFailure(
      toolId,
      "MISSING_TARGET_REF",
      "git.revertCommit requires target.commitRef",
      "input",
      context,
      repositoryPath,
    );
  }

  const mainlineParent = target?.mainlineParent;
  if (mainlineParent !== undefined && (!Number.isInteger(mainlineParent) || mainlineParent < 1)) {
    return createGitToolFailure(
      toolId,
      "MISSING_REQUIRED_FIELD",
      "git.revertCommit target.mainlineParent must be a positive integer when provided",
      "input",
      context,
      repositoryPath,
    );
  }

  return {
    repositoryPath,
    commitRef,
    noCommit: target?.noCommit === true,
    mainlineParent,
  };
}

function revertCommandPreview(target: GitRevertCommitTarget): readonly string[] {
  return [
    "git",
    "-C",
    target.repositoryPath,
    "revert",
    ...(target.noCommit ? ["--no-commit"] : []),
    ...(target.mainlineParent === undefined ? [] : ["--mainline", String(target.mainlineParent)]),
    target.commitRef,
  ];
}

export function planGitCommitRevert(
  request: GitRevertCommitRequest = {},
): GitToolResult<GitRevertCommitOutput> {
  const toolId = gitRevertCommitDescriptor.toolId;
  const target = normalizeRevertTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  const scopeFailure = ensureGitToolScope<GitRevertCommitOutput>(toolId, target.repositoryPath, request.context);
  if (scopeFailure !== undefined) {
    return scopeFailure;
  }

  const permissionFailure = ensureGitToolPermissions<GitRevertCommitOutput>(
    toolId,
    gitRevertCommitDescriptor.permissionsRequired,
    request.context,
    target.repositoryPath,
  );
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const realExecutionFailure = blockRealGitExecution<GitRevertCommitOutput>(
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
      kind: "agentCore.basicTool.git.revertCommit",
      target,
      commandPreview: revertCommandPreview(target),
      dryRun: true,
      executionBlocked: true,
      permissionsRequired: gitRevertCommitDescriptor.permissionsRequired,
      unsafeSideEffects: true,
    },
    audit: [
      createGitAuditEvent(
        toolId,
        "agentCore.basicTool.git.revertCommit.dryRun",
        request.context,
        target.repositoryPath,
        { commitRef: target.commitRef, noCommit: target.noCommit },
      ),
    ],
    events: ["basicTool.git.revertCommit.dryRun"],
  };
}
