/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / Shell 基础工具 / 执行守卫。
 * 核心目的：提供 Shell 基础工具 / 执行守卫 中的“控制执行权限”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type ShellExecutionPermission = "shell:validate" | "shell:execute" | "filesystem:read" | "filesystem:write" | "network:access";

export type ShellPermissionControlBoundary = "input" | "scope" | "permission" | "approval" | "contract";

export type ShellPermissionDecision = "granted" | "denied" | "approval-required";

export type ShellPermissionControlContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  grantedPermissions?: readonly ShellExecutionPermission[];
  allowedWorkingDirectories?: readonly string[];
  approval?: {
    accepted: boolean;
    approvalId?: string;
    reason?: string;
  };
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type ShellPermissionControlRequest = {
  command?: string;
  workingDirectory?: string;
  requestedPermissions?: readonly ShellExecutionPermission[];
  riskLevel?: "low" | "medium" | "high";
  context?: ShellPermissionControlContext;
};

export type ShellPermissionControlErrorCode =
  | "MISSING_COMMAND"
  | "MISSING_REQUESTED_PERMISSIONS"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "APPROVAL_REQUIRED"
  | "APPROVAL_REJECTED"
  | "REAL_EXECUTION_BLOCKED";

export type ShellPermissionControlError = {
  code: ShellPermissionControlErrorCode;
  message: string;
  boundary: ShellPermissionControlBoundary;
  publicSafe: true;
  internalDetailExposed: false;
};

export type ShellPermissionControlAuditEvent = {
  type: string;
  toolId: "shell.permissionControl";
  invocationId: string;
  dryRun: boolean;
  workingDirectory?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type ShellPermissionControlOutput = {
  kind: "agentCore.basicTool.shell.permissionControl";
  command: string;
  workingDirectory?: string;
  requestedPermissions: readonly ShellExecutionPermission[];
  grantedPermissions: readonly ShellExecutionPermission[];
  missingPermissions: readonly ShellExecutionPermission[];
  decision: ShellPermissionDecision;
  approvalId?: string;
  dryRun: true;
  executionBlocked: true;
  unsafeSideEffects: false;
};

export type ShellPermissionControlResult =
  | {
      ok: true;
      toolId: "shell.permissionControl";
      output: ShellPermissionControlOutput;
      audit: readonly ShellPermissionControlAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "shell.permissionControl";
      error: ShellPermissionControlError;
      audit: readonly ShellPermissionControlAuditEvent[];
      events: readonly string[];
    };

export const shellPermissionControlDescriptor = {
  toolId: "shell.permissionControl",
  capability: "shell-execution-permission-control",
  route: "agent_executionEngine.basic_toolLayer.baseTools.shellBase.executionGuard",
  defaultDryRun: true,
  tapOwnsApproval: true,
  unsafeSideEffects: false,
} as const;

function cleanList<T extends string>(values: readonly T[] | undefined): readonly T[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean) as T[])];
}

function dryRunEnabled(context: ShellPermissionControlContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: ShellPermissionControlContext | undefined): string {
  return context?.invocationId?.trim() || "shell.permissionControl:dry-run";
}

function normalizeDirectory(directory: string): string {
  const trimmed = directory.trim();
  return trimmed === "/" ? trimmed : trimmed.replace(/\/+$/, "");
}

