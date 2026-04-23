/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / MCP 基础工具 / MCP 连接。
 * 核心目的：提供 MCP 基础工具 / MCP 连接 中的“探活连接”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type McpPingPermission = "mcp:ping";

export type McpPingErrorBoundary = "input" | "scope" | "permission" | "contract";

export type McpPingContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  allowedServerIds?: readonly string[];
  grantedPermissions?: readonly McpPingPermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type McpPingTarget = {
  serverId: string;
  connectionId?: string;
  timeoutMs: number;
};

export type McpPingRequest = {
  target?: Partial<McpPingTarget>;
  context?: McpPingContext;
};

export type McpPingErrorCode =
  | "MISSING_SERVER_ID"
  | "INVALID_TIMEOUT"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "REAL_EXECUTION_BLOCKED";

export type McpPingError = {
  code: McpPingErrorCode;
  message: string;
  boundary: McpPingErrorBoundary;
  publicSafe: true;
};

export type McpPingAuditEvent = {
  type: string;
  toolId: "mcp.ping";
  invocationId: string;
  dryRun: boolean;
  serverId?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type McpPingEnvelope = {
  serverId: string;
  connectionId?: string;
  probeState: "planned";
  timeoutMs: number;
  healthy: "unknown";
};

export type McpPingOutput = {
  kind: "agentCore.basicTool.mcp.ping";
  target: McpPingTarget;
  operationPreview: McpPingEnvelope;
  dryRun: true;
  executionBlocked: true;
  permissionsRequired: readonly McpPingPermission[];
  unsafeSideEffects: false;
};

export type McpPingResult =
  | {
      ok: true;
      toolId: "mcp.ping";
      output: McpPingOutput;
      audit: readonly McpPingAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "mcp.ping";
      error: McpPingError;
      audit: readonly McpPingAuditEvent[];
      events: readonly string[];
    };

export const mcpPingDescriptor = {
  toolId: "mcp.ping",
  capability: "ping-mcp-connection",
  route: "agent_executionEngine.basic_toolLayer.baseTools.mcpBase.connection",
  defaultDryRun: true,
  tapOwnsApproval: true,
  permissionsRequired: ["mcp:ping"],
} as const;

function cleanList<T extends string>(values: readonly T[] | undefined): readonly T[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean) as T[])];
}

function dryRunEnabled(context: McpPingContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: McpPingContext | undefined): string {
  return context?.invocationId?.trim() || "mcp.ping:dry-run";
}

function auditEvent(
  type: string,
  context: McpPingContext | undefined,
  serverId?: string,
  metadata?: Readonly<Record<string, unknown>>,
): McpPingAuditEvent {
  return {
    type,
    toolId: mcpPingDescriptor.toolId,
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
  code: McpPingErrorCode,
  message: string,
  boundary: McpPingErrorBoundary,
  context: McpPingContext | undefined,
  serverId?: string,
): McpPingResult {
  return {
    ok: false,
    toolId: mcpPingDescriptor.toolId,
    error: { code, message, boundary, publicSafe: true },
    audit: [auditEvent("agentCore.basicTool.mcp.ping.rejected", context, serverId, { code })],
    events: ["basicTool.mcp.ping.rejected"],
  };
}

function normalizeServerId(serverId: string | undefined, context: McpPingContext | undefined): string | McpPingResult {
  const normalized = serverId?.trim() ?? "";
  if (normalized.length === 0) {
    return failure("MISSING_SERVER_ID", "mcp.ping requires target.serverId", "input", context, serverId);
  }

  return normalized;
}

function normalizeTimeoutMs(
  timeoutMs: number | undefined,
  context: McpPingContext | undefined,
  serverId: string,
): number | McpPingResult {
  const normalized = timeoutMs ?? 5_000;
  if (!Number.isInteger(normalized) || normalized < 1 || normalized > 60_000) {
    return failure(
      "INVALID_TIMEOUT",
      "mcp.ping target.timeoutMs must be an integer between 1 and 60000",
      "input",
      context,
      serverId,
    );
  }

  return normalized;
}

function ensureScope(serverId: string, context: McpPingContext | undefined): McpPingResult | undefined {
  const allowedServerIds = cleanList(context?.allowedServerIds);
  if (allowedServerIds.length === 0 || allowedServerIds.includes(serverId)) {
    return undefined;
  }

  return failure("SCOPE_REJECTED", "mcp.ping target server is outside allowed MCP server ids", "scope", context, serverId);
}

function ensurePermissions(serverId: string, context: McpPingContext | undefined): McpPingResult | undefined {
  const granted = cleanList(context?.grantedPermissions);
  if (granted.length === 0) {
    return undefined;
  }

  const missing = mcpPingDescriptor.permissionsRequired.filter((permission) => !granted.includes(permission));
  if (missing.length === 0) {
    return undefined;
  }

  return failure("PERMISSION_DENIED", `mcp.ping is missing permissions: ${missing.join(", ")}`, "permission", context, serverId);
}

function ensureDryRunOnly(serverId: string, context: McpPingContext | undefined): McpPingResult | undefined {
  if (dryRunEnabled(context)) {
    return undefined;
  }

  return failure(
    "REAL_EXECUTION_BLOCKED",
    "mcp.ping only returns a guarded dry-run plan in the first implementation",
    "contract",
    context,
    serverId,
  );
}

function normalizeTarget(
  target: Partial<McpPingTarget> | undefined,
  context: McpPingContext | undefined,
): McpPingTarget | McpPingResult {
  const serverId = normalizeServerId(target?.serverId, context);
  if (typeof serverId !== "string") {
    return serverId;
  }

  const timeoutMs = normalizeTimeoutMs(target?.timeoutMs, context, serverId);
  if (typeof timeoutMs !== "number") {
    return timeoutMs;
  }

  return {
    serverId,
    connectionId: target?.connectionId?.trim() || undefined,
    timeoutMs,
  };
}

function operationPreview(target: McpPingTarget): McpPingEnvelope {
  return {
    serverId: target.serverId,
    connectionId: target.connectionId,
    probeState: "planned",
    timeoutMs: target.timeoutMs,
    healthy: "unknown",
  };
}

export function planMcpPing(request: McpPingRequest = {}): McpPingResult {
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
    toolId: mcpPingDescriptor.toolId,
    output: {
      kind: "agentCore.basicTool.mcp.ping",
      target,
      operationPreview: operationPreview(target),
      dryRun: true,
      executionBlocked: true,
      permissionsRequired: mcpPingDescriptor.permissionsRequired,
      unsafeSideEffects: false,
    },
    audit: [
      auditEvent("agentCore.basicTool.mcp.ping.dryRun", request.context, target.serverId, {
        connectionId: target.connectionId,
        timeoutMs: target.timeoutMs,
      }),
    ],
    events: ["basicTool.mcp.ping.dryRun"],
  };
}
