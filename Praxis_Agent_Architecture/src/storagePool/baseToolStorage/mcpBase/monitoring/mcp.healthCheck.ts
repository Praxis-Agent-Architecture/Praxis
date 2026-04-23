/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / MCP 基础工具 / MCP 监控。
 * 核心目的：提供 MCP 基础工具 / MCP 监控 中的“健康检查”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type McpHealthCheckPermission = "mcp:connection:read" | "mcp:monitor:read";

export type McpHealthCheckErrorBoundary = "input" | "scope" | "permission" | "contract";

export type McpHealthCheckContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  allowedServerIds?: readonly string[];
  grantedPermissions?: readonly McpHealthCheckPermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type McpHealthCheckTarget = {
  serverId: string;
  includeCapabilities?: boolean;
  includeLatencyProbe?: boolean;
};

export type McpHealthCheckRequest = {
  target?: Partial<McpHealthCheckTarget>;
  context?: McpHealthCheckContext;
};

export type McpHealthCheckProbeEnvelope = {
  connection: "not-probed";
  latencyMs?: number;
  capabilities: readonly string[];
  status: "unknown";
};

export type McpHealthCheckErrorCode =
  | "MISSING_SERVER_ID"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "REAL_EXECUTION_BLOCKED";

export type McpHealthCheckError = {
  code: McpHealthCheckErrorCode;
  message: string;
  boundary: McpHealthCheckErrorBoundary;
  publicSafe: true;
};

export type McpHealthCheckAuditEvent = {
  type: string;
  toolId: "mcp.healthCheck";
  invocationId: string;
  dryRun: boolean;
  serverId?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type McpHealthCheckOutput = {
  kind: "agentCore.basicTool.mcp.healthCheck";
  target: McpHealthCheckTarget;
  dryRun: true;
  executionBlocked: true;
  permissionsRequired: readonly McpHealthCheckPermission[];
  unsafeSideEffects: false;
  probeEnvelope: McpHealthCheckProbeEnvelope;
};

export type McpHealthCheckResult =
  | {
      ok: true;
      toolId: "mcp.healthCheck";
      output: McpHealthCheckOutput;
      audit: readonly McpHealthCheckAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "mcp.healthCheck";
      error: McpHealthCheckError;
      audit: readonly McpHealthCheckAuditEvent[];
      events: readonly string[];
    };

export const mcpHealthCheckDescriptor = {
  toolId: "mcp.healthCheck",
  capability: "health-check",
  route: "agent_executionEngine.basic_toolLayer.baseTools.mcpBase.monitoring",
  defaultDryRun: true,
  tapOwnsApproval: true,
  permissionsRequired: ["mcp:connection:read", "mcp:monitor:read"],
} as const;

function cleanList<T extends string>(values: readonly T[] | undefined): readonly T[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean) as T[])];
}

function dryRunEnabled(context: McpHealthCheckContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: McpHealthCheckContext | undefined): string {
  return context?.invocationId?.trim() || "mcp.healthCheck:dry-run";
}

function auditEvent(
  type: string,
  context: McpHealthCheckContext | undefined,
  serverId?: string,
  metadata?: Readonly<Record<string, unknown>>,
): McpHealthCheckAuditEvent {
  return {
    type,
    toolId: mcpHealthCheckDescriptor.toolId,
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
  code: McpHealthCheckErrorCode,
  message: string,
  boundary: McpHealthCheckErrorBoundary,
  context: McpHealthCheckContext | undefined,
  serverId?: string,
): McpHealthCheckResult {
  return {
    ok: false,
    toolId: mcpHealthCheckDescriptor.toolId,
    error: { code, message, boundary, publicSafe: true },
    audit: [auditEvent("agentCore.basicTool.mcp.healthCheck.rejected", context, serverId, { code })],
    events: ["basicTool.mcp.healthCheck.rejected"],
  };
}

function normalizeServerId(
  serverId: string | undefined,
  context: McpHealthCheckContext | undefined,
): string | McpHealthCheckResult {
  const normalized = serverId?.trim() ?? "";
  if (normalized.length === 0) {
    return failure("MISSING_SERVER_ID", "mcp.healthCheck requires target.serverId", "input", context, serverId);
  }

  return normalized;
}

function ensureServerScope(serverId: string, context: McpHealthCheckContext | undefined): McpHealthCheckResult | undefined {
  const allowedServerIds = cleanList(context?.allowedServerIds);
  if (allowedServerIds.length === 0 || allowedServerIds.includes(serverId)) {
    return undefined;
  }

  return failure("SCOPE_REJECTED", "mcp.healthCheck target server is outside the allowed MCP server scope", "scope", context, serverId);
}

function ensurePermissions(serverId: string, context: McpHealthCheckContext | undefined): McpHealthCheckResult | undefined {
  const granted = cleanList(context?.grantedPermissions);
  if (granted.length === 0) {
    return undefined;
  }

  const missing = mcpHealthCheckDescriptor.permissionsRequired.filter((permission) => !granted.includes(permission));
  if (missing.length === 0) {
    return undefined;
  }

  return failure("PERMISSION_DENIED", `mcp.healthCheck is missing permissions: ${missing.join(", ")}`, "permission", context, serverId);
}

function ensureDryRunOnly(serverId: string, context: McpHealthCheckContext | undefined): McpHealthCheckResult | undefined {
  if (dryRunEnabled(context)) {
    return undefined;
  }

  return failure(
    "REAL_EXECUTION_BLOCKED",
    "mcp.healthCheck only returns a guarded dry-run probe envelope in the first implementation",
    "contract",
    context,
    serverId,
  );
}

function normalizeTarget(
  target: Partial<McpHealthCheckTarget> | undefined,
  context: McpHealthCheckContext | undefined,
): McpHealthCheckTarget | McpHealthCheckResult {
  const serverId = normalizeServerId(target?.serverId, context);
  if (typeof serverId !== "string") {
    return serverId;
  }

  return {
    serverId,
    includeCapabilities: target?.includeCapabilities === true,
    includeLatencyProbe: target?.includeLatencyProbe === true,
  };
}

export function planMcpHealthCheck(request: McpHealthCheckRequest = {}): McpHealthCheckResult {
  const target = normalizeTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  const scopeFailure = ensureServerScope(target.serverId, request.context);
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
    toolId: mcpHealthCheckDescriptor.toolId,
    output: {
      kind: "agentCore.basicTool.mcp.healthCheck",
      target,
      dryRun: true,
      executionBlocked: true,
      permissionsRequired: mcpHealthCheckDescriptor.permissionsRequired,
      unsafeSideEffects: false,
      probeEnvelope: {
        connection: "not-probed",
        capabilities: [],
        status: "unknown",
      },
    },
    audit: [
      auditEvent("agentCore.basicTool.mcp.healthCheck.dryRun", request.context, target.serverId, {
        includeCapabilities: target.includeCapabilities,
        includeLatencyProbe: target.includeLatencyProbe,
      }),
    ],
    events: ["basicTool.mcp.healthCheck.dryRun"],
  };
}
