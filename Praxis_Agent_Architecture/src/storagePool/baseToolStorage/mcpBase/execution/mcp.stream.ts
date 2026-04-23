/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / MCP 基础工具 / MCP 执行。
 * 核心目的：提供 MCP 基础工具 / MCP 执行 中的“流式执行”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type McpStreamPermission = "mcp:stream" | "mcp:call";

export type McpStreamErrorBoundary = "input" | "scope" | "permission" | "governance" | "contract";

export type McpStreamChannel = "events" | "chunks";

export type McpStreamContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  allowedServerIds?: readonly string[];
  grantedPermissions?: readonly McpStreamPermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type McpStreamTarget = {
  serverId: string;
  name: string;
  channel: McpStreamChannel;
  arguments?: Readonly<Record<string, unknown>>;
  maxEvents?: number;
};

export type McpStreamRequest = {
  target?: Partial<McpStreamTarget>;
  context?: McpStreamContext;
};

export type McpStreamErrorCode =
  | "MISSING_SERVER_ID"
  | "MISSING_STREAM_NAME"
  | "INVALID_CHANNEL"
  | "INVALID_ARGUMENTS"
  | "INVALID_MAX_EVENTS"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "REAL_EXECUTION_BLOCKED";

export type McpStreamError = {
  code: McpStreamErrorCode;
  message: string;
  boundary: McpStreamErrorBoundary;
  publicSafe: true;
};

export type McpStreamAuditEvent = {
  type: string;
  toolId: "mcp.stream";
  invocationId: string;
  dryRun: boolean;
  serverId?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type McpStreamOutput = {
  kind: "agentCore.basicTool.mcp.stream";
  target: McpStreamTarget;
  dryRun: true;
  executionBlocked: true;
  permissionsRequired: readonly McpStreamPermission[];
  unsafeSideEffects: true;
  streamEnvelope: {
    transport: "mcp";
    operation: "stream";
    serverId: string;
    name: string;
    channel: McpStreamChannel;
    arguments: Readonly<Record<string, unknown>>;
    maxEvents?: number;
  };
};

export type McpStreamResult =
  | {
      ok: true;
      toolId: "mcp.stream";
      output: McpStreamOutput;
      audit: readonly McpStreamAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "mcp.stream";
      error: McpStreamError;
      audit: readonly McpStreamAuditEvent[];
      events: readonly string[];
    };

export const mcpStreamDescriptor = {
  toolId: "mcp.stream",
  capability: "stream-mcp-execution",
  route: "agent_executionEngine.basic_toolLayer.baseTools.mcpBase.execution",
  defaultDryRun: true,
  tapOwnsApproval: true,
  permissionsRequired: ["mcp:stream", "mcp:call"],
  unsafeSideEffects: true,
} as const;

function cleanList<T extends string>(values: readonly T[] | undefined): readonly T[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean) as T[])];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function dryRunEnabled(context: McpStreamContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: McpStreamContext | undefined): string {
  return context?.invocationId?.trim() || "mcp.stream:dry-run";
}

