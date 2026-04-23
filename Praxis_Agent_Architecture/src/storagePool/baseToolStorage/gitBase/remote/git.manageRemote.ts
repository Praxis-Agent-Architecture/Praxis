/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / Git 基础工具 / 远端操作。
 * 核心目的：提供 Git 基础工具 / 远端操作 中的“管理远端仓库”基础能力原语。
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

export type GitManageRemoteAction = "list" | "show" | "add" | "remove" | "rename" | "set-url";

export type GitRemoteUrlMode = "fetch" | "push";

export type GitManageRemoteTarget = {
  repositoryPath: string;
  action: GitManageRemoteAction;
  remoteName?: string;
  newRemoteName?: string;
  remoteUrl?: string;
  urlMode?: GitRemoteUrlMode;
};

export type GitManageRemoteRequest = {
  target?: Partial<GitManageRemoteTarget>;
  context?: GitToolContext;
};

export type GitManageRemoteOutput = {
  kind: "agentCore.basicTool.git.manageRemote";
  target: GitManageRemoteTarget;
  commandPreview: readonly string[];
  dryRun: true;
  executionBlocked: true;
  permissionsRequired: readonly GitToolPermission[];
  unsafeSideEffects: boolean;
};

export const gitManageRemoteDescriptor = {
  toolId: "git.manageRemote",
  capability: "manage-remote",
  route: "agent_executionEngine.basic_toolLayer.baseTools.gitBase.remote",
  defaultDryRun: true,
  tapOwnsApproval: true,
} as const;

function normalizeRemoteAction(action: string | undefined): GitManageRemoteAction | undefined {
  if (
    action === undefined ||
    action === "list" ||
    action === "show" ||
    action === "add" ||
    action === "remove" ||
    action === "rename" ||
    action === "set-url"
  ) {
    return action ?? "list";
  }

  return undefined;
}

function remotePermissions(action: GitManageRemoteAction): readonly GitToolPermission[] {
  return action === "list" || action === "show" ? ["git:read"] : ["git:read", "git:write"];
}

function normalizeRemoteUrlMode(urlMode: GitRemoteUrlMode | undefined): GitRemoteUrlMode {
  return urlMode === "push" ? "push" : "fetch";
}

function normalizeRemoteTarget(
  target: Partial<GitManageRemoteTarget> | undefined,
  context: GitToolContext | undefined,
): GitManageRemoteTarget | GitToolResult<GitManageRemoteOutput> {
  const toolId = gitManageRemoteDescriptor.toolId;
  const repositoryPath = normalizeGitRepositoryPath(toolId, target?.repositoryPath, context);
  if (typeof repositoryPath !== "string") {
    return repositoryPath;
  }

  const action = normalizeRemoteAction(target?.action);
  if (action === undefined) {
    return createGitToolFailure(
      toolId,
      "INVALID_ACTION",
      "git.manageRemote target.action must be list, show, add, remove, rename, or set-url",
      "input",
      context,
      repositoryPath,
    );
  }

  const remoteName = target?.remoteName?.trim() || undefined;
  const newRemoteName = target?.newRemoteName?.trim() || undefined;
  const remoteUrl = target?.remoteUrl?.trim() || undefined;

  if (action !== "list" && isBlankGitValue(remoteName)) {
    return createGitToolFailure(
      toolId,
      "MISSING_REQUIRED_FIELD",
      `${toolId} action ${action} requires target.remoteName`,
      "input",
      context,
      repositoryPath,
    );
  }

  if (action === "rename" && isBlankGitValue(newRemoteName)) {
    return createGitToolFailure(
      toolId,
      "MISSING_REQUIRED_FIELD",
      "git.manageRemote action rename requires target.newRemoteName",
      "input",
      context,
      repositoryPath,
    );
  }

  if ((action === "add" || action === "set-url") && isBlankGitValue(remoteUrl)) {
    return createGitToolFailure(
      toolId,
      "MISSING_REQUIRED_FIELD",
      `git.manageRemote action ${action} requires target.remoteUrl`,
      "input",
      context,
      repositoryPath,
    );
  }

  return {
    repositoryPath,
    action,
    remoteName,
    newRemoteName,
    remoteUrl,
    urlMode: normalizeRemoteUrlMode(target?.urlMode),
  };
}

function remoteCommandPreview(target: GitManageRemoteTarget): readonly string[] {
  if (target.action === "list") {
    return ["git", "-C", target.repositoryPath, "remote", "-v"];
  }

  if (target.action === "show") {
    return ["git", "-C", target.repositoryPath, "remote", "show", target.remoteName ?? ""];
  }

  if (target.action === "add") {
    return ["git", "-C", target.repositoryPath, "remote", "add", target.remoteName ?? "", target.remoteUrl ?? ""];
  }

  if (target.action === "remove") {
    return ["git", "-C", target.repositoryPath, "remote", "remove", target.remoteName ?? ""];
  }

  if (target.action === "rename") {
    return ["git", "-C", target.repositoryPath, "remote", "rename", target.remoteName ?? "", target.newRemoteName ?? ""];
  }

  return [
    "git",
    "-C",
    target.repositoryPath,
    "remote",
    "set-url",
    ...(target.urlMode === "push" ? ["--push"] : []),
    target.remoteName ?? "",
    target.remoteUrl ?? "",
  ];
}

export function planGitRemoteManagement(
  request: GitManageRemoteRequest = {},
): GitToolResult<GitManageRemoteOutput> {
  const toolId = gitManageRemoteDescriptor.toolId;
  const target = normalizeRemoteTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  const scopeFailure = ensureGitToolScope<GitManageRemoteOutput>(toolId, target.repositoryPath, request.context);
  if (scopeFailure !== undefined) {
    return scopeFailure;
  }

  const permissionsRequired = remotePermissions(target.action);
  const permissionFailure = ensureGitToolPermissions<GitManageRemoteOutput>(
    toolId,
    permissionsRequired,
    request.context,
    target.repositoryPath,
  );
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const realExecutionFailure = blockRealGitExecution<GitManageRemoteOutput>(
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
      kind: "agentCore.basicTool.git.manageRemote",
      target,
      commandPreview: remoteCommandPreview(target),
      dryRun: true,
      executionBlocked: true,
      permissionsRequired,
      unsafeSideEffects: target.action !== "list" && target.action !== "show",
    },
    audit: [
      createGitAuditEvent(toolId, "agentCore.basicTool.git.manageRemote.dryRun", request.context, target.repositoryPath, {
        action: target.action,
        remoteName: target.remoteName,
      }),
    ],
    events: ["basicTool.git.manageRemote.dryRun"],
  };
}
