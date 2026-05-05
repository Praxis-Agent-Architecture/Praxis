/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / Shell 基础工具 / Shell 生成。
 * 核心目的：提供 Shell 基础工具 / Shell 生成 中的“构造调用对象”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import type { ShellCommandGenerationOutput } from "../shell.commandGeneration/core.js";
import type { ShellExecutionGuardOutput } from "../shell.executionGuard/core.js";

export type ShellInvocationConstructionPermission = "shell:generate";

export type ShellInvocationConstructionBoundary = "input" | "permission" | "contract" | "governance";

export type ShellInvocationConstructionStatus = "planned" | "pending-approval";

export type ShellInvocationConstructionContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: {
    allowed?: boolean;
    accepted?: boolean;
    reason?: string;
  };
  grantedPermissions?: readonly ShellInvocationConstructionPermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type ShellInvocationConstructionRequest = {
  generatedCommand?: ShellCommandGenerationOutput;
  executionGuard?: ShellExecutionGuardOutput;
  invocationId?: string;
  sessionId?: string;
  runtimeId?: string;
  metadata?: Readonly<Record<string, unknown>>;
  context?: ShellInvocationConstructionContext;
};

export type ShellInvocationConstructionErrorCode =
  | "MISSING_COMMAND"
  | "MISSING_GUARD"
  | "INVALID_COMMAND"
  | "INVALID_GUARD"
  | "GUARD_BLOCKED"
  | "PERMISSION_DENIED"
  | "GOVERNANCE_REJECTED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_REJECTED"
  | "REAL_EXECUTION_BLOCKED";

export type ShellInvocationConstructionError = {
  code: ShellInvocationConstructionErrorCode;
  message: string;
  boundary: ShellInvocationConstructionBoundary;
  publicSafe: true;
  internalDetailExposed: false;
};

