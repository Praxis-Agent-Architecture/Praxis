/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / Shell 基础工具 / 执行监控。
 * 核心目的：提供 Shell 基础工具 / 执行监控 中的“追踪进程状态”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type ShellProcessStatusTrackingPermission = "shell:observe";

export type ShellProcessStatusTrackingBoundary = "input" | "permission" | "contract" | "runtime";

export type ShellProcessStatus = "queued" | "running" | "completed" | "failed" | "terminated" | "unknown";

export type ShellProcessStatusTrackingContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: {
    allowed?: boolean;
    accepted?: boolean;
    reason?: string;
  };
  grantedPermissions?: readonly ShellProcessStatusTrackingPermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type ShellProcessStatusSnapshot = {
  pid?: number;
  status?: ShellProcessStatus;
  exitCode?: number | null;
  signal?: string | null;
  startedAt?: string;
  observedAt?: string;
  lastOutputAt?: string;
};

export type ShellProcessStatusTrackingRequest = {
  executionId?: string;
  command?: string;
  snapshot?: ShellProcessStatusSnapshot;
  expectedStatuses?: readonly ShellProcessStatus[];
  staleAfterMs?: number;
  context?: ShellProcessStatusTrackingContext;
};

export type ShellProcessStatusTrackingErrorCode =
  | "MISSING_EXECUTION_ID"
  | "MISSING_PROCESS_SNAPSHOT"
  | "INVALID_PID"
  | "INVALID_STATUS"
  | "INVALID_EXIT_CODE"
  | "INVALID_SIGNAL"
  | "INVALID_TIMESTAMP"
  | "INVALID_STALE_AFTER_MS"
  | "INVALID_ARGUMENT"
  | "PERMISSION_DENIED"
  | "REAL_EXECUTION_BLOCKED"
  | "GOVERNANCE_REJECTED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_REJECTED";

