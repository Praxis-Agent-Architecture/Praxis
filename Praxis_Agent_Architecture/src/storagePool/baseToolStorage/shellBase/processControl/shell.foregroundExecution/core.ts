/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / Shell 基础工具 / 进程控制。
 * 核心目的：提供 Shell 基础工具 / 进程控制 中的“前台执行”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import type { ShellProcessSpawningPermission } from "../shell.processSpawning/core.js";
import {
  cleanStringList,
  normalizeDirectory,
  readRecord,
  safeMetadata,
  stringValue,
  trimmedString,
} from "../_shared/processControlJson.js";

export type ShellForegroundExecutionPermission = ShellProcessSpawningPermission;

export type ShellForegroundExecutionBoundary = "input" | "scope" | "permission" | "contract" | "resource";

export type ShellForegroundExecutionContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  allowedWorkingDirectories?: readonly string[];
  grantedPermissions?: readonly ShellForegroundExecutionPermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
  guard?: {
    accepted?: boolean;
    allowed?: boolean;
    reason?: string;
  };
};

export type ShellForegroundExecutionTarget = {
  command: string;
  workingDirectory?: string;
  shell?: "sh" | "bash" | "zsh";
  timeoutMs?: number;
  stdin?: string;
  captureStdout?: boolean;
  captureStderr?: boolean;
};

export type ShellForegroundExecutionRequest = {
  target?: Partial<ShellForegroundExecutionTarget>;
  context?: ShellForegroundExecutionContext;
};

export type ShellForegroundExecutionErrorCode =
  | "MISSING_COMMAND"
  | "INVALID_SHELL"
  | "INVALID_CWD"
  | "INVALID_STDIN"
  | "INVALID_TIMEOUT"
  | "INVALID_CAPTURE_SETTING"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "REAL_EXECUTION_BLOCKED";

export type ShellForegroundExecutionError = {
  code: ShellForegroundExecutionErrorCode;
  message: string;
  boundary: ShellForegroundExecutionBoundary;
  publicSafe: true;
  internalDetailExposed: false;
};

