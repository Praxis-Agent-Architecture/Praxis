/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / Shell 基础工具 / 进程控制。
 * 核心目的：提供 Shell 基础工具 / 进程控制 中的“终止进程”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type ShellProcessTerminationSignal = "SIGTERM" | "SIGINT" | "SIGHUP" | "SIGKILL";

export type ShellProcessTerminationPermission =
  | "shell:process:terminate"
  | "shell:process:signal"
  | "shell:process:force";

export type ShellProcessTerminationBoundary = "input" | "scope" | "permission" | "approval" | "contract";

export type ShellProcessTerminationContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  allowedProcessIds?: readonly number[];
  grantedPermissions?: readonly ShellProcessTerminationPermission[];
  approval?: {
    accepted: boolean;
    approvalId?: string;
    reason?: string;
  };
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type ShellProcessTerminationTarget = {
  processId: number;
  signal: ShellProcessTerminationSignal;
  reason?: string;
  force: boolean;
};

export type ShellProcessTerminationRequest = {
  target?: Partial<ShellProcessTerminationTarget>;
  context?: ShellProcessTerminationContext;
};

export type ShellProcessTerminationErrorCode =
  | "MISSING_PROCESS_ID"
  | "INVALID_PROCESS_ID"
  | "INVALID_REASON"
  | "UNSUPPORTED_SIGNAL"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "APPROVAL_REQUIRED"
  | "APPROVAL_REJECTED"
  | "REAL_EXECUTION_BLOCKED";

export type ShellProcessTerminationError = {
  code: ShellProcessTerminationErrorCode;
  message: string;
  boundary: ShellProcessTerminationBoundary;
  publicSafe: true;
  internalDetailExposed: false;
};

export type ShellProcessTerminationAuditEvent = {
  type: string;
  toolId: "shell.processTermination";
  invocationId: string;
  dryRun: boolean;
  processId?: number;
  metadata: Readonly<Record<string, unknown>>;
};

export type ShellProcessTerminationOutput = {
  kind: "agentCore.basicTool.shell.processTermination";
  target: ShellProcessTerminationTarget;
  permissionsRequired: readonly ShellProcessTerminationPermission[];
  dryRun: true;
  executionBlocked: true;
  unsafeSideEffects: true;
  terminationEnvelope: {
    operation: "terminate-process";
    processId: number;
    signal: ShellProcessTerminationSignal;
    reason?: string;
    force: boolean;
  };
};

export type ShellProcessTerminationResult =
  | {
      ok: true;
      toolId: "shell.processTermination";
      output: ShellProcessTerminationOutput;
      audit: readonly ShellProcessTerminationAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "shell.processTermination";
      error: ShellProcessTerminationError;
      audit: readonly ShellProcessTerminationAuditEvent[];
      events: readonly string[];
    };

export const shellProcessTerminationDescriptor = {
  toolId: "shell.processTermination",
  capability: "terminate-shell-process",
  route: "agent_executionEngine.basic_toolLayer.baseTools.shellBase.processControl",
  defaultDryRun: true,
  tapOwnsApproval: true,
  permissionsRequired: ["shell:process:terminate"],
  unsafeSideEffects: true,
} as const;

const supportedSignals = ["SIGTERM", "SIGINT", "SIGHUP", "SIGKILL"] as const;

function cleanList<T extends string>(values: readonly T[] | undefined): readonly T[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean) as T[])];
}

function dryRunEnabled(context: ShellProcessTerminationContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: ShellProcessTerminationContext | undefined): string {
  return context?.invocationId?.trim() || "shell.processTermination:dry-run";
}

