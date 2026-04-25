/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / Shell 基础工具 / Shell 交互。
 * 核心目的：提供 Shell 基础工具 / Shell 交互 中的“控制交互进程”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import { jsonRecord, optionalStringArray, stringList, stringValue, trimmedString } from "../_shared/jsonBoundary.js";

export type ShellInteractiveControlPermission = "shell:interactive:control";

export type ShellInteractiveControlBoundary = "input" | "permission" | "approval" | "scope" | "contract";

export type ShellInteractiveControlAction = "send-input" | "interrupt" | "terminate" | "resize" | "resume";

export type ShellInteractiveControlContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  grantedPermissions?: readonly ShellInteractiveControlPermission[];
  allowedSessionIds?: readonly string[];
  approval?: {
    accepted: boolean;
    approvalId?: string;
    reason?: string;
  };
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type ShellInteractiveControlTarget = {
  sessionId: string;
  action: ShellInteractiveControlAction;
  input?: string;
  signal?: "SIGINT" | "SIGTERM";
  terminalSize?: {
    columns: number;
    rows: number;
  };
};

export type ShellInteractiveControlRequest = {
  target?: Partial<ShellInteractiveControlTarget>;
  context?: ShellInteractiveControlContext;
};

export type ShellInteractiveControlErrorCode =
  | "MISSING_SESSION_ID"
  | "MISSING_ACTION"
  | "MISSING_INPUT"
  | "INVALID_ACTION"
  | "INVALID_SIGNAL"
  | "INVALID_TERMINAL_SIZE"
  | "PERMISSION_DENIED"
  | "SCOPE_REJECTED"
  | "APPROVAL_REQUIRED"
  | "APPROVAL_REJECTED"
  | "REAL_CONTROL_BLOCKED";

export type ShellInteractiveControlError = {
  code: ShellInteractiveControlErrorCode;
  message: string;
  boundary: ShellInteractiveControlBoundary;
  publicSafe: true;
  internalDetailExposed: false;
};

