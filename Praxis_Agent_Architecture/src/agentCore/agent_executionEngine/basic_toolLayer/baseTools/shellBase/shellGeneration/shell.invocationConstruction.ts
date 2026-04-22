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

import type { ShellCommandGenerationOutput } from "./shell.commandGeneration.js";
import type { ShellExecutionGuardOutput } from "./shell.executionGuard.js";

export type ShellInvocationConstructionPermission = "shell:generate";

export type ShellInvocationConstructionBoundary = "input" | "permission" | "contract" | "governance";

export type ShellInvocationConstructionStatus = "planned" | "pending-approval";

export type ShellInvocationConstructionContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
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
  | "GUARD_BLOCKED"
  | "PERMISSION_DENIED"
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
  dryRun: true;
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

function requestInvocationId(request: ShellInvocationConstructionRequest): string {
  return (
    request.invocationId?.trim() ||
    request.context?.invocationId?.trim() ||
    "shell.invocationConstruction:dry-run"
  );
}

function cleanPermissions(
  permissions: readonly ShellInvocationConstructionPermission[] | undefined,
): readonly ShellInvocationConstructionPermission[] {
  return [
    ...new Set(
      (permissions ?? [])
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

function invocationStatus(guard: ShellExecutionGuardOutput): ShellInvocationConstructionStatus {
  return guard.requiresTapApproval ? "pending-approval" : "planned";
}

export function constructShellInvocation(
  request: ShellInvocationConstructionRequest = {},
): ShellInvocationConstructionResult {
  if (request.generatedCommand === undefined || request.generatedCommand.commandLine.trim().length === 0) {
    return failure("MISSING_COMMAND", "shell.invocationConstruction requires a generated shell command", "input", request);
  }

  if (request.executionGuard === undefined) {
    return failure(
      "MISSING_GUARD",
      "shell.invocationConstruction requires an execution guard before creating an invocation",
      "input",
      request,
      request.generatedCommand.commandLine,
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

  if (request.executionGuard.verdict === "blocked") {
    return failure(
      "GUARD_BLOCKED",
      "shell.invocationConstruction refuses to build an executable invocation from a blocked guard",
      "governance",
      request,
      request.generatedCommand.commandLine,
    );
  }

  const invocationId = requestInvocationId(request);
  const runtimeId = request.runtimeId?.trim() || request.context?.runtimeId?.trim() || undefined;
  const sessionId = request.sessionId?.trim() || request.context?.sessionId?.trim() || undefined;

  return {
    ok: true,
    toolId: shellInvocationConstructionDescriptor.toolId,
    invocation: {
      kind: "agentCore.basicTool.shell.invocation",
      invocationId,
      runtimeId,
      sessionId,
      shell: request.generatedCommand.shell,
      commandLine: request.generatedCommand.commandLine,
      argv: request.generatedCommand.argv,
      executable: request.generatedCommand.executable,
      workingDirectory: request.generatedCommand.workingDirectory,
      environmentKeys: request.generatedCommand.environmentKeys,
      guardVerdict: request.executionGuard.verdict,
      approvalRequired: request.executionGuard.requiresTapApproval,
      status: invocationStatus(request.executionGuard),
      metadata: request.metadata ?? {},
      dryRun: true,
      executionBlocked: true,
      unsafeSideEffects: false,
    },
    audit: [
      auditEvent("agentCore.basicTool.shell.invocationConstruction.dryRun", request, request.generatedCommand.commandLine, {
        guardVerdict: request.executionGuard.verdict,
        status: invocationStatus(request.executionGuard),
      }),
    ],
    events: ["basicTool.shell.invocationConstruction.constructed"],
  };
}
