/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / Git 基础工具 / Git 文件操作。
 * 核心目的：提供 Git 基础工具 / Git 文件操作 中的“管理忽略规则”基础能力原语。
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
  normalizeGitRepositoryPath,
  type GitToolContext,
  type GitToolPermission,
  type GitToolResult,
} from "../branch/git.manageBranch.js";

export type GitManageIgnoreRulesAction = "inspect" | "add" | "remove" | "replace";

export type GitIgnoreRulePatch = {
  action: GitManageIgnoreRulesAction;
  ignoreFilePath: string;
  rules: readonly string[];
};

export type GitManageIgnoreRulesTarget = {
  repositoryPath: string;
  action: GitManageIgnoreRulesAction;
  ignoreFilePath: string;
  rules: readonly string[];
};

export type GitManageIgnoreRulesRequest = {
  target?: Partial<GitManageIgnoreRulesTarget>;
  context?: GitToolContext;
};

export type GitManageIgnoreRulesOutput = {
  kind: "agentCore.basicTool.git.manageIgnoreRules";
  target: GitManageIgnoreRulesTarget;
  patchPreview: GitIgnoreRulePatch;
  dryRun: true;
  executionBlocked: true;
  permissionsRequired: readonly GitToolPermission[];
  unsafeSideEffects: boolean;
};

export const gitManageIgnoreRulesDescriptor = {
  toolId: "git.manageIgnoreRules",
  capability: "manage-ignore-rules",
  route: "agent_executionEngine.basic_toolLayer.baseTools.gitBase.file",
  defaultDryRun: true,
  tapOwnsApproval: true,
} as const;

function normalizeIgnoreAction(action: string | undefined): GitManageIgnoreRulesAction {
  if (action === "add" || action === "remove" || action === "replace") {
    return action;
  }

  return "inspect";
}

function normalizeIgnoreFilePath(
  toolId: string,
  ignoreFilePath: string | undefined,
  context: GitToolContext | undefined,
  repositoryPath: string,
): string | GitToolResult<GitManageIgnoreRulesOutput> {
  const normalizedPath = ignoreFilePath?.trim() || ".gitignore";
  const escaped =
    normalizedPath.startsWith("/") ||
    normalizedPath === ".." ||
    normalizedPath.startsWith("../") ||
    normalizedPath.includes("/../");

  if (escaped) {
    return createGitToolFailure(
      toolId,
      "SCOPE_REJECTED",
      "git.manageIgnoreRules target.ignoreFilePath must stay inside the repository",
      "scope",
      context,
      repositoryPath,
    );
  }

  return normalizedPath;
}

function ignorePermissions(action: GitManageIgnoreRulesAction): readonly GitToolPermission[] {
  if (action === "inspect") {
    return ["git:read", "filesystem:read"];
  }

  return ["git:read", "filesystem:read", "filesystem:write"];
}

function normalizeManageIgnoreRulesTarget(
  target: Partial<GitManageIgnoreRulesTarget> | undefined,
  context: GitToolContext | undefined,
): GitManageIgnoreRulesTarget | GitToolResult<GitManageIgnoreRulesOutput> {
  const toolId = gitManageIgnoreRulesDescriptor.toolId;
  const repositoryPath = normalizeGitRepositoryPath(toolId, target?.repositoryPath, context);
  if (typeof repositoryPath !== "string") {
    return repositoryPath;
  }

  const ignoreFilePath = normalizeIgnoreFilePath(toolId, target?.ignoreFilePath, context, repositoryPath);
  if (typeof ignoreFilePath !== "string") {
    return ignoreFilePath;
  }

  const action = normalizeIgnoreAction(target?.action);
  const rules = cleanGitList(target?.rules);
  if (action !== "inspect" && rules.length === 0) {
    return createGitToolFailure(
      toolId,
      "MISSING_REQUIRED_FIELD",
      `git.manageIgnoreRules action ${action} requires target.rules`,
      "input",
      context,
      repositoryPath,
    );
  }

  return {
    repositoryPath,
    action,
    ignoreFilePath,
    rules,
  };
}

function ignoreRulePatchPreview(target: GitManageIgnoreRulesTarget): GitIgnoreRulePatch {
  return {
    action: target.action,
    ignoreFilePath: target.ignoreFilePath,
    rules: target.rules,
  };
}

export function planGitIgnoreRuleManagement(
  request: GitManageIgnoreRulesRequest = {},
): GitToolResult<GitManageIgnoreRulesOutput> {
  const toolId = gitManageIgnoreRulesDescriptor.toolId;
  const target = normalizeManageIgnoreRulesTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  const scopeFailure = ensureGitToolScope<GitManageIgnoreRulesOutput>(toolId, target.repositoryPath, request.context);
  if (scopeFailure !== undefined) {
    return scopeFailure;
  }

  const permissionsRequired = ignorePermissions(target.action);
  const permissionFailure = ensureGitToolPermissions<GitManageIgnoreRulesOutput>(
    toolId,
    permissionsRequired,
    request.context,
    target.repositoryPath,
  );
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const realExecutionFailure = blockRealGitExecution<GitManageIgnoreRulesOutput>(
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
      kind: "agentCore.basicTool.git.manageIgnoreRules",
      target,
      patchPreview: ignoreRulePatchPreview(target),
      dryRun: true,
      executionBlocked: true,
      permissionsRequired,
      unsafeSideEffects: target.action !== "inspect",
    },
    audit: [
      createGitAuditEvent(
        toolId,
        "agentCore.basicTool.git.manageIgnoreRules.dryRun",
        request.context,
        target.repositoryPath,
        { action: target.action, ignoreFilePath: target.ignoreFilePath, ruleCount: target.rules.length },
      ),
    ],
    events: ["basicTool.git.manageIgnoreRules.dryRun"],
  };
}
