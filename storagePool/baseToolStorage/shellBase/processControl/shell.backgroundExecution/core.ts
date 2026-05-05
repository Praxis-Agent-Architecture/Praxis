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

import type { ShellProcessSpawningPermission } from "../shell.processSpawning/core.js";
import {
  approvalRecord,
  cleanStringList,
  normalizeDirectory,
  readRecord,
  safeMetadata,
  stringValue,
  trimmedString,
} from "../_shared/processControlJson.js";

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
  guard?: {
    accepted?: boolean;
    allowed?: boolean;
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
  | "INVALID_CWD"
  | "INVALID_JOB_ID"
  | "INVALID_CAPTURE_OUTPUT"
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
  dryRun: boolean;
  executionBlocked: boolean;
  providerCalled?: boolean;
  unsafeSideEffects: false;
  resultEnvelope: Readonly<Record<string, unknown>> & {
    planned?: true;
    backgroundHandle?: string;
    pid?: number;
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

function dryRunEnabled(context: ShellBackgroundExecutionContext | undefined): boolean {
  return readRecord(context)?.dryRun !== false;
}

function invocationId(context: ShellBackgroundExecutionContext | undefined): string {
  return trimmedString(readRecord(context)?.invocationId) || "shell.backgroundExecution:dry-run";
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
      ...safeMetadata(readRecord(context)?.auditMetadata),
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
  const targetRecord = readRecord(target);
  const workingDirectoryForAudit = stringValue(targetRecord?.workingDirectory);
  const command = trimmedString(targetRecord?.command) ?? "";
  if (command.length === 0) {
    return failure("MISSING_COMMAND", "shell.backgroundExecution requires a non-empty command", "input", context, workingDirectoryForAudit);
  }

  if (targetRecord?.shell !== undefined && typeof targetRecord.shell !== "string") {
    return failure("INVALID_SHELL", "shell.backgroundExecution shell must be sh, bash, or zsh", "input", context, workingDirectoryForAudit);
  }

  const shell = stringValue(targetRecord?.shell) ?? "sh";
  if (shell !== "sh" && shell !== "bash" && shell !== "zsh") {
    return failure("INVALID_SHELL", "shell.backgroundExecution shell must be sh, bash, or zsh", "input", context, workingDirectoryForAudit);
  }

  const monitorIntervalMs = targetRecord?.monitorIntervalMs === undefined ? defaultMonitorIntervalMs : targetRecord.monitorIntervalMs;
  if (typeof monitorIntervalMs !== "number" || !Number.isInteger(monitorIntervalMs) || monitorIntervalMs < minMonitorIntervalMs || monitorIntervalMs > maxMonitorIntervalMs) {
    return failure(
      "INVALID_MONITOR_INTERVAL",
      `shell.backgroundExecution monitorIntervalMs must be an integer between ${minMonitorIntervalMs} and ${maxMonitorIntervalMs}`,
      "resource",
      context,
      workingDirectoryForAudit,
    );
  }

  const outputBufferLimitBytes =
    targetRecord?.outputBufferLimitBytes === undefined ? defaultOutputBufferLimitBytes : targetRecord.outputBufferLimitBytes;
  if (
    typeof outputBufferLimitBytes !== "number" ||
    !Number.isInteger(outputBufferLimitBytes) ||
    outputBufferLimitBytes < 0 ||
    outputBufferLimitBytes > maxOutputBufferLimitBytes
  ) {
    return failure(
      "INVALID_OUTPUT_BUFFER",
      `shell.backgroundExecution outputBufferLimitBytes must be an integer between 0 and ${maxOutputBufferLimitBytes}`,
      "resource",
      context,
      workingDirectoryForAudit,
    );
  }

  if (targetRecord?.workingDirectory !== undefined && trimmedString(targetRecord.workingDirectory) === undefined) {
    return failure("INVALID_CWD", "shell.backgroundExecution workingDirectory must be a safe path string", "input", context, workingDirectoryForAudit);
  }

  if (targetRecord?.jobId !== undefined && trimmedString(targetRecord.jobId) === undefined) {
    return failure("INVALID_JOB_ID", "shell.backgroundExecution jobId must be a non-empty string when provided", "input", context, workingDirectoryForAudit);
  }

  if (targetRecord?.captureOutput !== undefined && typeof targetRecord.captureOutput !== "boolean") {
    return failure("INVALID_CAPTURE_OUTPUT", "shell.backgroundExecution captureOutput must be boolean when provided", "input", context, workingDirectoryForAudit);
  }

  const workingDirectory = trimmedString(targetRecord?.workingDirectory);
  return {
    command,
    workingDirectory: workingDirectory === undefined ? undefined : normalizeDirectory(workingDirectory),
    shell,
    jobId: trimmedString(targetRecord?.jobId) || `${invocationId(context)}:background`,
    monitorIntervalMs,
    outputBufferLimitBytes,
    captureOutput: targetRecord?.captureOutput !== false,
  };
}

function ensureScope(
  workingDirectory: string | undefined,
  context: ShellBackgroundExecutionContext | undefined,
): ShellBackgroundExecutionResult | undefined {
  if (workingDirectory === undefined) {
    return undefined;
  }

  const allowedDirectories = cleanStringList(readRecord(context)?.allowedWorkingDirectories).map(normalizeDirectory);
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
  if (readRecord(context)?.grantedPermissions === undefined) {
    return undefined;
  }

  const granted = cleanStringList(readRecord(context)?.grantedPermissions);
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

  const approval = approvalRecord(context);
  if (approval?.accepted === true) {
    return undefined;
  }

  if (approval?.accepted === false) {
    return failure(
      "APPROVAL_REJECTED",
      stringValue(approval.reason) ?? "shell.backgroundExecution approval was rejected by TAP governance",
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
      approvalId: trimmedString(approvalRecord(request.context)?.approvalId),
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
