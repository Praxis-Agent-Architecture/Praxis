/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / Shell 基础工具 / Shell 管理。
 * 核心目的：提供 Shell 基础工具 / Shell 管理 中的“管理 Shell 资源”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type ShellResourceManagementAction = "inspect" | "reserve" | "release" | "adjust-limit";

export type ShellResourceKind = "process-slot" | "pty" | "working-directory" | "environment" | "io-buffer";

export type ShellResourceManagementPermission =
  | "shell:resource:inspect"
  | "shell:resource:reserve"
  | "shell:resource:release"
  | "shell:resource:limit";

export type ShellResourceManagementBoundary = "input" | "scope" | "permission" | "governance" | "contract" | "resource";

export type ShellResourceManagementContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  allowedResourceIds?: readonly string[];
  grantedPermissions?: readonly ShellResourceManagementPermission[];
  guard?: {
    accepted: boolean;
    reason?: string;
  };
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type ShellResourceManagementTarget = {
  action: ShellResourceManagementAction;
  resourceKind: ShellResourceKind;
  resourceId?: string;
  amount: number;
  limitName?: string;
  limitValue?: number;
};

export type ShellResourceManagementRequest = {
  target?: Partial<ShellResourceManagementTarget>;
  context?: ShellResourceManagementContext;
};

export type ShellResourceManagementErrorCode =
  | "MISSING_RESOURCE_KIND"
  | "INVALID_RESOURCE_KIND"
  | "INVALID_RESOURCE_ID"
  | "INVALID_RESOURCE_AMOUNT"
  | "MISSING_LIMIT_NAME"
  | "INVALID_LIMIT_VALUE"
  | "RESOURCE_SCOPE_DENIED"
  | "PERMISSION_DENIED"
  | "GOVERNANCE_REJECTED"
  | "REAL_EXECUTION_BLOCKED";

export type ShellResourceManagementError = {
  code: ShellResourceManagementErrorCode;
  message: string;
  boundary: ShellResourceManagementBoundary;
  publicSafe: true;
  internalDetailExposed: false;
};

export type ShellResourceManagementAuditEvent = {
  type: string;
  toolId: "shell.shellResourceManagement";
  invocationId: string;
  dryRun: boolean;
  resourceId?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type ShellResourceManagementOutput = {
  kind: "agentCore.basicTool.shell.shellResourceManagement";
  target: ShellResourceManagementTarget;
  permissionsRequired: readonly ShellResourceManagementPermission[];
  dryRun: true;
  executionBlocked: true;
  unsafeSideEffects: boolean;
  resourceEnvelope: {
    operation: ShellResourceManagementAction;
    resourceKind: ShellResourceKind;
    resourceId?: string;
    allocationDelta: number;
    limitChange?: {
      name: string;
      value: number;
    };
  };
};

export type ShellResourceManagementResult =
  | {
      ok: true;
      toolId: "shell.shellResourceManagement";
      output: ShellResourceManagementOutput;
      audit: readonly ShellResourceManagementAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "shell.shellResourceManagement";
      error: ShellResourceManagementError;
      audit: readonly ShellResourceManagementAuditEvent[];
      events: readonly string[];
    };

export const shellResourceManagementDescriptor = {
  toolId: "shell.shellResourceManagement",
  capability: "manage-shell-resources",
  route: "agent_executionEngine.basic_toolLayer.baseTools.shellBase.shellManagement",
  defaultDryRun: true,
  tapOwnsApproval: true,
  unsafeSideEffects: true,
} as const;

const supportedResourceKinds = ["process-slot", "pty", "working-directory", "environment", "io-buffer"] as const;

function cleanList<T extends string>(values: readonly T[] | undefined): readonly T[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean) as T[])];
}

function dryRunEnabled(context: ShellResourceManagementContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: ShellResourceManagementContext | undefined): string {
  return context?.invocationId?.trim() || "shell.shellResourceManagement:dry-run";
}

