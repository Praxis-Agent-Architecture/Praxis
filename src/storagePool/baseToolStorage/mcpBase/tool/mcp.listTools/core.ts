import {
  cleanStringList,
  guardAccepted,
  isJsonObject,
  optionalTrimmedString,
  type McpToolAuditEvent,
  type McpToolResult,
} from "../../_shared/baseToolAdapter.js";

export type McpListToolsPermission = "mcp:tool:read";

export type McpToolDefinition = {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: unknown;
  disabled?: boolean;
  namespace?: string;
  raw?: unknown;
};

export type ListMcpToolsContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: { accepted?: boolean; allowed?: boolean; reason?: string };
  allowedServerIds?: readonly string[];
  grantedPermissions?: readonly McpListToolsPermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type ListMcpToolsTarget = {
  serverId: string;
  namespace?: string;
  includeDisabled?: boolean;
  cursor?: string;
  limit?: number;
};

export type ListMcpToolsRequest = {
  target?: Partial<ListMcpToolsTarget> | null;
  context?: ListMcpToolsContext;
};

export type ListMcpToolsProviderRequest = ListMcpToolsTarget;
export type ListMcpToolsProviderResult = {
  tools: readonly McpToolDefinition[];
  nextCursor?: string;
  providerMetadata?: Readonly<Record<string, unknown>>;
  raw?: unknown;
};
export type ListMcpToolsProvider = (
  request: ListMcpToolsProviderRequest,
  context: Readonly<Record<string, unknown>>,
) => Promise<ListMcpToolsProviderResult> | ListMcpToolsProviderResult;

export type ListMcpToolsOutput = {
  kind: "agentCore.basicTool.mcp.listTools";
  target: ListMcpToolsTarget;
  toolsPreview: readonly McpToolDefinition[];
  nextCursor?: string;
  providerCalled: boolean;
  providerMetadata?: Readonly<Record<string, unknown>>;
  dryRun: boolean;
  executionBlocked: boolean;
  permissionsRequired: readonly McpListToolsPermission[];
  unsafeSideEffects: false;
};

export type ListMcpToolsErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_CONTEXT"
  | "MISSING_SERVER_ID"
  | "INVALID_SERVER_ID"
  | "INVALID_LIMIT"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "GOVERNANCE_REJECTED"
  | "REAL_EXECUTION_BLOCKED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_REJECTED";

export type ListMcpToolsResult = McpToolResult<ListMcpToolsOutput, ListMcpToolsErrorCode>;

export const mcpListToolsDescriptor = {
  toolId: "mcp.listTools",
  capability: "list-mcp-tools",
  route: "agent_executionEngine.basic_toolLayer.baseTools.mcpBase.tool",
  permissionsRequired: ["mcp:tool:read"],
  defaultDryRun: true,
  unsafeSideEffects: false,
  tapOwnsApproval: true,
  runtimeOwnsMcpClient: true,
  defaultLimit: 100,
  maxLimit: 500,
} as const;

type ValidationFailure = {
  ok: false;
  code: ListMcpToolsErrorCode;
  message: string;
  boundary: "input" | "context" | "scope" | "permission" | "contract" | "governance" | "provider";
  context?: ListMcpToolsContext;
};

type ValidationSuccess = {
  ok: true;
  target: ListMcpToolsTarget;
  context: ListMcpToolsContext;
};

function normalizeContext(value: unknown): ListMcpToolsContext | ValidationFailure {
  if (value === undefined) return {};
  if (!isJsonObject(value)) {
    return { ok: false, code: "INVALID_CONTEXT", message: "mcp.listTools context must be a JSON object.", boundary: "context" };
  }
  const allowedServerIds = cleanStringList(value.allowedServerIds);
  const grantedPermissions = cleanStringList(value.grantedPermissions) as readonly McpListToolsPermission[] | undefined;
  if ((value.allowedServerIds !== undefined && allowedServerIds === undefined) || (value.grantedPermissions !== undefined && grantedPermissions === undefined)) {
    return { ok: false, code: "INVALID_CONTEXT", message: "mcp.listTools context lists must contain strings.", boundary: "context" };
  }
  return {
    runtimeId: optionalTrimmedString(value.runtimeId),
    sessionId: optionalTrimmedString(value.sessionId),
    invocationId: optionalTrimmedString(value.invocationId),
    dryRun: typeof value.dryRun === "boolean" ? value.dryRun : undefined,
    guard: isJsonObject(value.guard) ? value.guard : undefined,
    allowedServerIds,
    grantedPermissions,
    auditMetadata: isJsonObject(value.auditMetadata) ? value.auditMetadata : undefined,
  };
}