function auditEvent(
  type: string,
  context: McpStreamContext | undefined,
  serverId?: string,
  metadata?: Readonly<Record<string, unknown>>,
): McpStreamAuditEvent {
  return {
    type,
    toolId: mcpStreamDescriptor.toolId,
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
  code: McpStreamErrorCode,
  message: string,
  boundary: McpStreamErrorBoundary,
  context: McpStreamContext | undefined,
  serverId?: string,
): McpStreamResult {
  return {
    ok: false,
    toolId: mcpStreamDescriptor.toolId,
    error: { code, message, boundary, publicSafe: true },
    audit: [auditEvent("agentCore.basicTool.mcp.stream.rejected", context, serverId, { code })],
    events: ["basicTool.mcp.stream.rejected"],
  };
}

function normalizeChannel(
  channel: string | undefined,
  context: McpStreamContext | undefined,
  serverId: string,
): McpStreamChannel | McpStreamResult {
  if (channel === undefined || channel.trim() === "" || channel === "events") {
    return "events";
  }

  if (channel === "chunks") {
    return "chunks";
  }

  return failure("INVALID_CHANNEL", "mcp.stream target.channel must be events or chunks", "input", context, serverId);
}

function normalizeTarget(
  target: Partial<McpStreamTarget> | undefined,
  context: McpStreamContext | undefined,
): McpStreamTarget | McpStreamResult {
  const serverId = target?.serverId?.trim() ?? "";
  if (serverId.length === 0) {
    return failure("MISSING_SERVER_ID", "mcp.stream requires target.serverId", "input", context);
  }

  const name = target?.name?.trim() ?? "";
  if (name.length === 0) {
    return failure("MISSING_STREAM_NAME", "mcp.stream requires target.name", "input", context, serverId);
  }

  const channel = normalizeChannel(target?.channel, context, serverId);
  if (typeof channel !== "string") {
    return channel;
  }

  if (target?.arguments !== undefined && !isRecord(target.arguments)) {
    return failure("INVALID_ARGUMENTS", "mcp.stream target.arguments must be a plain record", "input", context, serverId);
  }

  if (
    target?.maxEvents !== undefined &&
    (!Number.isInteger(target.maxEvents) || target.maxEvents <= 0)
  ) {
    return failure("INVALID_MAX_EVENTS", "mcp.stream target.maxEvents must be a positive integer", "input", context, serverId);
  }

  return {
    serverId,
    name,
    channel,
    arguments: target?.arguments ?? {},
    maxEvents: target?.maxEvents,
  };
}

function ensureServerScope(serverId: string, context: McpStreamContext | undefined): McpStreamResult | undefined {
  const allowedServerIds = cleanList(context?.allowedServerIds);
  if (allowedServerIds.length === 0 || allowedServerIds.includes(serverId)) {
    return undefined;
  }

  return failure(
    "SCOPE_REJECTED",
    "mcp.stream target server is outside the allowed MCP server scope",
    "scope",
    context,
    serverId,
  );
}

function ensurePermissions(target: McpStreamTarget, context: McpStreamContext | undefined): McpStreamResult | undefined {
  const grantedPermissions = cleanList(context?.grantedPermissions);
  if (grantedPermissions.length === 0) {
    return undefined;
  }

  const missing = mcpStreamDescriptor.permissionsRequired.filter((permission) => !grantedPermissions.includes(permission));
  if (missing.length === 0) {
    return undefined;
  }

  return failure("PERMISSION_DENIED", `mcp.stream is missing permissions: ${missing.join(", ")}`, "permission", context, target.serverId);
}

function ensureDryRunOnly(target: McpStreamTarget, context: McpStreamContext | undefined): McpStreamResult | undefined {
  if (dryRunEnabled(context)) {
    return undefined;
  }

  return failure(
    "REAL_EXECUTION_BLOCKED",
    "mcp.stream only returns a governed dry-run envelope in the first implementation",
    "contract",
    context,
    target.serverId,
  );
}

export function planMcpStream(request: McpStreamRequest = {}): McpStreamResult {
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

  return {
    ok: true,
    toolId: mcpStreamDescriptor.toolId,
    output: {
      kind: "agentCore.basicTool.mcp.stream",
      target,
      dryRun: true,
      executionBlocked: true,
      permissionsRequired: mcpStreamDescriptor.permissionsRequired,
      unsafeSideEffects: true,
      streamEnvelope: {
        transport: "mcp",
        operation: "stream",
        serverId: target.serverId,
        name: target.name,
        channel: target.channel,
        arguments: target.arguments ?? {},
        maxEvents: target.maxEvents,
      },
    },
    audit: [
      auditEvent("agentCore.basicTool.mcp.stream.dryRun", request.context, target.serverId, {
        name: target.name,
        channel: target.channel,
      }),
    ],
    events: ["basicTool.mcp.stream.dryRun"],
  };
}
