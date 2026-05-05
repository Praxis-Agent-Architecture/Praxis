/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / Shell 基础工具 / Shell 管理。
 * 核心目的：提供 Shell 基础工具 / Shell 管理 中的“管理 Shell 进程”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type ShellProcessManagementPermission = "shell:process:manage";

export type ShellProcessManagementBoundary = "input" | "permission" | "scope" | "resource" | "contract";

export type ShellProcessManagementAction = "inspect" | "signal" | "reap" | "prioritize";

export type ShellManagedProcessSignal = "SIGINT" | "SIGTERM" | "SIGKILL";

export type ShellProcessManagementContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  grantedPermissions?: readonly ShellProcessManagementPermission[];
  allowedSessionIds?: readonly string[];
  allowedProcessIds?: readonly number[];
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

export type ShellProcessManagementTarget = {
  action: ShellProcessManagementAction;
  sessionId?: string;
  processId?: number;
  signal?: ShellManagedProcessSignal;
  priority?: number;
  reason?: string;
};

export type ShellProcessManagementRequest = {
  target?: Partial<ShellProcessManagementTarget>;
  context?: ShellProcessManagementContext;
};

export type ShellProcessManagementErrorCode =
  | "MISSING_ACTION"
  | "INVALID_ACTION"
  | "MISSING_PROCESS_REFERENCE"
  | "INVALID_SESSION_ID"
  | "INVALID_PROCESS_ID"
  | "MISSING_SIGNAL"
  | "INVALID_SIGNAL"
  | "INVALID_PRIORITY"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "REAL_PROCESS_CHANGE_BLOCKED";

export type ShellProcessManagementError = {
  code: ShellProcessManagementErrorCode;
  message: string;
  boundary: ShellProcessManagementBoundary;
  publicSafe: true;
  internalDetailExposed: false;
};

export type ShellProcessManagementAuditEvent = {
  type: string;
  toolId: "shell.shellProcessManagement";
  invocationId: string;
  dryRun: boolean;
  sessionId?: string;
  processId?: number;
  metadata: Readonly<Record<string, unknown>>;
};

export type ShellProcessManagementOutput = {
  kind: "agentCore.basicTool.shell.shellProcessManagement";
  action: ShellProcessManagementAction;
  sessionId?: string;
  processId?: number;
  signal?: ShellManagedProcessSignal;
  priority?: number;
  reason?: string;
  requiredPermission: ShellProcessManagementPermission;
  requiresTapApproval: boolean;
  approvalId?: string;
  dryRun: true;
  processChangeBlocked: true;
  unsafeSideEffects: boolean;
  resultEnvelope: {
    planned: true;
    observedStatus?: "unknown";
    processHandle?: never;
  };
};

export type ShellProcessManagementResult =
  | {
      ok: true;
      toolId: "shell.shellProcessManagement";
      output: ShellProcessManagementOutput;
      audit: readonly ShellProcessManagementAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "shell.shellProcessManagement";
      error: ShellProcessManagementError;
      audit: readonly ShellProcessManagementAuditEvent[];
      events: readonly string[];
    };

export const shellProcessManagementDescriptor = {
  toolId: "shell.shellProcessManagement",
  capability: "shell-process-management",
  route: "agent_executionEngine.basic_toolLayer.baseTools.shellBase.shellManagement",
  defaultDryRun: true,
  requiredPermission: "shell:process:manage",
  tapOwnsApproval: true,
} as const;

const processActions = new Set<ShellProcessManagementAction>(["inspect", "signal", "reap", "prioritize"]);
const processSignals = new Set<ShellManagedProcessSignal>(["SIGINT", "SIGTERM", "SIGKILL"]);

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function cleanStringList(values: unknown): readonly string[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return [...new Set(values.map((value) => stringValue(value)?.trim() ?? "").filter(Boolean))];
}

function cleanNumberList(values: unknown): readonly number[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return [...new Set(values.filter((value): value is number => Number.isInteger(value)))];
}

function dryRunEnabled(context: ShellProcessManagementContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: ShellProcessManagementContext | undefined): string {
  return stringValue(context?.invocationId)?.trim() || "shell.shellProcessManagement:dry-run";
}

