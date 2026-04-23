/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / MCP 基础工具 / MCP 资源。
 * 核心目的：提供 MCP 基础工具 / MCP 资源 中的“列出资源”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type McpListResourcesPermission = "mcp:connection:read" | "mcp:resource:list";

export type McpListResourcesErrorBoundary = "input" | "scope" | "permission" | "contract";

export type McpListResourcesContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  allowedServerIds?: readonly string[];
  allowedUriPrefixes?: readonly string[];
  grantedPermissions?: readonly McpListResourcesPermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type McpListResourcesTarget = {
  serverId: string;
  uriPrefix?: string;
  cursor?: string;
  limit?: number;
};

export type McpListResourcesRequest = {
  target?: Partial<McpListResourcesTarget>;
  context?: McpListResourcesContext;
};

export type McpListedResourceEnvelope = {
  uri: string;
  name?: string;
  mimeType?: string;
};

export type McpListResourcesEnvelope = {
  resources: readonly McpListedResourceEnvelope[];
  nextCursor?: string;
  exhausted: false;
};

export type McpListResourcesErrorCode =
  | "MISSING_SERVER_ID"
  | "INVALID_LIMIT"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "REAL_EXECUTION_BLOCKED";

export type McpListResourcesError = {
  code: McpListResourcesErrorCode;
  message: string;
  boundary: McpListResourcesErrorBoundary;
  publicSafe: true;
};

export type McpListResourcesAuditEvent = {
  type: string;
  toolId: "mcp.listResources";
  invocationId: string;
  dryRun: boolean;
  serverId?: string;
  uriPrefix?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type McpListResourcesOutput = {
  kind: "agentCore.basicTool.mcp.listResources";
  target: McpListResourcesTarget;
  dryRun: true;
  executionBlocked: true;
  permissionsRequired: readonly McpListResourcesPermission[];
  unsafeSideEffects: false;
  resourceEnvelope: McpListResourcesEnvelope;
};

export type McpListResourcesResult =
  | {
      ok: true;
      toolId: "mcp.listResources";
      output: McpListResourcesOutput;
      audit: readonly McpListResourcesAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "mcp.listResources";
      error: McpListResourcesError;
      audit: readonly McpListResourcesAuditEvent[];
      events: readonly string[];
    };

export const mcpListResourcesDescriptor = {
  toolId: "mcp.listResources",
  capability: "list-resources",
  route: "agent_executionEngine.basic_toolLayer.baseTools.mcpBase.resource",
  defaultDryRun: true,
  tapOwnsApproval: true,
  permissionsRequired: ["mcp:connection:read", "mcp:resource:list"],
  defaultLimit: 100,
  maxLimit: 500,
} as const;

function cleanList<T extends string>(values: readonly T[] | undefined): readonly T[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean) as T[])];
}

function dryRunEnabled(context: McpListResourcesContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: McpListResourcesContext | undefined): string {
  return context?.invocationId?.trim() || "mcp.listResources:dry-run";
}

