import {
  cleanStringList,
  guardAccepted,
  isJsonObject,
  optionalTrimmedString,
  type McpToolAuditEvent,
  type McpToolResult,
} from "../../_shared/baseToolAdapter.js";

export type McpInvalidateCacheScope = "server" | "resources" | "tools" | "all";
export type McpInvalidateCachePermission = "mcp:cache:invalidate";
export type McpInvalidateCacheContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: { accepted?: boolean; allowed?: boolean; reason?: string };
  contract?: { accepted?: boolean; reason?: string };
  governance?: { accepted?: boolean; reason?: string };
  allowedServerIds?: readonly string[];
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  grantedPermissions?: readonly McpInvalidateCachePermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type McpInvalidateCacheTarget = {
  serverId: string;
  scope: McpInvalidateCacheScope;
  cacheKey?: string;
  reason?: string;
};

export type McpInvalidateCacheRequest = {
  target?: Partial<McpInvalidateCacheTarget> | null;
  context?: McpInvalidateCacheContext;
};

export type McpInvalidateCacheProviderRequest = McpInvalidateCacheTarget;

export type McpInvalidateCacheProviderResult = {
  scope?: McpInvalidateCacheScope;
  cacheKey?: string;
  status: "invalidated" | "not_found" | "pending";
  invalidatedCount?: number;
  providerMetadata?: Readonly<Record<string, unknown>>;
  raw?: unknown;
};

export type McpInvalidateCacheProvider = (
  request: McpInvalidateCacheProviderRequest,
  context: Readonly<Record<string, unknown>>,
) => Promise<McpInvalidateCacheProviderResult> | McpInvalidateCacheProviderResult;

export type McpCacheInvalidationEnvelope = {
  serverId: string;
  scope: McpInvalidateCacheScope;
  cacheKey?: string;
  reason?: string;
  invalidationState: "planned" | "invalidated" | "not_found" | "pending";
  state: "planned" | "invalidated" | "not_found" | "pending";
  invalidatedCount?: number;
  source: "mockable-envelope" | "runtime-provider";
};

export type McpInvalidateCacheOutput = {
  kind: "agentCore.basicTool.mcp.invalidateCache";
  target: McpInvalidateCacheTarget;
  operationPreview: McpCacheInvalidationEnvelope;
  dryRun: boolean;
  executionBlocked: boolean;
  providerCalled: boolean;
  permissionsRequired: readonly McpInvalidateCachePermission[];
  unsafeSideEffects: true;
  acceptedScopes: readonly string[];
  providerMetadata?: Readonly<Record<string, unknown>>;
};

export type McpInvalidateCacheErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_CONTEXT"
  | "MISSING_SERVER_ID"
  | "INVALID_SERVER_ID"
  | "MISSING_SCOPE"
  | "INVALID_SCOPE"
  | "INVALID_CACHE_KEY"
  | "INVALID_REASON"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "REAL_EXECUTION_BLOCKED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_REJECTED";

export type McpInvalidateCacheResult = McpToolResult<McpInvalidateCacheOutput, McpInvalidateCacheErrorCode>;

export const mcpInvalidateCacheDescriptor = {
  toolId: "mcp.invalidateCache",
  capability: "invalidate-mcp-cache",
  route: "agent_executionEngine.basic_toolLayer.baseTools.mcpBase.cache",
  defaultDryRun: true,
  tapOwnsApproval: true,
  runtimeOwnsMcpClient: true,
  permissionsRequired: ["mcp:cache:invalidate"],
  unsafeSideEffects: true,
  providerBoundary: "BaseToolExecutorPort.mcp.invalidateCache",
} as const;

type Boundary = "input" | "context" | "scope" | "permission" | "contract" | "governance" | "provider";
type ValidationFailure = {
  ok: false;
  code: McpInvalidateCacheErrorCode;
  message: string;
  boundary: Boundary;
  context?: McpInvalidateCacheContext;
};
type ValidationSuccess = {
  ok: true;
  target: McpInvalidateCacheTarget;
  context: McpInvalidateCacheContext;
  acceptedScopes: readonly string[];
};

function isInvalidateScope(value: string): value is McpInvalidateCacheScope {
  return value === "server" || value === "resources" || value === "tools" || value === "all";
}

