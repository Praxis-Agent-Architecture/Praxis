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
  context?: ShellProcessStatusTrackingContext;
};

export type ShellProcessStatusTrackingErrorCode =
  | "MISSING_EXECUTION_ID"
  | "MISSING_PROCESS_SNAPSHOT"
  | "INVALID_PID"
  | "INVALID_STATUS"
  | "INVALID_EXIT_CODE"
  | "INVALID_TIMESTAMP"
  | "PERMISSION_DENIED"
  | "REAL_EXECUTION_BLOCKED";

export type ShellProcessStatusTrackingError = {
  code: ShellProcessStatusTrackingErrorCode;
  message: string;
  boundary: ShellProcessStatusTrackingBoundary;
  publicSafe: true;
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
  requiredPermission: ShellProcessStatusTrackingPermission;
  dryRun: true;
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

function cleanList<T extends string>(values: readonly T[] | undefined): readonly T[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean) as T[])];
}

function dryRunEnabled(context: ShellProcessStatusTrackingContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: ShellProcessStatusTrackingContext | undefined): string {
  return context?.invocationId?.trim() || "shell.processStatusTracking:dry-run";
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
      ...(context?.auditMetadata ?? {}),
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
    error: { code, message, boundary, publicSafe: true, internalDetailExposed: false },
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

  if (context.grantedPermissions.includes(shellProcessStatusTrackingDescriptor.requiredPermission)) {
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

export function trackShellProcessStatus(
  request: ShellProcessStatusTrackingRequest = {},
): ShellProcessStatusTrackingResult {
  const executionId = request.executionId?.trim() ?? "";
  if (executionId.length === 0) {
    return failure("MISSING_EXECUTION_ID", "shell.processStatusTracking requires an executionId", "input", request.context);
  }

  if (request.snapshot === undefined) {
    return failure(
      "MISSING_PROCESS_SNAPSHOT",
      "shell.processStatusTracking requires a supplied process snapshot",
      "input",
      request.context,
      executionId,
    );
  }

  if (request.snapshot.pid !== undefined && (!Number.isInteger(request.snapshot.pid) || request.snapshot.pid <= 0)) {
    return failure(
      "INVALID_PID",
      "shell.processStatusTracking pid must be a positive integer when provided",
      "input",
      request.context,
      executionId,
    );
  }

  const status = request.snapshot.status ?? "unknown";
  if (!validStatuses.has(status)) {
    return failure(
      "INVALID_STATUS",
      "shell.processStatusTracking status is outside the supported process status set",
      "input",
      request.context,
      executionId,
    );
  }

  const expectedStatuses = cleanList(request.expectedStatuses);
  if (expectedStatuses.some((expectedStatus) => !validStatuses.has(expectedStatus))) {
    return failure(
      "INVALID_STATUS",
      "shell.processStatusTracking expectedStatuses contains an unsupported status",
      "input",
      request.context,
      executionId,
    );
  }

  const hasExitCode = request.snapshot.exitCode !== undefined && request.snapshot.exitCode !== null;
  if (hasExitCode && !validExitCode(request.snapshot.exitCode as number)) {
    return failure(
      "INVALID_EXIT_CODE",
      "shell.processStatusTracking exitCode must be an integer between 0 and 255",
      "input",
      request.context,
      executionId,
    );
  }

  if (
    !validTimestamp(request.snapshot.startedAt) ||
    !validTimestamp(request.snapshot.observedAt) ||
    !validTimestamp(request.snapshot.lastOutputAt)
  ) {
    return failure(
      "INVALID_TIMESTAMP",
      "shell.processStatusTracking timestamps must be parseable strings when provided",
      "input",
      request.context,
      executionId,
    );
  }

  const permissionFailure = ensurePermission(request.context, executionId);
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const realExecutionFailure = ensureDryRunOnly(request.context, executionId);
  if (realExecutionFailure !== undefined) {
    return realExecutionFailure;
  }

  return {
    ok: true,
    toolId: shellProcessStatusTrackingDescriptor.toolId,
    output: {
      kind: "agentCore.basicTool.shell.processStatusTracking",
      executionId,
      command: request.command?.trim() || undefined,
      pid: request.snapshot.pid,
      status,
      expectedStatuses,
      matchesExpectedStatus: expectedStatuses.length === 0 ? true : expectedStatuses.includes(status),
      exitCode: hasExitCode ? request.snapshot.exitCode as number : undefined,
      signal: request.snapshot.signal?.trim() || undefined,
      startedAt: request.snapshot.startedAt,
      observedAt: request.snapshot.observedAt,
      lastOutputAt: request.snapshot.lastOutputAt,
      requiredPermission: shellProcessStatusTrackingDescriptor.requiredPermission,
      dryRun: true,
      observationOnly: true,
      unsafeSideEffects: false,
    },
    audit: [
      auditEvent("agentCore.basicTool.shell.processStatusTracking.dryRun", request.context, executionId, {
        status,
        matchesExpectedStatus: expectedStatuses.length === 0 ? true : expectedStatuses.includes(status),
      }),
    ],
    events: [`basicTool.shell.processStatusTracking.${status}`],
  };
}
