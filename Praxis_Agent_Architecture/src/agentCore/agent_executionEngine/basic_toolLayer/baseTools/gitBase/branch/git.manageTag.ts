/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / Git 基础工具 / 分支操作。
 * 核心目的：提供 Git 基础工具 / 分支操作 中的“管理标签”基础能力原语。
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

export type GitManageTagAction = "list" | "create" | "delete" | "annotate";

export type GitManageTagTarget = {
  repositoryPath: string;
  action: GitManageTagAction;
  tagName?: string;
  targetRef?: string;
  message?: string;
  force?: boolean;
};

export type GitManageTagRequest = {
  target?: Partial<GitManageTagTarget>;
  context?: GitToolContext;
};

export type GitManageTagOutput = {
  kind: "agentCore.basicTool.git.manageTag";
  target: GitManageTagTarget;
  commandPreview: readonly string[];
  dryRun: true;
  executionBlocked: true;
  permissionsRequired: readonly GitToolPermission[];
  unsafeSideEffects: boolean;
};

export const gitManageTagDescriptor = {
  toolId: "git.manageTag",
  capability: "manage-tag",
  route: "agent_executionEngine.basic_toolLayer.baseTools.gitBase.branch",
  defaultDryRun: true,
  tapOwnsApproval: true,
} as const;

function normalizeTagAction(action: string | undefined): GitManageTagAction {
  if (action === "create" || action === "delete" || action === "annotate") {
    return action;
  }

  return "list";
}

function tagPermissions(action: GitManageTagAction): readonly GitToolPermission[] {
  return action === "list" ? ["git:read"] : ["git:read", "git:write"];
}

function normalizeTagTarget(
  target: Partial<GitManageTagTarget> | undefined,
  context: GitToolContext | undefined,
): GitManageTagTarget | GitToolResult<GitManageTagOutput> {
  const toolId = gitManageTagDescriptor.toolId;
  const repositoryPath = normalizeGitRepositoryPath(toolId, target?.repositoryPath, context);
  if (typeof repositoryPath !== "string") {
    return repositoryPath;
  }

  const action = normalizeTagAction(target?.action);
  const tagName = target?.tagName?.trim() || undefined;
  const targetRef = target?.targetRef?.trim() || undefined;
  const message = target?.message?.trim() || undefined;

  if (action !== "list" && isBlankGitValue(tagName)) {
    return createGitToolFailure(
      toolId,
      "MISSING_TAG_NAME",
      `${toolId} action ${action} requires target.tagName`,
      "input",
      context,
      repositoryPath,
    );
  }

  if (action === "annotate" && isBlankGitValue(message)) {
    return createGitToolFailure(
      toolId,
      "MISSING_REQUIRED_FIELD",
      "git.manageTag action annotate requires target.message",
      "input",
      context,
      repositoryPath,
    );
  }

  return {
    repositoryPath,
    action,
    tagName,
    targetRef,
    message,
    force: target?.force === true,
  };
}

function tagCommandPreview(target: GitManageTagTarget): readonly string[] {
  if (target.action === "list") {
    return ["git", "-C", target.repositoryPath, "tag", "--list"];
  }

  if (target.action === "create") {
    return [
      "git",
      "-C",
      target.repositoryPath,
      "tag",
      ...(target.force ? ["--force"] : []),
      target.tagName ?? "",
      target.targetRef ?? "HEAD",
    ];
  }

  if (target.action === "delete") {
    return ["git", "-C", target.repositoryPath, "tag", "-d", target.tagName ?? ""];
  }

  return [
    "git",
    "-C",
    target.repositoryPath,
    "tag",
    "-a",
    ...(target.force ? ["--force"] : []),
    target.tagName ?? "",
    target.targetRef ?? "HEAD",
    "-m",
    target.message ?? "",
  ];
}

export function planGitTagManagement(request: GitManageTagRequest = {}): GitToolResult<GitManageTagOutput> {
  const toolId = gitManageTagDescriptor.toolId;
  const target = normalizeTagTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  const scopeFailure = ensureGitToolScope<GitManageTagOutput>(toolId, target.repositoryPath, request.context);
  if (scopeFailure !== undefined) {
    return scopeFailure;
  }

  const permissionsRequired = tagPermissions(target.action);
  const permissionFailure = ensureGitToolPermissions<GitManageTagOutput>(
    toolId,
    permissionsRequired,
    request.context,
    target.repositoryPath,
  );
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const realExecutionFailure = blockRealGitExecution<GitManageTagOutput>(toolId, request.context, target.repositoryPath);
  if (realExecutionFailure !== undefined) {
    return realExecutionFailure;
  }

  return {
    ok: true,
    toolId,
    output: {
      kind: "agentCore.basicTool.git.manageTag",
      target,
      commandPreview: tagCommandPreview(target),
      dryRun: true,
      executionBlocked: true,
      permissionsRequired,
      unsafeSideEffects: target.action !== "list",
    },
    audit: [
      createGitAuditEvent(toolId, "agentCore.basicTool.git.manageTag.dryRun", request.context, target.repositoryPath, {
        action: target.action,
      }),
    ],
    events: ["basicTool.git.manageTag.dryRun"],
  };
}
