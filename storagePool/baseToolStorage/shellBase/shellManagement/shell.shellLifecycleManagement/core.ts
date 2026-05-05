/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / Shell 基础工具 / Shell 管理。
 * 核心目的：提供 Shell 基础工具 / Shell 管理 中的“管理 Shell 生命周期”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type ShellLifecycleManagementPermission = "shell:lifecycle:manage";

export type ShellLifecycleManagementBoundary = "input" | "permission" | "scope" | "resource" | "contract";

export type ShellLifecycleAction = "create" | "attach" | "suspend" | "resume" | "close";

export type ShellLifecycleState = "planned" | "active" | "suspended" | "closed";

export type ShellLifecycleManagementContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  grantedPermissions?: readonly ShellLifecycleManagementPermission[];
  allowedSessionIds?: readonly string[];
  allowedWorkingDirectories?: readonly string[];
  approval?: {
    accepted: boolean;
    approvalId?: string;
    reason?: string;
  };
  guard?: {
    accepted?: boolean;
    allowed?: boolean;
    reason?: string;
  };
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type ShellLifecycleManagementTarget = {
  action: ShellLifecycleAction;
  sessionId?: string;
  shellType?: "sh" | "bash" | "zsh";
  workingDirectory?: string;
  idleTimeoutMs?: number;
};

export type ShellLifecycleManagementRequest = {
  target?: Partial<ShellLifecycleManagementTarget>;
  context?: ShellLifecycleManagementContext;
};

export type ShellLifecycleManagementErrorCode =
  | "MISSING_ACTION"
  | "INVALID_ACTION"
  | "MISSING_SESSION_ID"
  | "INVALID_SESSION_ID"
  | "INVALID_SHELL"
  | "INVALID_WORKING_DIRECTORY"
  | "INVALID_TIMEOUT"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "REAL_LIFECYCLE_CHANGE_BLOCKED";

export type ShellLifecycleManagementError = {
  code: ShellLifecycleManagementErrorCode;
  message: string;
  boundary: ShellLifecycleManagementBoundary;
  publicSafe: true;
  internalDetailExposed: false;
};