function auditEvent(
  type: string,
  context: ShellPermissionControlContext | undefined,
  workingDirectory?: string,
  metadata?: Readonly<Record<string, unknown>>,
): ShellPermissionControlAuditEvent {
  return {
    type,
    toolId: shellPermissionControlDescriptor.toolId,
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
  code: ShellPermissionControlErrorCode,
  message: string,
  boundary: ShellPermissionControlBoundary,
  context: ShellPermissionControlContext | undefined,
  workingDirectory?: string,
): ShellPermissionControlResult {
  return {
    ok: false,
    toolId: shellPermissionControlDescriptor.toolId,
    error: { code, message, boundary, publicSafe: true, internalDetailExposed: false },
    audit: [auditEvent("agentCore.basicTool.shell.permissionControl.rejected", context, workingDirectory, { code })],
    events: ["basicTool.shell.permissionControl.rejected"],
  };
}

function ensureScope(
  workingDirectory: string | undefined,
  context: ShellPermissionControlContext | undefined,
): ShellPermissionControlResult | undefined {
  if (workingDirectory === undefined) {
    return undefined;
  }

  const allowedDirectories = cleanList(context?.allowedWorkingDirectories).map(normalizeDirectory);
  if (allowedDirectories.length === 0) {
    return undefined;
  }

  const normalizedDirectory = normalizeDirectory(workingDirectory);
  const allowed = allowedDirectories.some((directory) => normalizedDirectory === directory || normalizedDirectory.startsWith(`${directory}/`));
  if (allowed) {
    return undefined;
  }

  return failure(
    "SCOPE_REJECTED",
    "shell.permissionControl workingDirectory is outside allowed execution scope",
    "scope",
    context,
    normalizedDirectory,
  );
}

function ensureDryRunOnly(
  context: ShellPermissionControlContext | undefined,
  workingDirectory: string | undefined,
): ShellPermissionControlResult | undefined {
  if (dryRunEnabled(context)) {
    return undefined;
  }

  return failure(
    "REAL_EXECUTION_BLOCKED",
    "shell.permissionControl only returns a guarded dry-run permission decision in the first implementation",
    "contract",
    context,
    workingDirectory,
  );
}

function resolveApproval(
  riskLevel: ShellPermissionControlRequest["riskLevel"],
  context: ShellPermissionControlContext | undefined,
  workingDirectory: string | undefined,
): ShellPermissionControlResult | undefined {
  if (riskLevel !== "high") {
    return undefined;
  }

  if (context?.approval?.accepted === true) {
    return undefined;
  }

  if (context?.approval?.accepted === false) {
    return failure(
      "APPROVAL_REJECTED",
      context.approval.reason ?? "shell.permissionControl approval was rejected by TAP governance",
      "approval",
      context,
      workingDirectory,
    );
  }

  return failure(
    "APPROVAL_REQUIRED",
    "shell.permissionControl high-risk shell execution requires TAP approval",
    "approval",
    context,
    workingDirectory,
  );
}

export function controlShellExecutionPermission(
  request: ShellPermissionControlRequest = {},
): ShellPermissionControlResult {
  const command = request.command?.trim() ?? "";
  if (command.length === 0) {
    return failure("MISSING_COMMAND", "shell.permissionControl requires a non-empty command", "input", request.context);
  }

  const requestedPermissions = cleanList(request.requestedPermissions);
  if (requestedPermissions.length === 0) {
    return failure(
      "MISSING_REQUESTED_PERMISSIONS",
      "shell.permissionControl requires at least one requested permission",
      "input",
      request.context,
      request.workingDirectory,
    );
  }

  const workingDirectory = request.workingDirectory?.trim() || undefined;
  const scopeFailure = ensureScope(workingDirectory, request.context);
  if (scopeFailure !== undefined) {
    return scopeFailure;
  }

  const realExecutionFailure = ensureDryRunOnly(request.context, workingDirectory);
  if (realExecutionFailure !== undefined) {
    return realExecutionFailure;
  }

  const approvalFailure = resolveApproval(request.riskLevel, request.context, workingDirectory);
  if (approvalFailure !== undefined) {
    return approvalFailure;
  }

  const grantedPermissions = cleanList(request.context?.grantedPermissions);
  const missingPermissions = requestedPermissions.filter((permission) => !grantedPermissions.includes(permission));
  if (missingPermissions.length > 0) {
    return failure(
      "PERMISSION_DENIED",
      `shell.permissionControl is missing permissions: ${missingPermissions.join(", ")}`,
      "permission",
      request.context,
      workingDirectory,
    );
  }

  return {
    ok: true,
    toolId: shellPermissionControlDescriptor.toolId,
    output: {
      kind: "agentCore.basicTool.shell.permissionControl",
      command,
      workingDirectory,
      requestedPermissions,
      grantedPermissions,
      missingPermissions,
      decision: "granted",
      approvalId: request.context?.approval?.approvalId?.trim() || undefined,
      dryRun: true,
      executionBlocked: true,
      unsafeSideEffects: false,
    },
    audit: [
      auditEvent("agentCore.basicTool.shell.permissionControl.dryRun", request.context, workingDirectory, {
        requestedPermissions,
        riskLevel: request.riskLevel ?? "low",
      }),
    ],
    events: ["basicTool.shell.permissionControl.granted"],
  };
}
