/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / MCP 基础工具 / MCP 资源。
 * 核心目的：提供 MCP 基础工具 / MCP 资源 中的“删除资源”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type McpDeleteResourcePermission = "mcp:connection:read" | "mcp:resource:delete";

export type McpDeleteResourceErrorBoundary = "input" | "scope" | "permission" | "contract";

export type McpDeleteResourceContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  allowedServerIds?: readonly string[];
  allowedUriPrefixes?: readonly string[];
  grantedPermissions?: readonly McpDeleteResourcePermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type McpDeleteResourceTarget = {
  serverId: string;
  uri: string;
  expectedRevision?: string;
};

export type McpDeleteResourceRequest = {
  target?: Partial<McpDeleteResourceTarget>;
  reason?: string;
  context?: McpDeleteResourceContext;
};

export type McpDeleteResourceEnvelope = {
  uri: string;
  deleted: false;
  deletionPlanned: true;
  reason?: string;
};

export type McpDeleteResourceErrorCode =
  | "MISSING_SERVER_ID"
  | "MISSING_RESOURCE_URI"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "REAL_EXECUTION_BLOCKED";

export type McpDeleteResourceError = {
  code: McpDeleteResourceErrorCode;
  message: string;
  boundary: McpDeleteResourceErrorBoundary;
  publicSafe: true;
};

export type McpDeleteResourceAuditEvent = {
  type: string;
  toolId: "mcp.deleteResource";
  invocationId: string;
  dryRun: boolean;
  serverId?: string;
  uri?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type McpDeleteResourceOutput = {
  kind: "agentCore.basicTool.mcp.deleteResource";
  target: McpDeleteResourceTarget;
  dryRun: true;
  executionBlocked: true;
  permissionsRequired: readonly McpDeleteResourcePermission[];
  unsafeSideEffects: false;
  resourceEnvelope: McpDeleteResourceEnvelope;
};

export type McpDeleteResourceResult =
  | {
      ok: true;
      toolId: "mcp.deleteResource";
      output: McpDeleteResourceOutput;
      audit: readonly McpDeleteResourceAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "mcp.deleteResource";
      error: McpDeleteResourceError;
      audit: readonly McpDeleteResourceAuditEvent[];
      events: readonly string[];
    };

export const mcpDeleteResourceDescriptor = {
  toolId: "mcp.deleteResource",
  capability: "delete-resource",
  route: "agent_executionEngine.basic_toolLayer.baseTools.mcpBase.resource",
  defaultDryRun: true,
  tapOwnsApproval: true,
  permissionsRequired: ["mcp:connection:read", "mcp:resource:delete"],
} as const;

function cleanList<T extends string>(values: readonly T[] | undefined): readonly T[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean) as T[])];
}

function dryRunEnabled(context: McpDeleteResourceContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: McpDeleteResourceContext | undefined): string {
  return context?.invocationId?.trim() || "mcp.deleteResource:dry-run";
}