export type ShellInteractiveControlAuditEvent = {
  type: string;
  toolId: "shell.interactiveControl";
  invocationId: string;
  dryRun: boolean;
  sessionId?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type ShellInteractiveControlOutput = {
  kind: "agentCore.basicTool.shell.interactiveControl";
  target: Omit<ShellInteractiveControlTarget, "input"> & {
    inputPreview?: string;
    inputBytes?: number;
  };
  requiredPermission: ShellInteractiveControlPermission;
  requiresTapApproval: boolean;
  approvalId?: string;
  dryRun: boolean;
  controlBlocked: boolean;
  unsafeSideEffects: true;
};

export type ShellInteractiveControlResult =
  | {
      ok: true;
      toolId: "shell.interactiveControl";
      output: ShellInteractiveControlOutput;
      audit: readonly ShellInteractiveControlAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "shell.interactiveControl";
      error: ShellInteractiveControlError;
      audit: readonly ShellInteractiveControlAuditEvent[];
      events: readonly string[];
    };

export const shellInteractiveControlDescriptor = {
  toolId: "shell.interactiveControl",
  capability: "shell-interactive-process-control",
  route: "agent_executionEngine.basic_toolLayer.baseTools.shellBase.shellInteraction",
  defaultDryRun: true,
  requiredPermission: "shell:interactive:control",
  tapOwnsApproval: true,
  unsafeSideEffects: true,
} as const;

const actions = new Set<ShellInteractiveControlAction>(["send-input", "interrupt", "terminate", "resize", "resume"]);

function cleanStringList(values: unknown): readonly string[] {
  return stringList(values);
}

function dryRunEnabled(context: ShellInteractiveControlContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: ShellInteractiveControlContext | undefined): string {
  return trimmedString(jsonRecord(context)?.invocationId) ?? "shell.interactiveControl:dry-run";
}

function auditEvent(
  type: string,
  context: ShellInteractiveControlContext | undefined,
  sessionId: string | undefined,
  metadata?: Readonly<Record<string, unknown>>,
): ShellInteractiveControlAuditEvent {
  return {
    type,
    toolId: shellInteractiveControlDescriptor.toolId,
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
  code: ShellInteractiveControlErrorCode,
  message: string,
  boundary: ShellInteractiveControlBoundary,
  context: ShellInteractiveControlContext | undefined,
  sessionId?: string,
): ShellInteractiveControlResult {
  return {
    ok: false,
    toolId: shellInteractiveControlDescriptor.toolId,
    error: { code, message, boundary, publicSafe: true, internalDetailExposed: false },
    audit: [auditEvent("agentCore.basicTool.shell.interactiveControl.rejected", context, sessionId, { code })],
    events: ["basicTool.shell.interactiveControl.rejected"],
  };
}

function ensureDryRunOnly(
  context: ShellInteractiveControlContext | undefined,
  sessionId: string | undefined,
): ShellInteractiveControlResult | undefined {
  if (dryRunEnabled(context)) {
    return undefined;
  }

  return failure(
    "REAL_CONTROL_BLOCKED",
    "shell.interactiveControl only creates a guarded dry-run control envelope in the first implementation",
    "contract",
    context,
    sessionId,
  );
}

function ensurePermission(
  context: ShellInteractiveControlContext | undefined,
  sessionId: string | undefined,
): ShellInteractiveControlResult | undefined {
  if (context?.grantedPermissions === undefined) {
    return undefined;
  }

  if (cleanStringList(context.grantedPermissions).includes(shellInteractiveControlDescriptor.requiredPermission)) {
    return undefined;
  }

  return failure(
    "PERMISSION_DENIED",
    "shell.interactiveControl is missing permission: shell:interactive:control",
    "permission",
    context,
    sessionId,
  );
}

function ensureScope(
  sessionId: string,
  context: ShellInteractiveControlContext | undefined,
): ShellInteractiveControlResult | undefined {
  const allowedSessionIds = optionalStringArray(context?.allowedSessionIds, { trim: true });
  if (!allowedSessionIds.ok) {
    return failure("SCOPE_REJECTED", "shell.interactiveControl allowedSessionIds must be a string array", "scope", context, sessionId);
  }

  if (context?.allowedSessionIds === undefined || allowedSessionIds.values.includes(sessionId)) {
    return undefined;
  }

  return failure("SCOPE_REJECTED", "shell.interactiveControl sessionId is outside allowed control scope", "scope", context, sessionId);
}

function approvalRequired(action: ShellInteractiveControlAction): boolean {
  return action === "interrupt" || action === "terminate";
}

function ensureApproval(
  action: ShellInteractiveControlAction,
  context: ShellInteractiveControlContext | undefined,
  sessionId: string,
): ShellInteractiveControlResult | undefined {
  if (!approvalRequired(action)) {
    return undefined;
  }

  if (context?.approval?.accepted === true) {
    return undefined;
  }

  if (context?.approval?.accepted === false) {
    return failure(
      "APPROVAL_REJECTED",
      context.approval.reason ?? "shell.interactiveControl approval was rejected by TAP governance",
      "approval",
      context,
      sessionId,
    );
  }

  return failure(
    "APPROVAL_REQUIRED",
    "shell.interactiveControl interrupt and terminate actions require TAP approval",
    "approval",
    context,
    sessionId,
  );
}

function normalizeTarget(
  target: unknown,
  context: ShellInteractiveControlContext | undefined,
): ShellInteractiveControlTarget | ShellInteractiveControlResult {
  const targetRecord = jsonRecord(target);
  if (targetRecord === undefined) {
    return failure("MISSING_SESSION_ID", "shell.interactiveControl requires target.sessionId", "input", context);
  }

  const sessionId = trimmedString(targetRecord.sessionId);
  if (sessionId === undefined) {
    return failure("MISSING_SESSION_ID", "shell.interactiveControl requires target.sessionId", "input", context);
  }

  const action = stringValue(targetRecord.action) as ShellInteractiveControlAction | undefined;
  if (action === undefined) {
    return failure("MISSING_ACTION", "shell.interactiveControl requires target.action", "input", context, sessionId);
  }

  if (!actions.has(action)) {
    return failure("INVALID_ACTION", "shell.interactiveControl action is not supported", "input", context, sessionId);
  }

  const input = stringValue(targetRecord.input);
  if (action === "send-input" && (input === undefined || input.length === 0 || input.includes("\0"))) {
    return failure("MISSING_INPUT", "shell.interactiveControl send-input requires non-empty safe input", "input", context, sessionId);
  }

  const signal = stringValue(targetRecord.signal) ?? (action === "interrupt" ? "SIGINT" : action === "terminate" ? "SIGTERM" : undefined);
  if (signal !== undefined && signal !== "SIGINT" && signal !== "SIGTERM") {
    return failure("INVALID_SIGNAL", "shell.interactiveControl signal must be SIGINT or SIGTERM", "input", context, sessionId);
  }

  const terminalSizeRecord = jsonRecord(targetRecord.terminalSize);
  const terminalSize =
    terminalSizeRecord === undefined
      ? undefined
      : {
          columns: terminalSizeRecord.columns as number,
          rows: terminalSizeRecord.rows as number,
        };
  if (action === "resize") {
    const columns = terminalSizeRecord?.columns;
    const rows = terminalSizeRecord?.rows;
    if (
      typeof columns !== "number" ||
      typeof rows !== "number" ||
      !Number.isInteger(columns) ||
      !Number.isInteger(rows) ||
      columns <= 0 ||
      rows <= 0
    ) {
      return failure(
        "INVALID_TERMINAL_SIZE",
        "shell.interactiveControl resize requires positive integer columns and rows",
        "input",
        context,
        sessionId,
      );
    }
  }

  return {
    sessionId,
    action,
    input,
    signal,
    terminalSize: action === "resize" ? terminalSize : undefined,
  };
}

function previewInput(input: string | undefined): { inputPreview?: string; inputBytes?: number } {
  if (input === undefined) {
    return {};
  }

  const normalizedPreview = input.length > 80 ? `${input.slice(0, 80)}...` : input;
  return {
    inputPreview: normalizedPreview,
    inputBytes: Buffer.byteLength(input),
  };
}

export function planShellInteractiveControl(
  request: ShellInteractiveControlRequest = {},
): ShellInteractiveControlResult {
  const requestRecord = jsonRecord(request) ?? {};
  const context = jsonRecord(requestRecord.context) as ShellInteractiveControlContext | undefined;
  const targetRecord = jsonRecord(requestRecord.target);
  const sessionId = trimmedString(targetRecord?.sessionId);
  const dryRunFailure = ensureDryRunOnly(context, sessionId);
  if (dryRunFailure !== undefined) {
    return dryRunFailure;
  }

  const permissionFailure = ensurePermission(context, sessionId);
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const target = normalizeTarget(requestRecord.target, context);
  if ("ok" in target) {
    return target;
  }

  const scopeFailure = ensureScope(target.sessionId, context);
  if (scopeFailure !== undefined) {
    return scopeFailure;
  }

  const approvalFailure = ensureApproval(target.action, context, target.sessionId);
  if (approvalFailure !== undefined) {
    return approvalFailure;
  }

  const inputPreview = previewInput(target.input);

  return {
    ok: true,
    toolId: shellInteractiveControlDescriptor.toolId,
    output: {
      kind: "agentCore.basicTool.shell.interactiveControl",
      target: {
        sessionId: target.sessionId,
        action: target.action,
        signal: target.signal,
        terminalSize: target.terminalSize,
        ...inputPreview,
      },
      requiredPermission: shellInteractiveControlDescriptor.requiredPermission,
      requiresTapApproval: approvalRequired(target.action),
      approvalId: trimmedString(jsonRecord(context?.approval)?.approvalId),
      dryRun: true,
      controlBlocked: true,
      unsafeSideEffects: true,
    },
    audit: [
      auditEvent("agentCore.basicTool.shell.interactiveControl.dryRun", context, target.sessionId, {
        action: target.action,
        requiresTapApproval: approvalRequired(target.action),
      }),
    ],
    events: [`basicTool.shell.interactiveControl.${target.action}.dryRun`],
  };
}
