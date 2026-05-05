/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / Shell 基础工具 / Shell 交互。
 * 核心目的：提供 Shell 基础工具 / Shell 交互 中的“处理交互提示”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import { jsonRecord, optionalStringArray, stringList, stringValue, trimmedString } from "../_shared/jsonBoundary.js";

export type ShellPromptHandlingPermission = "shell:prompt:handle";

export type ShellPromptHandlingBoundary = "input" | "permission" | "scope" | "approval" | "contract";

export type ShellPromptKind = "confirmation" | "password" | "sudo" | "selection" | "generic";

export type ShellPromptHandlingAction = "observe" | "respond" | "escalate";

export type ShellPromptHandlingContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  grantedPermissions?: readonly ShellPromptHandlingPermission[];
  allowedSessionIds?: readonly string[];
  approval?: {
    accepted: boolean;
    approvalId?: string;
    reason?: string;
  };
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type ShellPromptHandlingTarget = {
  sessionId: string;
  promptText: string;
  promptKind?: ShellPromptKind;
  action?: ShellPromptHandlingAction;
  responseText?: string;
  options?: readonly string[];
};

export type ShellPromptHandlingRequest = {
  target?: Partial<ShellPromptHandlingTarget>;
  context?: ShellPromptHandlingContext;
};

export type ShellPromptHandlingErrorCode =
  | "MISSING_SESSION_ID"
  | "MISSING_PROMPT_TEXT"
  | "INVALID_PROMPT_KIND"
  | "INVALID_ACTION"
  | "MISSING_RESPONSE"
  | "INVALID_OPTION"
  | "PERMISSION_DENIED"
  | "SCOPE_REJECTED"
  | "APPROVAL_REQUIRED"
  | "APPROVAL_REJECTED"
  | "REAL_PROMPT_HANDLING_BLOCKED";

export type ShellPromptHandlingError = {
  code: ShellPromptHandlingErrorCode;
  message: string;
  boundary: ShellPromptHandlingBoundary;
  publicSafe: true;
  internalDetailExposed: false;
};