function auditEvent(
  type: string,
  context: ShellProcessTerminationContext | undefined,
  processId?: number,
  metadata?: Readonly<Record<string, unknown>>,
): ShellProcessTerminationAuditEvent {
  return {
    type,
    toolId: shellProcessTerminationDescriptor.toolId,
    invocationId: invocationId(context),
    dryRun: dryRunEnabled(context),
    processId,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: ShellProcessTerminationErrorCode,
  message: string,
  boundary: ShellProcessTerminationBoundary,
  context: ShellProcessTerminationContext | undefined,
  processId?: number,
): ShellProcessTerminationResult {
  return {
    ok: false,
    toolId: shellProcessTerminationDescriptor.toolId,
    error: { code, message, boundary, publicSafe: true, internalDetailExposed: false },
    audit: [auditEvent("agentCore.basicTool.shell.processTermination.rejected", context, processId, { code })],
    events: ["basicTool.shell.processTermination.rejected"],
  };
}

function normalizeTarget(
  target: Partial<ShellProcessTerminationTarget> | undefined,
  context: ShellProcessTerminationContext | undefined,
): ShellProcessTerminationTarget | ShellProcessTerminationResult {
  if (target?.processId === undefined) {
    return failure("MISSING_PROCESS_ID", "shell.processTermination requires target.processId", "input", context);
  }

  if (!Number.isSafeInteger(target.processId) || target.processId <= 0) {
    return failure(
      "INVALID_PROCESS_ID",
      "shell.processTermination target.processId must be a positive integer",
      "input",
      context,
      target.processId,
    );
  }

  const signal = target.signal ?? (target.force === true ? "SIGKILL" : "SIGTERM");
  if (!supportedSignals.includes(signal)) {
    return failure(
      "UNSUPPORTED_SIGNAL",
      "shell.processTermination target.signal is not supported by this primitive",
      "input",
      context,
      target.processId,
    );
  }

  const reason = target.reason?.trim();
  if (target.reason !== undefined && reason?.length === 0) {
    return failure(
      "INVALID_REASON",
      "shell.processTermination target.reason must not be blank when provided",
      "input",
      context,
      target.processId,
    );
  }

  return {
    processId: target.processId,
    signal,
    reason,
    force: target.force === true || signal === "SIGKILL",
  };
}

function requiredPermissions(target: ShellProcessTerminationTarget): readonly ShellProcessTerminationPermission[] {
  const permissions: ShellProcessTerminationPermission[] = ["shell:process:terminate"];

  if (target.signal !== "SIGTERM") {
    permissions.push("shell:process:signal");
  }

  if (target.force) {
    permissions.push("shell:process:force");
  }

  return permissions;
}

function ensureProcessScope(
  target: ShellProcessTerminationTarget,
  context: ShellProcessTerminationContext | undefined,
): ShellProcessTerminationResult | undefined {
  const allowedProcessIds = context?.allowedProcessIds ?? [];
  if (allowedProcessIds.length === 0 || allowedProcessIds.includes(target.processId)) {
    return undefined;
  }

  return failure(
    "SCOPE_REJECTED",
    "shell.processTermination target process is outside the allowed process scope",
    "scope",
    context,
    target.processId,
  );
}

function ensurePermissions(
  target: ShellProcessTerminationTarget,
  context: ShellProcessTerminationContext | undefined,
): ShellProcessTerminationResult | undefined {
  const grantedPermissions = cleanList(context?.grantedPermissions);
  if (grantedPermissions.length === 0) {
    return undefined;
  }

  const missing = requiredPermissions(target).filter((permission) => !grantedPermissions.includes(permission));
  if (missing.length === 0) {
    return undefined;
  }

  return failure(
    "PERMISSION_DENIED",
    `shell.processTermination is missing permissions: ${missing.join(", ")}`,
    "permission",
    context,
    target.processId,
  );
}

function ensureApproval(
  target: ShellProcessTerminationTarget,
  context: ShellProcessTerminationContext | undefined,
): ShellProcessTerminationResult | undefined {
  if (!target.force) {
    return undefined;
  }

  if (context?.approval?.accepted === true) {
    return undefined;
  }

  if (context?.approval?.accepted === false) {
    return failure(
      "APPROVAL_REJECTED",
      context.approval.reason ?? "shell.processTermination approval was rejected by TAP governance",
      "approval",
      context,
      target.processId,
    );
  }

  return failure(
    "APPROVAL_REQUIRED",
    "shell.processTermination forceful termination requires TAP approval",
    "approval",
    context,
    target.processId,
  );
}

function ensureDryRunOnly(
  target: ShellProcessTerminationTarget,
  context: ShellProcessTerminationContext | undefined,
): ShellProcessTerminationResult | undefined {
  if (dryRunEnabled(context)) {
    return undefined;
  }

  return failure(
    "REAL_EXECUTION_BLOCKED",
    "shell.processTermination only returns a guarded dry-run termination envelope in the first implementation",
    "contract",
    context,
    target.processId,
  );
}

export function planShellProcessTermination(
  request: ShellProcessTerminationRequest = {},
): ShellProcessTerminationResult {
  const target = normalizeTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  const scopeFailure = ensureProcessScope(target, request.context);
  if (scopeFailure !== undefined) {
    return scopeFailure;
  }

  const permissionFailure = ensurePermissions(target, request.context);
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const approvalFailure = ensureApproval(target, request.context);
  if (approvalFailure !== undefined) {
    return approvalFailure;
  }

  const realExecutionFailure = ensureDryRunOnly(target, request.context);
  if (realExecutionFailure !== undefined) {
    return realExecutionFailure;
  }

  return {
    ok: true,
    toolId: shellProcessTerminationDescriptor.toolId,
    output: {
      kind: "agentCore.basicTool.shell.processTermination",
      target,
      permissionsRequired: requiredPermissions(target),
      dryRun: true,
      executionBlocked: true,
      unsafeSideEffects: true,
      terminationEnvelope: {
        operation: "terminate-process",
        processId: target.processId,
        signal: target.signal,
        reason: target.reason,
        force: target.force,
      },
    },
    audit: [
      auditEvent("agentCore.basicTool.shell.processTermination.dryRun", request.context, target.processId, {
        signal: target.signal,
        force: target.force,
      }),
    ],
    events: ["basicTool.shell.processTermination.dryRun"],
  };
}
