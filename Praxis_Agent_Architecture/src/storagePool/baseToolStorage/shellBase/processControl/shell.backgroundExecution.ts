/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / Shell 基础工具 / 进程控制。
 * 核心目的：提供 Shell 基础工具 / 进程控制 中的“后台执行”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import type { ShellProcessSpawningPermission } from "./shell.processSpawning.js";

export type ShellBackgroundExecutionPermission = ShellProcessSpawningPermission;

export type ShellBackgroundExecutionBoundary = "input" | "scope" | "permission" | "approval" | "contract" | "resource";

export type ShellBackgroundExecutionContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  allowedWorkingDirectories?: readonly string[];
  grantedPermissions?: readonly ShellBackgroundExecutionPermission[];
  approval?: {
    accepted: boolean;
    approvalId?: string;
    reason?: string;
  };
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type ShellBackgroundExecutionTarget = {
  command: string;
  workingDirectory?: string;
  shell?: "sh" | "bash" | "zsh";
  jobId?: string;
  monitorIntervalMs?: number;
  outputBufferLimitBytes?: number;
  captureOutput?: boolean;
};

export type ShellBackgroundExecutionRequest = {
  target?: Partial<ShellBackgroundExecutionTarget>;
  riskLevel?: "low" | "medium" | "high";
  context?: ShellBackgroundExecutionContext;
};

export type ShellBackgroundExecutionErrorCode =
  | "MISSING_COMMAND"
  | "INVALID_SHELL"
  | "INVALID_MONITOR_INTERVAL"
  | "INVALID_OUTPUT_BUFFER"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "APPROVAL_REQUIRED"
  | "APPROVAL_REJECTED"
  | "REAL_EXECUTION_BLOCKED";

export type ShellBackgroundExecutionError = {
  code: ShellBackgroundExecutionErrorCode;
  message: string;
  boundary: ShellBackgroundExecutionBoundary;
  publicSafe: true;
  internalDetailExposed: false;
};

export type ShellBackgroundExecutionAuditEvent = {
  type: string;
  toolId: "shell.backgroundExecution";
  invocationId: string;
  dryRun: boolean;
  workingDirectory?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type ShellBackgroundExecutionOutput = {
  kind: "agentCore.basicTool.shell.backgroundExecution";
  target: {
    command: string;
    workingDirectory?: string;
    shell: "sh" | "bash" | "zsh";
    jobId: string;
    monitorIntervalMs: number;
    outputBufferLimitBytes: number;
    captureOutput: boolean;
  };
  commandPreview: readonly string[];
  permissionsRequired: readonly ShellBackgroundExecutionPermission[];
  approvalId?: string;
  backgroundContract: {
    returnsImmediately: true;
    monitorableByRuntime: true;
    cancellationRequired: true;
  };
  dryRun: true;
  executionBlocked: true;
  unsafeSideEffects: false;
  resultEnvelope: {
    planned: true;
    backgroundHandle: string;
    pid?: never;
  };
};

export type ShellBackgroundExecutionResult =
  | {
      ok: true;
      toolId: "shell.backgroundExecution";
      output: ShellBackgroundExecutionOutput;
      audit: readonly ShellBackgroundExecutionAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "shell.backgroundExecution";
      error: ShellBackgroundExecutionError;
      audit: readonly ShellBackgroundExecutionAuditEvent[];
      events: readonly string[];
    };

export const shellBackgroundExecutionDescriptor = {
  toolId: "shell.backgroundExecution",
  capability: "shell-background-execution",
  route: "agent_executionEngine.basic_toolLayer.baseTools.shellBase.processControl",
  defaultDryRun: true,
  tapOwnsApproval: true,
  permissionsRequired: ["shell:execute"] as readonly ShellBackgroundExecutionPermission[],
  unsafeSideEffects: false,
} as const;

const defaultMonitorIntervalMs = 1_000;
const minMonitorIntervalMs = 100;
const maxMonitorIntervalMs = 60_000;
const defaultOutputBufferLimitBytes = 64 * 1024;
const maxOutputBufferLimitBytes = 10 * 1024 * 1024;

function cleanList<T extends string>(values: readonly T[] | undefined): readonly T[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean) as T[])];
}

