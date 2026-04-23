/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / Git 基础工具 / 暂存区操作。
 * 核心目的：提供 Git 基础工具 / 暂存区操作 中的“重置暂存区或提交”基础能力原语。
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
  isBlankGitValue,
  normalizeGitRepositoryPath,
  type GitToolContext,
  type GitToolPermission,
  type GitToolResult,
} from "../branch/git.manageBranch.js";

export type GitResetStagingOrCommitAction = "staging" | "commit";

export type GitResetCommitMode = "soft" | "mixed" | "hard" | "merge" | "keep";

export type GitResetStagingOrCommitTarget = {
  repositoryPath: string;
  action: GitResetStagingOrCommitAction;
  pathspecs: readonly string[];
  targetRef?: string;
  mode?: GitResetCommitMode;
};

export type GitResetStagingOrCommitRequest = {
  target?: Partial<GitResetStagingOrCommitTarget>;
  context?: GitToolContext;
};

export type GitResetStagingOrCommitOutput = {
  kind: "agentCore.basicTool.git.resetStagingOrCommit";
  target: GitResetStagingOrCommitTarget;
  commandPreview: readonly string[];
  dryRun: true;
  executionBlocked: true;
  permissionsRequired: readonly GitToolPermission[];
  unsafeSideEffects: true;
};

export const gitResetStagingOrCommitDescriptor = {
  toolId: "git.resetStagingOrCommit",
  capability: "reset-staging-or-commit",
  route: "agent_executionEngine.basic_toolLayer.baseTools.gitBase.staging",
  permissionsRequired: ["git:read", "git:write", "filesystem:write"],
  defaultDryRun: true,
  unsafeSideEffects: true,
  tapOwnsApproval: true,
} as const;

function normalizeResetAction(
  action: GitResetStagingOrCommitAction | undefined,
  context: GitToolContext | undefined,
  repositoryPath?: string,
): GitResetStagingOrCommitAction | GitToolResult<GitResetStagingOrCommitOutput> {
  const toolId = gitResetStagingOrCommitDescriptor.toolId;
  if (action === undefined) {
    return createGitToolFailure(
      toolId,
      "MISSING_REQUIRED_FIELD",
      "git.resetStagingOrCommit requires target.action",
      "input",
      context,
      repositoryPath,
    );
  }

  if (action !== "staging" && action !== "commit") {
    return createGitToolFailure(
      toolId,
      "INVALID_ACTION",
      "git.resetStagingOrCommit target.action must be staging or commit",
      "input",
      context,
      repositoryPath,
    );
  }

  return action;
}

function normalizeResetMode(
  mode: GitResetCommitMode | undefined,
  context: GitToolContext | undefined,
  repositoryPath: string,
): GitResetCommitMode | GitToolResult<GitResetStagingOrCommitOutput> {
  if (mode === undefined) {
    return "mixed";
  }

  if (mode === "soft" || mode === "mixed" || mode === "hard" || mode === "merge" || mode === "keep") {
    return mode;
  }

  return createGitToolFailure(
    gitResetStagingOrCommitDescriptor.toolId,
    "INVALID_ACTION",
    "git.resetStagingOrCommit target.mode is not supported",
    "input",
    context,
    repositoryPath,
  );
}

function normalizeResetTarget(
  target: Partial<GitResetStagingOrCommitTarget> | undefined,
  context: GitToolContext | undefined,
): GitResetStagingOrCommitTarget | GitToolResult<GitResetStagingOrCommitOutput> {
  const toolId = gitResetStagingOrCommitDescriptor.toolId;
  const repositoryPath = normalizeGitRepositoryPath(toolId, target?.repositoryPath, context);
  if (typeof repositoryPath !== "string") {
    return repositoryPath;
  }

  const action = normalizeResetAction(target?.action, context, repositoryPath);
  if (typeof action !== "string") {
    return action;
  }

  const pathspecs = cleanGitList(target?.pathspecs);
  const targetRef = target?.targetRef?.trim() || undefined;
  if (action === "commit" && isBlankGitValue(targetRef)) {
    return createGitToolFailure(
      toolId,
      "MISSING_TARGET_REF",
      "git.resetStagingOrCommit action commit requires target.targetRef",
      "input",
      context,
      repositoryPath,
    );
  }

  const mode = action === "commit" ? normalizeResetMode(target?.mode, context, repositoryPath) : undefined;
  if (typeof mode !== "string" && mode !== undefined) {
    return mode;
  }

  return {
    repositoryPath,
    action,
    pathspecs,
    targetRef,
    mode,
  };
}

function resetCommandPreview(target: GitResetStagingOrCommitTarget): readonly string[] {
  if (target.action === "staging") {
    return [
      "git",
      "-C",
      target.repositoryPath,
      "reset",
      ...(target.pathspecs.length === 0 ? [] : ["--", ...target.pathspecs]),
    ];
  }

  return ["git", "-C", target.repositoryPath, "reset", `--${target.mode ?? "mixed"}`, target.targetRef ?? ""];
}

export function planGitStagingOrCommitReset(
  request: GitResetStagingOrCommitRequest = {},
): GitToolResult<GitResetStagingOrCommitOutput> {
  const toolId = gitResetStagingOrCommitDescriptor.toolId;
  const target = normalizeResetTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  const scopeFailure = ensureGitToolScope<GitResetStagingOrCommitOutput>(toolId, target.repositoryPath, request.context);
  if (scopeFailure !== undefined) {
    return scopeFailure;
  }

  const permissionFailure = ensureGitToolPermissions<GitResetStagingOrCommitOutput>(
    toolId,
    gitResetStagingOrCommitDescriptor.permissionsRequired,
    request.context,
    target.repositoryPath,
  );
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const realExecutionFailure = blockRealGitExecution<GitResetStagingOrCommitOutput>(
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
      kind: "agentCore.basicTool.git.resetStagingOrCommit",
      target,
      commandPreview: resetCommandPreview(target),
      dryRun: true,
      executionBlocked: true,
      permissionsRequired: gitResetStagingOrCommitDescriptor.permissionsRequired,
      unsafeSideEffects: true,
    },
    audit: [
      createGitAuditEvent(
        toolId,
        "agentCore.basicTool.git.resetStagingOrCommit.dryRun",
        request.context,
        target.repositoryPath,
        { action: target.action, mode: target.mode },
      ),
    ],
    events: ["basicTool.git.resetStagingOrCommit.dryRun"],
  };
}
