/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / MCP 基础工具 / MCP 连接。
 * 核心目的：提供 MCP 基础工具 / MCP 连接 中的“建立连接”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type McpConnectTransport = "stdio" | "http" | "sse";

export type McpConnectPermission = "mcp:connect" | "network:connect" | "process:spawn";

export type McpConnectErrorBoundary = "input" | "scope" | "permission" | "contract";

export type McpConnectContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  allowedServerIds?: readonly string[];
  grantedPermissions?: readonly McpConnectPermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type McpConnectTarget = {
  serverId: string;
  transport: McpConnectTransport;
  endpoint?: string;
  command?: string;
  timeoutMs: number;
};

export type McpConnectRequest = {
  target?: Partial<McpConnectTarget>;
  context?: McpConnectContext;
};

export type McpConnectErrorCode =
  | "MISSING_SERVER_ID"
  | "MISSING_TRANSPORT"
  | "INVALID_TRANSPORT"
  | "MISSING_ENDPOINT"
  | "INVALID_ENDPOINT"
  | "MISSING_COMMAND"
  | "INVALID_TIMEOUT"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "REAL_EXECUTION_BLOCKED";

export type McpConnectError = {
  code: McpConnectErrorCode;
  message: string;
  boundary: McpConnectErrorBoundary;
  publicSafe: true;
};

export type McpConnectAuditEvent = {
  type: string;
  toolId: "mcp.connect";
  invocationId: string;
  dryRun: boolean;
  serverId?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type McpConnectionEnvelope = {
  serverId: string;
  transport: McpConnectTransport;
  connectionState: "planned";
  endpoint?: string;
  command?: string;
  timeoutMs: number;
};

export type McpConnectOutput = {
  kind: "agentCore.basicTool.mcp.connect";
  target: McpConnectTarget;
  operationPreview: McpConnectionEnvelope;
  dryRun: true;
  executionBlocked: true;
  permissionsRequired: readonly McpConnectPermission[];
  unsafeSideEffects: true;
};

export type McpConnectResult =
  | {
      ok: true;
      toolId: "mcp.connect";
      output: McpConnectOutput;
      audit: readonly McpConnectAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "mcp.connect";
      error: McpConnectError;
      audit: readonly McpConnectAuditEvent[];
      events: readonly string[];
    };

export const mcpConnectDescriptor = {
  toolId: "mcp.connect",
  capability: "connect-mcp-server",
  route: "agent_executionEngine.basic_toolLayer.baseTools.mcpBase.connection",
  defaultDryRun: true,
  tapOwnsApproval: true,
  basePermissionsRequired: ["mcp:connect"],
  transportPermissions: {
    stdio: ["process:spawn"],
    http: ["network:connect"],
    sse: ["network:connect"],
  },
} as const;

function cleanList<T extends string>(values: readonly T[] | undefined): readonly T[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean) as T[])];
}

function dryRunEnabled(context: McpConnectContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: McpConnectContext | undefined): string {
  return context?.invocationId?.trim() || "mcp.connect:dry-run";
}

function auditEvent(
  type: string,
  context: McpConnectContext | undefined,
  serverId?: string,
  metadata?: Readonly<Record<string, unknown>>,
): McpConnectAuditEvent {
  return {
    type,
    toolId: mcpConnectDescriptor.toolId,
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
  code: McpConnectErrorCode,
  message: string,
  boundary: McpConnectErrorBoundary,
  context: McpConnectContext | undefined,
  serverId?: string,
): McpConnectResult {
  return {
    ok: false,
    toolId: mcpConnectDescriptor.toolId,
    error: { code, message, boundary, publicSafe: true },
    audit: [auditEvent("agentCore.basicTool.mcp.connect.rejected", context, serverId, { code })],
    events: ["basicTool.mcp.connect.rejected"],
  };
}

function isMcpConnectTransport(value: string): value is McpConnectTransport {
  return value === "stdio" || value === "http" || value === "sse";
}

function normalizeServerId(
  serverId: string | undefined,
  context: McpConnectContext | undefined,
): string | McpConnectResult {
  const normalized = serverId?.trim() ?? "";
  if (normalized.length === 0) {
    return failure("MISSING_SERVER_ID", "mcp.connect requires target.serverId", "input", context, serverId);
  }

  return normalized;
}

function normalizeTransport(
  transport: string | undefined,
  context: McpConnectContext | undefined,
  serverId: string,
): McpConnectTransport | McpConnectResult {
  const normalized = transport?.trim() ?? "";
  if (normalized.length === 0) {
    return failure("MISSING_TRANSPORT", "mcp.connect requires target.transport", "input", context, serverId);
  }

  if (!isMcpConnectTransport(normalized)) {
    return failure(
      "INVALID_TRANSPORT",
      "mcp.connect target.transport must be stdio, http, or sse",
      "input",
      context,
      serverId,
    );
  }

  return normalized;
}

function normalizeEndpoint(
  endpoint: string | undefined,
  transport: McpConnectTransport,
  context: McpConnectContext | undefined,
  serverId: string,
): string | undefined | McpConnectResult {
  if (transport === "stdio") {
    return endpoint?.trim() || undefined;
  }

  const normalized = endpoint?.trim() ?? "";
  if (normalized.length === 0) {
    return failure("MISSING_ENDPOINT", "mcp.connect requires target.endpoint for network transports", "input", context, serverId);
  }

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    return failure("INVALID_ENDPOINT", "mcp.connect target.endpoint must be an http or https URL", "input", context, serverId);
  }

  if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || parsed.hostname.length === 0) {
    return failure("INVALID_ENDPOINT", "mcp.connect target.endpoint must be an http or https URL", "input", context, serverId);
  }

  return normalized;
}

