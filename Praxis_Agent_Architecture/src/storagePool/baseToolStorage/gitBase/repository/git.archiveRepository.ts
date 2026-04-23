/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / Git 基础工具 / 仓库操作。
 * 核心目的：提供 Git 基础工具 / 仓库操作 中的“归档仓库”基础能力原语。
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

export type GitArchiveFormat = "tar" | "zip";

export type GitArchiveRepositoryTarget = {
  repositoryPath: string;
  outputPath: string;
  ref: string;
  format: GitArchiveFormat;
  pathspecs: readonly string[];
  prefix?: string;
};

export type GitArchiveRepositoryRequest = {
  target?: Partial<GitArchiveRepositoryTarget>;
  context?: GitToolContext;
};

export type GitArchiveRepositoryOutput = {
  kind: "agentCore.basicTool.git.archiveRepository";
  target: GitArchiveRepositoryTarget;
  commandPreview: readonly string[];
  dryRun: true;
  executionBlocked: true;
  permissionsRequired: readonly GitToolPermission[];
  unsafeSideEffects: true;
};

export const gitArchiveRepositoryDescriptor = {
  toolId: "git.archiveRepository",
  capability: "archive-repository",
  route: "agent_executionEngine.basic_toolLayer.baseTools.gitBase.repository",
  permissionsRequired: ["git:read", "filesystem:write"],
  defaultDryRun: true,
  unsafeSideEffects: true,
  tapOwnsApproval: true,
} as const;

function normalizeArchiveFormat(format: GitArchiveFormat | undefined): GitArchiveFormat {
  return format === "zip" ? "zip" : "tar";
}

function normalizePathspecs(pathspecs: readonly string[] | undefined): readonly string[] {
  return [...new Set((pathspecs ?? []).map((pathspec) => pathspec.trim()).filter(Boolean))];
}

function normalizeArchiveTarget(
  target: Partial<GitArchiveRepositoryTarget> | undefined,
  context: GitToolContext | undefined,
): GitArchiveRepositoryTarget | GitToolResult<GitArchiveRepositoryOutput> {
  const toolId = gitArchiveRepositoryDescriptor.toolId;
  const repositoryPath = normalizeGitRepositoryPath(toolId, target?.repositoryPath, context);
  if (typeof repositoryPath !== "string") {
    return repositoryPath;
  }

  const outputPath = target?.outputPath?.trim() ?? "";
  if (isBlankGitValue(outputPath)) {
    return createGitToolFailure(
      toolId,
      "MISSING_TARGET_PATH",
      "git.archiveRepository requires target.outputPath",
      "input",
      context,
      repositoryPath,
    );
  }

  return {
    repositoryPath,
    outputPath,
    ref: target?.ref?.trim() || "HEAD",
    format: normalizeArchiveFormat(target?.format),
    pathspecs: normalizePathspecs(target?.pathspecs),
    prefix: target?.prefix?.trim() || undefined,
  };
}

function archiveCommandPreview(target: GitArchiveRepositoryTarget): readonly string[] {
  return [
    "git",
    "-C",
    target.repositoryPath,
    "archive",
    `--format=${target.format}`,
    "--output",
    target.outputPath,
    ...(target.prefix === undefined ? [] : [`--prefix=${target.prefix}`]),
    target.ref,
    ...target.pathspecs,
  ];
}

export function planGitRepositoryArchive(
  request: GitArchiveRepositoryRequest = {},
): GitToolResult<GitArchiveRepositoryOutput> {
  const toolId = gitArchiveRepositoryDescriptor.toolId;
  const target = normalizeArchiveTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  const scopeFailure = ensureGitToolScope<GitArchiveRepositoryOutput>(toolId, target.repositoryPath, request.context);
  if (scopeFailure !== undefined) {
    return scopeFailure;
  }

  const permissionFailure = ensureGitToolPermissions<GitArchiveRepositoryOutput>(
    toolId,
    gitArchiveRepositoryDescriptor.permissionsRequired,
    request.context,
    target.repositoryPath,
  );
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const realExecutionFailure = blockRealGitExecution<GitArchiveRepositoryOutput>(
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
      kind: "agentCore.basicTool.git.archiveRepository",
      target,
      commandPreview: archiveCommandPreview(target),
      dryRun: true,
      executionBlocked: true,
      permissionsRequired: gitArchiveRepositoryDescriptor.permissionsRequired,
      unsafeSideEffects: true,
    },
    audit: [
      createGitAuditEvent(
        toolId,
        "agentCore.basicTool.git.archiveRepository.dryRun",
        request.context,
        target.repositoryPath,
        { outputPath: target.outputPath, ref: target.ref, format: target.format },
      ),
    ],
    events: ["basicTool.git.archiveRepository.dryRun"],
  };
}