function dryRunEnabled(context: ShellBackgroundExecutionContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: ShellBackgroundExecutionContext | undefined): string {
  return context?.invocationId?.trim() || "shell.backgroundExecution:dry-run";
}

function normalizeDirectory(directory: string): string {
  const trimmed = directory.trim();
  return trimmed === "/" ? trimmed : trimmed.replace(/\/+$/, "");
}

function auditEvent(
  type: string,
  context: ShellBackgroundExecutionContext | undefined,
  workingDirectory?: string,
  metadata?: Readonly<Record<string, unknown>>,
): ShellBackgroundExecutionAuditEvent {
  return {
    type,
    toolId: shellBackgroundExecutionDescriptor.toolId,
    invocationId: invocationId(context),
    dryRun: dryRunEnabled(context),
    workingDirectory,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: ShellBackgroundExecutionErrorCode,
  message: string,
  boundary: ShellBackgroundExecutionBoundary,
  context: ShellBackgroundExecutionContext | undefined,
  workingDirectory?: string,
): ShellBackgroundExecutionResult {
  return {
    ok: false,
    toolId: shellBackgroundExecutionDescriptor.toolId,
    error: { code, message, boundary, publicSafe: true, internalDetailExposed: false },
    audit: [auditEvent("agentCore.basicTool.shell.backgroundExecution.rejected", context, workingDirectory, { code })],
    events: ["basicTool.shell.backgroundExecution.rejected"],
  };
}

function normalizeTarget(
  target: Partial<ShellBackgroundExecutionTarget> | undefined,
  context: ShellBackgroundExecutionContext | undefined,
): ShellBackgroundExecutionOutput["target"] | ShellBackgroundExecutionResult {
  const command = target?.command?.trim() ?? "";
  if (command.length === 0) {
    return failure("MISSING_COMMAND", "shell.backgroundExecution requires a non-empty command", "input", context, target?.workingDirectory);
  }

  const shell = target?.shell ?? "sh";
  if (shell !== "sh" && shell !== "bash" && shell !== "zsh") {
    return failure("INVALID_SHELL", "shell.backgroundExecution shell must be sh, bash, or zsh", "input", context, target?.workingDirectory);
  }

  const monitorIntervalMs = target?.monitorIntervalMs ?? defaultMonitorIntervalMs;
  if (!Number.isInteger(monitorIntervalMs) || monitorIntervalMs < minMonitorIntervalMs || monitorIntervalMs > maxMonitorIntervalMs) {
    return failure(
      "INVALID_MONITOR_INTERVAL",
      `shell.backgroundExecution monitorIntervalMs must be an integer between ${minMonitorIntervalMs} and ${maxMonitorIntervalMs}`,
      "resource",
      context,
      target?.workingDirectory,
    );
  }

  const outputBufferLimitBytes = target?.outputBufferLimitBytes ?? defaultOutputBufferLimitBytes;
  if (!Number.isInteger(outputBufferLimitBytes) || outputBufferLimitBytes < 0 || outputBufferLimitBytes > maxOutputBufferLimitBytes) {
    return failure(
      "INVALID_OUTPUT_BUFFER",
      `shell.backgroundExecution outputBufferLimitBytes must be an integer between 0 and ${maxOutputBufferLimitBytes}`,
      "resource",
      context,
      target?.workingDirectory,
    );
  }

  const workingDirectory = target?.workingDirectory?.trim() || undefined;
  return {
    command,
    workingDirectory: workingDirectory === undefined ? undefined : normalizeDirectory(workingDirectory),
    shell,
    jobId: target?.jobId?.trim() || `${invocationId(context)}:background`,
    monitorIntervalMs,
    outputBufferLimitBytes,
    captureOutput: target?.captureOutput !== false,
  };
}

function ensureScope(
  workingDirectory: string | undefined,
  context: ShellBackgroundExecutionContext | undefined,
): ShellBackgroundExecutionResult | undefined {
  if (workingDirectory === undefined) {
    return undefined;
  }

  const allowedDirectories = cleanList(context?.allowedWorkingDirectories).map(normalizeDirectory);
  if (allowedDirectories.length === 0) {
    return undefined;
  }

  const allowed = allowedDirectories.some(
    (directory) => directory === "/" || workingDirectory === directory || workingDirectory.startsWith(`${directory}/`),
  );
  if (allowed) {
    return undefined;
  }

  return failure(
    "SCOPE_REJECTED",
    "shell.backgroundExecution workingDirectory is outside allowed execution scope",
    "scope",
    context,
    workingDirectory,
  );
}

function ensurePermissions(
  workingDirectory: string | undefined,
  context: ShellBackgroundExecutionContext | undefined,
): ShellBackgroundExecutionResult | undefined {
  if (context?.grantedPermissions === undefined) {
    return undefined;
  }

  const granted = cleanList(context.grantedPermissions);
  const missing = shellBackgroundExecutionDescriptor.permissionsRequired.filter((permission) => !granted.includes(permission));
  if (missing.length === 0) {
    return undefined;
  }

  return failure(
    "PERMISSION_DENIED",
    `shell.backgroundExecution is missing permissions: ${missing.join(", ")}`,
    "permission",
    context,
    workingDirectory,
  );
}

function ensureDryRunOnly(
  workingDirectory: string | undefined,
  context: ShellBackgroundExecutionContext | undefined,
): ShellBackgroundExecutionResult | undefined {
  if (dryRunEnabled(context)) {
    return undefined;
  }

  return failure(
    "REAL_EXECUTION_BLOCKED",
    "shell.backgroundExecution only returns a guarded dry-run background execution plan in the first implementation",
    "contract",
    context,
    workingDirectory,
  );
}

function resolveApproval(
  riskLevel: ShellBackgroundExecutionRequest["riskLevel"],
  context: ShellBackgroundExecutionContext | undefined,
  workingDirectory: string | undefined,
): ShellBackgroundExecutionResult | undefined {
  if (riskLevel !== "high") {
    return undefined;
  }

  if (context?.approval?.accepted === true) {
    return undefined;
  }

  if (context?.approval?.accepted === false) {
    return failure(
      "APPROVAL_REJECTED",
      context.approval.reason ?? "shell.backgroundExecution approval was rejected by TAP governance",
      "approval",
      context,
      workingDirectory,
    );
  }

  return failure(
    "APPROVAL_REQUIRED",
    "shell.backgroundExecution high-risk background execution requires TAP approval",
    "approval",
    context,
    workingDirectory,
  );
}

export function planShellBackgroundExecution(request: ShellBackgroundExecutionRequest = {}): ShellBackgroundExecutionResult {
  const target = normalizeTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  const scopeFailure = ensureScope(target.workingDirectory, request.context);
  if (scopeFailure !== undefined) {
    return scopeFailure;
  }

  const permissionFailure = ensurePermissions(target.workingDirectory, request.context);
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const realExecutionFailure = ensureDryRunOnly(target.workingDirectory, request.context);
  if (realExecutionFailure !== undefined) {
    return realExecutionFailure;
  }

  const approvalFailure = resolveApproval(request.riskLevel, request.context, target.workingDirectory);
  if (approvalFailure !== undefined) {
    return approvalFailure;
  }

  return {
    ok: true,
    toolId: shellBackgroundExecutionDescriptor.toolId,
    output: {
      kind: "agentCore.basicTool.shell.backgroundExecution",
      target,
      commandPreview: [target.shell, "-lc", target.command],
      permissionsRequired: shellBackgroundExecutionDescriptor.permissionsRequired,
      approvalId: request.context?.approval?.approvalId?.trim() || undefined,
      backgroundContract: {
        returnsImmediately: true,
        monitorableByRuntime: true,
        cancellationRequired: true,
      },
      dryRun: true,
      executionBlocked: true,
      unsafeSideEffects: false,
      resultEnvelope: {
        planned: true,
        backgroundHandle: target.jobId,
      },
    },
    audit: [
      auditEvent("agentCore.basicTool.shell.backgroundExecution.dryRun", request.context, target.workingDirectory, {
        jobId: target.jobId,
        monitorIntervalMs: target.monitorIntervalMs,
        outputBufferLimitBytes: target.outputBufferLimitBytes,
      }),
    ],
    events: ["basicTool.shell.backgroundExecution.dryRun"],
  };
}
