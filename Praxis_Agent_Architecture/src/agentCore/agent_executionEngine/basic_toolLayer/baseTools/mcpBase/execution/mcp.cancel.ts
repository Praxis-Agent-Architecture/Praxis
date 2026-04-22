/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / MCP 基础工具 / MCP 执行。
 * 核心目的：提供 MCP 基础工具 / MCP 执行 中的“取消执行”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type McpCancelPermission = "mcp:cancel" | "mcp:control";

export type McpCancelErrorBoundary = "input" | "scope" | "permission" | "governance" | "contract";

export type McpCancelContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  allowedServerIds?: readonly string[];
  grantedPermissions?: readonly McpCancelPermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type McpCancelTarget = {
  serverId: string;
  executionId: string;
  reason?: string;
  force?: boolean;
};

export type McpCancelRequest = {
  target?: Partial<McpCancelTarget>;
  context?: McpCancelContext;
};

export type McpCancelErrorCode =
  | "MISSING_SERVER_ID"
  | "MISSING_EXECUTION_ID"
  | "INVALID_REASON"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "REAL_EXECUTION_BLOCKED";

export type McpCancelError = {
  code: McpCancelErrorCode;
  message: string;
  boundary: McpCancelErrorBoundary;
  publicSafe: true;
};

export type McpCancelAuditEvent = {
  type: string;
  toolId: "mcp.cancel";
  invocationId: string;
  dryRun: boolean;
  serverId?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type McpCancelOutput = {
  kind: "agentCore.basicTool.mcp.cancel";
  target: McpCancelTarget;
  dryRun: true;
  executionBlocked: true;
  permissionsRequired: readonly McpCancelPermission[];
  unsafeSideEffects: true;
  cancelEnvelope: {
    transport: "mcp";
    operation: "cancel";
    serverId: string;
    executionId: string;
    reason?: string;
    force: boolean;
  };
};

export type McpCancelResult =
  | {
      ok: true;
      toolId: "mcp.cancel";
      output: McpCancelOutput;
      audit: readonly McpCancelAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "mcp.cancel";
      error: McpCancelError;
      audit: readonly McpCancelAuditEvent[];
      events: readonly string[];
    };

export const mcpCancelDescriptor = {
  toolId: "mcp.cancel",
  capability: "cancel-mcp-execution",
  route: "agent_executionEngine.basic_toolLayer.baseTools.mcpBase.execution",
  defaultDryRun: true,
  tapOwnsApproval: true,
  permissionsRequired: ["mcp:cancel"],
  unsafeSideEffects: true,
} as const;

function cleanList<T extends string>(values: readonly T[] | undefined): readonly T[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean) as T[])];
}

function dryRunEnabled(context: McpCancelContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: McpCancelContext | undefined): string {
  return context?.invocationId?.trim() || "mcp.cancel:dry-run";
}

function auditEvent(
  type: string,
  context: McpCancelContext | undefined,
  serverId?: string,
  metadata?: Readonly<Record<string, unknown>>,
): McpCancelAuditEvent {
  return {
    type,
    toolId: mcpCancelDescriptor.toolId,
    invocationId: invocationId(context),
    dryRun: dryRunEnabled(context),
    serverId,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: McpCancelErrorCode,
  message: string,
  boundary: McpCancelErrorBoundary,
  context: McpCancelContext | undefined,
  serverId?: string,
): McpCancelResult {
  return {
    ok: false,
    toolId: mcpCancelDescriptor.toolId,
    error: { code, message, boundary, publicSafe: true },
    audit: [auditEvent("agentCore.basicTool.mcp.cancel.rejected", context, serverId, { code })],
    events: ["basicTool.mcp.cancel.rejected"],
  };
}

function normalizeTarget(
  target: Partial<McpCancelTarget> | undefined,
  context: McpCancelContext | undefined,
): McpCancelTarget | McpCancelResult {
  const serverId = target?.serverId?.trim() ?? "";
  if (serverId.length === 0) {
    return failure("MISSING_SERVER_ID", "mcp.cancel requires target.serverId", "input", context);
  }

  const executionId = target?.executionId?.trim() ?? "";
  if (executionId.length === 0) {
    return failure("MISSING_EXECUTION_ID", "mcp.cancel requires target.executionId", "input", context, serverId);
  }

  const reason = target?.reason?.trim();
  if (target?.reason !== undefined && reason?.length === 0) {
    return failure("INVALID_REASON", "mcp.cancel target.reason must not be blank when provided", "input", context, serverId);
  }

  return {
    serverId,
    executionId,
    reason,
    force: target?.force === true,
  };
}

function ensureServerScope(serverId: string, context: McpCancelContext | undefined): McpCancelResult | undefined {
  const allowedServerIds = cleanList(context?.allowedServerIds);
  if (allowedServerIds.length === 0 || allowedServerIds.includes(serverId)) {
    return undefined;
  }

  return failure(
    "SCOPE_REJECTED",
    "mcp.cancel target server is outside the allowed MCP server scope",
    "scope",
    context,
    serverId,
  );
}

function ensurePermissions(target: McpCancelTarget, context: McpCancelContext | undefined): McpCancelResult | undefined {
  const grantedPermissions = cleanList(context?.grantedPermissions);
  if (grantedPermissions.length === 0) {
    return undefined;
  }

  const requiredPermissions: readonly McpCancelPermission[] = target.force === true ? ["mcp:cancel", "mcp:control"] : ["mcp:cancel"];
  const missing = requiredPermissions.filter((permission) => !grantedPermissions.includes(permission));
  if (missing.length === 0) {
    return undefined;
  }

  return failure("PERMISSION_DENIED", `mcp.cancel is missing permissions: ${missing.join(", ")}`, "permission", context, target.serverId);
}

function ensureDryRunOnly(target: McpCancelTarget, context: McpCancelContext | undefined): McpCancelResult | undefined {
  if (dryRunEnabled(context)) {
    return undefined;
  }

  return failure(
    "REAL_EXECUTION_BLOCKED",
    "mcp.cancel only returns a governed dry-run envelope in the first implementation",
    "contract",
    context,
    target.serverId,
  );
}

export function planMcpCancel(request: McpCancelRequest = {}): McpCancelResult {
  const target = normalizeTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  const scopeFailure = ensureServerScope(target.serverId, request.context);
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

  const permissionsRequired: readonly McpCancelPermission[] =
    target.force === true ? ["mcp:cancel", "mcp:control"] : ["mcp:cancel"];

  return {
    ok: true,
    toolId: mcpCancelDescriptor.toolId,
    output: {
      kind: "agentCore.basicTool.mcp.cancel",
      target,
      dryRun: true,
      executionBlocked: true,
      permissionsRequired,
      unsafeSideEffects: true,
      cancelEnvelope: {
        transport: "mcp",
        operation: "cancel",
        serverId: target.serverId,
        executionId: target.executionId,
        reason: target.reason,
        force: target.force === true,
      },
    },
    audit: [
      auditEvent("agentCore.basicTool.mcp.cancel.dryRun", request.context, target.serverId, {
        executionId: target.executionId,
        force: target.force === true,
      }),
    ],
    events: ["basicTool.mcp.cancel.dryRun"],
  };
}