function validate(request: unknown): ValidationSuccess | ValidationFailure {
  const root = request === undefined ? {} : request;
  if (!isJsonObject(root)) return { ok: false, code: "INVALID_REQUEST", message: "mcp.listTools request must be a JSON object.", boundary: "input" };
  const context = normalizeContext(root.context);
  if ("ok" in context) return context;
  if (!isJsonObject(root.target)) return { ok: false, code: "MISSING_SERVER_ID", message: "mcp.listTools requires target.serverId.", boundary: "input", context };

  const serverId = optionalTrimmedString(root.target.serverId);
  if (root.target.serverId !== undefined && typeof root.target.serverId !== "string") {
    return { ok: false, code: "INVALID_SERVER_ID", message: "mcp.listTools target.serverId must be a string.", boundary: "input", context };
  }
  if (serverId === undefined) return { ok: false, code: "MISSING_SERVER_ID", message: "mcp.listTools requires target.serverId.", boundary: "input", context };

  const rawLimit = root.target.limit;
  if (rawLimit !== undefined && (typeof rawLimit !== "number" || !Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > mcpListToolsDescriptor.maxLimit)) {
    return { ok: false, code: "INVALID_LIMIT", message: "mcp.listTools target.limit must be an integer from 1 to 500.", boundary: "input", context };
  }
  const limit = rawLimit === undefined ? undefined : rawLimit;
  if (context.allowedServerIds !== undefined && !context.allowedServerIds.includes(serverId)) {
    return { ok: false, code: "SCOPE_REJECTED", message: "mcp.listTools target server is outside the allowed MCP server scope.", boundary: "scope", context };
  }
  if (context.grantedPermissions !== undefined && !context.grantedPermissions.includes("mcp:tool:read")) {
    return { ok: false, code: "PERMISSION_DENIED", message: "mcp.listTools requires mcp:tool:read.", boundary: "permission", context };
  }

  return {
    ok: true,
    target: {
      serverId,
      namespace: optionalTrimmedString(root.target.namespace),
      includeDisabled: root.target.includeDisabled === true,
      cursor: optionalTrimmedString(root.target.cursor),
      limit: limit === undefined ? undefined : limit,
    },
    context,
  };
}

function auditEvent(type: string, dryRun: boolean, context: ListMcpToolsContext): McpToolAuditEvent {
  return {
    type,
    toolId: "mcp.listTools",
    invocationId: context.invocationId ?? "mcp.listTools:dry-run",
    dryRun,
    metadata: { runtimeId: context.runtimeId, sessionId: context.sessionId, ...(context.auditMetadata ?? {}) },
  };
}

function failure(error: ValidationFailure, context: ListMcpToolsContext = {}, event = "basicTool.mcp.listTools.rejected"): ListMcpToolsResult {
  return {
    ok: false,
    toolId: "mcp.listTools",
    error: {
      code: error.code,
      message: error.message,
      boundary: error.boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("mcp.listTools.rejected", context.dryRun !== false, context)],
    events: [event],
  };
}

function output(target: ListMcpToolsTarget, options: { dryRun: boolean; providerCalled: boolean; tools: readonly McpToolDefinition[]; nextCursor?: string; providerMetadata?: Readonly<Record<string, unknown>> }): ListMcpToolsOutput {
  return {
    kind: "agentCore.basicTool.mcp.listTools",
    target,
    toolsPreview: options.tools,
    nextCursor: options.nextCursor,
    providerCalled: options.providerCalled,
    providerMetadata: options.providerMetadata,
    dryRun: options.dryRun,
    executionBlocked: options.dryRun,
    permissionsRequired: mcpListToolsDescriptor.permissionsRequired,
    unsafeSideEffects: false,
  };
}

export function planMcpToolsList(request: unknown = {}): ListMcpToolsResult {
  const normalized = validate(request);
  if (!normalized.ok) return failure(normalized, normalized.context);
  if (normalized.context.dryRun === false) {
    return failure({ ok: false, code: "REAL_EXECUTION_BLOCKED", message: "planMcpToolsList only produces dry-run envelopes.", boundary: "contract", context: normalized.context }, normalized.context);
  }
  return {
    ok: true,
    toolId: "mcp.listTools",
    output: output(normalized.target, { dryRun: true, providerCalled: false, tools: [] }),
    audit: [auditEvent("mcp.listTools.planned", true, normalized.context)],
    events: ["basicTool.mcp.listTools.dryRun"],
  };
}

export async function executeMcpToolsList(request: unknown = {}, provider?: ListMcpToolsProvider): Promise<ListMcpToolsResult> {
  const normalized = validate(request);
  if (!normalized.ok) return failure(normalized, normalized.context);
  if (normalized.context.dryRun !== false) {
    return {
      ok: true,
      toolId: "mcp.listTools",
      output: output(normalized.target, { dryRun: true, providerCalled: false, tools: [] }),
      audit: [auditEvent("mcp.listTools.planned", true, normalized.context)],
      events: ["basicTool.mcp.listTools.dryRun"],
    };
  }
  if (!guardAccepted(normalized.context.guard)) {
    return failure({ ok: false, code: "GOVERNANCE_REJECTED", message: "mcp.listTools requires an accepted runtime guard before real dispatch.", boundary: "governance", context: normalized.context }, normalized.context);
  }
  if (provider === undefined) {
    return failure({ ok: false, code: "PROVIDER_UNAVAILABLE", message: "Runtime MCP listTools provider is unavailable.", boundary: "provider", context: normalized.context }, normalized.context, "basicTool.mcp.listTools.providerUnavailable");
  }
  try {
    const result = await provider(normalized.target, {
      runtimeId: normalized.context.runtimeId,
      sessionId: normalized.context.sessionId,
      invocationId: normalized.context.invocationId,
      auditMetadata: normalized.context.auditMetadata,
    });
    return {
      ok: true,
      toolId: "mcp.listTools",
      output: output(normalized.target, { dryRun: false, providerCalled: true, tools: result.tools, nextCursor: result.nextCursor, providerMetadata: result.providerMetadata }),
      audit: [auditEvent("mcp.listTools.executed", false, normalized.context)],
      events: ["basicTool.mcp.listTools.executed"],
    };
  } catch {
    return failure({ ok: false, code: "PROVIDER_REJECTED", message: "Runtime MCP provider failed listTools.", boundary: "provider", context: normalized.context }, normalized.context, "basicTool.mcp.listTools.providerRejected");
  }
}
