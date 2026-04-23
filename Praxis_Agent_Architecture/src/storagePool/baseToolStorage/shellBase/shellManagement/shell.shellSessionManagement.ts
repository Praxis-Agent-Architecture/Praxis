/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / Shell 基础工具 / Shell 管理。
 * 核心目的：提供 Shell 基础工具 / Shell 管理 中的“管理 Shell 会话”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type ShellSessionManagementAction = "inspect" | "create" | "attach" | "detach" | "close";

export type ShellSessionManagementPermission =
  | "shell:session:inspect"
  | "shell:session:create"
  | "shell:session:attach"
  | "shell:session:close";

export type ShellSessionManagementBoundary = "input" | "scope" | "permission" | "governance" | "contract";

export type ShellSessionManagementContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  allowedSessionIds?: readonly string[];
  grantedPermissions?: readonly ShellSessionManagementPermission[];
  guard?: {
    accepted: boolean;
    reason?: string;
  };
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type ShellSessionManagementTarget = {
  action: ShellSessionManagementAction;
  sessionId?: string;
  sessionName?: string;
  shellType?: string;
  workingDirectory?: string;
  reason?: string;
};

export type ShellSessionManagementRequest = {
  target?: Partial<ShellSessionManagementTarget>;
  context?: ShellSessionManagementContext;
};

export type ShellSessionManagementErrorCode =
  | "MISSING_SESSION_ID"
  | "INVALID_SESSION_ID"
  | "INVALID_SESSION_NAME"
  | "INVALID_SHELL_TYPE"
  | "INVALID_WORKING_DIRECTORY"
  | "SESSION_SCOPE_DENIED"
  | "PERMISSION_DENIED"
  | "GOVERNANCE_REJECTED"
  | "REAL_EXECUTION_BLOCKED";

export type ShellSessionManagementError = {
  code: ShellSessionManagementErrorCode;
  message: string;
  boundary: ShellSessionManagementBoundary;
  publicSafe: true;
  internalDetailExposed: false;
};

export type ShellSessionManagementAuditEvent = {
  type: string;
  toolId: "shell.shellSessionManagement";
  invocationId: string;
  dryRun: boolean;
  sessionId?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type ShellSessionManagementOutput = {
  kind: "agentCore.basicTool.shell.shellSessionManagement";
  target: ShellSessionManagementTarget;
  permissionsRequired: readonly ShellSessionManagementPermission[];
  dryRun: true;
  executionBlocked: true;
  unsafeSideEffects: boolean;
  sessionEnvelope: {
    operation: ShellSessionManagementAction;
    wouldCreateSession: boolean;
    wouldAttachSession: boolean;
    wouldCloseSession: boolean;
    runtimeSessionState: "unchanged";
  };
};

export type ShellSessionManagementResult =
  | {
      ok: true;
      toolId: "shell.shellSessionManagement";
      output: ShellSessionManagementOutput;
      audit: readonly ShellSessionManagementAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "shell.shellSessionManagement";
      error: ShellSessionManagementError;
      audit: readonly ShellSessionManagementAuditEvent[];
      events: readonly string[];
    };

export const shellSessionManagementDescriptor = {
  toolId: "shell.shellSessionManagement",
  capability: "manage-shell-sessions",
  route: "agent_executionEngine.basic_toolLayer.baseTools.shellBase.shellManagement",
  defaultDryRun: true,
  tapOwnsApproval: true,
  unsafeSideEffects: true,
} as const;

function cleanList<T extends string>(values: readonly T[] | undefined): readonly T[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean) as T[])];
}

function dryRunEnabled(context: ShellSessionManagementContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: ShellSessionManagementContext | undefined): string {
  return context?.invocationId?.trim() || "shell.shellSessionManagement:dry-run";
}

