import {
  cleanStringList,
  guardAccepted,
  isJsonObject,
  optionalTrimmedString,
  type McpToolAuditEvent,
  type McpToolResult,
} from "../../_shared/baseToolAdapter.js";

export type McpCachePermission = "mcp:read" | "mcp:write" | "cache:write";
export type McpCacheContext = {
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
  grantedPermissions?: readonly McpCachePermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type McpCacheTarget = {
  serverId: string;
  cacheKey: string;
  valueRef: string;
  ttlSeconds?: number;
  tags: readonly string[];
};

export type McpCacheRequest = {
  target?: Partial<McpCacheTarget> | null;
  context?: McpCacheContext;
};

export type McpCacheProviderRequest = {
  serverId: string;
  cacheKey: string;
  valueRef: string;
  ttlSeconds?: number;
  tags: readonly string[];
};

export type McpCacheProviderResult = {
  cacheKey?: string;
  status: "cached" | "already_cached" | "pending";
  expiresAt?: string;
  providerMetadata?: Readonly<Record<string, unknown>>;
  raw?: unknown;
};

export type McpCacheProvider = (
  request: McpCacheProviderRequest,
  context: Readonly<Record<string, unknown>>,
) => Promise<McpCacheProviderResult> | McpCacheProviderResult;

export type McpCacheEnvelope = {
  serverId: string;
  cacheKey: string;
  valueRef: string;
  ttlSeconds?: number;
  tags: readonly string[];
  state: "planned" | "cached" | "already_cached" | "pending";
  writesCache: boolean;
  expiresAt?: string;
  source: "mockable-envelope" | "runtime-provider";
};

export type McpCacheOutput = {
  kind: "agentCore.basicTool.mcp.cache";
  target: McpCacheTarget;
  dryRun: boolean;
  executionBlocked: boolean;
  providerCalled: boolean;
  permissionsRequired: readonly McpCachePermission[];
  unsafeSideEffects: true;
  acceptedScopes: readonly string[];
  writesCache: boolean;
  cachePlan: {
    serverId: string;
    cacheKey: string;
    valueRef: string;
    ttlSeconds?: number;
    tags: readonly string[];
  };
  cacheEnvelope: McpCacheEnvelope;
  providerMetadata?: Readonly<Record<string, unknown>>;
};

export type McpCacheErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_CONTEXT"
  | "MISSING_SERVER_ID"
  | "INVALID_SERVER_ID"
  | "MISSING_CACHE_KEY"
  | "INVALID_CACHE_KEY"
  | "MISSING_CACHE_VALUE_REF"
  | "INVALID_CACHE_VALUE_REF"
  | "INVALID_CACHE_TTL"
  | "INVALID_TAGS"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "REAL_EXECUTION_BLOCKED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_REJECTED";

export type McpCacheResult = McpToolResult<McpCacheOutput, McpCacheErrorCode>;

export const mcpCacheDescriptor = {
  toolId: "mcp.cache",
  capability: "cache-mcp-data",
  route: "agent_executionEngine.basic_toolLayer.baseTools.mcpBase.cache",
  permissionsRequired: ["mcp:read", "mcp:write", "cache:write"],
  defaultDryRun: true,
  tapOwnsApproval: true,
  runtimeOwnsMcpClient: true,
  permissionsRequiredForCacheWrite: ["mcp:read", "mcp:write", "cache:write"],
  unsafeSideEffects: true,
  providerBoundary: "BaseToolExecutorPort.mcp.cache",
} as const;

type Boundary = "input" | "context" | "scope" | "permission" | "contract" | "governance" | "provider";
type ValidationFailure = {
  ok: false;
  code: McpCacheErrorCode;
  message: string;
  boundary: Boundary;
  context?: McpCacheContext;
};
type ValidationSuccess = {
  ok: true;
  target: McpCacheTarget;
  context: McpCacheContext;
  acceptedScopes: readonly string[];
};

function invalid(value: string): boolean {
  return value.includes("\0");
}

function normalizeContext(value: unknown): McpCacheContext | ValidationFailure {
  if (value === undefined) return {};
  if (!isJsonObject(value)) return { ok: false, code: "INVALID_CONTEXT", message: "mcp.cache context must be a JSON object.", boundary: "context" };
  const allowedServerIds = cleanStringList(value.allowedServerIds);
  const requestedScopes = cleanStringList(value.requestedScopes);
  const allowedScopes = cleanStringList(value.allowedScopes);
  const grantedPermissions = cleanStringList(value.grantedPermissions) as readonly McpCachePermission[] | undefined;
  if (
    (value.allowedServerIds !== undefined && allowedServerIds === undefined) ||
    (value.requestedScopes !== undefined && requestedScopes === undefined) ||
    (value.allowedScopes !== undefined && allowedScopes === undefined) ||
    (value.grantedPermissions !== undefined && grantedPermissions === undefined)
  ) {
    return { ok: false, code: "INVALID_CONTEXT", message: "mcp.cache context lists must contain strings.", boundary: "context" };
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
  if (!isJsonObject(root)) return { ok: false, code: "INVALID_REQUEST", message: "mcp.cache request must be a JSON object.", boundary: "input" };
  const context = normalizeContext(root.context);
  if ("ok" in context) return context;
  if (!isJsonObject(root.target)) return { ok: false, code: "MISSING_SERVER_ID", message: "mcp.cache requires target.serverId.", boundary: "input", context };
  if (root.target.serverId !== undefined && typeof root.target.serverId !== "string") return { ok: false, code: "INVALID_SERVER_ID", message: "mcp.cache target.serverId must be a string.", boundary: "input", context };
  if (root.target.cacheKey !== undefined && typeof root.target.cacheKey !== "string") return { ok: false, code: "INVALID_CACHE_KEY", message: "mcp.cache target.cacheKey must be a string.", boundary: "input", context };
  if (root.target.valueRef !== undefined && typeof root.target.valueRef !== "string") return { ok: false, code: "INVALID_CACHE_VALUE_REF", message: "mcp.cache target.valueRef must be a string.", boundary: "input", context };
  if (root.target.ttlSeconds !== undefined && (typeof root.target.ttlSeconds !== "number" || !Number.isInteger(root.target.ttlSeconds) || root.target.ttlSeconds <= 0)) return { ok: false, code: "INVALID_CACHE_TTL", message: "mcp.cache target.ttlSeconds must be a positive integer when provided.", boundary: "input", context };
  const tags = cleanStringList(root.target.tags);
  if (root.target.tags !== undefined && tags === undefined) return { ok: false, code: "INVALID_TAGS", message: "mcp.cache target.tags must contain strings.", boundary: "input", context };
  const serverId = optionalTrimmedString(root.target.serverId);
  const cacheKey = optionalTrimmedString(root.target.cacheKey);
  const valueRef = optionalTrimmedString(root.target.valueRef);
  if (serverId === undefined) return { ok: false, code: "MISSING_SERVER_ID", message: "mcp.cache requires target.serverId.", boundary: "input", context };
  if (cacheKey === undefined) return { ok: false, code: "MISSING_CACHE_KEY", message: "mcp.cache requires target.cacheKey.", boundary: "input", context };
  if (cacheKey.length > 256 || invalid(cacheKey)) return { ok: false, code: "INVALID_CACHE_KEY", message: "mcp.cache target.cacheKey must be non-binary and at most 256 characters.", boundary: "input", context };
  if (valueRef === undefined) return { ok: false, code: "MISSING_CACHE_VALUE_REF", message: "mcp.cache requires target.valueRef instead of embedded cache data.", boundary: "input", context };
  if (valueRef.length > 1024 || invalid(valueRef)) return { ok: false, code: "INVALID_CACHE_VALUE_REF", message: "mcp.cache target.valueRef must be non-binary and at most 1024 characters.", boundary: "input", context };
  if (context.allowedServerIds !== undefined && !context.allowedServerIds.includes(serverId)) return { ok: false, code: "SCOPE_REJECTED", message: "mcp.cache target server is outside allowed MCP server ids.", boundary: "scope", context };
  const requested = context.requestedScopes ?? [];
  const allowed = context.allowedScopes ?? [];
  if (requested.length > 0 && allowed.length > 0 && requested.some((scope) => !allowed.includes(scope))) return { ok: false, code: "SCOPE_REJECTED", message: "mcp.cache requested scope is outside runtime governance.", boundary: "scope", context };
  const missing = context.grantedPermissions === undefined ? [] : mcpCacheDescriptor.permissionsRequired.filter((permission) => !context.grantedPermissions?.includes(permission));
  if (missing.length > 0) return { ok: false, code: "PERMISSION_DENIED", message: `mcp.cache is missing permissions: ${missing.join(", ")}`, boundary: "permission", context };
  return {
    ok: true,
    target: { serverId, cacheKey, valueRef, ttlSeconds: root.target.ttlSeconds as number | undefined, tags: tags ?? [] },
    context,
    acceptedScopes: requested,
  };
}

function auditEvent(type: string, dryRun: boolean, context: McpCacheContext): McpToolAuditEvent {
  return { type, toolId: "mcp.cache", invocationId: context.invocationId ?? "mcp.cache:dry-run", dryRun, metadata: { runtimeId: context.runtimeId, sessionId: context.sessionId, ...(context.auditMetadata ?? {}) } };
}

function failure(error: ValidationFailure, context: McpCacheContext = {}, event = "basicTool.mcp.cache.rejected"): McpCacheResult {
  return { ok: false, toolId: "mcp.cache", error: { code: error.code, message: error.message, boundary: error.boundary, publicSafe: true, safeForRuntimeInspection: true, internalDetailExposed: false }, audit: [auditEvent("mcp.cache.rejected", context.dryRun !== false, context)], events: [event] };
}

function policyFailure(context: McpCacheContext): ValidationFailure | undefined {
  if (context.contract?.accepted === false) return { ok: false, code: "CONTRACT_REJECTED", message: context.contract.reason ?? "mcp.cache was rejected by runtime contract surface.", boundary: "contract", context };
  if (context.governance?.accepted === false) return { ok: false, code: "GOVERNANCE_REJECTED", message: context.governance.reason ?? "mcp.cache was rejected by runtime governance.", boundary: "governance", context };
  return undefined;
}

function envelope(target: McpCacheTarget, result?: McpCacheProviderResult): McpCacheEnvelope {
  return {
    serverId: target.serverId,
    cacheKey: result?.cacheKey ?? target.cacheKey,
    valueRef: target.valueRef,
    ttlSeconds: target.ttlSeconds,
    tags: target.tags,
    state: result?.status ?? "planned",
    writesCache: result !== undefined,
    expiresAt: result?.expiresAt,
    source: result === undefined ? "mockable-envelope" : "runtime-provider",
  };
}

function output(normalized: ValidationSuccess, options: { dryRun: boolean; providerCalled: boolean; result?: McpCacheProviderResult }): McpCacheOutput {
  return {
    kind: "agentCore.basicTool.mcp.cache",
    target: normalized.target,
    dryRun: options.dryRun,
    executionBlocked: options.dryRun,
    providerCalled: options.providerCalled,
    permissionsRequired: mcpCacheDescriptor.permissionsRequired,
    unsafeSideEffects: true,
    acceptedScopes: normalized.acceptedScopes,
    writesCache: options.result !== undefined,
    cachePlan: {
      serverId: normalized.target.serverId,
      cacheKey: normalized.target.cacheKey,
      valueRef: normalized.target.valueRef,
      ttlSeconds: normalized.target.ttlSeconds,
      tags: normalized.target.tags,
    },
    cacheEnvelope: envelope(normalized.target, options.result),
    providerMetadata: options.result?.providerMetadata,
  };
}

export function planMcpCache(request: unknown = {}): McpCacheResult {
  const normalized = validate(request);
  if (!normalized.ok) return failure(normalized, normalized.context);
  const blocked = policyFailure(normalized.context);
  if (blocked !== undefined) return failure(blocked, normalized.context);
  if (normalized.context.dryRun === false) return failure({ ok: false, code: "REAL_EXECUTION_BLOCKED", message: "planMcpCache only produces dry-run envelopes.", boundary: "contract", context: normalized.context }, normalized.context);
  return { ok: true, toolId: "mcp.cache", output: output(normalized, { dryRun: true, providerCalled: false }), audit: [auditEvent("mcp.cache.planned", true, normalized.context)], events: ["basicTool.mcp.cache.dryRun"] };
}

export async function executeMcpCache(request: unknown = {}, provider?: McpCacheProvider): Promise<McpCacheResult> {
  const normalized = validate(request);
  if (!normalized.ok) return failure(normalized, normalized.context);
  const blocked = policyFailure(normalized.context);
  if (blocked !== undefined) return failure(blocked, normalized.context);
  if (normalized.context.dryRun !== false) return { ok: true, toolId: "mcp.cache", output: output(normalized, { dryRun: true, providerCalled: false }), audit: [auditEvent("mcp.cache.planned", true, normalized.context)], events: ["basicTool.mcp.cache.dryRun"] };
  if (!guardAccepted(normalized.context.guard)) return failure({ ok: false, code: "GOVERNANCE_REJECTED", message: "mcp.cache requires an accepted runtime guard before real dispatch.", boundary: "governance", context: normalized.context }, normalized.context);
  if (provider === undefined) return failure({ ok: false, code: "PROVIDER_UNAVAILABLE", message: "Runtime MCP cache provider is unavailable.", boundary: "provider", context: normalized.context }, normalized.context, "basicTool.mcp.cache.providerUnavailable");
  try {
    const result = await provider(normalized.target, { runtimeId: normalized.context.runtimeId, sessionId: normalized.context.sessionId, invocationId: normalized.context.invocationId, auditMetadata: normalized.context.auditMetadata });
    return { ok: true, toolId: "mcp.cache", output: output(normalized, { dryRun: false, providerCalled: true, result }), audit: [auditEvent("mcp.cache.executed", false, normalized.context)], events: ["basicTool.mcp.cache.executed"] };
  } catch {
    return failure({ ok: false, code: "PROVIDER_REJECTED", message: "Runtime MCP provider failed cache write.", boundary: "provider", context: normalized.context }, normalized.context, "basicTool.mcp.cache.providerRejected");
  }
}
