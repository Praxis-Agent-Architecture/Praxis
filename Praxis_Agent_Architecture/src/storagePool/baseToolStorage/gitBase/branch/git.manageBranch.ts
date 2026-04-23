/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / Git 基础工具 / 分支操作。
 * 核心目的：提供 Git 基础工具 / 分支操作 中的“管理分支”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type GitToolBoundary = "input" | "contract" | "permission" | "scope" | "execution" | "environment";

export type GitToolPermission = "git:read" | "git:write" | "filesystem:read" | "filesystem:write";

export type GitToolContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  allowedRepositoryRoots?: readonly string[];
  grantedPermissions?: readonly GitToolPermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type GitToolAuditEvent = {
  type: string;
  toolId: string;
  invocationId: string;
  dryRun: boolean;
  repositoryPath?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type GitToolErrorCode =
  | "MISSING_REPOSITORY_PATH"
  | "MISSING_BRANCH_NAME"
  | "MISSING_TARGET_REF"
  | "MISSING_TARGET_PATH"
  | "MISSING_TAG_NAME"
  | "MISSING_REQUIRED_FIELD"
  | "INVALID_ACTION"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "REAL_EXECUTION_BLOCKED";

export type GitToolError = {
  code: GitToolErrorCode;
  message: string;
  boundary: GitToolBoundary;
  publicSafe: true;
};

export type GitToolResult<Output> =
  | {
      ok: true;
      toolId: string;
      output: Output;
      audit: readonly GitToolAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: string;
      error: GitToolError;
      audit: readonly GitToolAuditEvent[];
      events: readonly string[];
    };

export type GitManageBranchAction = "list" | "create" | "delete" | "rename" | "set-upstream";

export type GitManageBranchTarget = {
  repositoryPath: string;
  action: GitManageBranchAction;
  branchName?: string;
  newBranchName?: string;
  startPoint?: string;
  upstream?: string;
  force?: boolean;
};

export type GitManageBranchRequest = {
  target?: Partial<GitManageBranchTarget>;
  context?: GitToolContext;
};

export type GitManageBranchOutput = {
  kind: "agentCore.basicTool.git.manageBranch";
  target: GitManageBranchTarget;
  commandPreview: readonly string[];
  dryRun: true;
  executionBlocked: true;
  permissionsRequired: readonly GitToolPermission[];
  unsafeSideEffects: boolean;
};

export const gitManageBranchDescriptor = {
  toolId: "git.manageBranch",
  capability: "manage-branch",
  route: "agent_executionEngine.basic_toolLayer.baseTools.gitBase.branch",
  defaultDryRun: true,
  tapOwnsApproval: true,
} as const;

export function cleanGitList<T extends string>(values: readonly T[] | undefined): readonly T[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean) as T[])];
}

