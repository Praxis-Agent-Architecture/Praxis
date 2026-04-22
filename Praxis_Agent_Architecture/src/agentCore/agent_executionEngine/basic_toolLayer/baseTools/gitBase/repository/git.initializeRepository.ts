/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / Git 基础工具 / 仓库操作。
 * 核心目的：提供 Git 基础工具 / 仓库操作 中的“初始化仓库”基础能力原语。
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
  normalizeGitRepositoryPath,
  type GitToolContext,
  type GitToolPermission,
  type GitToolResult,
} from "../branch/git.manageBranch.js";

export type GitInitializeRepositoryTarget = {
  repositoryPath: string;
  initialBranch?: string;
  bare?: boolean;
  separateGitDir?: string;
};

export type GitInitializeRepositoryRequest = {
  target?: Partial<GitInitializeRepositoryTarget>;
  context?: GitToolContext;
};

export type GitInitializeRepositoryOutput = {
  kind: "agentCore.basicTool.git.initializeRepository";
  target: GitInitializeRepositoryTarget;
  commandPreview: readonly string[];
  dryRun: true;
  executionBlocked: true;
  permissionsRequired: readonly GitToolPermission[];
  unsafeSideEffects: true;
};

export const gitInitializeRepositoryDescriptor = {
  toolId: "git.initializeRepository",
  capability: "initialize-repository",
  route: "agent_executionEngine.basic_toolLayer.baseTools.gitBase.repository",
  permissionsRequired: ["git:write", "filesystem:write"],
  defaultDryRun: true,
  unsafeSideEffects: true,
  tapOwnsApproval: true,
} as const;

function normalizeInitializeTarget(
  target: Partial<GitInitializeRepositoryTarget> | undefined,
  context: GitToolContext | undefined,
): GitInitializeRepositoryTarget | GitToolResult<GitInitializeRepositoryOutput> {
  const toolId = gitInitializeRepositoryDescriptor.toolId;
  const repositoryPath = normalizeGitRepositoryPath(toolId, target?.repositoryPath, context);
  if (typeof repositoryPath !== "string") {
    return repositoryPath;
  }

  const initialBranch = target?.initialBranch?.trim() || undefined;
  const separateGitDir = target?.separateGitDir?.trim() || undefined;
  if (target?.initialBranch !== undefined && initialBranch === undefined) {
    return createGitToolFailure(
      toolId,
      "MISSING_BRANCH_NAME",
      "git.initializeRepository target.initialBranch cannot be blank when provided",
      "input",
      context,
      repositoryPath,
    );
  }

  return {
    repositoryPath,
    initialBranch,
    bare: target?.bare === true,
    separateGitDir,
  };
}

function initializeCommandPreview(target: GitInitializeRepositoryTarget): readonly string[] {
  return [
    "git",
    "init",
    ...(target.initialBranch === undefined ? [] : ["--initial-branch", target.initialBranch]),
    ...(target.bare ? ["--bare"] : []),
    ...(target.separateGitDir === undefined ? [] : ["--separate-git-dir", target.separateGitDir]),
    target.repositoryPath,
  ];
}

export function planGitRepositoryInitialization(
  request: GitInitializeRepositoryRequest = {},
): GitToolResult<GitInitializeRepositoryOutput> {
  const toolId = gitInitializeRepositoryDescriptor.toolId;
  const target = normalizeInitializeTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  const scopeFailure = ensureGitToolScope<GitInitializeRepositoryOutput>(toolId, target.repositoryPath, request.context);
  if (scopeFailure !== undefined) {
    return scopeFailure;
  }

  const permissionFailure = ensureGitToolPermissions<GitInitializeRepositoryOutput>(
    toolId,
    gitInitializeRepositoryDescriptor.permissionsRequired,
    request.context,
    target.repositoryPath,
  );
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const realExecutionFailure = blockRealGitExecution<GitInitializeRepositoryOutput>(
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
      kind: "agentCore.basicTool.git.initializeRepository",
      target,
      commandPreview: initializeCommandPreview(target),
      dryRun: true,
      executionBlocked: true,
      permissionsRequired: gitInitializeRepositoryDescriptor.permissionsRequired,
      unsafeSideEffects: true,
    },
    audit: [
      createGitAuditEvent(
        toolId,
        "agentCore.basicTool.git.initializeRepository.dryRun",
        request.context,
        target.repositoryPath,
        { initialBranch: target.initialBranch },
      ),
    ],
    events: ["basicTool.git.initializeRepository.dryRun"],
  };
}