function normalizeContext(value: unknown): McpInvalidateCacheContext | ValidationFailure {
  if (value === undefined) return {};
  if (!isJsonObject(value)) return { ok: false, code: "INVALID_CONTEXT", message: "mcp.invalidateCache context must be a JSON object.", boundary: "context" };
  const allowedServerIds = cleanStringList(value.allowedServerIds);
  const requestedScopes = cleanStringList(value.requestedScopes);
  const allowedScopes = cleanStringList(value.allowedScopes);
  const grantedPermissions = cleanStringList(value.grantedPermissions) as readonly McpInvalidateCachePermission[] | undefined;
  if (
    (value.allowedServerIds !== undefined && allowedServerIds === undefined) ||
    (value.requestedScopes !== undefined && requestedScopes === undefined) ||
    (value.allowedScopes !== undefined && allowedScopes === undefined) ||
    (value.grantedPermissions !== undefined && grantedPermissions === undefined)
  ) {
    return { ok: false, code: "INVALID_CONTEXT", message: "mcp.invalidateCache context lists must contain strings.", boundary: "context" };
  }
  return {
    runtimeId: optionalTrimmedString(value.runtimeId),
    sessionId: optionalTrimmedString(value.sessionId),
    invocationId: optionalTrimmedString(value.invocationId),
    dryRun: typeof value.dryRun === "boolean" ? value.dryRun : undefined,
    guard: isJsonObject(value.guard) ? value.guard : undefined,
    contract: isJsonObject(value.contract) ? value.contract : undefined,
    governance: isJsonObject(value.governance) ? value.governance : undefined,
    allowedServerIds,
    requestedScopes,
    allowedScopes,
    grantedPermissions,
    auditMetadata: isJsonObject(value.auditMetadata) ? value.auditMetadata : undefined,
  };
}

function validate(request: unknown): ValidationSuccess | ValidationFailure {
  const root = request === undefined ? {} : request;
  if (!isJsonObject(root)) return { ok: false, code: "INVALID_REQUEST", message: "mcp.invalidateCache request must be a JSON object.", boundary: "input" };
  const context = normalizeContext(root.context);
  if ("ok" in context) return context;
  if (!isJsonObject(root.target)) return { ok: false, code: "MISSING_SERVER_ID", message: "mcp.invalidateCache requires target.serverId.", boundary: "input", context };
  if (root.target.serverId !== undefined && typeof root.target.serverId !== "string") return { ok: false, code: "INVALID_SERVER_ID", message: "mcp.invalidateCache target.serverId must be a string.", boundary: "input", context };
  if (root.target.scope !== undefined && typeof root.target.scope !== "string") return { ok: false, code: "INVALID_SCOPE", message: "mcp.invalidateCache target.scope must be a string.", boundary: "input", context };
  if (root.target.cacheKey !== undefined && typeof root.target.cacheKey !== "string") return { ok: false, code: "INVALID_CACHE_KEY", message: "mcp.invalidateCache target.cacheKey must be a string.", boundary: "input", context };
  if (root.target.reason !== undefined && typeof root.target.reason !== "string") return { ok: false, code: "INVALID_REASON", message: "mcp.invalidateCache target.reason must be a string.", boundary: "input", context };
  const serverId = optionalTrimmedString(root.target.serverId);
  const scopeRaw = optionalTrimmedString(root.target.scope);
  const cacheKey = optionalTrimmedString(root.target.cacheKey);
  const reason = optionalTrimmedString(root.target.reason);
  if (serverId === undefined) return { ok: false, code: "MISSING_SERVER_ID", message: "mcp.invalidateCache requires target.serverId.", boundary: "input", context };
  if (scopeRaw === undefined) return { ok: false, code: "MISSING_SCOPE", message: "mcp.invalidateCache requires target.scope.", boundary: "input", context };
  if (!isInvalidateScope(scopeRaw)) return { ok: false, code: "INVALID_SCOPE", message: "mcp.invalidateCache target.scope must be server, resources, tools, or all.", boundary: "input", context };
  if (cacheKey !== undefined && (cacheKey.length > 256 || cacheKey.includes("\0"))) return { ok: false, code: "INVALID_CACHE_KEY", message: "mcp.invalidateCache target.cacheKey must be non-binary and at most 256 characters.", boundary: "input", context };
  if (reason !== undefined && reason.length > 256) return { ok: false, code: "INVALID_REASON", message: "mcp.invalidateCache target.reason must be at most 256 characters.", boundary: "input", context };
  if (context.allowedServerIds !== undefined && !context.allowedServerIds.includes(serverId)) return { ok: false, code: "SCOPE_REJECTED", message: "mcp.invalidateCache target server is outside allowed MCP server ids.", boundary: "scope", context };
  const requested = context.requestedScopes ?? [];
  const allowed = context.allowedScopes ?? [];
  if (requested.length > 0 && allowed.length > 0 && requested.some((scope) => !allowed.includes(scope))) return { ok: false, code: "SCOPE_REJECTED", message: "mcp.invalidateCache requested scope is outside runtime governance.", boundary: "scope", context };
  const missing = context.grantedPermissions === undefined ? [] : mcpInvalidateCacheDescriptor.permissionsRequired.filter((permission) => !context.grantedPermissions?.includes(permission));
  if (missing.length > 0) return { ok: false, code: "PERMISSION_DENIED", message: `mcp.invalidateCache is missing permissions: ${missing.join(", ")}`, boundary: "permission", context };
  return { ok: true, target: { serverId, scope: scopeRaw, cacheKey, reason }, context, acceptedScopes: requested };
}

function auditEvent(type: string, dryRun: boolean, context: McpInvalidateCacheContext): McpToolAuditEvent {
  return { type, toolId: "mcp.invalidateCache", invocationId: context.invocationId ?? "mcp.invalidateCache:dry-run", dryRun, metadata: { runtimeId: context.runtimeId, sessionId: context.sessionId, ...(context.auditMetadata ?? {}) } };
}