function auditEvent(
  type: string,
  context: McpDeleteResourceContext | undefined,
  serverId?: string,
  uri?: string,
  metadata?: Readonly<Record<string, unknown>>,
): McpDeleteResourceAuditEvent {
  return {
    type,
    toolId: mcpDeleteResourceDescriptor.toolId,
    invocationId: invocationId(context),
    dryRun: dryRunEnabled(context),
    serverId,
    uri,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: McpDeleteResourceErrorCode,
  message: string,
  boundary: McpDeleteResourceErrorBoundary,
  context: McpDeleteResourceContext | undefined,
  serverId?: string,
  uri?: string,
): McpDeleteResourceResult {
  return {
    ok: false,
    toolId: mcpDeleteResourceDescriptor.toolId,
    error: { code, message, boundary, publicSafe: true },
    audit: [auditEvent("agentCore.basicTool.mcp.deleteResource.rejected", context, serverId, uri, { code })],
    events: ["basicTool.mcp.deleteResource.rejected"],
  };
}

function normalizeRequiredField(
  value: string | undefined,
  missingCode: "MISSING_SERVER_ID" | "MISSING_RESOURCE_URI",
  label: string,
  context: McpDeleteResourceContext | undefined,
  serverId?: string,
): string | McpDeleteResourceResult {
  const normalized = value?.trim() ?? "";
  if (normalized.length === 0) {
    return failure(missingCode, `mcp.deleteResource requires target.${label}`, "input", context, serverId, value);
  }

  return normalized;
}

function ensureServerScope(serverId: string, context: McpDeleteResourceContext | undefined, uri?: string): McpDeleteResourceResult | undefined {
  const allowedServerIds = cleanList(context?.allowedServerIds);
  if (allowedServerIds.length === 0 || allowedServerIds.includes(serverId)) {
    return undefined;
  }

  return failure("SCOPE_REJECTED", "mcp.deleteResource target server is outside the allowed MCP server scope", "scope", context, serverId, uri);
}

function uriMatchesAllowedPrefix(uri: string, prefix: string): boolean {
  return uri === prefix || uri.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`);
}

function ensureUriScope(serverId: string, uri: string, context: McpDeleteResourceContext | undefined): McpDeleteResourceResult | undefined {
  const allowedPrefixes = cleanList(context?.allowedUriPrefixes);
  if (allowedPrefixes.length === 0 || allowedPrefixes.some((prefix) => uriMatchesAllowedPrefix(uri, prefix))) {
    return undefined;
  }

  return failure("SCOPE_REJECTED", "mcp.deleteResource target uri is outside the allowed resource prefixes", "scope", context, serverId, uri);
}

function ensurePermissions(serverId: string, uri: string, context: McpDeleteResourceContext | undefined): McpDeleteResourceResult | undefined {
  const granted = cleanList(context?.grantedPermissions);
  if (granted.length === 0) {
    return undefined;
  }

  const missing = mcpDeleteResourceDescriptor.permissionsRequired.filter((permission) => !granted.includes(permission));
  if (missing.length === 0) {
    return undefined;
  }

  return failure("PERMISSION_DENIED", `mcp.deleteResource is missing permissions: ${missing.join(", ")}`, "permission", context, serverId, uri);
}

function ensureDryRunOnly(serverId: string, uri: string, context: McpDeleteResourceContext | undefined): McpDeleteResourceResult | undefined {
  if (dryRunEnabled(context)) {
    return undefined;
  }

  return failure(
    "REAL_EXECUTION_BLOCKED",
    "mcp.deleteResource only returns a guarded dry-run resource envelope in the first implementation",
    "contract",
    context,
    serverId,
    uri,
  );
}

function normalizeTarget(
  target: Partial<McpDeleteResourceTarget> | undefined,
  context: McpDeleteResourceContext | undefined,
): McpDeleteResourceTarget | McpDeleteResourceResult {
  const serverId = normalizeRequiredField(target?.serverId, "MISSING_SERVER_ID", "serverId", context);
  if (typeof serverId !== "string") {
    return serverId;
  }

  const uri = normalizeRequiredField(target?.uri, "MISSING_RESOURCE_URI", "uri", context, serverId);
  if (typeof uri !== "string") {
    return uri;
  }

  return {
    serverId,
    uri,
    expectedRevision: target?.expectedRevision?.trim() || undefined,
  };
}

export function planMcpDeleteResource(request: McpDeleteResourceRequest = {}): McpDeleteResourceResult {
  const target = normalizeTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  const serverScopeFailure = ensureServerScope(target.serverId, request.context, target.uri);
  if (serverScopeFailure !== undefined) {
    return serverScopeFailure;
  }

  const uriScopeFailure = ensureUriScope(target.serverId, target.uri, request.context);
  if (uriScopeFailure !== undefined) {
    return uriScopeFailure;
  }

  const permissionFailure = ensurePermissions(target.serverId, target.uri, request.context);
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const realExecutionFailure = ensureDryRunOnly(target.serverId, target.uri, request.context);
  if (realExecutionFailure !== undefined) {
    return realExecutionFailure;
  }

  const reason = request.reason?.trim() || undefined;

  return {
    ok: true,
    toolId: mcpDeleteResourceDescriptor.toolId,
    output: {
      kind: "agentCore.basicTool.mcp.deleteResource",
      target,
      dryRun: true,
      executionBlocked: true,
      permissionsRequired: mcpDeleteResourceDescriptor.permissionsRequired,
      unsafeSideEffects: false,
      resourceEnvelope: {
        uri: target.uri,
        deleted: false,
        deletionPlanned: true,
        reason,
      },
    },
    audit: [
      auditEvent("agentCore.basicTool.mcp.deleteResource.dryRun", request.context, target.serverId, target.uri, {
        expectedRevision: target.expectedRevision,
        reason,
      }),
    ],
    events: ["basicTool.mcp.deleteResource.dryRun"],
  };
}
