/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / Shell 基础工具 / 执行监控。
 * 核心目的：提供 Shell 基础工具 / 执行监控 中的“观察执行过程”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type ShellRuntimeObservationPermission = "shell:observe";

export type ShellRuntimeObservationBoundary = "input" | "permission" | "contract" | "runtime";

export type ShellRuntimeObservationSeverity = "debug" | "info" | "warn" | "error";

export type ShellRuntimeObservationStatus = "quiet" | "active" | "warning" | "errored";

export type ShellRuntimeObservationContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: {
    allowed?: boolean;
    accepted?: boolean;
    reason?: string;
  };
  grantedPermissions?: readonly ShellRuntimeObservationPermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type ShellRuntimeObservationEvent = {
  type?: string;
  observedAt?: string;
  severity?: ShellRuntimeObservationSeverity;
  message?: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type ShellRuntimeObservationRequest = {
  executionId?: string;
  command?: string;
  events?: readonly ShellRuntimeObservationEvent[];
  maxEvents?: number;
  runtimeObservationError?: ShellRuntimeObservationMaterialError;
  context?: ShellRuntimeObservationContext;
};

export type ShellRuntimeObservationMaterialErrorCode =
  | "INVALID_STATE"
  | "INVALID_OBSERVED_AT_MS"
  | "INVALID_STDOUT"
  | "INVALID_STDERR"
  | "INVALID_STDOUT_BYTES"
  | "INVALID_STDERR_BYTES"
  | "INVALID_EXIT_CODE";

export type ShellRuntimeObservationMaterialError = {
  code: ShellRuntimeObservationMaterialErrorCode;
};

export type ShellRuntimeObservationErrorCode =
  | "MISSING_EXECUTION_ID"
  | "MISSING_EVENTS"
  | "INVALID_EVENT"
  | "INVALID_RUNTIME_OBSERVATION"
  | "INVALID_SEVERITY"
  | "INVALID_TIMESTAMP"
  | "EVENT_LIMIT_EXCEEDED"
  | "INVALID_ARGUMENT"
  | "PERMISSION_DENIED"
  | "REAL_EXECUTION_BLOCKED"
  | "GOVERNANCE_REJECTED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_REJECTED";

export type ShellRuntimeObservationError = {
  code: ShellRuntimeObservationErrorCode;
  message: string;
  boundary: ShellRuntimeObservationBoundary;
  publicSafe: true;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type ShellRuntimeObservationAuditEvent = {
  type: string;
  toolId: "shell.runtimeObservation";
  invocationId: string;
  dryRun: boolean;
  executionId?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type ShellRuntimeObservationOutput = {
  kind: "agentCore.basicTool.shell.runtimeObservation";
  executionId: string;
  command?: string;
  status: ShellRuntimeObservationStatus;
  eventCount: number;
  retainedEvents: readonly Required<Pick<ShellRuntimeObservationEvent, "type" | "observedAt" | "severity">>[];
  latestEventType?: string;
  severities: Readonly<Record<ShellRuntimeObservationSeverity, number>>;
  requiredPermission: ShellRuntimeObservationPermission;
  dryRun: boolean;
  providerCalled: boolean;
  observationOnly: true;
  unsafeSideEffects: false;
};

export type ShellRuntimeObservationResult =
  | {
      ok: true;
      toolId: "shell.runtimeObservation";
      output: ShellRuntimeObservationOutput;
      audit: readonly ShellRuntimeObservationAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "shell.runtimeObservation";
      error: ShellRuntimeObservationError;
      audit: readonly ShellRuntimeObservationAuditEvent[];
      events: readonly string[];
    };

export const shellRuntimeObservationDescriptor = {
  toolId: "shell.runtimeObservation",
  capability: "shell-runtime-observation",
  route: "agent_executionEngine.basic_toolLayer.baseTools.shellBase.executionMonitoring",
  defaultDryRun: true,
  requiredPermission: "shell:observe",
  unsafeSideEffects: false,
} as const;

const validSeverities = new Set<ShellRuntimeObservationSeverity>(["debug", "info", "warn", "error"]);
const defaultMaxEvents = 50;

export type ShellRuntimeObservationProviderRequest = {
  executionId: string;
  command?: string;
  events?: readonly ShellRuntimeObservationEvent[];
  maxEvents?: number;
};

export type ShellRuntimeObservationProviderResult = Partial<
  Pick<ShellRuntimeObservationRequest, "command" | "events" | "maxEvents" | "runtimeObservationError">
>;

export type ShellRuntimeObservationProvider = (
  request: ShellRuntimeObservationProviderRequest,
  context: ShellRuntimeObservationContext,
) => Promise<ShellRuntimeObservationProviderResult> | ShellRuntimeObservationProviderResult;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value.trim() || undefined : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function optionalSeverity(value: unknown): ShellRuntimeObservationSeverity | undefined {
  return optionalString(value) as ShellRuntimeObservationSeverity | undefined;
}

function normalizeContext(value: unknown): ShellRuntimeObservationContext | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return {};
  return {
    runtimeId: optionalString(value.runtimeId),
    invocationId: optionalString(value.invocationId),
    dryRun: typeof value.dryRun === "boolean" ? value.dryRun : undefined,
    guard: isRecord(value.guard)
      ? {
          allowed: typeof value.guard.allowed === "boolean" ? value.guard.allowed : undefined,
          accepted: typeof value.guard.accepted === "boolean" ? value.guard.accepted : undefined,
          reason: optionalString(value.guard.reason),
        }
      : undefined,
    grantedPermissions: Array.isArray(value.grantedPermissions)
      ? value.grantedPermissions.filter((permission): permission is ShellRuntimeObservationPermission => permission === "shell:observe")
      : undefined,
    auditMetadata: isRecord(value.auditMetadata) ? value.auditMetadata : undefined,
  };
}

function dryRunEnabled(context: ShellRuntimeObservationContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: ShellRuntimeObservationContext | undefined): string {
  return optionalString(context?.invocationId) ?? "shell.runtimeObservation:dry-run";
}

function auditEvent(
  type: string,
  context: ShellRuntimeObservationContext | undefined,
  executionId?: string,
  metadata?: Readonly<Record<string, unknown>>,
): ShellRuntimeObservationAuditEvent {
  return {
    type,
    toolId: shellRuntimeObservationDescriptor.toolId,
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
  code: ShellRuntimeObservationErrorCode,
  message: string,
  boundary: ShellRuntimeObservationBoundary,
  context: ShellRuntimeObservationContext | undefined,
  executionId?: string,
): ShellRuntimeObservationResult {
  return {
    ok: false,
    toolId: shellRuntimeObservationDescriptor.toolId,
    error: { code, message, boundary, publicSafe: true, safeForRuntimeInspection: true, internalDetailExposed: false },
    audit: [auditEvent("agentCore.basicTool.shell.runtimeObservation.rejected", context, executionId, { code })],
    events: ["basicTool.shell.runtimeObservation.rejected"],
  };
}

function ensurePermission(
  context: ShellRuntimeObservationContext | undefined,
  executionId: string,
): ShellRuntimeObservationResult | undefined {
  if (context?.grantedPermissions === undefined) {
    return undefined;
  }

  if (
    Array.isArray(context.grantedPermissions) &&
    context.grantedPermissions.includes(shellRuntimeObservationDescriptor.requiredPermission)
  ) {
    return undefined;
  }

  return failure(
    "PERMISSION_DENIED",
    "shell.runtimeObservation is missing permission: shell:observe",
    "permission",
    context,
    executionId,
  );
}

function ensureDryRunOnly(
  context: ShellRuntimeObservationContext | undefined,
  executionId: string,
): ShellRuntimeObservationResult | undefined {
  if (dryRunEnabled(context)) {
    return undefined;
  }

  return failure(
    "REAL_EXECUTION_BLOCKED",
    "shell.runtimeObservation only summarizes supplied runtime events in the first implementation",
    "contract",
    context,
    executionId,
  );
}

function parseEventTimestamp(event: ShellRuntimeObservationEvent, fallbackIndex: number): string {
  return optionalString(event.observedAt) ?? new Date(fallbackIndex).toISOString();
}

function validateEvents(
  events: readonly ShellRuntimeObservationEvent[],
): ShellRuntimeObservationError | undefined {
  for (const event of events) {
    if (optionalString(event.type) === undefined) {
      return {
        code: "INVALID_EVENT",
        message: "shell.runtimeObservation events require a non-empty type",
        boundary: "input",
        publicSafe: true,
        safeForRuntimeInspection: true,
        internalDetailExposed: false,
      };
    }

    const severity = event.severity ?? "info";
    if (!validSeverities.has(severity)) {
      return {
        code: "INVALID_SEVERITY",
        message: "shell.runtimeObservation event severity must be debug, info, warn, or error",
        boundary: "input",
        publicSafe: true,
        safeForRuntimeInspection: true,
        internalDetailExposed: false,
      };
    }

    if (event.observedAt !== undefined && (typeof event.observedAt !== "string" || Number.isNaN(Date.parse(event.observedAt)))) {
      return {
        code: "INVALID_TIMESTAMP",
        message: "shell.runtimeObservation event observedAt must be parseable when provided",
        boundary: "input",
        publicSafe: true,
        safeForRuntimeInspection: true,
        internalDetailExposed: false,
      };
    }
  }

  return undefined;
}

function summarizeStatus(severities: Readonly<Record<ShellRuntimeObservationSeverity, number>>): ShellRuntimeObservationStatus {
  if (severities.error > 0) {
    return "errored";
  }

  if (severities.warn > 0) {
    return "warning";
  }

  if (severities.debug + severities.info > 0) {
    return "active";
  }

  return "quiet";
}

function normalizeEvent(value: unknown): ShellRuntimeObservationEvent {
  if (!isRecord(value)) return {};
  return {
    type: optionalString(value.type),
    observedAt: value.observedAt === undefined ? undefined : optionalString(value.observedAt) ?? "__invalid_timestamp__",
    severity: value.severity === undefined ? undefined : optionalSeverity(value.severity) ?? ("__invalid_severity__" as ShellRuntimeObservationSeverity),
    message: optionalString(value.message),
    metadata: isRecord(value.metadata) ? value.metadata : undefined,
  };
}

type NormalizedShellRuntimeObservationRequest = {
  executionId: string;
  command?: string;
  events: readonly ShellRuntimeObservationEvent[];
  maxEvents?: number;
  runtimeObservationError?: ShellRuntimeObservationMaterialError;
  invalidEventsShape: boolean;
  invalidMaxEvents: boolean;
  invalidRuntimeObservationError: boolean;
  context?: ShellRuntimeObservationContext;
};

const validRuntimeObservationMaterialErrors = new Set<ShellRuntimeObservationMaterialErrorCode>([
  "INVALID_STATE",
  "INVALID_OBSERVED_AT_MS",
  "INVALID_STDOUT",
  "INVALID_STDERR",
  "INVALID_STDOUT_BYTES",
  "INVALID_STDERR_BYTES",
  "INVALID_EXIT_CODE",
]);

function normalizeRuntimeObservationError(value: unknown): ShellRuntimeObservationMaterialError | undefined {
  if (!isRecord(value)) return undefined;
  const code = optionalString(value.code) as ShellRuntimeObservationMaterialErrorCode | undefined;
  return code !== undefined && validRuntimeObservationMaterialErrors.has(code) ? { code } : undefined;
}

function normalizeRequest(request: unknown): NormalizedShellRuntimeObservationRequest {
  if (!isRecord(request)) {
    return { executionId: "", events: [], invalidEventsShape: false, invalidMaxEvents: false, invalidRuntimeObservationError: false };
  }

  const runtimeObservationError = normalizeRuntimeObservationError(request.runtimeObservationError);
  return {
    executionId: optionalString(request.executionId) ?? "",
    command: optionalString(request.command),
    events: request.events === undefined ? [] : Array.isArray(request.events) ? request.events.map(normalizeEvent) : [],
    invalidEventsShape: request.events !== undefined && !Array.isArray(request.events),
    maxEvents: optionalNumber(request.maxEvents),
    invalidMaxEvents: request.maxEvents !== undefined && typeof request.maxEvents !== "number",
    runtimeObservationError,
    invalidRuntimeObservationError: request.runtimeObservationError !== undefined && runtimeObservationError === undefined,
    context: normalizeContext(request.context),
  };
}

export function observeShellRuntime(request: ShellRuntimeObservationRequest = {}): ShellRuntimeObservationResult {
  const normalized = normalizeRequest(request);
  const executionId = normalized.executionId;
  if (executionId.length === 0) {
    return failure("MISSING_EXECUTION_ID", "shell.runtimeObservation requires an executionId", "input", normalized.context);
  }

  if (normalized.invalidEventsShape) {
    return failure("INVALID_ARGUMENT", "shell.runtimeObservation events must be an array when provided", "input", normalized.context, executionId);
  }

  if (normalized.invalidRuntimeObservationError || normalized.runtimeObservationError !== undefined) {
    return failure(
      "INVALID_RUNTIME_OBSERVATION",
      "shell.runtimeObservation received malformed runtime observation material",
      "runtime",
      normalized.context,
      executionId,
    );
  }

  const events = normalized.events;
  if (events.length === 0) {
    return failure(
      "MISSING_EVENTS",
      "shell.runtimeObservation requires at least one supplied runtime event",
      "input",
      normalized.context,
      executionId,
    );
  }

  const maxEvents = normalized.maxEvents ?? defaultMaxEvents;
  if (normalized.invalidMaxEvents) {
    return failure(
      "EVENT_LIMIT_EXCEEDED",
      "shell.runtimeObservation maxEvents must be a positive integer when provided",
      "runtime",
      normalized.context,
      executionId,
    );
  }

  if (!Number.isInteger(maxEvents) || maxEvents <= 0 || events.length > maxEvents) {
    return failure(
      "EVENT_LIMIT_EXCEEDED",
      "shell.runtimeObservation event count exceeds the configured observation limit",
      "runtime",
      normalized.context,
      executionId,
    );
  }

  const eventFailure = validateEvents(events);
  if (eventFailure !== undefined) {
    return failure(eventFailure.code, eventFailure.message, eventFailure.boundary, normalized.context, executionId);
  }

  const permissionFailure = ensurePermission(normalized.context, executionId);
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const realExecutionFailure = ensureDryRunOnly(normalized.context, executionId);
  if (realExecutionFailure !== undefined) {
    return realExecutionFailure;
  }

  const severities: Record<ShellRuntimeObservationSeverity, number> = {
    debug: 0,
    info: 0,
    warn: 0,
    error: 0,
  };

  const retainedEvents = events.map((event, index) => {
    const severity = event.severity ?? "info";
    severities[severity] += 1;

    return {
      type: optionalString(event.type) ?? "",
      observedAt: parseEventTimestamp(event, index),
      severity,
    };
  });

  const latestEventType = retainedEvents.at(-1)?.type;
  const status = summarizeStatus(severities);

  return {
    ok: true,
    toolId: shellRuntimeObservationDescriptor.toolId,
    output: {
      kind: "agentCore.basicTool.shell.runtimeObservation",
      executionId,
      command: normalized.command,
      status,
      eventCount: events.length,
      retainedEvents,
      latestEventType,
      severities,
      requiredPermission: shellRuntimeObservationDescriptor.requiredPermission,
      dryRun: true,
      providerCalled: false,
      observationOnly: true,
      unsafeSideEffects: false,
    },
    audit: [
      auditEvent("agentCore.basicTool.shell.runtimeObservation.dryRun", normalized.context, executionId, {
        status,
        eventCount: events.length,
      }),
    ],
    events: [`basicTool.shell.runtimeObservation.${status}`],
  };
}