function failure(error: ValidationFailure, context: McpInvalidateCacheContext = {}, event = "basicTool.mcp.invalidateCache.rejected"): McpInvalidateCacheResult {
  return { ok: false, toolId: "mcp.invalidateCache", error: { code: error.code, message: error.message, boundary: error.boundary, publicSafe: true, safeForRuntimeInspection: true, internalDetailExposed: false }, audit: [auditEvent("mcp.invalidateCache.rejected", context.dryRun !== false, context)], events: [event] };
}

function policyFailure(context: McpInvalidateCacheContext): ValidationFailure | undefined {
  if (context.contract?.accepted === false) return { ok: false, code: "CONTRACT_REJECTED", message: context.contract.reason ?? "mcp.invalidateCache was rejected by runtime contract surface.", boundary: "contract", context };
  if (context.governance?.accepted === false) return { ok: false, code: "GOVERNANCE_REJECTED", message: context.governance.reason ?? "mcp.invalidateCache was rejected by runtime governance.", boundary: "governance", context };
  return undefined;
}

function envelope(target: McpInvalidateCacheTarget, result?: McpInvalidateCacheProviderResult): McpCacheInvalidationEnvelope {
  return {
    serverId: target.serverId,
    scope: result?.scope ?? target.scope,
    cacheKey: result?.cacheKey ?? target.cacheKey,
    reason: target.reason,
    invalidationState: result?.status ?? "planned",
    state: result?.status ?? "planned",
    invalidatedCount: result?.invalidatedCount,
    source: result === undefined ? "mockable-envelope" : "runtime-provider",
  };
}

function output(normalized: ValidationSuccess, options: { dryRun: boolean; providerCalled: boolean; result?: McpInvalidateCacheProviderResult }): McpInvalidateCacheOutput {
  return {
    kind: "agentCore.basicTool.mcp.invalidateCache",
    target: normalized.target,
    operationPreview: envelope(normalized.target, options.result),
    dryRun: options.dryRun,
    executionBlocked: options.dryRun,
    providerCalled: options.providerCalled,
    permissionsRequired: mcpInvalidateCacheDescriptor.permissionsRequired,
    unsafeSideEffects: true,
    acceptedScopes: normalized.acceptedScopes,
    providerMetadata: options.result?.providerMetadata,
  };
}

export function planMcpCacheInvalidation(request: unknown = {}): McpInvalidateCacheResult {
  const normalized = validate(request);
  if (!normalized.ok) return failure(normalized, normalized.context);
  const blocked = policyFailure(normalized.context);
  if (blocked !== undefined) return failure(blocked, normalized.context);
  if (normalized.context.dryRun === false) return failure({ ok: false, code: "REAL_EXECUTION_BLOCKED", message: "planMcpCacheInvalidation only produces dry-run envelopes.", boundary: "contract", context: normalized.context }, normalized.context);
  return { ok: true, toolId: "mcp.invalidateCache", output: output(normalized, { dryRun: true, providerCalled: false }), audit: [auditEvent("mcp.invalidateCache.planned", true, normalized.context)], events: ["basicTool.mcp.invalidateCache.dryRun"] };
}

export async function executeMcpCacheInvalidation(request: unknown = {}, provider?: McpInvalidateCacheProvider): Promise<McpInvalidateCacheResult> {
  const normalized = validate(request);
  if (!normalized.ok) return failure(normalized, normalized.context);
  const blocked = policyFailure(normalized.context);
  if (blocked !== undefined) return failure(blocked, normalized.context);
  if (normalized.context.dryRun !== false) return { ok: true, toolId: "mcp.invalidateCache", output: output(normalized, { dryRun: true, providerCalled: false }), audit: [auditEvent("mcp.invalidateCache.planned", true, normalized.context)], events: ["basicTool.mcp.invalidateCache.dryRun"] };
  if (!guardAccepted(normalized.context.guard)) return failure({ ok: false, code: "GOVERNANCE_REJECTED", message: "mcp.invalidateCache requires an accepted runtime guard before real dispatch.", boundary: "governance", context: normalized.context }, normalized.context);
  if (provider === undefined) return failure({ ok: false, code: "PROVIDER_UNAVAILABLE", message: "Runtime MCP cache invalidation provider is unavailable.", boundary: "provider", context: normalized.context }, normalized.context, "basicTool.mcp.invalidateCache.providerUnavailable");
  try {
    const result = await provider(normalized.target, { runtimeId: normalized.context.runtimeId, sessionId: normalized.context.sessionId, invocationId: normalized.context.invocationId, auditMetadata: normalized.context.auditMetadata });
    return { ok: true, toolId: "mcp.invalidateCache", output: output(normalized, { dryRun: false, providerCalled: true, result }), audit: [auditEvent("mcp.invalidateCache.executed", false, normalized.context)], events: ["basicTool.mcp.invalidateCache.executed"] };
  } catch {
    return failure({ ok: false, code: "PROVIDER_REJECTED", message: "Runtime MCP provider failed cache invalidation.", boundary: "provider", context: normalized.context }, normalized.context, "basicTool.mcp.invalidateCache.providerRejected");
  }
}