export type ShellInvocationConstructionAuditEvent = {
  type: string;
  toolId: "shell.invocationConstruction";
  invocationId: string;
  dryRun: boolean;
  commandPreview?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type ShellInvocationEnvelope = {
  kind: "agentCore.basicTool.shell.invocation";
  invocationId: string;
  runtimeId?: string;
  sessionId?: string;
  shell: ShellCommandGenerationOutput["shell"];
  commandLine: string;
  argv: readonly string[];
  executable: string;
  workingDirectory?: string;
  environmentKeys: readonly string[];
  guardVerdict: ShellExecutionGuardOutput["verdict"];
  approvalRequired: boolean;
  status: ShellInvocationConstructionStatus;
  metadata: Readonly<Record<string, unknown>>;
  dryRun: boolean;
  providerCalled: boolean;
  executionBlocked: true;
  unsafeSideEffects: false;
};

export type ShellInvocationConstructionResult =
  | {
      ok: true;
      toolId: "shell.invocationConstruction";
      invocation: ShellInvocationEnvelope;
      audit: readonly ShellInvocationConstructionAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "shell.invocationConstruction";
      error: ShellInvocationConstructionError;
      audit: readonly ShellInvocationConstructionAuditEvent[];
      events: readonly string[];
    };

export const shellInvocationConstructionDescriptor = {
  toolId: "shell.invocationConstruction",
  capability: "shell-invocation-construction",
  route: "agent_executionEngine.basic_toolLayer.baseTools.shellBase.shellGeneration",
  defaultDryRun: true,
  tapOwnsApproval: true,
  requiredPermission: "shell:generate",
  unsafeSideEffects: false,
} as const;

function dryRunEnabled(context: ShellInvocationConstructionContext | undefined): boolean {
  return context?.dryRun !== false;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requestInvocationId(request: ShellInvocationConstructionRequest): string {
  return (
    (typeof request.invocationId === "string" ? request.invocationId.trim() : "") ||
    (typeof request.context?.invocationId === "string" ? request.context.invocationId.trim() : "") ||
    "shell.invocationConstruction:dry-run"
  );
}

function cleanPermissions(
  permissions: readonly ShellInvocationConstructionPermission[] | undefined,
): readonly ShellInvocationConstructionPermission[] {
  if (!Array.isArray(permissions)) {
    return [];
  }

  return [
    ...new Set(
      permissions
        .filter((permission): permission is string => typeof permission === "string")
        .map((permission) => permission.trim())
        .filter((permission): permission is ShellInvocationConstructionPermission => permission === "shell:generate"),
    ),
  ];
}

function auditEvent(
  type: string,
  request: ShellInvocationConstructionRequest,
  commandPreview?: string,
  metadata?: Readonly<Record<string, unknown>>,
): ShellInvocationConstructionAuditEvent {
  return {
    type,
    toolId: shellInvocationConstructionDescriptor.toolId,
    invocationId: requestInvocationId(request),
    dryRun: dryRunEnabled(request.context),
    commandPreview,
    metadata: {
      ...(request.context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: ShellInvocationConstructionErrorCode,
  message: string,
  boundary: ShellInvocationConstructionBoundary,
  request: ShellInvocationConstructionRequest,
  commandPreview?: string,
): ShellInvocationConstructionResult {
  return {
    ok: false,
    toolId: shellInvocationConstructionDescriptor.toolId,
    error: { code, message, boundary, publicSafe: true, internalDetailExposed: false },
    audit: [auditEvent("agentCore.basicTool.shell.invocationConstruction.rejected", request, commandPreview, { code })],
    events: ["basicTool.shell.invocationConstruction.rejected"],
  };
}

function ensurePermissions(
  request: ShellInvocationConstructionRequest,
): ShellInvocationConstructionResult | undefined {
  if (request.context?.grantedPermissions === undefined) {
    return undefined;
  }

  const granted = cleanPermissions(request.context.grantedPermissions);
  if (granted.includes(shellInvocationConstructionDescriptor.requiredPermission)) {
    return undefined;
  }

  return failure(
    "PERMISSION_DENIED",
    "shell.invocationConstruction is missing permission: shell:generate",
    "permission",
    request,
  );
}

function ensureDryRunOnly(
  request: ShellInvocationConstructionRequest,
): ShellInvocationConstructionResult | undefined {
  if (dryRunEnabled(request.context)) {
    return undefined;
  }

  return failure(
    "REAL_EXECUTION_BLOCKED",
    "shell.invocationConstruction only creates a dry-run invocation envelope in the first implementation",
    "contract",
    request,
  );
}

function invocationStatus(guard: { requiresTapApproval: boolean }): ShellInvocationConstructionStatus {
  return guard.requiresTapApproval ? "pending-approval" : "planned";
}

function cleanStringArray(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    return undefined;
  }

  return value;
}

function isShell(commandShell: unknown): commandShell is ShellCommandGenerationOutput["shell"] {
  return commandShell === "sh" || commandShell === "bash" || commandShell === "zsh";
}

function isGuardVerdict(value: unknown): value is ShellExecutionGuardOutput["verdict"] {
  return value === "allowed" || value === "requires-approval" || value === "blocked";
}

export function constructShellInvocation(
  request: ShellInvocationConstructionRequest = {},
): ShellInvocationConstructionResult {
  if (!isRecord(request)) {
    return failure("MISSING_COMMAND", "shell.invocationConstruction requires a generated shell command", "input", {});
  }

  if (!isRecord(request.generatedCommand) || typeof request.generatedCommand.commandLine !== "string" || request.generatedCommand.commandLine.trim().length === 0) {
    return failure("MISSING_COMMAND", "shell.invocationConstruction requires a generated shell command", "input", request);
  }

  if (!isRecord(request.executionGuard)) {
    return failure(
      "MISSING_GUARD",
      "shell.invocationConstruction requires an execution guard before creating an invocation",
      "input",
      request,
      request.generatedCommand.commandLine,
    );
  }

  const generatedCommand = request.generatedCommand;
  const argv = cleanStringArray(generatedCommand.argv);
  const environmentKeys = cleanStringArray(generatedCommand.environmentKeys);
  const executable = typeof generatedCommand.executable === "string" ? generatedCommand.executable.trim() : "";
  if (
    argv === undefined ||
    environmentKeys === undefined ||
    executable.length === 0 ||
    !isShell(generatedCommand.shell) ||
    (generatedCommand.workingDirectory !== undefined && typeof generatedCommand.workingDirectory !== "string")
  ) {
    return failure(
      "INVALID_COMMAND",
      "shell.invocationConstruction generatedCommand must match shell.commandGeneration output",
      "input",
      request,
      generatedCommand.commandLine,
    );
  }

  const executionGuard = request.executionGuard;
  if (!isGuardVerdict(executionGuard.verdict) || typeof executionGuard.requiresTapApproval !== "boolean") {
    return failure(
      "INVALID_GUARD",
      "shell.invocationConstruction executionGuard must match shell.executionGuard output",
      "input",
      request,
      generatedCommand.commandLine,
    );
  }

  const permissionFailure = ensurePermissions(request);
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const realExecutionFailure = ensureDryRunOnly(request);
  if (realExecutionFailure !== undefined) {
    return realExecutionFailure;
  }

  if (executionGuard.verdict === "blocked") {
    return failure(
      "GUARD_BLOCKED",
      "shell.invocationConstruction refuses to build an executable invocation from a blocked guard",
      "governance",
      request,
      generatedCommand.commandLine,
    );
  }

  const invocationId = requestInvocationId(request);
  const runtimeId = (typeof request.runtimeId === "string" ? request.runtimeId.trim() : "") || (typeof request.context?.runtimeId === "string" ? request.context.runtimeId.trim() : "") || undefined;
  const sessionId = (typeof request.sessionId === "string" ? request.sessionId.trim() : "") || (typeof request.context?.sessionId === "string" ? request.context.sessionId.trim() : "") || undefined;

  return {
    ok: true,
    toolId: shellInvocationConstructionDescriptor.toolId,
    invocation: {
      kind: "agentCore.basicTool.shell.invocation",
      invocationId,
      runtimeId,
      sessionId,
      shell: generatedCommand.shell,
      commandLine: generatedCommand.commandLine,
      argv,
      executable,
      workingDirectory: generatedCommand.workingDirectory,
      environmentKeys,
      guardVerdict: executionGuard.verdict,
      approvalRequired: executionGuard.requiresTapApproval,
      status: invocationStatus(executionGuard),
      metadata: isRecord(request.metadata) ? request.metadata : {},
      dryRun: true,
      providerCalled: false,
      executionBlocked: true,
      unsafeSideEffects: false,
    },
    audit: [
      auditEvent("agentCore.basicTool.shell.invocationConstruction.dryRun", request, generatedCommand.commandLine, {
        guardVerdict: executionGuard.verdict,
        status: invocationStatus(executionGuard),
      }),
    ],
    events: ["basicTool.shell.invocationConstruction.constructed"],
  };
}