export type ShellPromptHandlingAuditEvent = {
  type: string;
  toolId: "shell.promptHandling";
  invocationId: string;
  dryRun: boolean;
  sessionId?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type ShellPromptHandlingOutput = {
  kind: "agentCore.basicTool.shell.promptHandling";
  sessionId: string;
  promptKind: ShellPromptKind;
  action: ShellPromptHandlingAction;
  promptPreview: string;
  responsePreview?: string;
  responseBytes?: number;
  options: readonly string[];
  requiredPermission: ShellPromptHandlingPermission;
  requiresTapApproval: boolean;
  approvalId?: string;
  dryRun: boolean;
  stdinWriteBlocked: boolean;
  unsafeSideEffects: boolean;
};

export type ShellPromptHandlingResult =
  | {
      ok: true;
      toolId: "shell.promptHandling";
      output: ShellPromptHandlingOutput;
      audit: readonly ShellPromptHandlingAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "shell.promptHandling";
      error: ShellPromptHandlingError;
      audit: readonly ShellPromptHandlingAuditEvent[];
      events: readonly string[];
    };

export const shellPromptHandlingDescriptor = {
  toolId: "shell.promptHandling",
  capability: "shell-prompt-handling",
  route: "agent_executionEngine.basic_toolLayer.baseTools.shellBase.shellInteraction",
  defaultDryRun: true,
  requiredPermission: "shell:prompt:handle",
  tapOwnsApproval: true,
  unsafeSideEffectsWhenResponding: true,
} as const;

const promptKinds = new Set<ShellPromptKind>(["confirmation", "password", "sudo", "selection", "generic"]);
const promptActions = new Set<ShellPromptHandlingAction>(["observe", "respond", "escalate"]);

function cleanStringList(values: unknown): readonly string[] {
  return stringList(values);
}

function dryRunEnabled(context: ShellPromptHandlingContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: ShellPromptHandlingContext | undefined): string {
  return trimmedString(jsonRecord(context)?.invocationId) ?? "shell.promptHandling:dry-run";
}

function auditEvent(
  type: string,
  context: ShellPromptHandlingContext | undefined,
  sessionId: string | undefined,
  metadata?: Readonly<Record<string, unknown>>,
): ShellPromptHandlingAuditEvent {
  return {
    type,
    toolId: shellPromptHandlingDescriptor.toolId,
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
  code: ShellPromptHandlingErrorCode,
  message: string,
  boundary: ShellPromptHandlingBoundary,
  context: ShellPromptHandlingContext | undefined,
  sessionId?: string,
): ShellPromptHandlingResult {
  return {
    ok: false,
    toolId: shellPromptHandlingDescriptor.toolId,
    error: { code, message, boundary, publicSafe: true, internalDetailExposed: false },
    audit: [auditEvent("agentCore.basicTool.shell.promptHandling.rejected", context, sessionId, { code })],
    events: ["basicTool.shell.promptHandling.rejected"],
  };
}

function preview(text: string, sensitive = false): string {
  if (sensitive) {
    return "[redacted]";
  }

  return text.length > 96 ? `${text.slice(0, 96)}...` : text;
}

function detectPromptKind(promptText: string): ShellPromptKind {
  const lower = promptText.toLowerCase();
  if (lower.includes("sudo") && lower.includes("password")) {
    return "sudo";
  }

  if (lower.includes("password") || lower.includes("passphrase") || lower.includes("token")) {
    return "password";
  }

  if (/\[[yYnN]\/[yYnN]\]|\(y\/n\)|yes\/no/u.test(promptText)) {
    return "confirmation";
  }

  if (/\[[0-9]+\]|select|choice|option/u.test(lower)) {
    return "selection";
  }

  return "generic";
}

function approvalRequired(promptKind: ShellPromptKind, action: ShellPromptHandlingAction): boolean {
  return action === "respond" && (promptKind === "password" || promptKind === "sudo");
}

function ensureDryRunOnly(
  context: ShellPromptHandlingContext | undefined,
  sessionId: string | undefined,
): ShellPromptHandlingResult | undefined {
  if (dryRunEnabled(context)) {
    return undefined;
  }

  return failure(
    "REAL_PROMPT_HANDLING_BLOCKED",
    "shell.promptHandling only creates a guarded dry-run prompt handling envelope in the first implementation",
    "contract",
    context,
    sessionId,
  );
}

function ensurePermission(
  context: ShellPromptHandlingContext | undefined,
  sessionId: string | undefined,
): ShellPromptHandlingResult | undefined {
  if (context?.grantedPermissions === undefined) {
    return undefined;
  }

  if (cleanStringList(context.grantedPermissions).includes(shellPromptHandlingDescriptor.requiredPermission)) {
    return undefined;
  }

  return failure(
    "PERMISSION_DENIED",
    "shell.promptHandling is missing permission: shell:prompt:handle",
    "permission",
    context,
    sessionId,
  );
}

function ensureScope(
  sessionId: string,
  context: ShellPromptHandlingContext | undefined,
): ShellPromptHandlingResult | undefined {
  const allowedSessionIds = optionalStringArray(context?.allowedSessionIds, { trim: true });
  if (!allowedSessionIds.ok) {
    return failure("SCOPE_REJECTED", "shell.promptHandling allowedSessionIds must be a string array", "scope", context, sessionId);
  }

  if (context?.allowedSessionIds === undefined || allowedSessionIds.values.includes(sessionId)) {
    return undefined;
  }

  return failure("SCOPE_REJECTED", "shell.promptHandling sessionId is outside allowed prompt scope", "scope", context, sessionId);
}

function ensureApproval(
  promptKind: ShellPromptKind,
  action: ShellPromptHandlingAction,
  context: ShellPromptHandlingContext | undefined,
  sessionId: string,
): ShellPromptHandlingResult | undefined {
  if (!approvalRequired(promptKind, action)) {
    return undefined;
  }

  if (context?.approval?.accepted === true) {
    return undefined;
  }

  if (context?.approval?.accepted === false) {
    return failure(
      "APPROVAL_REJECTED",
      context.approval.reason ?? "shell.promptHandling approval was rejected by TAP governance",
      "approval",
      context,
      sessionId,
    );
  }

  return failure(
    "APPROVAL_REQUIRED",
    "shell.promptHandling sensitive prompt responses require TAP approval",
    "approval",
    context,
    sessionId,
  );
}

function normalizeTarget(
  target: unknown,
  context: ShellPromptHandlingContext | undefined,
): ShellPromptHandlingOutput | ShellPromptHandlingResult {
  const targetRecord = jsonRecord(target);
  const sessionId = trimmedString(targetRecord?.sessionId);
  if (sessionId === undefined) {
    return failure("MISSING_SESSION_ID", "shell.promptHandling requires target.sessionId", "input", context);
  }

  const promptText = stringValue(targetRecord?.promptText);
  if (typeof promptText !== "string" || promptText.trim().length === 0 || promptText.includes("\0")) {
    return failure("MISSING_PROMPT_TEXT", "shell.promptHandling requires non-empty safe promptText", "input", context, sessionId);
  }

  const promptKind = (stringValue(targetRecord?.promptKind) ?? detectPromptKind(promptText)) as ShellPromptKind;
  if (!promptKinds.has(promptKind)) {
    return failure("INVALID_PROMPT_KIND", "shell.promptHandling promptKind is not supported", "input", context, sessionId);
  }

  const action = (stringValue(targetRecord?.action) ?? "observe") as ShellPromptHandlingAction;
  if (!promptActions.has(action)) {
    return failure("INVALID_ACTION", "shell.promptHandling action is not supported", "input", context, sessionId);
  }

  const responseText = stringValue(targetRecord?.responseText);
  if (
    action === "respond" &&
    (responseText === undefined || responseText.length === 0 || responseText.includes("\0"))
  ) {
    return failure("MISSING_RESPONSE", "shell.promptHandling respond action requires non-empty safe responseText", "input", context, sessionId);
  }

  const normalizedOptions = optionalStringArray(targetRecord?.options);
  if (!normalizedOptions.ok) {
    return failure("INVALID_OPTION", "shell.promptHandling options must be a string array", "input", context, sessionId);
  }

  const options = normalizedOptions.values;
  if (options.some((option) => option.includes("\0") || option.length > 256)) {
    return failure("INVALID_OPTION", "shell.promptHandling options must be safe short strings", "input", context, sessionId);
  }

  const responseSensitive = promptKind === "password" || promptKind === "sudo";
  return {
    kind: "agentCore.basicTool.shell.promptHandling",
    sessionId,
    promptKind,
    action,
    promptPreview: preview(promptText),
    responsePreview: responseText === undefined ? undefined : preview(responseText, responseSensitive),
    responseBytes: responseText === undefined ? undefined : Buffer.byteLength(responseText, "utf8"),
    options,
    requiredPermission: shellPromptHandlingDescriptor.requiredPermission,
    requiresTapApproval: approvalRequired(promptKind, action),
    approvalId: trimmedString(jsonRecord(context?.approval)?.approvalId),
    dryRun: true,
    stdinWriteBlocked: true,
    unsafeSideEffects: action === "respond",
  };
}

export function planShellPromptHandling(request: ShellPromptHandlingRequest = {}): ShellPromptHandlingResult {
  const requestRecord = jsonRecord(request) ?? {};
  const context = jsonRecord(requestRecord.context) as ShellPromptHandlingContext | undefined;
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

  const output = normalizeTarget(requestRecord.target, context);
  if ("ok" in output) {
    return output;
  }

  const scopeFailure = ensureScope(output.sessionId, context);
  if (scopeFailure !== undefined) {
    return scopeFailure;
  }

  const approvalFailure = ensureApproval(output.promptKind, output.action, context, output.sessionId);
  if (approvalFailure !== undefined) {
    return approvalFailure;
  }

  return {
    ok: true,
    toolId: shellPromptHandlingDescriptor.toolId,
    output,
    audit: [
      auditEvent("agentCore.basicTool.shell.promptHandling.dryRun", context, output.sessionId, {
        promptKind: output.promptKind,
        action: output.action,
        requiresTapApproval: output.requiresTapApproval,
      }),
    ],
    events: [`basicTool.shell.promptHandling.${output.action}.dryRun`],
  };
}
