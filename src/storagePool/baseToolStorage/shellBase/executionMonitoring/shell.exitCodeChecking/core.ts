/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / Shell 基础工具 / 执行监控。
 * 核心目的：提供 Shell 基础工具 / 执行监控 中的“检查退出码”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type ShellExitCodeCheckingPermission = "shell:observe";

export type ShellExitCodeCheckingBoundary = "input" | "permission" | "contract" | "runtime";

export type ShellExitCodeStatus = "success" | "allowed-failure" | "failed" | "terminated" | "unknown";

export type ShellExitCodeCheckingContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: {
    allowed?: boolean;
    accepted?: boolean;
    reason?: string;
  };
  grantedPermissions?: readonly ShellExitCodeCheckingPermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type ShellExitCodeCheckingPolicy = {
  allowedExitCodes?: readonly number[];
  treatSignalAsFailure?: boolean;
};

export type ShellExitCodeCheckingRequest = {
  executionId?: string;
  command?: string;
  exitCode?: number | null;
  signal?: string | null;
  timedOut?: boolean;
  policy?: ShellExitCodeCheckingPolicy;
  context?: ShellExitCodeCheckingContext;
};

export type ShellExitCodeCheckingErrorCode =
  | "MISSING_EXECUTION_ID"
  | "MISSING_EXIT_OBSERVATION"
  | "INVALID_EXIT_CODE"
  | "INVALID_ALLOWED_EXIT_CODE"
  | "INVALID_SIGNAL"
  | "INVALID_ARGUMENT"
  | "PERMISSION_DENIED"
  | "REAL_EXECUTION_BLOCKED"
  | "GOVERNANCE_REJECTED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_REJECTED";

