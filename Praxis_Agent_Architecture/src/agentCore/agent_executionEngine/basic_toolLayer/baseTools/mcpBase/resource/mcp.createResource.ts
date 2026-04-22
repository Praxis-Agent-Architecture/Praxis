/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / MCP 基础工具 / MCP 资源。
 * 核心目的：提供 MCP 基础工具 / MCP 资源 中的“创建资源”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type McpCreateResourcePermission = "mcp:connection:read" | "mcp:resource:create";

export type McpCreateResourceErrorBoundary = "input" | "scope" | "permission" | "contract";

export type McpCreateResourceContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  allowedServerIds?: readonly string[];
  allowedUriPrefixes?: readonly string[];
  grantedPermissions?: readonly McpCreateResourcePermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type McpCreateResourceTarget = {
  serverId: string;
  uri: string;
  resourceType?: string;
  mimeType?: string;
};

export type McpCreateResourceRequest = {
  target?: Partial<McpCreateResourceTarget>;
  initialContent?: unknown;
  metadata?: Readonly<Record<string, unknown>>;
  context?: McpCreateResourceContext;
};

export type McpCreateResourceEnvelope = {
  uri: string;
  created: false;
  contentAccepted: boolean;
  metadataKeys: readonly string[];
};

export type McpCreateResourceErrorCode =
  | "MISSING_SERVER_ID"
  | "MISSING_RESOURCE_URI"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "REAL_EXECUTION_BLOCKED";

export type McpCreateResourceError = {
  code: McpCreateResourceErrorCode;
  message: string;
  boundary: McpCreateResourceErrorBoundary;
  publicSafe: true;
};

export type McpCreateResourceAuditEvent = {
  type: string;
  toolId: "mcp.createResource";
  invocationId: string;
  dryRun: boolean;
  serverId?: string;
  uri?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type McpCreateResourceOutput = {
  kind: "agentCore.basicTool.mcp.createResource";
  target: McpCreateResourceTarget;
  dryRun: true;
  executionBlocked: true;
  permissionsRequired: readonly McpCreateResourcePermission[];
  unsafeSideEffects: false;
  resourceEnvelope: McpCreateResourceEnvelope;
};

export type McpCreateResourceResult =
  | {
      ok: true;
      toolId: "mcp.createResource";
      output: McpCreateResourceOutput;
      audit: readonly McpCreateResourceAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "mcp.createResource";
      error: McpCreateResourceError;
      audit: readonly McpCreateResourceAuditEvent[];
      events: readonly string[];
    };

export const mcpCreateResourceDescriptor = {
  toolId: "mcp.createResource",
  capability: "create-resource",
  route: "agent_executionEngine.basic_toolLayer.baseTools.mcpBase.resource",
  defaultDryRun: true,
  tapOwnsApproval: true,
  permissionsRequired: ["mcp:connection:read", "mcp:resource:create"],
} as const;

function cleanList<T extends string>(values: readonly T[] | undefined): readonly T[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean) as T[])];
}

function dryRunEnabled(context: McpCreateResourceContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: McpCreateResourceContext | undefined): string {
  return context?.invocationId?.trim() || "mcp.createResource:dry-run";
}

