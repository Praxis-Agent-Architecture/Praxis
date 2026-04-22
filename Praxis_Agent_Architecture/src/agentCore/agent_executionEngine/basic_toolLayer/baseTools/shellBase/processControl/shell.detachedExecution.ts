/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / Shell 基础工具 / 进程控制。
 * 核心目的：提供 Shell 基础工具 / 进程控制 中的“脱离会话执行”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import type { ShellProcessSpawningPermission } from "./shell.processSpawning.js";

export type ShellDetachedExecutionPermission = ShellProcessSpawningPermission;

export type ShellDetachedExecutionBoundary = "input" | "scope" | "permission" | "approval" | "contract" | "resource";

export type ShellDetachedRestartPolicy = "none" | "on-failure";

export type ShellDetachedExecutionContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  allowedWorkingDirectories?: readonly string[];
  grantedPermissions?: readonly ShellDetachedExecutionPermission[];
  approval?: {
    accepted: boolean;
    approvalId?: string;
    reason?: string;
  };
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type ShellDetachedExecutionTarget = {
  command: string;
  workingDirectory?: string;
  shell?: "sh" | "bash" | "zsh";
  launchId?: string;
  pidFilePath?: string;
  stdoutLogPath?: string;
  stderrLogPath?: string;
  restartPolicy?: ShellDetachedRestartPolicy;
};

export type ShellDetachedExecutionRequest = {
  target?: Partial<ShellDetachedExecutionTarget>;
  context?: ShellDetachedExecutionContext;
};

export type ShellDetachedExecutionErrorCode =
  | "MISSING_COMMAND"
  | "INVALID_SHELL"
  | "INVALID_RESTART_POLICY"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "APPROVAL_REQUIRED"
  | "APPROVAL_REJECTED"
  | "REAL_EXECUTION_BLOCKED";

export type ShellDetachedExecutionError = {
  code: ShellDetachedExecutionErrorCode;
  message: string;
  boundary: ShellDetachedExecutionBoundary;
  publicSafe: true;
  internalDetailExposed: false;
};

export type ShellDetachedExecutionAuditEvent = {
  type: string;
  toolId: "shell.detachedExecution";
  invocationId: string;
  dryRun: boolean;
  workingDirectory?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type ShellDetachedExecutionOutput = {
  kind: "agentCore.basicTool.shell.detachedExecution";
  target: {
    command: string;
    workingDirectory?: string;
    shell: "sh" | "bash" | "zsh";
    launchId: string;
    pidFilePath?: string;
    stdoutLogPath?: string;
    stderrLogPath?: string;
    restartPolicy: ShellDetachedRestartPolicy;
  };
  commandPreview: readonly string[];
  permissionsRequired: readonly ShellDetachedExecutionPermission[];
  approvalId?: string;
  detachedContract: {
    outlivesAgentSession: true;
    requiresTapApproval: true;
    runtimeMustRecordHandle: true;
  };
  dryRun: true;
  executionBlocked: true;
  unsafeSideEffects: false;
  resultEnvelope: {
    planned: true;
    detachedHandle: string;
    pid?: never;
  };
};

export type ShellDetachedExecutionResult =
  | {
      ok: true;
      toolId: "shell.detachedExecution";
      output: ShellDetachedExecutionOutput;
      audit: readonly ShellDetachedExecutionAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "shell.detachedExecution";
      error: ShellDetachedExecutionError;
      audit: readonly ShellDetachedExecutionAuditEvent[];
      events: readonly string[];
    };

export const shellDetachedExecutionDescriptor = {
  toolId: "shell.detachedExecution",
  capability: "shell-detached-execution",
  route: "agent_executionEngine.basic_toolLayer.baseTools.shellBase.processControl",
  defaultDryRun: true,
  tapOwnsApproval: true,
  permissionsRequired: ["shell:execute"] as readonly ShellDetachedExecutionPermission[],
  unsafeSideEffects: false,
} as const;

function cleanList<T extends string>(values: readonly T[] | undefined): readonly T[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean) as T[])];
}

function dryRunEnabled(context: ShellDetachedExecutionContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: ShellDetachedExecutionContext | undefined): string {
  return context?.invocationId?.trim() || "shell.detachedExecution:dry-run";
}

function normalizeDirectory(directory: string): string {
  const trimmed = directory.trim();
  return trimmed === "/" ? trimmed : trimmed.replace(/\/+$/, "");
}