function auditEvent(
  type: string,
  context: McpListResourcesContext | undefined,
  serverId?: string,
  uriPrefix?: string,
  metadata?: Readonly<Record<string, unknown>>,
): McpListResourcesAuditEvent {
  return {
    type,
    toolId: mcpListResourcesDescriptor.toolId,
    invocationId: invocationId(context),
    dryRun: dryRunEnabled(context),
    serverId,
    uriPrefix,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: McpListResourcesErrorCode,
  message: string,
  boundary: McpListResourcesErrorBoundary,
  context: McpListResourcesContext | undefined,
  serverId?: string,
  uriPrefix?: string,
): McpListResourcesResult {
  return {
    ok: false,
    toolId: mcpListResourcesDescriptor.toolId,
    error: { code, message, boundary, publicSafe: true },
    audit: [auditEvent("agentCore.basicTool.mcp.listResources.rejected", context, serverId, uriPrefix, { code })],
    events: ["basicTool.mcp.listResources.rejected"],
  };
}

function normalizeServerId(
  serverId: string | undefined,
  context: McpListResourcesContext | undefined,
): string | McpListResourcesResult {
  const normalized = serverId?.trim() ?? "";
  if (normalized.length === 0) {
    return failure("MISSING_SERVER_ID", "mcp.listResources requires target.serverId", "input", context, serverId);
  }

  return normalized;
}

function normalizeLimit(
  limit: number | undefined,
  context: McpListResourcesContext | undefined,
  serverId: string,
  uriPrefix?: string,
): number | McpListResourcesResult {
  if (limit === undefined) {
    return mcpListResourcesDescriptor.defaultLimit;
  }

  if (!Number.isInteger(limit) || limit < 1 || limit > mcpListResourcesDescriptor.maxLimit) {
    return failure(
      "INVALID_LIMIT",
      `mcp.listResources target.limit must be an integer from 1 to ${mcpListResourcesDescriptor.maxLimit}`,
      "input",
      context,
      serverId,
      uriPrefix,
    );
  }

  return limit;
}

function ensureServerScope(serverId: string, context: McpListResourcesContext | undefined, uriPrefix?: string): McpListResourcesResult | undefined {
  const allowedServerIds = cleanList(context?.allowedServerIds);
  if (allowedServerIds.length === 0 || allowedServerIds.includes(serverId)) {
    return undefined;
  }

  return failure("SCOPE_REJECTED", "mcp.listResources target server is outside the allowed MCP server scope", "scope", context, serverId, uriPrefix);
}

function uriMatchesAllowedPrefix(uri: string, prefix: string): boolean {
  return uri === prefix || uri.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`);
}

function ensureUriScope(serverId: string, uriPrefix: string | undefined, context: McpListResourcesContext | undefined): McpListResourcesResult | undefined {
  const allowedPrefixes = cleanList(context?.allowedUriPrefixes);
  if (allowedPrefixes.length === 0 || uriPrefix === undefined) {
    return undefined;
  }

  if (allowedPrefixes.some((prefix) => uriMatchesAllowedPrefix(uriPrefix, prefix))) {
    return undefined;
  }

  return failure("SCOPE_REJECTED", "mcp.listResources uriPrefix is outside the allowed resource prefixes", "scope", context, serverId, uriPrefix);
}

function ensurePermissions(serverId: string, uriPrefix: string | undefined, context: McpListResourcesContext | undefined): McpListResourcesResult | undefined {
  const granted = cleanList(context?.grantedPermissions);
  if (granted.length === 0) {
    return undefined;
  }

  const missing = mcpListResourcesDescriptor.permissionsRequired.filter((permission) => !granted.includes(permission));
  if (missing.length === 0) {
    return undefined;
  }

  return failure("PERMISSION_DENIED", `mcp.listResources is missing permissions: ${missing.join(", ")}`, "permission", context, serverId, uriPrefix);
}

function ensureDryRunOnly(serverId: string, uriPrefix: string | undefined, context: McpListResourcesContext | undefined): McpListResourcesResult | undefined {
  if (dryRunEnabled(context)) {
    return undefined;
  }

  return failure(
    "REAL_EXECUTION_BLOCKED",
    "mcp.listResources only returns a guarded dry-run resource envelope in the first implementation",
    "contract",
    context,
    serverId,
    uriPrefix,
  );
}

function normalizeTarget(
  target: Partial<McpListResourcesTarget> | undefined,
  context: McpListResourcesContext | undefined,
): McpListResourcesTarget | McpListResourcesResult {
  const serverId = normalizeServerId(target?.serverId, context);
  if (typeof serverId !== "string") {
    return serverId;
  }

  const uriPrefix = target?.uriPrefix?.trim() || undefined;
  const limit = normalizeLimit(target?.limit, context, serverId, uriPrefix);
  if (typeof limit !== "number") {
    return limit;
  }

  return {
    serverId,
    uriPrefix,
    cursor: target?.cursor?.trim() || undefined,
    limit,
  };
}

export function planMcpListResources(request: McpListResourcesRequest = {}): McpListResourcesResult {
  const target = normalizeTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  const serverScopeFailure = ensureServerScope(target.serverId, request.context, target.uriPrefix);
  if (serverScopeFailure !== undefined) {
    return serverScopeFailure;
  }

  const uriScopeFailure = ensureUriScope(target.serverId, target.uriPrefix, request.context);
  if (uriScopeFailure !== undefined) {
    return uriScopeFailure;
  }

  const permissionFailure = ensurePermissions(target.serverId, target.uriPrefix, request.context);
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const realExecutionFailure = ensureDryRunOnly(target.serverId, target.uriPrefix, request.context);
  if (realExecutionFailure !== undefined) {
    return realExecutionFailure;
  }

  return {
    ok: true,
    toolId: mcpListResourcesDescriptor.toolId,
    output: {
      kind: "agentCore.basicTool.mcp.listResources",
      target,
      dryRun: true,
      executionBlocked: true,
      permissionsRequired: mcpListResourcesDescriptor.permissionsRequired,
      unsafeSideEffects: false,
      resourceEnvelope: {
        resources: [],
        exhausted: false,
      },
    },
    audit: [
      auditEvent("agentCore.basicTool.mcp.listResources.dryRun", request.context, target.serverId, target.uriPrefix, {
        cursor: target.cursor,
        limit: target.limit,
      }),
    ],
    events: ["basicTool.mcp.listResources.dryRun"],
  };
}