export type ShellLifecycleManagementAuditEvent = {
  type: string;
  toolId: "shell.shellLifecycleManagement";
  invocationId: string;
  dryRun: boolean;
  sessionId?: string;
  workingDirectory?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type ShellLifecycleManagementOutput = {
  kind: "agentCore.basicTool.shell.shellLifecycleManagement";
  action: ShellLifecycleAction;
  sessionId: string;
  shellType: "sh" | "bash" | "zsh";
  workingDirectory?: string;
  idleTimeoutMs: number;
  plannedState: ShellLifecycleState;
  requiredPermission: ShellLifecycleManagementPermission;
  requiresTapApproval: boolean;
  approvalId?: string;
  dryRun: true;
  lifecycleChangeBlocked: true;
  unsafeSideEffects: boolean;
  resultEnvelope: {
    planned: true;
    actualSessionHandle?: never;
  };
};

export type ShellLifecycleManagementResult =
  | {
      ok: true;
      toolId: "shell.shellLifecycleManagement";
      output: ShellLifecycleManagementOutput;
      audit: readonly ShellLifecycleManagementAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "shell.shellLifecycleManagement";
      error: ShellLifecycleManagementError;
      audit: readonly ShellLifecycleManagementAuditEvent[];
      events: readonly string[];
    };

export const shellLifecycleManagementDescriptor = {
  toolId: "shell.shellLifecycleManagement",
  capability: "shell-lifecycle-management",
  route: "agent_executionEngine.basic_toolLayer.baseTools.shellBase.shellManagement",
  defaultDryRun: true,
  defaultShellType: "sh",
  defaultIdleTimeoutMs: 300_000,
  maxIdleTimeoutMs: 86_400_000,
  requiredPermission: "shell:lifecycle:manage",
  tapOwnsApproval: true,
} as const;

const lifecycleActions = new Set<ShellLifecycleAction>(["create", "attach", "suspend", "resume", "close"]);

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function cleanStringList(values: unknown): readonly string[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return [...new Set(values.map((value) => stringValue(value)?.trim() ?? "").filter(Boolean))];
}

function dryRunEnabled(context: ShellLifecycleManagementContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: ShellLifecycleManagementContext | undefined): string {
  return stringValue(context?.invocationId)?.trim() || "shell.shellLifecycleManagement:dry-run";
}

function normalizeDirectory(directory: string): string {
  const trimmed = directory.trim();
  return trimmed === "/" ? trimmed : trimmed.replace(/\/+$/, "");
}

function auditEvent(
  type: string,
  context: ShellLifecycleManagementContext | undefined,
  sessionId: string | undefined,
  workingDirectory: string | undefined,
  metadata?: Readonly<Record<string, unknown>>,
): ShellLifecycleManagementAuditEvent {
  return {
    type,
    toolId: shellLifecycleManagementDescriptor.toolId,
    invocationId: invocationId(context),
    dryRun: dryRunEnabled(context),
    sessionId,
    workingDirectory,
    metadata: {
      ...(typeof context?.auditMetadata === "object" && context.auditMetadata !== null ? context.auditMetadata : {}),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: ShellLifecycleManagementErrorCode,
  message: string,
  boundary: ShellLifecycleManagementBoundary,
  context: ShellLifecycleManagementContext | undefined,
  sessionId?: string,
  workingDirectory?: string,
): ShellLifecycleManagementResult {
  return {
    ok: false,
    toolId: shellLifecycleManagementDescriptor.toolId,
    error: { code, message, boundary, publicSafe: true, internalDetailExposed: false },
    audit: [auditEvent("agentCore.basicTool.shell.shellLifecycleManagement.rejected", context, sessionId, workingDirectory, { code })],
    events: ["basicTool.shell.shellLifecycleManagement.rejected"],
  };
}

function plannedSessionId(action: ShellLifecycleAction, requestedSessionId: string | undefined, context: ShellLifecycleManagementContext | undefined): string {
  if (requestedSessionId !== undefined) {
    return requestedSessionId;
  }

  return `${invocationId(context)}:${action}:planned-session`;
}

function stateForAction(action: ShellLifecycleAction): ShellLifecycleState {
  if (action === "close") {
    return "closed";
  }

  if (action === "suspend") {
    return "suspended";
  }

  if (action === "create") {
    return "planned";
  }

  return "active";
}

function ensureDryRunOnly(
  context: ShellLifecycleManagementContext | undefined,
  sessionId: string | undefined,
  workingDirectory: string | undefined,
): ShellLifecycleManagementResult | undefined {
  if (dryRunEnabled(context)) {
    return undefined;
  }

  return failure(
    "REAL_LIFECYCLE_CHANGE_BLOCKED",
    "shell.shellLifecycleManagement only creates a guarded dry-run lifecycle envelope in the first implementation",
    "contract",
    context,
    sessionId,
    workingDirectory,
  );
}

function ensurePermission(
  context: ShellLifecycleManagementContext | undefined,
  sessionId: string | undefined,
  workingDirectory: string | undefined,
): ShellLifecycleManagementResult | undefined {
  if (context?.grantedPermissions === undefined) {
    return undefined;
  }

  if (cleanStringList(context.grantedPermissions).includes(shellLifecycleManagementDescriptor.requiredPermission)) {
    return undefined;
  }

  return failure(
    "PERMISSION_DENIED",
    "shell.shellLifecycleManagement is missing permission: shell:lifecycle:manage",
    "permission",
    context,
    sessionId,
    workingDirectory,
  );
}

function ensureSessionScope(
  action: ShellLifecycleAction,
  sessionId: string,
  context: ShellLifecycleManagementContext | undefined,
  workingDirectory: string | undefined,
): ShellLifecycleManagementResult | undefined {
  if (action === "create") {
    return undefined;
  }

  const allowedSessionIds = cleanStringList(context?.allowedSessionIds);
  if (allowedSessionIds.length === 0 || allowedSessionIds.includes(sessionId)) {
    return undefined;
  }

  return failure(
    "SCOPE_REJECTED",
    "shell.shellLifecycleManagement sessionId is outside allowed lifecycle scope",
    "scope",
    context,
    sessionId,
    workingDirectory,
  );
}

function ensureDirectoryScope(
  workingDirectory: string | undefined,
  context: ShellLifecycleManagementContext | undefined,
  sessionId: string | undefined,
): ShellLifecycleManagementResult | undefined {
  if (workingDirectory === undefined) {
    return undefined;
  }

  const allowedDirectories = cleanStringList(context?.allowedWorkingDirectories).map(normalizeDirectory);
  if (allowedDirectories.length === 0) {
    return undefined;
  }

  const allowed = allowedDirectories.some(
    (directory) => directory === "/" || workingDirectory === directory || workingDirectory.startsWith(`${directory}/`),
  );
  if (allowed) {
    return undefined;
  }

  return failure(
    "SCOPE_REJECTED",
    "shell.shellLifecycleManagement workingDirectory is outside allowed lifecycle scope",
    "scope",
    context,
    sessionId,
    workingDirectory,
  );
}

function normalizeTarget(
  target: Partial<ShellLifecycleManagementTarget> | undefined,
  context: ShellLifecycleManagementContext | undefined,
): ShellLifecycleManagementOutput | ShellLifecycleManagementResult {
  const action = target?.action;
  if (action === undefined) {
    return failure("MISSING_ACTION", "shell.shellLifecycleManagement requires target.action", "input", context);
  }

  if (typeof action !== "string" || !lifecycleActions.has(action as ShellLifecycleAction)) {
    return failure("INVALID_ACTION", "shell.shellLifecycleManagement action is not supported", "input", context, stringValue(target?.sessionId));
  }
  const lifecycleAction = action as ShellLifecycleAction;

  const sessionIdValue = target?.sessionId;
  if (sessionIdValue !== undefined && typeof sessionIdValue !== "string") {
    return failure("INVALID_SESSION_ID", "shell.shellLifecycleManagement sessionId must be a string", "input", context);
  }
  const requestedSessionId = stringValue(sessionIdValue)?.trim() || undefined;
  if (lifecycleAction !== "create" && requestedSessionId === undefined) {
    return failure("MISSING_SESSION_ID", "shell.shellLifecycleManagement requires sessionId for existing-session actions", "input", context);
  }

  const shellType = target?.shellType ?? shellLifecycleManagementDescriptor.defaultShellType;
  if (shellType !== "sh" && shellType !== "bash" && shellType !== "zsh") {
    return failure("INVALID_SHELL", "shell.shellLifecycleManagement shellType must be sh, bash, or zsh", "input", context, requestedSessionId);
  }

  const idleTimeoutMs = target?.idleTimeoutMs ?? shellLifecycleManagementDescriptor.defaultIdleTimeoutMs;
  if (
    !Number.isInteger(idleTimeoutMs) ||
    idleTimeoutMs <= 0 ||
    idleTimeoutMs > shellLifecycleManagementDescriptor.maxIdleTimeoutMs
  ) {
    return failure(
      "INVALID_TIMEOUT",
      `shell.shellLifecycleManagement idleTimeoutMs must be between 1 and ${shellLifecycleManagementDescriptor.maxIdleTimeoutMs}`,
      "resource",
      context,
      requestedSessionId,
    );
  }

  const workingDirectoryValue = target?.workingDirectory;
  if (workingDirectoryValue !== undefined && typeof workingDirectoryValue !== "string") {
    return failure(
      "INVALID_WORKING_DIRECTORY",
      "shell.shellLifecycleManagement workingDirectory must be a string",
      "input",
      context,
      requestedSessionId,
    );
  }
  const workingDirectory = stringValue(workingDirectoryValue)?.trim() || undefined;
  const normalizedDirectory = workingDirectory === undefined ? undefined : normalizeDirectory(workingDirectory);
  const sessionId = plannedSessionId(lifecycleAction, requestedSessionId, context);

  return {
    kind: "agentCore.basicTool.shell.shellLifecycleManagement",
    action: lifecycleAction,
    sessionId,
    shellType,
    workingDirectory: normalizedDirectory,
    idleTimeoutMs,
    plannedState: stateForAction(lifecycleAction),
    requiredPermission: shellLifecycleManagementDescriptor.requiredPermission,
    requiresTapApproval: lifecycleAction === "close",
    approvalId: stringValue(context?.approval?.approvalId)?.trim() || undefined,
    dryRun: true,
    lifecycleChangeBlocked: true,
    unsafeSideEffects: lifecycleAction === "create" || lifecycleAction === "close",
    resultEnvelope: {
      planned: true,
    },
  };
}

export function planShellLifecycleManagement(
  request: ShellLifecycleManagementRequest = {},
): ShellLifecycleManagementResult {
  const target = normalizeTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  const dryRunFailure = ensureDryRunOnly(request.context, target.sessionId, target.workingDirectory);
  if (dryRunFailure !== undefined) {
    return dryRunFailure;
  }

  const permissionFailure = ensurePermission(request.context, target.sessionId, target.workingDirectory);
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const sessionScopeFailure = ensureSessionScope(target.action, target.sessionId, request.context, target.workingDirectory);
  if (sessionScopeFailure !== undefined) {
    return sessionScopeFailure;
  }

  const directoryScopeFailure = ensureDirectoryScope(target.workingDirectory, request.context, target.sessionId);
  if (directoryScopeFailure !== undefined) {
    return directoryScopeFailure;
  }

  return {
    ok: true,
    toolId: shellLifecycleManagementDescriptor.toolId,
    output: target,
    audit: [
      auditEvent("agentCore.basicTool.shell.shellLifecycleManagement.dryRun", request.context, target.sessionId, target.workingDirectory, {
        action: target.action,
        plannedState: target.plannedState,
      }),
    ],
    events: [`basicTool.shell.shellLifecycleManagement.${target.action}.dryRun`],
  };
}
