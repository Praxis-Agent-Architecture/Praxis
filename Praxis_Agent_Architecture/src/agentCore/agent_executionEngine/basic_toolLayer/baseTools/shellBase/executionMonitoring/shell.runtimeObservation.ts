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
  context?: ShellRuntimeObservationContext;
};

export type ShellRuntimeObservationErrorCode =
  | "MISSING_EXECUTION_ID"
  | "MISSING_EVENTS"
  | "INVALID_EVENT"
  | "INVALID_SEVERITY"
  | "INVALID_TIMESTAMP"
  | "EVENT_LIMIT_EXCEEDED"
  | "PERMISSION_DENIED"
  | "REAL_EXECUTION_BLOCKED";

export type ShellRuntimeObservationError = {
  code: ShellRuntimeObservationErrorCode;
  message: string;
  boundary: ShellRuntimeObservationBoundary;
  publicSafe: true;
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
  dryRun: true;
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

function dryRunEnabled(context: ShellRuntimeObservationContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: ShellRuntimeObservationContext | undefined): string {
  return context?.invocationId?.trim() || "shell.runtimeObservation:dry-run";
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
      ...(context?.auditMetadata ?? {}),
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
    error: { code, message, boundary, publicSafe: true, internalDetailExposed: false },
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

  if (context.grantedPermissions.includes(shellRuntimeObservationDescriptor.requiredPermission)) {
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
  return event.observedAt?.trim() || new Date(fallbackIndex).toISOString();
}

function validateEvents(
  events: readonly ShellRuntimeObservationEvent[],
): ShellRuntimeObservationError | undefined {
  for (const event of events) {
    if ((event.type?.trim() ?? "").length === 0) {
      return {
        code: "INVALID_EVENT",
        message: "shell.runtimeObservation events require a non-empty type",
        boundary: "input",
        publicSafe: true,
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
        internalDetailExposed: false,
      };
    }

    if (event.observedAt !== undefined && Number.isNaN(Date.parse(event.observedAt))) {
      return {
        code: "INVALID_TIMESTAMP",
        message: "shell.runtimeObservation event observedAt must be parseable when provided",
        boundary: "input",
        publicSafe: true,
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

export function observeShellRuntime(
  request: ShellRuntimeObservationRequest = {},
): ShellRuntimeObservationResult {
  const executionId = request.executionId?.trim() ?? "";
  if (executionId.length === 0) {
    return failure("MISSING_EXECUTION_ID", "shell.runtimeObservation requires an executionId", "input", request.context);
  }

  const events = request.events ?? [];
  if (events.length === 0) {
    return failure(
      "MISSING_EVENTS",
      "shell.runtimeObservation requires at least one supplied runtime event",
      "input",
      request.context,
      executionId,
    );
  }

  const maxEvents = request.maxEvents ?? defaultMaxEvents;
  if (!Number.isInteger(maxEvents) || maxEvents <= 0 || events.length > maxEvents) {
    return failure(
      "EVENT_LIMIT_EXCEEDED",
      "shell.runtimeObservation event count exceeds the configured observation limit",
      "runtime",
      request.context,
      executionId,
    );
  }

  const eventFailure = validateEvents(events);
  if (eventFailure !== undefined) {
    return failure(eventFailure.code, eventFailure.message, eventFailure.boundary, request.context, executionId);
  }

  const permissionFailure = ensurePermission(request.context, executionId);
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const realExecutionFailure = ensureDryRunOnly(request.context, executionId);
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
      type: event.type?.trim() ?? "",
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
      command: request.command?.trim() || undefined,
      status,
      eventCount: events.length,
      retainedEvents,
      latestEventType,
      severities,
      requiredPermission: shellRuntimeObservationDescriptor.requiredPermission,
      dryRun: true,
      observationOnly: true,
      unsafeSideEffects: false,
    },
    audit: [
      auditEvent("agentCore.basicTool.shell.runtimeObservation.dryRun", request.context, executionId, {
        status,
        eventCount: events.length,
      }),
    ],
    events: [`basicTool.shell.runtimeObservation.${status}`],
  };
}
