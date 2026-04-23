/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / MCP 基础工具 / MCP 连接。
 * 核心目的：提供 MCP 基础工具 / MCP 连接 中的“断开连接”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type McpDisconnectPermission = "mcp:disconnect";

export type McpDisconnectErrorBoundary = "input" | "scope" | "permission" | "contract";

export type McpDisconnectContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  allowedServerIds?: readonly string[];
  grantedPermissions?: readonly McpDisconnectPermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type McpDisconnectTarget = {
  serverId: string;
  connectionId?: string;
  reason?: string;
  force: boolean;
};

export type McpDisconnectRequest = {
  target?: Partial<McpDisconnectTarget>;
  context?: McpDisconnectContext;
};

export type McpDisconnectErrorCode =
  | "MISSING_SERVER_ID"
  | "INVALID_REASON"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "REAL_EXECUTION_BLOCKED";

export type McpDisconnectError = {
  code: McpDisconnectErrorCode;
  message: string;
  boundary: McpDisconnectErrorBoundary;
  publicSafe: true;
};

export type McpDisconnectAuditEvent = {
  type: string;
  toolId: "mcp.disconnect";
  invocationId: string;
  dryRun: boolean;
  serverId?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type McpDisconnectPlan = {
  serverId: string;
  connectionId?: string;
  reason?: string;
  force: boolean;
  connectionState: "disconnect-planned";
};

export type McpDisconnectOutput = {
  kind: "agentCore.basicTool.mcp.disconnect";
  target: McpDisconnectTarget;
  operationPreview: McpDisconnectPlan;
  dryRun: true;
  executionBlocked: true;
  permissionsRequired: readonly McpDisconnectPermission[];
  unsafeSideEffects: true;
};

export type McpDisconnectResult =
  | {
      ok: true;
      toolId: "mcp.disconnect";
      output: McpDisconnectOutput;
      audit: readonly McpDisconnectAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "mcp.disconnect";
      error: McpDisconnectError;
      audit: readonly McpDisconnectAuditEvent[];
      events: readonly string[];
    };

export const mcpDisconnectDescriptor = {
  toolId: "mcp.disconnect",
  capability: "disconnect-mcp-server",
  route: "agent_executionEngine.basic_toolLayer.baseTools.mcpBase.connection",
  defaultDryRun: true,
  tapOwnsApproval: true,
  permissionsRequired: ["mcp:disconnect"],
} as const;

function cleanList<T extends string>(values: readonly T[] | undefined): readonly T[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean) as T[])];
}

function dryRunEnabled(context: McpDisconnectContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: McpDisconnectContext | undefined): string {
  return context?.invocationId?.trim() || "mcp.disconnect:dry-run";
}