function auditEvent(
  type: string,
  context: ShellProcessManagementContext | undefined,
  sessionId: string | undefined,
  processId: number | undefined,
  metadata?: Readonly<Record<string, unknown>>,
): ShellProcessManagementAuditEvent {
  return {
    type,
    toolId: shellProcessManagementDescriptor.toolId,
    invocationId: invocationId(context),
    dryRun: dryRunEnabled(context),
    sessionId,
    processId,
    metadata: {
      ...(typeof context?.auditMetadata === "object" && context.auditMetadata !== null ? context.auditMetadata : {}),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: ShellProcessManagementErrorCode,
  message: string,
  boundary: ShellProcessManagementBoundary,
  context: ShellProcessManagementContext | undefined,
  sessionId?: string,
  processId?: number,
): ShellProcessManagementResult {
  return {
    ok: false,
    toolId: shellProcessManagementDescriptor.toolId,
    error: { code, message, boundary, publicSafe: true, internalDetailExposed: false },
    audit: [auditEvent("agentCore.basicTool.shell.shellProcessManagement.rejected", context, sessionId, processId, { code })],
    events: ["basicTool.shell.shellProcessManagement.rejected"],
  };
}

function normalizeProcessId(
  processId: number | undefined,
  context: ShellProcessManagementContext | undefined,
  sessionId: string | undefined,
): number | ShellProcessManagementResult | undefined {
  if (processId === undefined) {
    return undefined;
  }

  if (!Number.isInteger(processId) || processId <= 0) {
    return failure("INVALID_PROCESS_ID", "shell.shellProcessManagement processId must be a positive integer", "input", context, sessionId, processId);
  }

  return processId;
}

function ensureDryRunOnly(
  context: ShellProcessManagementContext | undefined,
  sessionId: string | undefined,
  processId: number | undefined,
): ShellProcessManagementResult | undefined {
  if (dryRunEnabled(context)) {
    return undefined;
  }

  return failure(
    "REAL_PROCESS_CHANGE_BLOCKED",
    "shell.shellProcessManagement only creates a guarded dry-run process management envelope in the first implementation",
    "contract",
    context,
    sessionId,
    processId,
  );
}

function ensurePermission(
  context: ShellProcessManagementContext | undefined,
  sessionId: string | undefined,
  processId: number | undefined,
): ShellProcessManagementResult | undefined {
  if (context?.grantedPermissions === undefined) {
    return undefined;
  }

  if (cleanStringList(context.grantedPermissions).includes(shellProcessManagementDescriptor.requiredPermission)) {
    return undefined;
  }

  return failure(
    "PERMISSION_DENIED",
    "shell.shellProcessManagement is missing permission: shell:process:manage",
    "permission",
    context,
    sessionId,
    processId,
  );
}

function ensureScope(
  sessionId: string | undefined,
  processId: number | undefined,
  context: ShellProcessManagementContext | undefined,
): ShellProcessManagementResult | undefined {
  const allowedSessionIds = cleanStringList(context?.allowedSessionIds);
  if (sessionId !== undefined && allowedSessionIds.length > 0 && !allowedSessionIds.includes(sessionId)) {
    return failure(
      "SCOPE_REJECTED",
      "shell.shellProcessManagement sessionId is outside allowed process scope",
      "scope",
      context,
      sessionId,
      processId,
    );
  }

  const allowedProcessIds = cleanNumberList(context?.allowedProcessIds);
  if (processId !== undefined && allowedProcessIds.length > 0 && !allowedProcessIds.includes(processId)) {
    return failure(
      "SCOPE_REJECTED",
      "shell.shellProcessManagement processId is outside allowed process scope",
      "scope",
      context,
      sessionId,
      processId,
    );
  }

  return undefined;
}

function approvalRequired(action: ShellProcessManagementAction, signal: ShellManagedProcessSignal | undefined): boolean {
  return action === "reap" || signal === "SIGTERM" || signal === "SIGKILL";
}

function normalizeTarget(
  target: Partial<ShellProcessManagementTarget> | undefined,
  context: ShellProcessManagementContext | undefined,
): ShellProcessManagementOutput | ShellProcessManagementResult {
  const action = target?.action;
  if (action === undefined) {
    return failure("MISSING_ACTION", "shell.shellProcessManagement requires target.action", "input", context);
  }

  if (typeof action !== "string" || !processActions.has(action as ShellProcessManagementAction)) {
    return failure("INVALID_ACTION", "shell.shellProcessManagement action is not supported", "input", context, stringValue(target?.sessionId));
  }
  const processAction = action as ShellProcessManagementAction;

  const sessionIdValue = target?.sessionId;
  if (sessionIdValue !== undefined && typeof sessionIdValue !== "string") {
    return failure("INVALID_SESSION_ID", "shell.shellProcessManagement sessionId must be a string", "input", context);
  }
  const sessionId = stringValue(sessionIdValue)?.trim() || undefined;
  const processId = normalizeProcessId(target?.processId, context, sessionId);
  if (processId !== undefined && typeof processId !== "number") {
    return processId;
  }

  if (sessionId === undefined && processId === undefined) {
    return failure(
      "MISSING_PROCESS_REFERENCE",
      "shell.shellProcessManagement requires target.sessionId or target.processId",
      "input",
      context,
    );
  }

  const signal = target?.signal;
  if (processAction === "signal" && signal === undefined) {
    return failure("MISSING_SIGNAL", "shell.shellProcessManagement signal action requires target.signal", "input", context, sessionId, processId);
  }

  if (signal !== undefined && (typeof signal !== "string" || !processSignals.has(signal as ShellManagedProcessSignal))) {
    return failure("INVALID_SIGNAL", "shell.shellProcessManagement signal must be SIGINT, SIGTERM, or SIGKILL", "input", context, sessionId, processId);
  }
  const managedSignal = signal as ShellManagedProcessSignal | undefined;

  const priority = target?.priority;
  if (priority !== undefined && (typeof priority !== "number" || !Number.isInteger(priority) || priority < -20 || priority > 19)) {
    return failure(
      "INVALID_PRIORITY",
      "shell.shellProcessManagement priority must be an integer between -20 and 19",
      "resource",
      context,
      sessionId,
      processId,
    );
  }
  const managedPriority = processAction === "prioritize" ? priority : undefined;

  const reason = stringValue(target?.reason)?.trim() || undefined;
  const requiresTapApproval = approvalRequired(processAction, managedSignal);

  return {
    kind: "agentCore.basicTool.shell.shellProcessManagement",
    action: processAction,
    sessionId,
    processId,
    signal: managedSignal,
    priority: managedPriority,
    reason,
    requiredPermission: shellProcessManagementDescriptor.requiredPermission,
    requiresTapApproval,
    approvalId: stringValue(context?.approval?.approvalId)?.trim() || undefined,
    dryRun: true,
    processChangeBlocked: true,
    unsafeSideEffects: processAction !== "inspect",
    resultEnvelope: {
      planned: true,
      observedStatus: processAction === "inspect" ? "unknown" : undefined,
    },
  };
}

export function planShellProcessManagement(
  request: ShellProcessManagementRequest = {},
): ShellProcessManagementResult {
  const target = normalizeTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  const dryRunFailure = ensureDryRunOnly(request.context, target.sessionId, target.processId);
  if (dryRunFailure !== undefined) {
    return dryRunFailure;
  }

  const permissionFailure = ensurePermission(request.context, target.sessionId, target.processId);
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const scopeFailure = ensureScope(target.sessionId, target.processId, request.context);
  if (scopeFailure !== undefined) {
    return scopeFailure;
  }

  return {
    ok: true,
    toolId: shellProcessManagementDescriptor.toolId,
    output: target,
    audit: [
      auditEvent("agentCore.basicTool.shell.shellProcessManagement.dryRun", request.context, target.sessionId, target.processId, {
        action: target.action,
        signal: target.signal,
        requiresTapApproval: target.requiresTapApproval,
      }),
    ],
    events: [`basicTool.shell.shellProcessManagement.${target.action}.dryRun`],
  };
}