export type ShellExitCodeCheckingError = {
  code: ShellExitCodeCheckingErrorCode;
  message: string;
  boundary: ShellExitCodeCheckingBoundary;
  publicSafe: true;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type ShellExitCodeCheckingAuditEvent = {
  type: string;
  toolId: "shell.exitCodeChecking";
  invocationId: string;
  dryRun: boolean;
  executionId?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type ShellExitCodeCheckingOutput = {
  kind: "agentCore.basicTool.shell.exitCodeChecking";
  executionId: string;
  command?: string;
  exitCode?: number;
  signal?: string;
  timedOut: boolean;
  status: ShellExitCodeStatus;
  allowedExitCodes: readonly number[];
  reasons: readonly string[];
  requiredPermission: ShellExitCodeCheckingPermission;
  dryRun: boolean;
  providerCalled: boolean;
  executionObservedOnly: true;
  unsafeSideEffects: false;
};

export type ShellExitCodeCheckingResult =
  | {
      ok: true;
      toolId: "shell.exitCodeChecking";
      output: ShellExitCodeCheckingOutput;
      audit: readonly ShellExitCodeCheckingAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "shell.exitCodeChecking";
      error: ShellExitCodeCheckingError;
      audit: readonly ShellExitCodeCheckingAuditEvent[];
      events: readonly string[];
    };

export const shellExitCodeCheckingDescriptor = {
  toolId: "shell.exitCodeChecking",
  capability: "shell-exit-code-checking",
  route: "agent_executionEngine.basic_toolLayer.baseTools.shellBase.executionMonitoring",
  defaultDryRun: true,
  requiredPermission: "shell:observe",
  unsafeSideEffects: false,
} as const;

export type ShellExitCodeCheckingProviderRequest = {
  executionId: string;
  command?: string;
  exitCode?: number | null;
  signal?: string | null;
  timedOut?: boolean;
  policy?: ShellExitCodeCheckingPolicy;
};

export type ShellExitCodeCheckingProviderResult = Partial<
  Pick<ShellExitCodeCheckingRequest, "command" | "exitCode" | "signal" | "timedOut">
>;

export type ShellExitCodeCheckingProvider = (
  request: ShellExitCodeCheckingProviderRequest,
  context: ShellExitCodeCheckingContext,
) => Promise<ShellExitCodeCheckingProviderResult> | ShellExitCodeCheckingProviderResult;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value.trim() || undefined : undefined;
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function optionalExitCode(value: unknown): number | null | undefined {
  if (value === null) return null;
  return typeof value === "number" ? value : undefined;
}

function normalizeContext(value: unknown): ShellExitCodeCheckingContext | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return {};
  return {
    runtimeId: optionalString(value.runtimeId),
    invocationId: optionalString(value.invocationId),
    dryRun: optionalBoolean(value.dryRun),
    guard: isRecord(value.guard)
      ? {
          allowed: optionalBoolean(value.guard.allowed),
          accepted: optionalBoolean(value.guard.accepted),
          reason: optionalString(value.guard.reason),
        }
      : undefined,
    grantedPermissions: Array.isArray(value.grantedPermissions)
      ? value.grantedPermissions.filter((permission): permission is ShellExitCodeCheckingPermission => permission === "shell:observe")
      : undefined,
    auditMetadata: isRecord(value.auditMetadata) ? value.auditMetadata : undefined,
  };
}

function cleanNumberList(values: unknown): readonly number[] {
  if (values === undefined) return [0];
  if (!Array.isArray(values)) return [Number.NaN];
  return [...new Set(values)];
}

function dryRunEnabled(context: ShellExitCodeCheckingContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: ShellExitCodeCheckingContext | undefined): string {
  return optionalString(context?.invocationId) ?? "shell.exitCodeChecking:dry-run";
}

function auditEvent(
  type: string,
  context: ShellExitCodeCheckingContext | undefined,
  executionId?: string,
  metadata?: Readonly<Record<string, unknown>>,
): ShellExitCodeCheckingAuditEvent {
  return {
    type,
    toolId: shellExitCodeCheckingDescriptor.toolId,
    invocationId: invocationId(context),
    dryRun: dryRunEnabled(context),
    executionId,
    metadata: {
      ...(isRecord(context?.auditMetadata) ? context.auditMetadata : {}),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: ShellExitCodeCheckingErrorCode,
  message: string,
  boundary: ShellExitCodeCheckingBoundary,
  context: ShellExitCodeCheckingContext | undefined,
  executionId?: string,
): ShellExitCodeCheckingResult {
  return {
    ok: false,
    toolId: shellExitCodeCheckingDescriptor.toolId,
    error: { code, message, boundary, publicSafe: true, safeForRuntimeInspection: true, internalDetailExposed: false },
    audit: [auditEvent("agentCore.basicTool.shell.exitCodeChecking.rejected", context, executionId, { code })],
    events: ["basicTool.shell.exitCodeChecking.rejected"],
  };
}

function ensurePermission(
  context: ShellExitCodeCheckingContext | undefined,
  executionId: string,
): ShellExitCodeCheckingResult | undefined {
  if (context?.grantedPermissions === undefined) {
    return undefined;
  }

  if (
    Array.isArray(context.grantedPermissions) &&
    context.grantedPermissions.includes(shellExitCodeCheckingDescriptor.requiredPermission)
  ) {
    return undefined;
  }

  return failure(
    "PERMISSION_DENIED",
    "shell.exitCodeChecking is missing permission: shell:observe",
    "permission",
    context,
    executionId,
  );
}

function ensureDryRunOnly(
  context: ShellExitCodeCheckingContext | undefined,
  executionId: string,
): ShellExitCodeCheckingResult | undefined {
  if (dryRunEnabled(context)) {
    return undefined;
  }

  return failure(
    "REAL_EXECUTION_BLOCKED",
    "shell.exitCodeChecking only classifies supplied exit observations in the first implementation",
    "contract",
    context,
    executionId,
  );
}

function validateExitCode(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 255;
}

function evaluateExitStatus(
  request: NormalizedShellExitCodeCheckingRequest,
  allowedExitCodes: readonly number[],
): Pick<ShellExitCodeCheckingOutput, "status" | "reasons"> {
  const reasons: string[] = [];

  if (request.timedOut === true) {
    reasons.push("shell execution timed out before a normal exit code was observed");
    return { status: "terminated", reasons };
  }

  const signal = request.signal;
  if (signal) {
    reasons.push(`shell execution ended with signal ${signal}`);
    return { status: request.policy?.treatSignalAsFailure === false ? "unknown" : "terminated", reasons };
  }

  if (typeof request.exitCode !== "number") {
    reasons.push("no numeric exit code has been observed yet");
    return { status: "unknown", reasons };
  }

  if (request.exitCode === 0) {
    reasons.push("shell execution reported exit code 0");
    return { status: "success", reasons };
  }

  if (allowedExitCodes.includes(request.exitCode)) {
    reasons.push(`exit code ${request.exitCode} is allowed by the monitoring policy`);
    return { status: "allowed-failure", reasons };
  }

  reasons.push(`exit code ${request.exitCode} is outside the allowed exit code policy`);
  return { status: "failed", reasons };
}

type NormalizedShellExitCodeCheckingRequest = {
  executionId: string;
  command?: string;
  exitCode?: number | null;
  invalidExitCode: boolean;
  signal?: string;
  invalidSignal: boolean;
  timedOut?: boolean;
  invalidTimedOut: boolean;
  policy?: ShellExitCodeCheckingPolicy;
  context?: ShellExitCodeCheckingContext;
};

function normalizeRequest(request: unknown): NormalizedShellExitCodeCheckingRequest {
  if (!isRecord(request)) {
    return { executionId: "", invalidExitCode: false, invalidSignal: false, invalidTimedOut: false };
  }

  const policy = isRecord(request.policy)
    ? { allowedExitCodes: request.policy.allowedExitCodes as readonly number[] | undefined, treatSignalAsFailure: optionalBoolean(request.policy.treatSignalAsFailure) }
    : undefined;

  return {
    executionId: optionalString(request.executionId) ?? "",
    command: optionalString(request.command),
    exitCode: optionalExitCode(request.exitCode),
    invalidExitCode: request.exitCode !== undefined && request.exitCode !== null && typeof request.exitCode !== "number",
    signal: optionalString(request.signal),
    invalidSignal: request.signal !== undefined && request.signal !== null && typeof request.signal !== "string",
    timedOut: optionalBoolean(request.timedOut),
    invalidTimedOut: request.timedOut !== undefined && typeof request.timedOut !== "boolean",
    policy,
    context: normalizeContext(request.context),
  };
}

export function checkShellExitCode(request: ShellExitCodeCheckingRequest = {}): ShellExitCodeCheckingResult {
  const normalized = normalizeRequest(request);
  const executionId = normalized.executionId;
  if (executionId.length === 0) {
    return failure("MISSING_EXECUTION_ID", "shell.exitCodeChecking requires an executionId", "input", normalized.context);
  }

  const hasExitCode = normalized.exitCode !== undefined && normalized.exitCode !== null;
  const hasSignal = normalized.signal !== undefined;
  if (normalized.invalidExitCode) {
    return failure(
      "INVALID_EXIT_CODE",
      "shell.exitCodeChecking exitCode must be a number or null when provided",
      "input",
      normalized.context,
      executionId,
    );
  }

  if (normalized.invalidSignal) {
    return failure(
      "INVALID_SIGNAL",
      "shell.exitCodeChecking signal must be a string or null when provided",
      "input",
      normalized.context,
      executionId,
    );
  }

  if (normalized.invalidTimedOut) {
    return failure(
      "INVALID_ARGUMENT",
      "shell.exitCodeChecking timedOut must be a boolean when provided",
      "input",
      normalized.context,
      executionId,
    );
  }

  if (!hasExitCode && !hasSignal && normalized.timedOut !== true) {
    return failure(
      "MISSING_EXIT_OBSERVATION",
      "shell.exitCodeChecking requires an exitCode, signal, or timeout observation",
      "input",
      normalized.context,
      executionId,
    );
  }

  if (hasExitCode && !validateExitCode(normalized.exitCode as number)) {
    return failure(
      "INVALID_EXIT_CODE",
      "shell.exitCodeChecking exitCode must be an integer between 0 and 255",
      "input",
      normalized.context,
      executionId,
    );
  }

  const allowedExitCodes = cleanNumberList(normalized.policy?.allowedExitCodes);
  if (allowedExitCodes.some((exitCode) => !validateExitCode(exitCode))) {
    return failure(
      "INVALID_ALLOWED_EXIT_CODE",
      "shell.exitCodeChecking allowedExitCodes must be integers between 0 and 255",
      "input",
      normalized.context,
      executionId,
    );
  }

  const permissionFailure = ensurePermission(normalized.context, executionId);
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const realExecutionFailure = ensureDryRunOnly(normalized.context, executionId);
  if (realExecutionFailure !== undefined) {
    return realExecutionFailure;
  }

  const decision = evaluateExitStatus(normalized, allowedExitCodes);

  return {
    ok: true,
    toolId: shellExitCodeCheckingDescriptor.toolId,
    output: {
      kind: "agentCore.basicTool.shell.exitCodeChecking",
      executionId,
      command: normalized.command,
      exitCode: hasExitCode ? normalized.exitCode as number : undefined,
      signal: normalized.signal,
      timedOut: normalized.timedOut === true,
      status: decision.status,
      allowedExitCodes,
      reasons: decision.reasons,
      requiredPermission: shellExitCodeCheckingDescriptor.requiredPermission,
      dryRun: true,
      providerCalled: false,
      executionObservedOnly: true,
      unsafeSideEffects: false,
    },
    audit: [
      auditEvent("agentCore.basicTool.shell.exitCodeChecking.dryRun", normalized.context, executionId, {
        status: decision.status,
      }),
    ],
    events: [`basicTool.shell.exitCodeChecking.${decision.status}`],
  };
}