function auditEvent(
  type: string,
  context: ShellDetachedExecutionContext | undefined,
  workingDirectory?: string,
  metadata?: Readonly<Record<string, unknown>>,
): ShellDetachedExecutionAuditEvent {
  return {
    type,
    toolId: shellDetachedExecutionDescriptor.toolId,
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
  code: ShellDetachedExecutionErrorCode,
  message: string,
  boundary: ShellDetachedExecutionBoundary,
  context: ShellDetachedExecutionContext | undefined,
  workingDirectory?: string,
): ShellDetachedExecutionResult {
  return {
    ok: false,
    toolId: shellDetachedExecutionDescriptor.toolId,
    error: { code, message, boundary, publicSafe: true, internalDetailExposed: false },
    audit: [auditEvent("agentCore.basicTool.shell.detachedExecution.rejected", context, workingDirectory, { code })],
    events: ["basicTool.shell.detachedExecution.rejected"],
  };
}

function normalizeOptionalPath(pathValue: string | undefined): string | undefined {
  return pathValue?.trim() || undefined;
}

function normalizeTarget(
  target: Partial<ShellDetachedExecutionTarget> | undefined,
  context: ShellDetachedExecutionContext | undefined,
): ShellDetachedExecutionOutput["target"] | ShellDetachedExecutionResult {
  const command = target?.command?.trim() ?? "";
  if (command.length === 0) {
    return failure("MISSING_COMMAND", "shell.detachedExecution requires a non-empty command", "input", context, target?.workingDirectory);
  }

  const shell = target?.shell ?? "sh";
  if (shell !== "sh" && shell !== "bash" && shell !== "zsh") {
    return failure("INVALID_SHELL", "shell.detachedExecution shell must be sh, bash, or zsh", "input", context, target?.workingDirectory);
  }

  const restartPolicy = target?.restartPolicy ?? "none";
  if (restartPolicy !== "none" && restartPolicy !== "on-failure") {
    return failure(
      "INVALID_RESTART_POLICY",
      "shell.detachedExecution restartPolicy must be none or on-failure",
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
    launchId: target?.launchId?.trim() || `${invocationId(context)}:detached`,
    pidFilePath: normalizeOptionalPath(target?.pidFilePath),
    stdoutLogPath: normalizeOptionalPath(target?.stdoutLogPath),
    stderrLogPath: normalizeOptionalPath(target?.stderrLogPath),
    restartPolicy,
  };
}

function ensureScope(
  workingDirectory: string | undefined,
  context: ShellDetachedExecutionContext | undefined,
): ShellDetachedExecutionResult | undefined {
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
    "shell.detachedExecution workingDirectory is outside allowed execution scope",
    "scope",
    context,
    workingDirectory,
  );
}

function ensurePermissions(
  workingDirectory: string | undefined,
  context: ShellDetachedExecutionContext | undefined,
): ShellDetachedExecutionResult | undefined {
  if (context?.grantedPermissions === undefined) {
    return undefined;
  }

  const granted = cleanList(context.grantedPermissions);
  const missing = shellDetachedExecutionDescriptor.permissionsRequired.filter((permission) => !granted.includes(permission));
  if (missing.length === 0) {
    return undefined;
  }

  return failure(
    "PERMISSION_DENIED",
    `shell.detachedExecution is missing permissions: ${missing.join(", ")}`,
    "permission",
    context,
    workingDirectory,
  );
}

function ensureDryRunOnly(
  workingDirectory: string | undefined,
  context: ShellDetachedExecutionContext | undefined,
): ShellDetachedExecutionResult | undefined {
  if (dryRunEnabled(context)) {
    return undefined;
  }

  return failure(
    "REAL_EXECUTION_BLOCKED",
    "shell.detachedExecution only returns a guarded dry-run detached execution plan in the first implementation",
    "contract",
    context,
    workingDirectory,
  );
}

function ensureApproval(
  workingDirectory: string | undefined,
  context: ShellDetachedExecutionContext | undefined,
): ShellDetachedExecutionResult | undefined {
  if (context?.approval?.accepted === true) {
    return undefined;
  }

  if (context?.approval?.accepted === false) {
    return failure(
      "APPROVAL_REJECTED",
      context.approval.reason ?? "shell.detachedExecution approval was rejected by TAP governance",
      "approval",
      context,
      workingDirectory,
    );
  }

  return failure(
    "APPROVAL_REQUIRED",
    "shell.detachedExecution requires TAP approval because the process may outlive the agent session",
    "approval",
    context,
    workingDirectory,
  );
}

export function planShellDetachedExecution(request: ShellDetachedExecutionRequest = {}): ShellDetachedExecutionResult {
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

  const approvalFailure = ensureApproval(target.workingDirectory, request.context);
  if (approvalFailure !== undefined) {
    return approvalFailure;
  }

  return {
    ok: true,
    toolId: shellDetachedExecutionDescriptor.toolId,
    output: {
      kind: "agentCore.basicTool.shell.detachedExecution",
      target,
      commandPreview: [target.shell, "-lc", target.command],
      permissionsRequired: shellDetachedExecutionDescriptor.permissionsRequired,
      approvalId: request.context?.approval?.approvalId?.trim() || undefined,
      detachedContract: {
        outlivesAgentSession: true,
        requiresTapApproval: true,
        runtimeMustRecordHandle: true,
      },
      dryRun: true,
      executionBlocked: true,
      unsafeSideEffects: false,
      resultEnvelope: {
        planned: true,
        detachedHandle: target.launchId,
      },
    },
    audit: [
      auditEvent("agentCore.basicTool.shell.detachedExecution.dryRun", request.context, target.workingDirectory, {
        launchId: target.launchId,
        restartPolicy: target.restartPolicy,
        pidFilePath: target.pidFilePath,
      }),
    ],
    events: ["basicTool.shell.detachedExecution.dryRun"],
  };
}