export type ShellProcessStatusTrackingError = {
  code: ShellProcessStatusTrackingErrorCode;
  message: string;
  boundary: ShellProcessStatusTrackingBoundary;
  publicSafe: true;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type ShellProcessStatusTrackingAuditEvent = {
  type: string;
  toolId: "shell.processStatusTracking";
  invocationId: string;
  dryRun: boolean;
  executionId?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type ShellProcessStatusTrackingOutput = {
  kind: "agentCore.basicTool.shell.processStatusTracking";
  executionId: string;
  command?: string;
  pid?: number;
  status: ShellProcessStatus;
  expectedStatuses: readonly ShellProcessStatus[];
  matchesExpectedStatus: boolean;
  exitCode?: number;
  signal?: string;
  startedAt?: string;
  observedAt?: string;
  lastOutputAt?: string;
  staleAfterMs?: number;
  stale: boolean;
  requiredPermission: ShellProcessStatusTrackingPermission;
  dryRun: boolean;
  providerCalled: boolean;
  observationOnly: true;
  unsafeSideEffects: false;
};

export type ShellProcessStatusTrackingResult =
  | {
      ok: true;
      toolId: "shell.processStatusTracking";
      output: ShellProcessStatusTrackingOutput;
      audit: readonly ShellProcessStatusTrackingAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "shell.processStatusTracking";
      error: ShellProcessStatusTrackingError;
      audit: readonly ShellProcessStatusTrackingAuditEvent[];
      events: readonly string[];
    };

export const shellProcessStatusTrackingDescriptor = {
  toolId: "shell.processStatusTracking",
  capability: "shell-process-status-tracking",
  route: "agent_executionEngine.basic_toolLayer.baseTools.shellBase.executionMonitoring",
  defaultDryRun: true,
  requiredPermission: "shell:observe",
  unsafeSideEffects: false,
} as const;

const validStatuses = new Set<ShellProcessStatus>(["queued", "running", "completed", "failed", "terminated", "unknown"]);

export type ShellProcessStatusTrackingProviderRequest = {
  executionId: string;
  command?: string;
  snapshot?: ShellProcessStatusSnapshot;
  expectedStatuses?: readonly ShellProcessStatus[];
  staleAfterMs?: number;
};

export type ShellProcessStatusTrackingProviderResult = Partial<
  Pick<ShellProcessStatusTrackingRequest, "command" | "snapshot" | "expectedStatuses">
>;

export type ShellProcessStatusTrackingProvider = (
  request: ShellProcessStatusTrackingProviderRequest,
  context: ShellProcessStatusTrackingContext,
) => Promise<ShellProcessStatusTrackingProviderResult> | ShellProcessStatusTrackingProviderResult;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value.trim() || undefined : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function invalidOptionalNumber(value: unknown): boolean {
  return value !== undefined && value !== null && typeof value !== "number";
}

function optionalExitCode(value: unknown): number | null | undefined {
  if (value === null) return null;
  return optionalNumber(value);
}

function optionalSignal(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return optionalString(value) ?? "__invalid_signal__";
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function optionalPositiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

function normalizeContext(value: unknown): ShellProcessStatusTrackingContext | undefined {
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
      ? value.grantedPermissions.filter((permission): permission is ShellProcessStatusTrackingPermission => permission === "shell:observe")
      : undefined,
    auditMetadata: isRecord(value.auditMetadata) ? value.auditMetadata : undefined,
  };
}

function cleanList<T extends string>(values: unknown): readonly T[] {
  if (values === undefined) return [];
  if (!Array.isArray(values)) return ["__invalid__" as T];
  return [...new Set(values.map((value) => optionalString(value)).filter((value): value is T => value !== undefined))];
}

function dryRunEnabled(context: ShellProcessStatusTrackingContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: ShellProcessStatusTrackingContext | undefined): string {
  return optionalString(context?.invocationId) ?? "shell.processStatusTracking:dry-run";
}

function auditEvent(
  type: string,
  context: ShellProcessStatusTrackingContext | undefined,
  executionId?: string,
  metadata?: Readonly<Record<string, unknown>>,
): ShellProcessStatusTrackingAuditEvent {
  return {
    type,
    toolId: shellProcessStatusTrackingDescriptor.toolId,
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
  code: ShellProcessStatusTrackingErrorCode,
  message: string,
  boundary: ShellProcessStatusTrackingBoundary,
  context: ShellProcessStatusTrackingContext | undefined,
  executionId?: string,
): ShellProcessStatusTrackingResult {
  return {
    ok: false,
    toolId: shellProcessStatusTrackingDescriptor.toolId,
    error: { code, message, boundary, publicSafe: true, safeForRuntimeInspection: true, internalDetailExposed: false },
    audit: [auditEvent("agentCore.basicTool.shell.processStatusTracking.rejected", context, executionId, { code })],
    events: ["basicTool.shell.processStatusTracking.rejected"],
  };
}

function ensurePermission(
  context: ShellProcessStatusTrackingContext | undefined,
  executionId: string,
): ShellProcessStatusTrackingResult | undefined {
  if (context?.grantedPermissions === undefined) {
    return undefined;
  }

  if (
    Array.isArray(context.grantedPermissions) &&
    context.grantedPermissions.includes(shellProcessStatusTrackingDescriptor.requiredPermission)
  ) {
    return undefined;
  }

  return failure(
    "PERMISSION_DENIED",
    "shell.processStatusTracking is missing permission: shell:observe",
    "permission",
    context,
    executionId,
  );
}

function ensureDryRunOnly(
  context: ShellProcessStatusTrackingContext | undefined,
  executionId: string,
): ShellProcessStatusTrackingResult | undefined {
  if (dryRunEnabled(context)) {
    return undefined;
  }

  return failure(
    "REAL_EXECUTION_BLOCKED",
    "shell.processStatusTracking only normalizes supplied process snapshots in the first implementation",
    "contract",
    context,
    executionId,
  );
}

function validExitCode(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 255;
}

function validTimestamp(value: string | undefined): boolean {
  if (value === undefined) {
    return true;
  }

  return value.trim().length > 0 && !Number.isNaN(Date.parse(value));
}

function normalizeSnapshot(value: unknown): ShellProcessStatusSnapshot | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return undefined;
  return {
    pid: invalidOptionalNumber(value.pid) ? Number.NaN : optionalNumber(value.pid),
    status: optionalString(value.status) as ShellProcessStatus | undefined,
    exitCode: invalidOptionalNumber(value.exitCode) ? Number.NaN : optionalExitCode(value.exitCode),
    signal: optionalSignal(value.signal),
    startedAt: optionalString(value.startedAt),
    observedAt: optionalString(value.observedAt),
    lastOutputAt: optionalString(value.lastOutputAt),
  };
}

type NormalizedShellProcessStatusTrackingRequest = {
  executionId: string;
  command?: string;
  snapshot?: ShellProcessStatusSnapshot;
  expectedStatuses: readonly ShellProcessStatus[];
  staleAfterMs?: number;
  invalidStaleAfterMs: boolean;
  context?: ShellProcessStatusTrackingContext;
};

function normalizeRequest(request: unknown): NormalizedShellProcessStatusTrackingRequest {
  if (!isRecord(request)) {
    return { executionId: "", expectedStatuses: [], invalidStaleAfterMs: false };
  }

  return {
    executionId: optionalString(request.executionId) ?? "",
    command: optionalString(request.command),
    snapshot: normalizeSnapshot(request.snapshot),
    expectedStatuses: cleanList<ShellProcessStatus>(request.expectedStatuses),
    staleAfterMs: optionalPositiveInteger(request.staleAfterMs),
    invalidStaleAfterMs: request.staleAfterMs !== undefined && optionalPositiveInteger(request.staleAfterMs) === undefined,
    context: normalizeContext(request.context),
  };
}

function hasSnapshotMaterial(snapshot: ShellProcessStatusSnapshot | undefined): snapshot is ShellProcessStatusSnapshot {
  return snapshot !== undefined && Object.values(snapshot).some((value) => value !== undefined && value !== null && value !== "");
}

function staleFromSnapshot(snapshot: ShellProcessStatusSnapshot, staleAfterMs: number | undefined): boolean {
  if (staleAfterMs === undefined || snapshot.observedAt === undefined) return false;
  const observedAt = Date.parse(snapshot.observedAt);
  return Number.isFinite(observedAt) && Date.now() - observedAt > staleAfterMs;
}

export function trackShellProcessStatus(request: ShellProcessStatusTrackingRequest = {}): ShellProcessStatusTrackingResult {
  const normalized = normalizeRequest(request);
  const executionId = normalized.executionId;
  if (executionId.length === 0) {
    return failure("MISSING_EXECUTION_ID", "shell.processStatusTracking requires an executionId", "input", normalized.context);
  }

  if (!hasSnapshotMaterial(normalized.snapshot)) {
    return failure(
      "MISSING_PROCESS_SNAPSHOT",
      "shell.processStatusTracking requires runtime-supplied process status material",
      "input",
      normalized.context,
      executionId,
    );
  }

  if (normalized.invalidStaleAfterMs) {
    return failure(
      "INVALID_STALE_AFTER_MS",
      "shell.processStatusTracking staleAfterMs must be a positive integer when provided",
      "runtime",
      normalized.context,
      executionId,
    );
  }

  if (normalized.snapshot.pid !== undefined && (!Number.isInteger(normalized.snapshot.pid) || normalized.snapshot.pid <= 0)) {
    return failure(
      "INVALID_PID",
      "shell.processStatusTracking pid must be a positive integer when provided",
      "input",
      normalized.context,
      executionId,
    );
  }

  const status = normalized.snapshot.status ?? "unknown";
  if (!validStatuses.has(status)) {
    return failure(
      "INVALID_STATUS",
      "shell.processStatusTracking status is outside the supported process status set",
      "input",
      normalized.context,
      executionId,
    );
  }

  const expectedStatuses = normalized.expectedStatuses;
  if (expectedStatuses.some((expectedStatus) => !validStatuses.has(expectedStatus))) {
    return failure(
      "INVALID_STATUS",
      "shell.processStatusTracking expectedStatuses contains an unsupported status",
      "input",
      normalized.context,
      executionId,
    );
  }

  if (normalized.snapshot.signal !== undefined && normalized.snapshot.signal !== null && normalized.snapshot.signal === "__invalid_signal__") {
    return failure(
      "INVALID_SIGNAL",
      "shell.processStatusTracking signal must be a non-empty string or null when provided",
      "input",
      normalized.context,
      executionId,
    );
  }

  const hasExitCode = normalized.snapshot.exitCode !== undefined && normalized.snapshot.exitCode !== null;
  if (hasExitCode && !validExitCode(normalized.snapshot.exitCode as number)) {
    return failure(
      "INVALID_EXIT_CODE",
      "shell.processStatusTracking exitCode must be an integer between 0 and 255",
      "input",
      normalized.context,
      executionId,
    );
  }

  if (
    !validTimestamp(normalized.snapshot.startedAt) ||
    !validTimestamp(normalized.snapshot.observedAt) ||
    !validTimestamp(normalized.snapshot.lastOutputAt)
  ) {
    return failure(
      "INVALID_TIMESTAMP",
      "shell.processStatusTracking timestamps must be parseable strings when provided",
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

  const stale = staleFromSnapshot(normalized.snapshot, normalized.staleAfterMs);

  return {
    ok: true,
    toolId: shellProcessStatusTrackingDescriptor.toolId,
    output: {
      kind: "agentCore.basicTool.shell.processStatusTracking",
      executionId,
      command: normalized.command,
      pid: normalized.snapshot.pid,
      status,
      expectedStatuses,
      matchesExpectedStatus: expectedStatuses.length === 0 ? true : expectedStatuses.includes(status),
      exitCode: hasExitCode ? normalized.snapshot.exitCode as number : undefined,
      signal: optionalString(normalized.snapshot.signal),
      startedAt: normalized.snapshot.startedAt,
      observedAt: normalized.snapshot.observedAt,
      lastOutputAt: normalized.snapshot.lastOutputAt,
      staleAfterMs: normalized.staleAfterMs,
      stale,
      requiredPermission: shellProcessStatusTrackingDescriptor.requiredPermission,
      dryRun: true,
      providerCalled: false,
      observationOnly: true,
      unsafeSideEffects: false,
    },
    audit: [
      auditEvent("agentCore.basicTool.shell.processStatusTracking.dryRun", normalized.context, executionId, {
        status,
        stale,
        matchesExpectedStatus: expectedStatuses.length === 0 ? true : expectedStatuses.includes(status),
      }),
    ],
    events: [`basicTool.shell.processStatusTracking.${status}`],
  };
}