function auditEvent(
  type: string,
  context: McpDisconnectContext | undefined,
  serverId?: string,
  metadata?: Readonly<Record<string, unknown>>,
): McpDisconnectAuditEvent {
  return {
    type,
    toolId: mcpDisconnectDescriptor.toolId,
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
  code: McpDisconnectErrorCode,
  message: string,
  boundary: McpDisconnectErrorBoundary,
  context: McpDisconnectContext | undefined,
  serverId?: string,
): McpDisconnectResult {
  return {
    ok: false,
    toolId: mcpDisconnectDescriptor.toolId,
    error: { code, message, boundary, publicSafe: true },
    audit: [auditEvent("agentCore.basicTool.mcp.disconnect.rejected", context, serverId, { code })],
    events: ["basicTool.mcp.disconnect.rejected"],
  };
}

function normalizeServerId(
  serverId: string | undefined,
  context: McpDisconnectContext | undefined,
): string | McpDisconnectResult {
  const normalized = serverId?.trim() ?? "";
  if (normalized.length === 0) {
    return failure("MISSING_SERVER_ID", "mcp.disconnect requires target.serverId", "input", context, serverId);
  }

  return normalized;
}

function normalizeReason(
  reason: string | undefined,
  context: McpDisconnectContext | undefined,
  serverId: string,
): string | undefined | McpDisconnectResult {
  const normalized = reason?.trim() ?? "";
  if (normalized.length === 0) {
    return undefined;
  }

  if (normalized.length > 256) {
    return failure("INVALID_REASON", "mcp.disconnect target.reason must be at most 256 characters", "input", context, serverId);
  }

  return normalized;
}

function ensureScope(serverId: string, context: McpDisconnectContext | undefined): McpDisconnectResult | undefined {
  const allowedServerIds = cleanList(context?.allowedServerIds);
  if (allowedServerIds.length === 0 || allowedServerIds.includes(serverId)) {
    return undefined;
  }

  return failure("SCOPE_REJECTED", "mcp.disconnect target server is outside allowed MCP server ids", "scope", context, serverId);
}

function ensurePermissions(serverId: string, context: McpDisconnectContext | undefined): McpDisconnectResult | undefined {
  const granted = cleanList(context?.grantedPermissions);
  if (granted.length === 0) {
    return undefined;
  }

  const missing = mcpDisconnectDescriptor.permissionsRequired.filter((permission) => !granted.includes(permission));
  if (missing.length === 0) {
    return undefined;
  }

  return failure(
    "PERMISSION_DENIED",
    `mcp.disconnect is missing permissions: ${missing.join(", ")}`,
    "permission",
    context,
    serverId,
  );
}

function ensureDryRunOnly(serverId: string, context: McpDisconnectContext | undefined): McpDisconnectResult | undefined {
  if (dryRunEnabled(context)) {
    return undefined;
  }

  return failure(
    "REAL_EXECUTION_BLOCKED",
    "mcp.disconnect only returns a guarded dry-run plan in the first implementation",
    "contract",
    context,
    serverId,
  );
}

function normalizeTarget(
  target: Partial<McpDisconnectTarget> | undefined,
  context: McpDisconnectContext | undefined,
): McpDisconnectTarget | McpDisconnectResult {
  const serverId = normalizeServerId(target?.serverId, context);
  if (typeof serverId !== "string") {
    return serverId;
  }

  const reason = normalizeReason(target?.reason, context, serverId);
  if (reason !== undefined && typeof reason !== "string") {
    return reason;
  }

  return {
    serverId,
    connectionId: target?.connectionId?.trim() || undefined,
    reason,
    force: target?.force === true,
  };
}

function operationPreview(target: McpDisconnectTarget): McpDisconnectPlan {
  return {
    serverId: target.serverId,
    connectionId: target.connectionId,
    reason: target.reason,
    force: target.force,
    connectionState: "disconnect-planned",
  };
}

export function planMcpDisconnect(request: McpDisconnectRequest = {}): McpDisconnectResult {
  const target = normalizeTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  const scopeFailure = ensureScope(target.serverId, request.context);
  if (scopeFailure !== undefined) {
    return scopeFailure;
  }

  const permissionFailure = ensurePermissions(target.serverId, request.context);
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const realExecutionFailure = ensureDryRunOnly(target.serverId, request.context);
  if (realExecutionFailure !== undefined) {
    return realExecutionFailure;
  }

  return {
    ok: true,
    toolId: mcpDisconnectDescriptor.toolId,
    output: {
      kind: "agentCore.basicTool.mcp.disconnect",
      target,
      operationPreview: operationPreview(target),
      dryRun: true,
      executionBlocked: true,
      permissionsRequired: mcpDisconnectDescriptor.permissionsRequired,
      unsafeSideEffects: true,
    },
    audit: [
      auditEvent("agentCore.basicTool.mcp.disconnect.dryRun", request.context, target.serverId, {
        connectionId: target.connectionId,
        force: target.force,
      }),
    ],
    events: ["basicTool.mcp.disconnect.dryRun"],
  };
}
