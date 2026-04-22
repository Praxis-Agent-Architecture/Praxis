/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / Shell 基础工具 / Shell 交互。
 * 核心目的：承载 shell execution Monitoring 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type ShellExecutionMonitoringPermission = "shell:execution:monitor";

export type ShellExecutionMonitoringBoundary = "input" | "permission" | "scope" | "resource" | "contract";

export type ShellExecutionState = "queued" | "running" | "exited" | "failed" | "unknown";

export type ShellExecutionHealth = "pending" | "healthy" | "stalled" | "completed" | "failed" | "unknown";

export type ShellExecutionMonitoringContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  grantedPermissions?: readonly ShellExecutionMonitoringPermission[];
  allowedSessionIds?: readonly string[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type ShellExecutionMonitoringTarget = {
  sessionId?: string;
  processId?: number;
};

export type ShellExecutionObservation = {
  state: ShellExecutionState;
  startedAtMs?: number;
  observedAtMs?: number;
  lastActivityAtMs?: number;
  exitCode?: number;
  signal?: string;
  stdoutBytes?: number;
  stderrBytes?: number;
};

export type ShellExecutionMonitoringRequest = {
  target?: ShellExecutionMonitoringTarget;
  observation?: ShellExecutionObservation;
  staleAfterMs?: number;
  context?: ShellExecutionMonitoringContext;
};

export type ShellExecutionMonitoringErrorCode =
  | "MISSING_TARGET"
  | "INVALID_PROCESS_ID"
  | "INVALID_OBSERVATION"
  | "INVALID_STALE_AFTER_MS"
  | "PERMISSION_DENIED"
  | "SCOPE_REJECTED"
  | "REAL_MONITORING_BLOCKED";

export type ShellExecutionMonitoringError = {
  code: ShellExecutionMonitoringErrorCode;
  message: string;
  boundary: ShellExecutionMonitoringBoundary;
  publicSafe: true;
  internalDetailExposed: false;
};

export type ShellExecutionMonitoringAuditEvent = {
  type: string;
  toolId: "shell.executionMonitoring";
  invocationId: string;
  dryRun: boolean;
  metadata: Readonly<Record<string, unknown>>;
};

export type ShellExecutionMonitoringOutput = {
  kind: "agentCore.basicTool.shell.executionMonitoring";
  target: ShellExecutionMonitoringTarget;
  observation: ShellExecutionObservation;
  health: ShellExecutionHealth;
  idleMs?: number;
  requiredPermission: ShellExecutionMonitoringPermission;
  dryRun: true;
  realProcessReadBlocked: true;
  unsafeSideEffects: false;
};

export type ShellExecutionMonitoringResult =
  | {
      ok: true;
      toolId: "shell.executionMonitoring";
      output: ShellExecutionMonitoringOutput;
      audit: readonly ShellExecutionMonitoringAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "shell.executionMonitoring";
      error: ShellExecutionMonitoringError;
      audit: readonly ShellExecutionMonitoringAuditEvent[];
      events: readonly string[];
    };

export const shellExecutionMonitoringDescriptor = {
  toolId: "shell.executionMonitoring",
  capability: "shell-execution-monitoring",
  route: "agent_executionEngine.basic_toolLayer.baseTools.shellBase.shellInteraction",
  defaultDryRun: true,
  requiredPermission: "shell:execution:monitor",
  tapOwnsApproval: true,
  unsafeSideEffects: false,
} as const;

const defaultStaleAfterMs = 300_000;
const validStates = new Set<ShellExecutionState>(["queued", "running", "exited", "failed", "unknown"]);

function cleanStringList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function dryRunEnabled(context: ShellExecutionMonitoringContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: ShellExecutionMonitoringContext | undefined): string {
  return context?.invocationId?.trim() || "shell.executionMonitoring:dry-run";
}

function auditEvent(
  type: string,
  context: ShellExecutionMonitoringContext | undefined,
  metadata?: Readonly<Record<string, unknown>>,
): ShellExecutionMonitoringAuditEvent {
  return {
    type,
    toolId: shellExecutionMonitoringDescriptor.toolId,
    invocationId: invocationId(context),
    dryRun: dryRunEnabled(context),
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: ShellExecutionMonitoringErrorCode,
  message: string,
  boundary: ShellExecutionMonitoringBoundary,
  context: ShellExecutionMonitoringContext | undefined,
): ShellExecutionMonitoringResult {
  return {
    ok: false,
    toolId: shellExecutionMonitoringDescriptor.toolId,
    error: { code, message, boundary, publicSafe: true, internalDetailExposed: false },
    audit: [auditEvent("agentCore.basicTool.shell.executionMonitoring.rejected", context, { code })],
    events: ["basicTool.shell.executionMonitoring.rejected"],
  };
}

function ensureDryRunOnly(context: ShellExecutionMonitoringContext | undefined): ShellExecutionMonitoringResult | undefined {
  if (dryRunEnabled(context)) {
    return undefined;
  }

  return failure(
    "REAL_MONITORING_BLOCKED",
    "shell.executionMonitoring only summarizes supplied observations in the first implementation",
    "contract",
    context,
  );
}

function ensurePermission(context: ShellExecutionMonitoringContext | undefined): ShellExecutionMonitoringResult | undefined {
  if (context?.grantedPermissions === undefined) {
    return undefined;
  }

  if (cleanStringList(context.grantedPermissions).includes(shellExecutionMonitoringDescriptor.requiredPermission)) {
    return undefined;
  }

  return failure(
    "PERMISSION_DENIED",
    "shell.executionMonitoring is missing permission: shell:execution:monitor",
    "permission",
    context,
  );
}

function normalizeTarget(
  target: ShellExecutionMonitoringTarget | undefined,
  context: ShellExecutionMonitoringContext | undefined,
): ShellExecutionMonitoringTarget | ShellExecutionMonitoringResult {
  const sessionId = target?.sessionId?.trim() || undefined;
  const processId = target?.processId;

  if (sessionId === undefined && processId === undefined) {
    return failure("MISSING_TARGET", "shell.executionMonitoring requires sessionId or processId", "input", context);
  }

  if (processId !== undefined && (!Number.isInteger(processId) || processId <= 0)) {
    return failure("INVALID_PROCESS_ID", "shell.executionMonitoring processId must be a positive integer", "input", context);
  }

  const allowedSessionIds = cleanStringList(context?.allowedSessionIds);
  if (sessionId !== undefined && allowedSessionIds.length > 0 && !allowedSessionIds.includes(sessionId)) {
    return failure("SCOPE_REJECTED", "shell.executionMonitoring sessionId is outside allowed monitoring scope", "scope", context);
  }

  return { sessionId, processId };
}

function normalizeObservation(
  observation: ShellExecutionObservation | undefined,
  context: ShellExecutionMonitoringContext | undefined,
): ShellExecutionObservation | ShellExecutionMonitoringResult {
  const normalized: ShellExecutionObservation = observation ?? { state: "unknown" };

  if (!validStates.has(normalized.state)) {
    return failure("INVALID_OBSERVATION", "shell.executionMonitoring observation state is not supported", "input", context);
  }

  const numericFields = [
    normalized.startedAtMs,
    normalized.observedAtMs,
    normalized.lastActivityAtMs,
    normalized.exitCode,
    normalized.stdoutBytes,
    normalized.stderrBytes,
  ];
  if (numericFields.some((value) => value !== undefined && (!Number.isFinite(value) || value < 0))) {
    return failure("INVALID_OBSERVATION", "shell.executionMonitoring numeric observation fields must be non-negative", "input", context);
  }

  return {
    state: normalized.state,
    startedAtMs: normalized.startedAtMs,
    observedAtMs: normalized.observedAtMs,
    lastActivityAtMs: normalized.lastActivityAtMs,
    exitCode: normalized.exitCode,
    signal: normalized.signal?.trim() || undefined,
    stdoutBytes: normalized.stdoutBytes,
    stderrBytes: normalized.stderrBytes,
  };
}

function resolveHealth(observation: ShellExecutionObservation, staleAfterMs: number): { health: ShellExecutionHealth; idleMs?: number } {
  if (observation.state === "queued") {
    return { health: "pending" };
  }

  if (observation.state === "exited") {
    return { health: observation.exitCode === 0 || observation.exitCode === undefined ? "completed" : "failed" };
  }

  if (observation.state === "failed") {
    return { health: "failed" };
  }

  if (observation.state !== "running") {
    return { health: "unknown" };
  }

  if (observation.observedAtMs === undefined || observation.lastActivityAtMs === undefined) {
    return { health: "healthy" };
  }

  const idleMs = Math.max(0, observation.observedAtMs - observation.lastActivityAtMs);
  return { health: idleMs > staleAfterMs ? "stalled" : "healthy", idleMs };
}

export function monitorShellExecution(
  request: ShellExecutionMonitoringRequest = {},
): ShellExecutionMonitoringResult {
  const dryRunFailure = ensureDryRunOnly(request.context);
  if (dryRunFailure !== undefined) {
    return dryRunFailure;
  }

  const permissionFailure = ensurePermission(request.context);
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const staleAfterMs = request.staleAfterMs ?? defaultStaleAfterMs;
  if (!Number.isInteger(staleAfterMs) || staleAfterMs <= 0) {
    return failure(
      "INVALID_STALE_AFTER_MS",
      "shell.executionMonitoring staleAfterMs must be a positive integer",
      "resource",
      request.context,
    );
  }

  const target = normalizeTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  const observation = normalizeObservation(request.observation, request.context);
  if ("ok" in observation) {
    return observation;
  }

  const health = resolveHealth(observation, staleAfterMs);

  return {
    ok: true,
    toolId: shellExecutionMonitoringDescriptor.toolId,
    output: {
      kind: "agentCore.basicTool.shell.executionMonitoring",
      target,
      observation,
      health: health.health,
      idleMs: health.idleMs,
      requiredPermission: shellExecutionMonitoringDescriptor.requiredPermission,
      dryRun: true,
      realProcessReadBlocked: true,
      unsafeSideEffects: false,
    },
    audit: [
      auditEvent("agentCore.basicTool.shell.executionMonitoring.dryRun", request.context, {
        state: observation.state,
        health: health.health,
      }),
    ],
    events: [`basicTool.shell.executionMonitoring.${health.health}`],
  };
}
