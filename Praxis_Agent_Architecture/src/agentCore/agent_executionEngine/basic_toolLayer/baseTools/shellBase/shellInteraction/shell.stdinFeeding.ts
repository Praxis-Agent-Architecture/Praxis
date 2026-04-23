/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / Shell 基础工具 / Shell 交互。
 * 核心目的：提供 Shell 基础工具 / Shell 交互 中的“写入 stdin”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type ShellStdinFeedingPermission = "shell:stdin:feed";

export type ShellStdinFeedingBoundary = "input" | "permission" | "scope" | "approval" | "resource" | "contract";

export type ShellStdinFeedingMode = "text" | "control-sequence";

export type ShellStdinFeedingContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  grantedPermissions?: readonly ShellStdinFeedingPermission[];
  allowedSessionIds?: readonly string[];
  maxBytes?: number;
  approval?: {
    accepted: boolean;
    approvalId?: string;
    reason?: string;
  };
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type ShellStdinFeedingTarget = {
  sessionId: string;
  input: string;
  mode?: ShellStdinFeedingMode;
  appendNewline?: boolean;
  sensitive?: boolean;
};

export type ShellStdinFeedingRequest = {
  target?: Partial<ShellStdinFeedingTarget>;
  context?: ShellStdinFeedingContext;
};

export type ShellStdinFeedingErrorCode =
  | "MISSING_SESSION_ID"
  | "MISSING_INPUT"
  | "INVALID_MODE"
  | "INPUT_TOO_LARGE"
  | "PERMISSION_DENIED"
  | "SCOPE_REJECTED"
  | "APPROVAL_REQUIRED"
  | "APPROVAL_REJECTED"
  | "REAL_STDIN_WRITE_BLOCKED";

export type ShellStdinFeedingError = {
  code: ShellStdinFeedingErrorCode;
  message: string;
  boundary: ShellStdinFeedingBoundary;
  publicSafe: true;
  internalDetailExposed: false;
};