function auditEvent(
  type: string,
  context: McpCreateResourceContext | undefined,
  serverId?: string,
  uri?: string,
  metadata?: Readonly<Record<string, unknown>>,
): McpCreateResourceAuditEvent {
  return {
    type,
    toolId: mcpCreateResourceDescriptor.toolId,
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
  code: McpCreateResourceErrorCode,
  message: string,
  boundary: McpCreateResourceErrorBoundary,
  context: McpCreateResourceContext | undefined,
  serverId?: string,
  uri?: string,
): McpCreateResourceResult {
  return {
    ok: false,
    toolId: mcpCreateResourceDescriptor.toolId,
    error: { code, message, boundary, publicSafe: true },
    audit: [auditEvent("agentCore.basicTool.mcp.createResource.rejected", context, serverId, uri, { code })],
    events: ["basicTool.mcp.createResource.rejected"],
  };
}

function normalizeRequiredField(
  value: string | undefined,
  missingCode: "MISSING_SERVER_ID" | "MISSING_RESOURCE_URI",
  label: string,
  context: McpCreateResourceContext | undefined,
  serverId?: string,
): string | McpCreateResourceResult {
  const normalized = value?.trim() ?? "";
  if (normalized.length === 0) {
    return failure(missingCode, `mcp.createResource requires target.${label}`, "input", context, serverId, value);
  }

  return normalized;
}

function ensureServerScope(serverId: string, context: McpCreateResourceContext | undefined, uri?: string): McpCreateResourceResult | undefined {
  const allowedServerIds = cleanList(context?.allowedServerIds);
  if (allowedServerIds.length === 0 || allowedServerIds.includes(serverId)) {
    return undefined;
  }

  return failure("SCOPE_REJECTED", "mcp.createResource target server is outside the allowed MCP server scope", "scope", context, serverId, uri);
}

function uriMatchesAllowedPrefix(uri: string, prefix: string): boolean {
  return uri === prefix || uri.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`);
}

function ensureUriScope(serverId: string, uri: string, context: McpCreateResourceContext | undefined): McpCreateResourceResult | undefined {
  const allowedPrefixes = cleanList(context?.allowedUriPrefixes);
  if (allowedPrefixes.length === 0 || allowedPrefixes.some((prefix) => uriMatchesAllowedPrefix(uri, prefix))) {
    return undefined;
  }

  return failure("SCOPE_REJECTED", "mcp.createResource target uri is outside the allowed resource prefixes", "scope", context, serverId, uri);
}

function ensurePermissions(serverId: string, uri: string, context: McpCreateResourceContext | undefined): McpCreateResourceResult | undefined {
  const granted = cleanList(context?.grantedPermissions);
  if (granted.length === 0) {
    return undefined;
  }

  const missing = mcpCreateResourceDescriptor.permissionsRequired.filter((permission) => !granted.includes(permission));
  if (missing.length === 0) {
    return undefined;
  }

  return failure("PERMISSION_DENIED", `mcp.createResource is missing permissions: ${missing.join(", ")}`, "permission", context, serverId, uri);
}

function ensureDryRunOnly(serverId: string, uri: string, context: McpCreateResourceContext | undefined): McpCreateResourceResult | undefined {
  if (dryRunEnabled(context)) {
    return undefined;
  }

  return failure(
    "REAL_EXECUTION_BLOCKED",
    "mcp.createResource only returns a guarded dry-run resource envelope in the first implementation",
    "contract",
    context,
    serverId,
    uri,
  );
}

function normalizeTarget(
  target: Partial<McpCreateResourceTarget> | undefined,
  context: McpCreateResourceContext | undefined,
): McpCreateResourceTarget | McpCreateResourceResult {
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
    resourceType: target?.resourceType?.trim() || undefined,
    mimeType: target?.mimeType?.trim() || undefined,
  };
}

export function planMcpCreateResource(request: McpCreateResourceRequest = {}): McpCreateResourceResult {
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

  return {
    ok: true,
    toolId: mcpCreateResourceDescriptor.toolId,
    output: {
      kind: "agentCore.basicTool.mcp.createResource",
      target,
      dryRun: true,
      executionBlocked: true,
      permissionsRequired: mcpCreateResourceDescriptor.permissionsRequired,
      unsafeSideEffects: false,
      resourceEnvelope: {
        uri: target.uri,
        created: false,
        contentAccepted: request.initialContent !== undefined,
        metadataKeys: Object.keys(request.metadata ?? {}).sort(),
      },
    },
    audit: [
      auditEvent("agentCore.basicTool.mcp.createResource.dryRun", request.context, target.serverId, target.uri, {
        resourceType: target.resourceType,
        mimeType: target.mimeType,
        hasInitialContent: request.initialContent !== undefined,
      }),
    ],
    events: ["basicTool.mcp.createResource.dryRun"],
  };
}