function auditEvent(
  type: string,
  context: ShellResourceManagementContext | undefined,
  resourceId?: string,
  metadata?: Readonly<Record<string, unknown>>,
): ShellResourceManagementAuditEvent {
  return {
    type,
    toolId: shellResourceManagementDescriptor.toolId,
    invocationId: invocationId(context),
    dryRun: dryRunEnabled(context),
    resourceId,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: ShellResourceManagementErrorCode,
  message: string,
  boundary: ShellResourceManagementBoundary,
  context: ShellResourceManagementContext | undefined,
  resourceId?: string,
): ShellResourceManagementResult {
  return {
    ok: false,
    toolId: shellResourceManagementDescriptor.toolId,
    error: { code, message, boundary, publicSafe: true, internalDetailExposed: false },
    audit: [
      auditEvent("agentCore.basicTool.shell.shellResourceManagement.rejected", context, resourceId, { code }),
    ],
    events: ["basicTool.shell.shellResourceManagement.rejected"],
  };
}

function normalizeAction(action: string | undefined): ShellResourceManagementAction {
  if (action === "reserve" || action === "release" || action === "adjust-limit") {
    return action;
  }

  return "inspect";
}

function normalizeResourceId(
  resourceId: string | undefined,
  context: ShellResourceManagementContext | undefined,
): string | undefined | ShellResourceManagementResult {
  const normalized = resourceId?.trim();
  if (normalized === undefined || normalized.length === 0) {
    return undefined;
  }

  if (normalized.includes("\0") || /[\r\n]/u.test(normalized)) {
    return failure(
      "INVALID_RESOURCE_ID",
      "shell.shellResourceManagement resourceId must be a safe single-line string",
      "input",
      context,
      normalized,
    );
  }

  return normalized;
}

function normalizeTarget(
  target: Partial<ShellResourceManagementTarget> | undefined,
  context: ShellResourceManagementContext | undefined,
): ShellResourceManagementTarget | ShellResourceManagementResult {
  const action = normalizeAction(target?.action);
  const resourceKind = target?.resourceKind?.trim() as ShellResourceKind | undefined;

  if (resourceKind === undefined || resourceKind.length === 0) {
    return failure("MISSING_RESOURCE_KIND", "shell.shellResourceManagement requires target.resourceKind", "input", context);
  }

  if (!supportedResourceKinds.includes(resourceKind)) {
    return failure(
      "INVALID_RESOURCE_KIND",
      "shell.shellResourceManagement target.resourceKind is not supported",
      "input",
      context,
    );
  }

  const resourceId = normalizeResourceId(target?.resourceId, context);
  if (resourceId !== undefined && typeof resourceId !== "string") {
    return resourceId;
  }

  const amount = target?.amount ?? 1;
  if (!Number.isInteger(amount) || amount <= 0) {
    return failure(
      "INVALID_RESOURCE_AMOUNT",
      "shell.shellResourceManagement target.amount must be a positive integer",
      "resource",
      context,
      resourceId,
    );
  }

  const limitName = target?.limitName?.trim();
  const limitValue = target?.limitValue;
  if (action === "adjust-limit") {
    if (limitName === undefined || limitName.length === 0) {
      return failure("MISSING_LIMIT_NAME", "shell.shellResourceManagement adjust-limit requires limitName", "input", context);
    }

    if (typeof limitValue !== "number" || !Number.isInteger(limitValue) || limitValue < 0) {
      return failure(
        "INVALID_LIMIT_VALUE",
        "shell.shellResourceManagement adjust-limit requires a non-negative integer limitValue",
        "resource",
        context,
        resourceId,
      );
    }
  }

  return {
    action,
    resourceKind,
    resourceId,
    amount,
    limitName: limitName || undefined,
    limitValue,
  };
}

function requiredPermissions(target: ShellResourceManagementTarget): readonly ShellResourceManagementPermission[] {
  if (target.action === "inspect") {
    return ["shell:resource:inspect"];
  }

  if (target.action === "reserve") {
    return ["shell:resource:reserve"];
  }

  if (target.action === "release") {
    return ["shell:resource:release"];
  }

  return ["shell:resource:limit"];
}

function ensureScope(
  target: ShellResourceManagementTarget,
  context: ShellResourceManagementContext | undefined,
): ShellResourceManagementResult | undefined {
  const allowedResourceIds = cleanList(context?.allowedResourceIds);
  if (allowedResourceIds.length === 0 || target.resourceId === undefined) {
    return undefined;
  }

  if (allowedResourceIds.includes(target.resourceId)) {
    return undefined;
  }

  return failure(
    "RESOURCE_SCOPE_DENIED",
    "shell.shellResourceManagement target resource is outside runtime governance scope",
    "scope",
    context,
    target.resourceId,
  );
}

function ensurePermissions(
  target: ShellResourceManagementTarget,
  context: ShellResourceManagementContext | undefined,
): ShellResourceManagementResult | undefined {
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
    `shell.shellResourceManagement is missing permissions: ${missing.join(", ")}`,
    "permission",
    context,
    target.resourceId,
  );
}

function ensureGovernance(
  context: ShellResourceManagementContext | undefined,
): ShellResourceManagementResult | undefined {
  if (context?.guard?.accepted !== false) {
    return undefined;
  }

  return failure(
    "GOVERNANCE_REJECTED",
    context.guard.reason ?? "shell.shellResourceManagement was rejected by runtime governance",
    "governance",
    context,
  );
}

function ensureDryRunOnly(
  target: ShellResourceManagementTarget,
  context: ShellResourceManagementContext | undefined,
): ShellResourceManagementResult | undefined {
  if (dryRunEnabled(context)) {
    return undefined;
  }

  return failure(
    "REAL_EXECUTION_BLOCKED",
    "shell.shellResourceManagement only returns a guarded dry-run resource envelope in the first implementation",
    "contract",
    context,
    target.resourceId,
  );
}

export function planShellResourceManagement(
  request: ShellResourceManagementRequest = {},
): ShellResourceManagementResult {
  const target = normalizeTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  const governanceFailure = ensureGovernance(request.context);
  if (governanceFailure !== undefined) {
    return governanceFailure;
  }

  const scopeFailure = ensureScope(target, request.context);
  if (scopeFailure !== undefined) {
    return scopeFailure;
  }

  const permissionFailure = ensurePermissions(target, request.context);
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const realExecutionFailure = ensureDryRunOnly(target, request.context);
  if (realExecutionFailure !== undefined) {
    return realExecutionFailure;
  }

  const allocationDelta =
    target.action === "reserve" ? target.amount : target.action === "release" ? -target.amount : 0;

  return {
    ok: true,
    toolId: shellResourceManagementDescriptor.toolId,
    output: {
      kind: "agentCore.basicTool.shell.shellResourceManagement",
      target,
      permissionsRequired: requiredPermissions(target),
      dryRun: true,
      executionBlocked: true,
      unsafeSideEffects: target.action !== "inspect",
      resourceEnvelope: {
        operation: target.action,
        resourceKind: target.resourceKind,
        resourceId: target.resourceId,
        allocationDelta,
        limitChange:
          target.action === "adjust-limit" && target.limitName !== undefined && target.limitValue !== undefined
            ? { name: target.limitName, value: target.limitValue }
            : undefined,
      },
    },
    audit: [
      auditEvent("agentCore.basicTool.shell.shellResourceManagement.dryRun", request.context, target.resourceId, {
        action: target.action,
        resourceKind: target.resourceKind,
        amount: target.amount,
      }),
    ],
    events: ["basicTool.shell.shellResourceManagement.dryRun"],
  };
}