export type ShellForegroundExecutionAuditEvent = {
  type: string;
  toolId: "shell.foregroundExecution";
  invocationId: string;
  dryRun: boolean;
  workingDirectory?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type ShellForegroundExecutionOutput = {
  kind: "agentCore.basicTool.shell.foregroundExecution";
  target: {
    command: string;
    workingDirectory?: string;
    shell: "sh" | "bash" | "zsh";
    timeoutMs: number;
    stdinBytes: number;
    captureStdout: boolean;
    captureStderr: boolean;
  };
  commandPreview: readonly string[];
  permissionsRequired: readonly ShellForegroundExecutionPermission[];
  foregroundContract: {
    blocksCallerUntilExit: true;
    exitStatusWillBeCaptured: true;
  };
  dryRun: boolean;
  executionBlocked: boolean;
  providerCalled?: boolean;
  unsafeSideEffects: false;
  resultEnvelope: Readonly<Record<string, unknown>> & {
    planned?: true;
    exitCode?: number;
    stdout?: string;
    stderr?: string;
  };
};

export type ShellForegroundExecutionResult =
  | {
      ok: true;
      toolId: "shell.foregroundExecution";
      output: ShellForegroundExecutionOutput;
      audit: readonly ShellForegroundExecutionAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "shell.foregroundExecution";
      error: ShellForegroundExecutionError;
      audit: readonly ShellForegroundExecutionAuditEvent[];
      events: readonly string[];
    };

export const shellForegroundExecutionDescriptor = {
  toolId: "shell.foregroundExecution",
  capability: "shell-foreground-execution",
  route: "agent_executionEngine.basic_toolLayer.baseTools.shellBase.processControl",
  defaultDryRun: true,
  tapOwnsApproval: true,
  permissionsRequired: ["shell:execute"] as readonly ShellForegroundExecutionPermission[],
  unsafeSideEffects: false,
} as const;

const defaultTimeoutMs = 30_000;
const maxTimeoutMs = 600_000;

function dryRunEnabled(context: ShellForegroundExecutionContext | undefined): boolean {
  return readRecord(context)?.dryRun !== false;
}

function invocationId(context: ShellForegroundExecutionContext | undefined): string {
  return trimmedString(readRecord(context)?.invocationId) || "shell.foregroundExecution:dry-run";
}

function auditEvent(
  type: string,
  context: ShellForegroundExecutionContext | undefined,
  workingDirectory?: string,
  metadata?: Readonly<Record<string, unknown>>,
): ShellForegroundExecutionAuditEvent {
  return {
    type,
    toolId: shellForegroundExecutionDescriptor.toolId,
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
  code: ShellForegroundExecutionErrorCode,
  message: string,
  boundary: ShellForegroundExecutionBoundary,
  context: ShellForegroundExecutionContext | undefined,
  workingDirectory?: string,
): ShellForegroundExecutionResult {
  return {
    ok: false,
    toolId: shellForegroundExecutionDescriptor.toolId,
    error: { code, message, boundary, publicSafe: true, internalDetailExposed: false },
    audit: [auditEvent("agentCore.basicTool.shell.foregroundExecution.rejected", context, workingDirectory, { code })],
    events: ["basicTool.shell.foregroundExecution.rejected"],
  };
}

function normalizeTarget(
  target: Partial<ShellForegroundExecutionTarget> | undefined,
  context: ShellForegroundExecutionContext | undefined,
): ShellForegroundExecutionOutput["target"] | ShellForegroundExecutionResult {
  const targetRecord = readRecord(target);
  const workingDirectoryForAudit = stringValue(targetRecord?.workingDirectory);
  const command = trimmedString(targetRecord?.command) ?? "";
  if (command.length === 0) {
    return failure("MISSING_COMMAND", "shell.foregroundExecution requires a non-empty command", "input", context, workingDirectoryForAudit);
  }

  if (targetRecord?.shell !== undefined && typeof targetRecord.shell !== "string") {
    return failure("INVALID_SHELL", "shell.foregroundExecution shell must be sh, bash, or zsh", "input", context, workingDirectoryForAudit);
  }

  const shell = stringValue(targetRecord?.shell) ?? "sh";
  if (shell !== "sh" && shell !== "bash" && shell !== "zsh") {
    return failure("INVALID_SHELL", "shell.foregroundExecution shell must be sh, bash, or zsh", "input", context, workingDirectoryForAudit);
  }

  const timeoutMs = targetRecord?.timeoutMs === undefined ? defaultTimeoutMs : targetRecord.timeoutMs;
  if (typeof timeoutMs !== "number" || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > maxTimeoutMs) {
    return failure(
      "INVALID_TIMEOUT",
      `shell.foregroundExecution timeoutMs must be an integer between 1 and ${maxTimeoutMs}`,
      "resource",
      context,
      workingDirectoryForAudit,
    );
  }

  if (targetRecord?.workingDirectory !== undefined && trimmedString(targetRecord.workingDirectory) === undefined) {
    return failure("INVALID_CWD", "shell.foregroundExecution workingDirectory must be a safe path string", "input", context, workingDirectoryForAudit);
  }

  if (targetRecord?.stdin !== undefined && typeof targetRecord.stdin !== "string") {
    return failure("INVALID_STDIN", "shell.foregroundExecution stdin must be a safe string", "input", context, workingDirectoryForAudit);
  }

  if (targetRecord?.captureStdout !== undefined && typeof targetRecord.captureStdout !== "boolean") {
    return failure("INVALID_CAPTURE_SETTING", "shell.foregroundExecution captureStdout must be boolean when provided", "input", context, workingDirectoryForAudit);
  }

  if (targetRecord?.captureStderr !== undefined && typeof targetRecord.captureStderr !== "boolean") {
    return failure("INVALID_CAPTURE_SETTING", "shell.foregroundExecution captureStderr must be boolean when provided", "input", context, workingDirectoryForAudit);
  }

  const workingDirectory = trimmedString(targetRecord?.workingDirectory);
  return {
    command,
    workingDirectory: workingDirectory === undefined ? undefined : normalizeDirectory(workingDirectory),
    shell,
    timeoutMs,
    stdinBytes: targetRecord?.stdin === undefined ? 0 : Buffer.byteLength(targetRecord.stdin as string, "utf8"),
    captureStdout: targetRecord?.captureStdout !== false,
    captureStderr: targetRecord?.captureStderr !== false,
  };
}

function ensureScope(
  workingDirectory: string | undefined,
  context: ShellForegroundExecutionContext | undefined,
): ShellForegroundExecutionResult | undefined {
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
    "shell.foregroundExecution workingDirectory is outside allowed execution scope",
    "scope",
    context,
    workingDirectory,
  );
}

function ensurePermissions(
  workingDirectory: string | undefined,
  context: ShellForegroundExecutionContext | undefined,
): ShellForegroundExecutionResult | undefined {
  if (readRecord(context)?.grantedPermissions === undefined) {
    return undefined;
  }

  const granted = cleanStringList(readRecord(context)?.grantedPermissions);
  const missing = shellForegroundExecutionDescriptor.permissionsRequired.filter((permission) => !granted.includes(permission));
  if (missing.length === 0) {
    return undefined;
  }

  return failure(
    "PERMISSION_DENIED",
    `shell.foregroundExecution is missing permissions: ${missing.join(", ")}`,
    "permission",
    context,
    workingDirectory,
  );
}

function ensureDryRunOnly(
  workingDirectory: string | undefined,
  context: ShellForegroundExecutionContext | undefined,
): ShellForegroundExecutionResult | undefined {
  if (dryRunEnabled(context)) {
    return undefined;
  }

  return failure(
    "REAL_EXECUTION_BLOCKED",
    "shell.foregroundExecution only returns a guarded dry-run foreground execution plan in the first implementation",
    "contract",
    context,
    workingDirectory,
  );
}

export function planShellForegroundExecution(request: ShellForegroundExecutionRequest = {}): ShellForegroundExecutionResult {
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

  return {
    ok: true,
    toolId: shellForegroundExecutionDescriptor.toolId,
    output: {
      kind: "agentCore.basicTool.shell.foregroundExecution",
      target,
      commandPreview: [target.shell, "-lc", target.command],
      permissionsRequired: shellForegroundExecutionDescriptor.permissionsRequired,
      foregroundContract: {
        blocksCallerUntilExit: true,
        exitStatusWillBeCaptured: true,
      },
      dryRun: true,
      executionBlocked: true,
      unsafeSideEffects: false,
      resultEnvelope: {
        planned: true,
      },
    },
    audit: [
      auditEvent("agentCore.basicTool.shell.foregroundExecution.dryRun", request.context, target.workingDirectory, {
        shell: target.shell,
        timeoutMs: target.timeoutMs,
        captureStdout: target.captureStdout,
        captureStderr: target.captureStderr,
      }),
    ],
    events: ["basicTool.shell.foregroundExecution.dryRun"],
  };
}