export function isBlankGitValue(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

export function gitDryRunEnabled(context: GitToolContext | undefined): boolean {
  return context?.dryRun !== false;
}

export function gitInvocationId(toolId: string, context: GitToolContext | undefined): string {
  return context?.invocationId?.trim() || `${toolId}:dry-run`;
}

export function createGitAuditEvent(
  toolId: string,
  type: string,
  context: GitToolContext | undefined,
  repositoryPath?: string,
  metadata?: Readonly<Record<string, unknown>>,
): GitToolAuditEvent {
  return {
    type,
    toolId,
    invocationId: gitInvocationId(toolId, context),
    dryRun: gitDryRunEnabled(context),
    repositoryPath,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

export function createGitToolFailure<Output>(
  toolId: string,
  code: GitToolErrorCode,
  message: string,
  boundary: GitToolBoundary,
  context: GitToolContext | undefined,
  repositoryPath?: string,
): GitToolResult<Output> {
  return {
    ok: false,
    toolId,
    error: { code, message, boundary, publicSafe: true },
    audit: [createGitAuditEvent(toolId, "agentCore.basicTool.git.rejected", context, repositoryPath, { code })],
    events: ["basicTool.git.rejected"],
  };
}

export function normalizeGitRepositoryPath(
  toolId: string,
  repositoryPath: string | undefined,
  context: GitToolContext | undefined,
): string | GitToolResult<never> {
  const normalizedRepositoryPath = repositoryPath?.trim() ?? "";
  if (isBlankGitValue(normalizedRepositoryPath)) {
    return createGitToolFailure(
      toolId,
      "MISSING_REPOSITORY_PATH",
      `${toolId} requires target.repositoryPath`,
      "input",
      context,
      repositoryPath,
    );
  }

  return normalizedRepositoryPath;
}

export function ensureGitToolScope<Output>(
  toolId: string,
  repositoryPath: string,
  context: GitToolContext | undefined,
): GitToolResult<Output> | undefined {
  const allowedRoots = cleanGitList(context?.allowedRepositoryRoots);
  if (allowedRoots.length === 0) {
    return undefined;
  }

  const allowed = allowedRoots.some((root) => repositoryPath === root || repositoryPath.startsWith(`${root}/`));
  if (allowed) {
    return undefined;
  }

  return createGitToolFailure(
    toolId,
    "SCOPE_REJECTED",
    `${toolId} target repository is outside the allowed repository roots`,
    "scope",
    context,
    repositoryPath,
  );
}

export function ensureGitToolPermissions<Output>(
  toolId: string,
  permissionsRequired: readonly GitToolPermission[],
  context: GitToolContext | undefined,
  repositoryPath: string,
): GitToolResult<Output> | undefined {
  const granted = cleanGitList(context?.grantedPermissions);
  if (granted.length === 0) {
    return undefined;
  }

  const missing = permissionsRequired.filter((permission) => !granted.includes(permission));
  if (missing.length === 0) {
    return undefined;
  }

  return createGitToolFailure(
    toolId,
    "PERMISSION_DENIED",
    `${toolId} is missing permissions: ${missing.join(", ")}`,
    "permission",
    context,
    repositoryPath,
  );
}

export function blockRealGitExecution<Output>(
  toolId: string,
  context: GitToolContext | undefined,
  repositoryPath: string,
): GitToolResult<Output> | undefined {
  if (gitDryRunEnabled(context)) {
    return undefined;
  }

  return createGitToolFailure(
    toolId,
    "REAL_EXECUTION_BLOCKED",
    `${toolId} only returns a guarded dry-run plan in the first implementation`,
    "contract",
    context,
    repositoryPath,
  );
}

function normalizeBranchAction(action: string | undefined): GitManageBranchAction {
  if (action === "create" || action === "delete" || action === "rename" || action === "set-upstream") {
    return action;
  }

  return "list";
}

function branchPermissions(action: GitManageBranchAction): readonly GitToolPermission[] {
  return action === "list" ? ["git:read"] : ["git:read", "git:write"];
}

function normalizeBranchTarget(
  target: Partial<GitManageBranchTarget> | undefined,
  context: GitToolContext | undefined,
): GitManageBranchTarget | GitToolResult<GitManageBranchOutput> {
  const toolId = gitManageBranchDescriptor.toolId;
  const repositoryPath = normalizeGitRepositoryPath(toolId, target?.repositoryPath, context);
  if (typeof repositoryPath !== "string") {
    return repositoryPath;
  }

  const action = normalizeBranchAction(target?.action);
  const branchName = target?.branchName?.trim() || undefined;
  const newBranchName = target?.newBranchName?.trim() || undefined;
  const upstream = target?.upstream?.trim() || undefined;

  if (action !== "list" && branchName === undefined) {
    return createGitToolFailure(
      toolId,
      "MISSING_BRANCH_NAME",
      `${toolId} action ${action} requires target.branchName`,
      "input",
      context,
      repositoryPath,
    );
  }

  if (action === "rename" && newBranchName === undefined) {
    return createGitToolFailure(
      toolId,
      "MISSING_REQUIRED_FIELD",
      `${toolId} action rename requires target.newBranchName`,
      "input",
      context,
      repositoryPath,
    );
  }

  if (action === "set-upstream" && upstream === undefined) {
    return createGitToolFailure(
      toolId,
      "MISSING_REQUIRED_FIELD",
      `${toolId} action set-upstream requires target.upstream`,
      "input",
      context,
      repositoryPath,
    );
  }

  return {
    repositoryPath,
    action,
    branchName,
    newBranchName,
    startPoint: target?.startPoint?.trim() || undefined,
    upstream,
    force: target?.force === true,
  };
}

function branchCommandPreview(target: GitManageBranchTarget): readonly string[] {
  if (target.action === "list") {
    return ["git", "-C", target.repositoryPath, "branch", "--list"];
  }

  if (target.action === "create") {
    return [
      "git",
      "-C",
      target.repositoryPath,
      "branch",
      target.branchName ?? "",
      ...(target.startPoint === undefined ? [] : [target.startPoint]),
    ];
  }

  if (target.action === "delete") {
    return ["git", "-C", target.repositoryPath, "branch", target.force ? "-D" : "-d", target.branchName ?? ""];
  }

  if (target.action === "rename") {
    return ["git", "-C", target.repositoryPath, "branch", "-m", target.branchName ?? "", target.newBranchName ?? ""];
  }

  return ["git", "-C", target.repositoryPath, "branch", "--set-upstream-to", target.upstream ?? "", target.branchName ?? ""];
}

export function planGitBranchManagement(
  request: GitManageBranchRequest = {},
): GitToolResult<GitManageBranchOutput> {
  const toolId = gitManageBranchDescriptor.toolId;
  const target = normalizeBranchTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  const scopeFailure = ensureGitToolScope<GitManageBranchOutput>(toolId, target.repositoryPath, request.context);
  if (scopeFailure !== undefined) {
    return scopeFailure;
  }

  const permissionsRequired = branchPermissions(target.action);
  const permissionFailure = ensureGitToolPermissions<GitManageBranchOutput>(
    toolId,
    permissionsRequired,
    request.context,
    target.repositoryPath,
  );
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const realExecutionFailure = blockRealGitExecution<GitManageBranchOutput>(
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
      kind: "agentCore.basicTool.git.manageBranch",
      target,
      commandPreview: branchCommandPreview(target),
      dryRun: true,
      executionBlocked: true,
      permissionsRequired,
      unsafeSideEffects: target.action !== "list",
    },
    audit: [
      createGitAuditEvent(toolId, "agentCore.basicTool.git.manageBranch.dryRun", request.context, target.repositoryPath, {
        action: target.action,
      }),
    ],
    events: ["basicTool.git.manageBranch.dryRun"],
  };
}