function auditEvent(
  type: string,
  context: ShellSessionManagementContext | undefined,
  sessionId?: string,
  metadata?: Readonly<Record<string, unknown>>,
): ShellSessionManagementAuditEvent {
  return {
    type,
    toolId: shellSessionManagementDescriptor.toolId,
    invocationId: invocationId(context),
    dryRun: dryRunEnabled(context),
    sessionId,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: ShellSessionManagementErrorCode,
  message: string,
  boundary: ShellSessionManagementBoundary,
  context: ShellSessionManagementContext | undefined,
  sessionId?: string,
): ShellSessionManagementResult {
  return {
    ok: false,
    toolId: shellSessionManagementDescriptor.toolId,
    error: { code, message, boundary, publicSafe: true, internalDetailExposed: false },
    audit: [auditEvent("agentCore.basicTool.shell.shellSessionManagement.rejected", context, sessionId, { code })],
    events: ["basicTool.shell.shellSessionManagement.rejected"],
  };
}

function normalizeAction(action: string | undefined): ShellSessionManagementAction {
  if (action === "create" || action === "attach" || action === "detach" || action === "close") {
    return action;
  }

  return "inspect";
}

function normalizeSingleLine(
  value: string | undefined,
  errorCode: ShellSessionManagementErrorCode,
  message: string,
  context: ShellSessionManagementContext | undefined,
  boundary: ShellSessionManagementBoundary = "input",
): string | undefined | ShellSessionManagementResult {
  const normalized = value?.trim();
  if (normalized === undefined || normalized.length === 0) {
    return undefined;
  }

  if (normalized.includes("\0") || /[\r\n]/u.test(normalized)) {
    return failure(errorCode, message, boundary, context, normalized);
  }

  return normalized;
}

function normalizeTarget(
  target: Partial<ShellSessionManagementTarget> | undefined,
  context: ShellSessionManagementContext | undefined,
): ShellSessionManagementTarget | ShellSessionManagementResult {
  const action = normalizeAction(target?.action);
  const sessionId = normalizeSingleLine(
    target?.sessionId,
    "INVALID_SESSION_ID",
    "shell.shellSessionManagement sessionId must be a safe single-line string",
    context,
  );
  if (sessionId !== undefined && typeof sessionId !== "string") {
    return sessionId;
  }

  if (action !== "create" && sessionId === undefined) {
    return failure(
      "MISSING_SESSION_ID",
      `shell.shellSessionManagement action ${action} requires target.sessionId`,
      "input",
      context,
    );
  }

  const sessionName = normalizeSingleLine(
    target?.sessionName,
    "INVALID_SESSION_NAME",
    "shell.shellSessionManagement sessionName must be a safe single-line string",
    context,
  );
  if (sessionName !== undefined && typeof sessionName !== "string") {
    return sessionName;
  }

  const shellType = normalizeSingleLine(
    target?.shellType,
    "INVALID_SHELL_TYPE",
    "shell.shellSessionManagement shellType must be a safe single-line string",
    context,
  );
  if (shellType !== undefined && typeof shellType !== "string") {
    return shellType;
  }

  const workingDirectory = normalizeSingleLine(
    target?.workingDirectory,
    "INVALID_WORKING_DIRECTORY",
    "shell.shellSessionManagement workingDirectory must be a safe path string",
    context,
    "scope",
  );
  if (workingDirectory !== undefined && typeof workingDirectory !== "string") {
    return workingDirectory;
  }

  const reason = normalizeSingleLine(
    target?.reason,
    "INVALID_SESSION_NAME",
    "shell.shellSessionManagement reason must be a safe single-line string",
    context,
  );
  if (reason !== undefined && typeof reason !== "string") {
    return reason;
  }

  return {
    action,
    sessionId,
    sessionName,
    shellType,
    workingDirectory,
    reason,
  };
}

function requiredPermissions(target: ShellSessionManagementTarget): readonly ShellSessionManagementPermission[] {
  if (target.action === "create") {
    return ["shell:session:create"];
  }

  if (target.action === "attach" || target.action === "detach") {
    return ["shell:session:attach"];
  }

  if (target.action === "close") {
    return ["shell:session:close"];
  }

  return ["shell:session:inspect"];
}

function ensureScope(
  target: ShellSessionManagementTarget,
  context: ShellSessionManagementContext | undefined,
): ShellSessionManagementResult | undefined {
  const allowedSessionIds = cleanList(context?.allowedSessionIds);
  if (allowedSessionIds.length === 0 || target.sessionId === undefined) {
    return undefined;
  }

  if (allowedSessionIds.includes(target.sessionId)) {
    return undefined;
  }

  return failure(
    "SESSION_SCOPE_DENIED",
    "shell.shellSessionManagement target session is outside runtime governance scope",
    "scope",
    context,
    target.sessionId,
  );
}

function ensurePermissions(
  target: ShellSessionManagementTarget,
  context: ShellSessionManagementContext | undefined,
): ShellSessionManagementResult | undefined {
  const grantedPermissions = cleanList(context?.grantedPermissions);
  if (grantedPermissions.length === 0) {
    return undefined;
  }

  const missing = requiredPermissions(target).filter((permission) => !grantedPermissions.includes(permission));
  if (missing.length === 0) {
    return undefined;
  }

  return failure(
    "PERMISSION_DENIED",
    `shell.shellSessionManagement is missing permissions: ${missing.join(", ")}`,
    "permission",
    context,
    target.sessionId,
  );
}

function ensureGovernance(
  context: ShellSessionManagementContext | undefined,
): ShellSessionManagementResult | undefined {
  if (context?.guard?.accepted !== false) {
    return undefined;
  }

  return failure(
    "GOVERNANCE_REJECTED",
    context.guard.reason ?? "shell.shellSessionManagement was rejected by runtime governance",
    "governance",
    context,
  );
}

function ensureDryRunOnly(
  target: ShellSessionManagementTarget,
  context: ShellSessionManagementContext | undefined,
): ShellSessionManagementResult | undefined {
  if (dryRunEnabled(context)) {
    return undefined;
  }

  return failure(
    "REAL_EXECUTION_BLOCKED",
    "shell.shellSessionManagement only returns a guarded dry-run session envelope in the first implementation",
    "contract",
    context,
    target.sessionId,
  );
}

export function planShellSessionManagement(request: ShellSessionManagementRequest = {}): ShellSessionManagementResult {
  const target = normalizeTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  const governanceFailure = ensureGovernance(request.context);
  if (governanceFailure !== undefined) {
    return governanceFailure;
  }

  const scopeFailure = ensureScope(target, request.context);
  if (scopeFailure !== undefined) {
    return scopeFailure;
  }

  const permissionFailure = ensurePermissions(target, request.context);
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const realExecutionFailure = ensureDryRunOnly(target, request.context);
  if (realExecutionFailure !== undefined) {
    return realExecutionFailure;
  }

  return {
    ok: true,
    toolId: shellSessionManagementDescriptor.toolId,
    output: {
      kind: "agentCore.basicTool.shell.shellSessionManagement",
      target,
      permissionsRequired: requiredPermissions(target),
      dryRun: true,
      executionBlocked: true,
      unsafeSideEffects: target.action !== "inspect",
      sessionEnvelope: {
        operation: target.action,
        wouldCreateSession: target.action === "create",
        wouldAttachSession: target.action === "attach",
        wouldCloseSession: target.action === "close",
        runtimeSessionState: "unchanged",
      },
    },
    audit: [
      auditEvent("agentCore.basicTool.shell.shellSessionManagement.dryRun", request.context, target.sessionId, {
        action: target.action,
        shellType: target.shellType,
      }),
    ],
    events: ["basicTool.shell.shellSessionManagement.dryRun"],
  };
}
