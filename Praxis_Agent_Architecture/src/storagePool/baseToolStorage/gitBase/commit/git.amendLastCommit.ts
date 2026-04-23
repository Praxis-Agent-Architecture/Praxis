/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / Git 基础工具 / 提交操作。
 * 核心目的：提供 Git 基础工具 / 提交操作 中的“修订最后一次提交”基础能力原语。
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

export type GitAmendLastCommitTarget = {
  repositoryPath: string;
  commitMessage?: string;
  noEdit?: boolean;
  includeAllTracked?: boolean;
  resetAuthor?: boolean;
};

export type GitAmendLastCommitRequest = {
  target?: Partial<GitAmendLastCommitTarget>;
  context?: GitToolContext;
};

export type GitAmendLastCommitOutput = {
  kind: "agentCore.basicTool.git.amendLastCommit";
  target: GitAmendLastCommitTarget;
  commandPreview: readonly string[];
  dryRun: true;
  executionBlocked: true;
  permissionsRequired: readonly GitToolPermission[];
  unsafeSideEffects: true;
};

export const gitAmendLastCommitDescriptor = {
  toolId: "git.amendLastCommit",
  capability: "amend-last-commit",
  route: "agent_executionEngine.basic_toolLayer.baseTools.gitBase.commit",
  permissionsRequired: ["git:read", "git:write", "filesystem:write"],
  defaultDryRun: true,
  unsafeSideEffects: true,
  tapOwnsApproval: true,
} as const;

function normalizeAmendTarget(
  target: Partial<GitAmendLastCommitTarget> | undefined,
  context: GitToolContext | undefined,
): GitAmendLastCommitTarget | GitToolResult<GitAmendLastCommitOutput> {
  const toolId = gitAmendLastCommitDescriptor.toolId;
  const repositoryPath = normalizeGitRepositoryPath(toolId, target?.repositoryPath, context);
  if (typeof repositoryPath !== "string") {
    return repositoryPath;
  }

  const commitMessage = target?.commitMessage?.trim() || undefined;
  const noEdit = target?.noEdit === true;
  if (!noEdit && isBlankGitValue(commitMessage)) {
    return createGitToolFailure(
      toolId,
      "MISSING_REQUIRED_FIELD",
      "git.amendLastCommit requires target.commitMessage unless target.noEdit is true",
      "input",
      context,
      repositoryPath,
    );
  }

  return {
    repositoryPath,
    commitMessage,
    noEdit,
    includeAllTracked: target?.includeAllTracked === true,
    resetAuthor: target?.resetAuthor === true,
  };
}

function amendCommandPreview(target: GitAmendLastCommitTarget): readonly string[] {
  return [
    "git",
    "-C",
    target.repositoryPath,
    "commit",
    "--amend",
    ...(target.includeAllTracked ? ["--all"] : []),
    ...(target.resetAuthor ? ["--reset-author"] : []),
    ...(target.noEdit ? ["--no-edit"] : ["-m", target.commitMessage ?? ""]),
  ];
}

export function planGitLastCommitAmend(
  request: GitAmendLastCommitRequest = {},
): GitToolResult<GitAmendLastCommitOutput> {
  const toolId = gitAmendLastCommitDescriptor.toolId;
  const target = normalizeAmendTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  const scopeFailure = ensureGitToolScope<GitAmendLastCommitOutput>(toolId, target.repositoryPath, request.context);
  if (scopeFailure !== undefined) {
    return scopeFailure;
  }

  const permissionFailure = ensureGitToolPermissions<GitAmendLastCommitOutput>(
    toolId,
    gitAmendLastCommitDescriptor.permissionsRequired,
    request.context,
    target.repositoryPath,
  );
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const realExecutionFailure = blockRealGitExecution<GitAmendLastCommitOutput>(
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
      kind: "agentCore.basicTool.git.amendLastCommit",
      target,
      commandPreview: amendCommandPreview(target),
      dryRun: true,
      executionBlocked: true,
      permissionsRequired: gitAmendLastCommitDescriptor.permissionsRequired,
      unsafeSideEffects: true,
    },
    audit: [
      createGitAuditEvent(
        toolId,
        "agentCore.basicTool.git.amendLastCommit.dryRun",
        request.context,
        target.repositoryPath,
        { noEdit: target.noEdit, includeAllTracked: target.includeAllTracked },
      ),
    ],
    events: ["basicTool.git.amendLastCommit.dryRun"],
  };
}
