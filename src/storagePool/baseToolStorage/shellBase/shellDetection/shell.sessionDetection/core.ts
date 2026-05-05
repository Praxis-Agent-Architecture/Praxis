/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / Shell 基础工具 / Shell 探测。
 * 核心目的：提供 Shell 基础工具 / Shell 探测 中的“探测 Shell 会话”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type ShellSessionDetectionPermission = "shell:session:detect" | "shell:process:read";

export type ShellSessionDetectionBoundary = "input" | "scope" | "permission" | "contract" | "governance" | "provider";

export type ShellSessionKind = "interactive" | "non-interactive" | "unknown";

export type ShellSessionDetectionContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: {
    allowed?: boolean;
    accepted?: boolean;
    reason?: string;
  };
  allowedSessionIds?: readonly string[];
  allowedProcessIds?: readonly number[];
  grantedPermissions?: readonly ShellSessionDetectionPermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type ShellSessionDetectionTarget = {
  sessionId?: string;
  processId?: number;
  tty?: string;
  shellExecutable?: string;
  knownInteractive?: boolean;
};

export type ShellSessionDetectionRequest = {
  target?: Partial<ShellSessionDetectionTarget>;
  context?: ShellSessionDetectionContext;
  provider?: ShellSessionDetectionProvider;
};

export type ShellSessionDetectionErrorCode =
  | "MISSING_SESSION_TARGET"
  | "INVALID_PROCESS_ID"
  | "INVALID_SESSION_ID"
  | "INVALID_SHELL_EXECUTABLE"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "REAL_DETECTION_BLOCKED"
  | "GOVERNANCE_REJECTED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_REJECTED";

export type ShellSessionDetectionError = {
  code: ShellSessionDetectionErrorCode;
  message: string;
  boundary: ShellSessionDetectionBoundary;
  publicSafe: true;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type ShellSessionDetectionAuditEvent = {
  type: string;
  toolId: "shell.sessionDetection";
  invocationId: string;
  dryRun: boolean;
  sessionId?: string;
  processId?: number;
  metadata: Readonly<Record<string, unknown>>;
};

export type ShellSessionDetectionOutput = {
  kind: "agentCore.basicTool.shell.sessionDetection";
  target: ShellSessionDetectionTarget;
  detected: {
    sessionKind: ShellSessionKind;
    interactive: boolean | "unknown";
    hasTty: boolean;
    shellKind: string;
  };
  permissionsRequired: readonly ShellSessionDetectionPermission[];
  dryRun: boolean;
  executionBlocked: boolean;
  unsafeSideEffects: false;
  detectionEnvelope: {
    operation: "detect-shell-session";
    realProcessReadRequired: boolean;
  };
};

export type ShellSessionDetectionProviderRequest = {
  target: ShellSessionDetectionTarget;
  context?: ShellSessionDetectionContext;
};

export type ShellSessionDetectionProvider = (
  request: ShellSessionDetectionProviderRequest,
) => ShellSessionDetectionOutput | Promise<ShellSessionDetectionOutput>;

export type ShellSessionDetectionResult =
  | {
      ok: true;
      toolId: "shell.sessionDetection";
      output: ShellSessionDetectionOutput;
      audit: readonly ShellSessionDetectionAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "shell.sessionDetection";
      error: ShellSessionDetectionError;
      audit: readonly ShellSessionDetectionAuditEvent[];
      events: readonly string[];
    };

export const shellSessionDetectionDescriptor = {
  toolId: "shell.sessionDetection",
  capability: "detect-shell-session",
  route: "agent_executionEngine.basic_toolLayer.baseTools.shellBase.shellDetection",
  defaultDryRun: true,
  tapOwnsApproval: true,
  permissionsRequired: ["shell:session:detect"],
  unsafeSideEffects: false,
} as const;

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function publicReason(value: unknown, fallback: string): string {
  const reason = stringValue(value)?.trim();
  return reason !== undefined && reason.length > 0 ? reason : fallback;
}

function recordValue(value: unknown): Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : {};
}

function requestValue(value: unknown): ShellSessionDetectionRequest {
  return recordValue(value) as ShellSessionDetectionRequest;
}

function cleanList<T extends string>(values: readonly T[] | undefined): readonly T[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return [...new Set(values.map((value) => stringValue(value)?.trim() ?? "").filter(Boolean) as T[])];
}

function dryRunEnabled(context: ShellSessionDetectionContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: ShellSessionDetectionContext | undefined): string {
  return stringValue(context?.invocationId)?.trim() || "shell.sessionDetection:dry-run";
}

function auditEvent(
  type: string,
  context: ShellSessionDetectionContext | undefined,
  target: ShellSessionDetectionTarget | undefined,
  metadata?: Readonly<Record<string, unknown>>,
): ShellSessionDetectionAuditEvent {
  return {
    type,
    toolId: shellSessionDetectionDescriptor.toolId,
    invocationId: invocationId(context),
    dryRun: dryRunEnabled(context),
    sessionId: target?.sessionId,
    processId: target?.processId,
    metadata: {
      ...recordValue(context?.auditMetadata),
      ...recordValue(metadata),
    },
  };
}

