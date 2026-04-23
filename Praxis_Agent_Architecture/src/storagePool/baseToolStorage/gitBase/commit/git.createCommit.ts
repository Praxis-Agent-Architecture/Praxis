/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / Git 基础工具 / 提交操作。
 * 核心目的：提供 Git 基础工具 / 提交操作 中的“创建提交”基础能力原语。
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

export type GitCreateCommitTarget = {
  repositoryPath: string;
  commitMessage: string;
  includeAllTracked?: boolean;
  allowEmpty?: boolean;
  signoff?: boolean;
};

export type GitCreateCommitRequest = {
  target?: Partial<GitCreateCommitTarget>;
  context?: GitToolContext;
};

export type GitCreateCommitOutput = {
  kind: "agentCore.basicTool.git.createCommit";
  target: GitCreateCommitTarget;
  commandPreview: readonly string[];
  dryRun: true;
  executionBlocked: true;
  permissionsRequired: readonly GitToolPermission[];
  unsafeSideEffects: true;
};

export const gitCreateCommitDescriptor = {
  toolId: "git.createCommit",
  capability: "create-commit",
  route: "agent_executionEngine.basic_toolLayer.baseTools.gitBase.commit",
  permissionsRequired: ["git:read", "git:write", "filesystem:write"],
  defaultDryRun: true,
  unsafeSideEffects: true,
  tapOwnsApproval: true,
} as const;

function normalizeCreateCommitTarget(
  target: Partial<GitCreateCommitTarget> | undefined,
  context: GitToolContext | undefined,
): GitCreateCommitTarget | GitToolResult<GitCreateCommitOutput> {
  const toolId = gitCreateCommitDescriptor.toolId;
  const repositoryPath = normalizeGitRepositoryPath(toolId, target?.repositoryPath, context);
  if (typeof repositoryPath !== "string") {
    return repositoryPath;
  }

  const commitMessage = target?.commitMessage?.trim() ?? "";
  if (isBlankGitValue(commitMessage)) {
    return createGitToolFailure(
      toolId,
      "MISSING_REQUIRED_FIELD",
      "git.createCommit requires target.commitMessage",
      "input",
      context,
      repositoryPath,
    );
  }

  return {
    repositoryPath,
    commitMessage,
    includeAllTracked: target?.includeAllTracked === true,
    allowEmpty: target?.allowEmpty === true,
    signoff: target?.signoff === true,
  };
}

function createCommitCommandPreview(target: GitCreateCommitTarget): readonly string[] {
  return [
    "git",
    "-C",
    target.repositoryPath,
    "commit",
    ...(target.includeAllTracked ? ["--all"] : []),
    ...(target.allowEmpty ? ["--allow-empty"] : []),
    ...(target.signoff ? ["--signoff"] : []),
    "-m",
    target.commitMessage,
  ];
}

export function planGitCommitCreation(
  request: GitCreateCommitRequest = {},
): GitToolResult<GitCreateCommitOutput> {
  const toolId = gitCreateCommitDescriptor.toolId;
  const target = normalizeCreateCommitTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  const scopeFailure = ensureGitToolScope<GitCreateCommitOutput>(toolId, target.repositoryPath, request.context);
  if (scopeFailure !== undefined) {
    return scopeFailure;
  }

  const permissionFailure = ensureGitToolPermissions<GitCreateCommitOutput>(
    toolId,
    gitCreateCommitDescriptor.permissionsRequired,
    request.context,
    target.repositoryPath,
  );
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const realExecutionFailure = blockRealGitExecution<GitCreateCommitOutput>(
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
      kind: "agentCore.basicTool.git.createCommit",
      target,
      commandPreview: createCommitCommandPreview(target),
      dryRun: true,
      executionBlocked: true,
      permissionsRequired: gitCreateCommitDescriptor.permissionsRequired,
      unsafeSideEffects: true,
    },
    audit: [
      createGitAuditEvent(
        toolId,
        "agentCore.basicTool.git.createCommit.dryRun",
        request.context,
        target.repositoryPath,
        { includeAllTracked: target.includeAllTracked, allowEmpty: target.allowEmpty },
      ),
    ],
    events: ["basicTool.git.createCommit.dryRun"],
  };
}