function normalizeCommand(
  command: string | undefined,
  transport: McpConnectTransport,
  context: McpConnectContext | undefined,
  serverId: string,
): string | undefined | McpConnectResult {
  const normalized = command?.trim() ?? "";
  if (transport !== "stdio") {
    return normalized || undefined;
  }

  if (normalized.length === 0) {
    return failure("MISSING_COMMAND", "mcp.connect requires target.command for stdio transport", "input", context, serverId);
  }

  return normalized;
}

function normalizeTimeoutMs(
  timeoutMs: number | undefined,
  context: McpConnectContext | undefined,
  serverId: string,
): number | McpConnectResult {
  const normalized = timeoutMs ?? 30_000;
  if (!Number.isInteger(normalized) || normalized < 1 || normalized > 120_000) {
    return failure(
      "INVALID_TIMEOUT",
      "mcp.connect target.timeoutMs must be an integer between 1 and 120000",
      "input",
      context,
      serverId,
    );
  }

  return normalized;
}

function ensureScope(serverId: string, context: McpConnectContext | undefined): McpConnectResult | undefined {
  const allowedServerIds = cleanList(context?.allowedServerIds);
  if (allowedServerIds.length === 0 || allowedServerIds.includes(serverId)) {
    return undefined;
  }

  return failure("SCOPE_REJECTED", "mcp.connect target server is outside allowed MCP server ids", "scope", context, serverId);
}

function permissionsRequired(transport: McpConnectTransport): readonly McpConnectPermission[] {
  return [
    ...mcpConnectDescriptor.basePermissionsRequired,
    ...mcpConnectDescriptor.transportPermissions[transport],
  ] as readonly McpConnectPermission[];
}

function ensurePermissions(
  target: McpConnectTarget,
  context: McpConnectContext | undefined,
): McpConnectResult | undefined {
  const granted = cleanList(context?.grantedPermissions);
  if (granted.length === 0) {
    return undefined;
  }

  const missing = permissionsRequired(target.transport).filter((permission) => !granted.includes(permission));
  if (missing.length === 0) {
    return undefined;
  }

  return failure(
    "PERMISSION_DENIED",
    `mcp.connect is missing permissions: ${missing.join(", ")}`,
    "permission",
    context,
    target.serverId,
  );
}

function ensureDryRunOnly(serverId: string, context: McpConnectContext | undefined): McpConnectResult | undefined {
  if (dryRunEnabled(context)) {
    return undefined;
  }

  return failure(
    "REAL_EXECUTION_BLOCKED",
    "mcp.connect only returns a guarded dry-run plan in the first implementation",
    "contract",
    context,
    serverId,
  );
}

function normalizeTarget(
  target: Partial<McpConnectTarget> | undefined,
  context: McpConnectContext | undefined,
): McpConnectTarget | McpConnectResult {
  const serverId = normalizeServerId(target?.serverId, context);
  if (typeof serverId !== "string") {
    return serverId;
  }

  const transport = normalizeTransport(target?.transport, context, serverId);
  if (typeof transport !== "string") {
    return transport;
  }

  const endpoint = normalizeEndpoint(target?.endpoint, transport, context, serverId);
  if (endpoint !== undefined && typeof endpoint !== "string") {
    return endpoint;
  }

  const command = normalizeCommand(target?.command, transport, context, serverId);
  if (command !== undefined && typeof command !== "string") {
    return command;
  }

  const timeoutMs = normalizeTimeoutMs(target?.timeoutMs, context, serverId);
  if (typeof timeoutMs !== "number") {
    return timeoutMs;
  }

  return {
    serverId,
    transport,
    endpoint,
    command,
    timeoutMs,
  };
}

function operationPreview(target: McpConnectTarget): McpConnectionEnvelope {
  return {
    serverId: target.serverId,
    transport: target.transport,
    connectionState: "planned",
    endpoint: target.endpoint,
    command: target.command,
    timeoutMs: target.timeoutMs,
  };
}

export function planMcpConnect(request: McpConnectRequest = {}): McpConnectResult {
  const target = normalizeTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  const scopeFailure = ensureScope(target.serverId, request.context);
  if (scopeFailure !== undefined) {
    return scopeFailure;
  }

  const permissionFailure = ensurePermissions(target, request.context);
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const realExecutionFailure = ensureDryRunOnly(target.serverId, request.context);
  if (realExecutionFailure !== undefined) {
    return realExecutionFailure;
  }

  return {
    ok: true,
    toolId: mcpConnectDescriptor.toolId,
    output: {
      kind: "agentCore.basicTool.mcp.connect",
      target,
      operationPreview: operationPreview(target),
      dryRun: true,
      executionBlocked: true,
      permissionsRequired: permissionsRequired(target.transport),
      unsafeSideEffects: true,
    },
    audit: [
      auditEvent("agentCore.basicTool.mcp.connect.dryRun", request.context, target.serverId, {
        transport: target.transport,
      }),
    ],
    events: ["basicTool.mcp.connect.dryRun"],
  };
}