function failure(
  code: ShellSessionDetectionErrorCode,
  message: string,
  boundary: ShellSessionDetectionBoundary,
  context: ShellSessionDetectionContext | undefined,
  target?: ShellSessionDetectionTarget,
): ShellSessionDetectionResult {
  return {
    ok: false,
    toolId: shellSessionDetectionDescriptor.toolId,
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("agentCore.basicTool.shell.sessionDetection.rejected", context, target, { code })],
    events: ["basicTool.shell.sessionDetection.rejected"],
  };
}

function normalizeTarget(
  target: Partial<ShellSessionDetectionTarget> | undefined,
  context: ShellSessionDetectionContext | undefined,
): ShellSessionDetectionTarget | ShellSessionDetectionResult {
  const sessionId = stringValue(target?.sessionId)?.trim();
  const tty = stringValue(target?.tty)?.trim();
  const shellExecutable = stringValue(target?.shellExecutable)?.trim();

  if (
    target?.processId !== undefined &&
    (!Number.isSafeInteger(target.processId) || Number(target.processId) <= 0)
  ) {
    return failure(
      "INVALID_PROCESS_ID",
      "shell.sessionDetection target.processId must be a positive integer",
      "input",
      context,
      { processId: target.processId },
    );
  }

  if (target?.sessionId !== undefined && sessionId?.length === 0) {
    return failure("INVALID_SESSION_ID", "shell.sessionDetection target.sessionId must not be blank", "input", context);
  }

  if (shellExecutable !== undefined && /[\u0000-\u001F\u007F]/u.test(shellExecutable)) {
    return failure(
      "INVALID_SHELL_EXECUTABLE",
      "shell.sessionDetection target.shellExecutable must be a safe shell executable token",
      "input",
      context,
    );
  }

  if (
    sessionId === undefined &&
    target?.processId === undefined &&
    tty === undefined &&
    shellExecutable === undefined
  ) {
    return failure(
      "MISSING_SESSION_TARGET",
      "shell.sessionDetection requires at least one of target.sessionId, target.processId, target.tty, or target.shellExecutable",
      "input",
      context,
    );
  }

  return {
    sessionId,
    processId: Number.isSafeInteger(target?.processId) ? target?.processId : undefined,
    tty,
    shellExecutable,
    knownInteractive: typeof target?.knownInteractive === "boolean" ? target.knownInteractive : undefined,
  };
}

function ensureScope(
  target: ShellSessionDetectionTarget,
  context: ShellSessionDetectionContext | undefined,
): ShellSessionDetectionResult | undefined {
  const allowedSessionIds = cleanList(context?.allowedSessionIds);
  if (target.sessionId !== undefined && allowedSessionIds.length > 0 && !allowedSessionIds.includes(target.sessionId)) {
    return failure(
      "SCOPE_REJECTED",
      "shell.sessionDetection target session is outside the allowed session scope",
      "scope",
      context,
      target,
    );
  }

  const allowedProcessIds = Array.isArray(context?.allowedProcessIds)
    ? context.allowedProcessIds.filter((processId) => Number.isSafeInteger(processId) && processId > 0)
    : [];
  if (target.processId !== undefined && allowedProcessIds.length > 0 && !allowedProcessIds.includes(target.processId)) {
    return failure(
      "SCOPE_REJECTED",
      "shell.sessionDetection target process is outside the allowed process scope",
      "scope",
      context,
      target,
    );
  }

  return undefined;
}

function ensureRealExecutionGuard(
  target: ShellSessionDetectionTarget,
  context: ShellSessionDetectionContext | undefined,
): ShellSessionDetectionResult | undefined {
  if (context?.guard?.allowed === true || context?.guard?.accepted === true) {
    return undefined;
  }

  return failure(
    "GOVERNANCE_REJECTED",
    publicReason(context?.guard?.reason, "shell.sessionDetection requires an affirmative runtime guard for real detection"),
    "governance",
    context,
    target,
  );
}

function ensurePermissions(
  target: ShellSessionDetectionTarget,
  context: ShellSessionDetectionContext | undefined,
): ShellSessionDetectionResult | undefined {
  const grantedPermissions = cleanList(context?.grantedPermissions);
  if (grantedPermissions.length === 0) {
    return undefined;
  }

  const requiredPermissions: readonly ShellSessionDetectionPermission[] =
    target.processId === undefined ? ["shell:session:detect"] : ["shell:session:detect", "shell:process:read"];
  const missing = requiredPermissions.filter((permission) => !grantedPermissions.includes(permission));
  if (missing.length === 0) {
    return undefined;
  }

  return failure(
    "PERMISSION_DENIED",
    `shell.sessionDetection is missing permissions: ${missing.join(", ")}`,
    "permission",
    context,
    target,
  );
}