export type ShellStdinFeedingAuditEvent = {
  type: string;
  toolId: "shell.stdinFeeding";
  invocationId: string;
  dryRun: boolean;
  sessionId?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type ShellStdinFeedingOutput = {
  kind: "agentCore.basicTool.shell.stdinFeeding";
  sessionId: string;
  mode: ShellStdinFeedingMode;
  appendNewline: boolean;
  inputPreview: string;
  inputBytes: number;
  requiredPermission: ShellStdinFeedingPermission;
  requiresTapApproval: boolean;
  approvalId?: string;
  dryRun: true;
  stdinWriteBlocked: true;
  unsafeSideEffects: true;
  resultEnvelope: {
    planned: true;
    bytesWritten?: never;
  };
};

export type ShellStdinFeedingResult =
  | {
      ok: true;
      toolId: "shell.stdinFeeding";
      output: ShellStdinFeedingOutput;
      audit: readonly ShellStdinFeedingAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "shell.stdinFeeding";
      error: ShellStdinFeedingError;
      audit: readonly ShellStdinFeedingAuditEvent[];
      events: readonly string[];
    };

export const shellStdinFeedingDescriptor = {
  toolId: "shell.stdinFeeding",
  capability: "shell-stdin-feeding",
  route: "agent_executionEngine.basic_toolLayer.baseTools.shellBase.shellInteraction",
  defaultDryRun: true,
  defaultMode: "text",
  defaultMaxBytes: 16_384,
  requiredPermission: "shell:stdin:feed",
  tapOwnsApproval: true,
  unsafeSideEffects: true,
} as const;

const maxInputBytes = 262_144;
const stdinModes = new Set<ShellStdinFeedingMode>(["text", "control-sequence"]);

function cleanStringList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function dryRunEnabled(context: ShellStdinFeedingContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: ShellStdinFeedingContext | undefined): string {
  return context?.invocationId?.trim() || "shell.stdinFeeding:dry-run";
}

function auditEvent(
  type: string,
  context: ShellStdinFeedingContext | undefined,
  sessionId: string | undefined,
  metadata?: Readonly<Record<string, unknown>>,
): ShellStdinFeedingAuditEvent {
  return {
    type,
    toolId: shellStdinFeedingDescriptor.toolId,
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
  code: ShellStdinFeedingErrorCode,
  message: string,
  boundary: ShellStdinFeedingBoundary,
  context: ShellStdinFeedingContext | undefined,
  sessionId?: string,
): ShellStdinFeedingResult {
  return {
    ok: false,
    toolId: shellStdinFeedingDescriptor.toolId,
    error: { code, message, boundary, publicSafe: true, internalDetailExposed: false },
    audit: [auditEvent("agentCore.basicTool.shell.stdinFeeding.rejected", context, sessionId, { code })],
    events: ["basicTool.shell.stdinFeeding.rejected"],
  };
}

function ensureDryRunOnly(
  context: ShellStdinFeedingContext | undefined,
  sessionId: string | undefined,
): ShellStdinFeedingResult | undefined {
  if (dryRunEnabled(context)) {
    return undefined;
  }

  return failure(
    "REAL_STDIN_WRITE_BLOCKED",
    "shell.stdinFeeding only creates a guarded dry-run stdin write envelope in the first implementation",
    "contract",
    context,
    sessionId,
  );
}

function ensurePermission(
  context: ShellStdinFeedingContext | undefined,
  sessionId: string | undefined,
): ShellStdinFeedingResult | undefined {
  if (context?.grantedPermissions === undefined) {
    return undefined;
  }

  if (cleanStringList(context.grantedPermissions).includes(shellStdinFeedingDescriptor.requiredPermission)) {
    return undefined;
  }

  return failure(
    "PERMISSION_DENIED",
    "shell.stdinFeeding is missing permission: shell:stdin:feed",
    "permission",
    context,
    sessionId,
  );
}

function ensureScope(
  sessionId: string,
  context: ShellStdinFeedingContext | undefined,
): ShellStdinFeedingResult | undefined {
  const allowedSessionIds = cleanStringList(context?.allowedSessionIds);
  if (allowedSessionIds.length === 0 || allowedSessionIds.includes(sessionId)) {
    return undefined;
  }

  return failure("SCOPE_REJECTED", "shell.stdinFeeding sessionId is outside allowed stdin scope", "scope", context, sessionId);
}

function approvalRequired(target: Pick<ShellStdinFeedingTarget, "sensitive" | "mode">): boolean {
  return target.sensitive === true || target.mode === "control-sequence";
}

function ensureApproval(
  requiresApproval: boolean,
  context: ShellStdinFeedingContext | undefined,
  sessionId: string,
): ShellStdinFeedingResult | undefined {
  if (!requiresApproval) {
    return undefined;
  }

  if (context?.approval?.accepted === true) {
    return undefined;
  }

  if (context?.approval?.accepted === false) {
    return failure(
      "APPROVAL_REJECTED",
      context.approval.reason ?? "shell.stdinFeeding approval was rejected by TAP governance",
      "approval",
      context,
      sessionId,
    );
  }

  return failure(
    "APPROVAL_REQUIRED",
    "shell.stdinFeeding sensitive or control-sequence input requires TAP approval",
    "approval",
    context,
    sessionId,
  );
}

function previewInput(input: string, sensitive: boolean): string {
  if (sensitive) {
    return "[redacted]";
  }

  return input.length > 80 ? `${input.slice(0, 80)}...` : input;
}

function normalizeTarget(
  target: Partial<ShellStdinFeedingTarget> | undefined,
  context: ShellStdinFeedingContext | undefined,
): ShellStdinFeedingOutput | ShellStdinFeedingResult {
  const sessionId = target?.sessionId?.trim() || undefined;
  if (sessionId === undefined) {
    return failure("MISSING_SESSION_ID", "shell.stdinFeeding requires target.sessionId", "input", context);
  }

  if (typeof target?.input !== "string" || target.input.length === 0 || target.input.includes("\0")) {
    return failure("MISSING_INPUT", "shell.stdinFeeding requires non-empty safe input", "input", context, sessionId);
  }

  const mode = target.mode ?? shellStdinFeedingDescriptor.defaultMode;
  if (!stdinModes.has(mode)) {
    return failure("INVALID_MODE", "shell.stdinFeeding mode must be text or control-sequence", "input", context, sessionId);
  }

  const appendNewline = target.appendNewline === true;
  const plannedInput = appendNewline ? `${target.input}\n` : target.input;
  const inputBytes = Buffer.byteLength(plannedInput, "utf8");
  const maxBytes = context?.maxBytes ?? shellStdinFeedingDescriptor.defaultMaxBytes;
  if (!Number.isInteger(maxBytes) || maxBytes <= 0 || maxBytes > maxInputBytes || inputBytes > maxBytes) {
    return failure(
      "INPUT_TOO_LARGE",
      `shell.stdinFeeding input must fit within maxBytes (${maxBytes}) and absolute limit ${maxInputBytes}`,
      "resource",
      context,
      sessionId,
    );
  }

  const requiresTapApproval = approvalRequired({ sensitive: target.sensitive, mode });
  return {
    kind: "agentCore.basicTool.shell.stdinFeeding",
    sessionId,
    mode,
    appendNewline,
    inputPreview: previewInput(plannedInput, target.sensitive === true),
    inputBytes,
    requiredPermission: shellStdinFeedingDescriptor.requiredPermission,
    requiresTapApproval,
    approvalId: context?.approval?.approvalId?.trim() || undefined,
    dryRun: true,
    stdinWriteBlocked: true,
    unsafeSideEffects: true,
    resultEnvelope: {
      planned: true,
    },
  };
}

export function planShellStdinFeeding(request: ShellStdinFeedingRequest = {}): ShellStdinFeedingResult {
  const sessionId = request.target?.sessionId?.trim();
  const dryRunFailure = ensureDryRunOnly(request.context, sessionId);
  if (dryRunFailure !== undefined) {
    return dryRunFailure;
  }

  const permissionFailure = ensurePermission(request.context, sessionId);
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const output = normalizeTarget(request.target, request.context);
  if ("ok" in output) {
    return output;
  }

  const scopeFailure = ensureScope(output.sessionId, request.context);
  if (scopeFailure !== undefined) {
    return scopeFailure;
  }

  const approvalFailure = ensureApproval(output.requiresTapApproval, request.context, output.sessionId);
  if (approvalFailure !== undefined) {
    return approvalFailure;
  }

  return {
    ok: true,
    toolId: shellStdinFeedingDescriptor.toolId,
    output,
    audit: [
      auditEvent("agentCore.basicTool.shell.stdinFeeding.dryRun", request.context, output.sessionId, {
        mode: output.mode,
        inputBytes: output.inputBytes,
        requiresTapApproval: output.requiresTapApproval,
      }),
    ],
    events: ["basicTool.shell.stdinFeeding.dryRun"],
  };
}