function ensureDryRunOnly(
  target: ShellSessionDetectionTarget,
  context: ShellSessionDetectionContext | undefined,
): ShellSessionDetectionResult | undefined {
  if (dryRunEnabled(context)) {
    return undefined;
  }

  return failure(
    "REAL_DETECTION_BLOCKED",
    "shell.sessionDetection only returns a guarded dry-run session detection envelope in the first implementation",
    "contract",
    context,
    target,
  );
}

function inferShellKind(shellExecutable: string | undefined): string {
  const basename = shellExecutable?.split(/[\\/]/).pop()?.toLowerCase() ?? "";
  if (basename.includes("zsh")) {
    return "zsh";
  }
  if (basename.includes("bash")) {
    return "bash";
  }
  if (basename.includes("fish")) {
    return "fish";
  }
  if (basename.includes("pwsh") || basename.includes("powershell")) {
    return "powershell";
  }
  if (basename.includes("cmd")) {
    return "cmd";
  }
  if (basename === "sh" || basename.endsWith("-sh")) {
    return "sh";
  }
  return "unknown";
}

function inferSessionKind(target: ShellSessionDetectionTarget): ShellSessionKind {
  if (target.knownInteractive === true || target.tty !== undefined) {
    return "interactive";
  }

  if (target.knownInteractive === false) {
    return "non-interactive";
  }

  return "unknown";
}

function requiredPermissions(target: ShellSessionDetectionTarget): readonly ShellSessionDetectionPermission[] {
  return target.processId === undefined ? ["shell:session:detect"] : ["shell:session:detect", "shell:process:read"];
}

export function detectShellSession(request: ShellSessionDetectionRequest = {}): ShellSessionDetectionResult {
  const normalizedRequest = requestValue(request);
  const target = normalizeTarget(normalizedRequest.target, normalizedRequest.context);
  if ("ok" in target) {
    return target;
  }

  const scopeFailure = ensureScope(target, normalizedRequest.context);
  if (scopeFailure !== undefined) {
    return scopeFailure;
  }

  const permissionFailure = ensurePermissions(target, normalizedRequest.context);
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const realDetectionFailure = ensureDryRunOnly(target, normalizedRequest.context);
  if (realDetectionFailure !== undefined) {
    return realDetectionFailure;
  }

  const sessionKind = inferSessionKind(target);

  return {
    ok: true,
    toolId: shellSessionDetectionDescriptor.toolId,
    output: {
      kind: "agentCore.basicTool.shell.sessionDetection",
      target,
      detected: {
        sessionKind,
        interactive: sessionKind === "unknown" ? "unknown" : sessionKind === "interactive",
        hasTty: target.tty !== undefined,
        shellKind: inferShellKind(target.shellExecutable),
      },
      permissionsRequired: requiredPermissions(target),
      dryRun: true,
      executionBlocked: true,
      unsafeSideEffects: false,
      detectionEnvelope: {
        operation: "detect-shell-session",
        realProcessReadRequired: false,
      },
    },
    audit: [
      auditEvent("agentCore.basicTool.shell.sessionDetection.dryRun", normalizedRequest.context, target, {
        sessionKind,
        hasProcessTarget: target.processId !== undefined,
      }),
    ],
    events: ["basicTool.shell.sessionDetection.dryRun"],
  };
}

export async function executeShellSessionDetection(
  request: ShellSessionDetectionRequest = {},
): Promise<ShellSessionDetectionResult> {
  const normalizedRequest = requestValue(request);
  if (dryRunEnabled(normalizedRequest.context)) {
    return detectShellSession(normalizedRequest);
  }

  const target = normalizeTarget(normalizedRequest.target, normalizedRequest.context);
  if ("ok" in target) {
    return target;
  }

  const scopeFailure = ensureScope(target, normalizedRequest.context);
  if (scopeFailure !== undefined) {
    return scopeFailure;
  }

  const permissionFailure = ensurePermissions(target, normalizedRequest.context);
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const guardFailure = ensureRealExecutionGuard(target, normalizedRequest.context);
  if (guardFailure !== undefined) {
    return guardFailure;
  }

  if (typeof normalizedRequest.provider !== "function") {
    return failure(
      "PROVIDER_UNAVAILABLE",
      "shell.sessionDetection requires a runtime provider for real detection",
      "provider",
      normalizedRequest.context,
      target,
    );
  }

  try {
    const output = await normalizedRequest.provider({ target, context: normalizedRequest.context });
    return {
      ok: true,
      toolId: shellSessionDetectionDescriptor.toolId,
      output,
      audit: [
        auditEvent("agentCore.basicTool.shell.sessionDetection.detected", normalizedRequest.context, target, {
          sessionKind: output.detected.sessionKind,
          hasProcessTarget: target.processId !== undefined,
        }),
      ],
      events: ["basicTool.shell.sessionDetection.detected"],
    };
  } catch (error) {
    return failure(
      "PROVIDER_REJECTED",
      "shell.sessionDetection provider rejected the detection",
      "provider",
      normalizedRequest.context,
      target,
    );
  }
}
