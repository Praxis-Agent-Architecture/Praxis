import {
  cleanStringList,
  guardAccepted,
  isJsonObject,
  optionalTrimmedString,
  type McpToolAuditEvent,
  type McpToolResult,
} from "../../_shared/baseToolAdapter.js";

export type McpCreateResourcePermission = "mcp:connection:read" | "mcp:resource:create";
export type McpCreateResourceContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: { accepted?: boolean; allowed?: boolean; reason?: string };
  contract?: { accepted?: boolean; reason?: string };
  governance?: { accepted?: boolean; reason?: string };
  allowedServerIds?: readonly string[];
  allowedUriPrefixes?: readonly string[];
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
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
  target?: Partial<McpCreateResourceTarget> | null;
  initialContent?: unknown;
  metadata?: Readonly<Record<string, unknown>>;
  context?: McpCreateResourceContext;
};

export type McpCreateResourceProviderRequest = {
  serverId: string;
  uri: string;
  resourceType?: string;
  mimeType?: string;
  initialContent?: unknown;
  metadata?: Readonly<Record<string, unknown>>;
};

export type McpCreateResourceProviderResult = {
  uri?: string;
  status: "created" | "already_exists" | "pending";
  revision?: string;
  providerMetadata?: Readonly<Record<string, unknown>>;
  raw?: unknown;
};

export type McpCreateResourceProvider = (
  request: McpCreateResourceProviderRequest,
  context: Readonly<Record<string, unknown>>,
) => Promise<McpCreateResourceProviderResult> | McpCreateResourceProviderResult;

export type McpCreateResourceEnvelope = {
  uri: string;
  state: "planned" | "created" | "already_exists" | "pending";
  created: boolean;
  contentAccepted: boolean;
  metadataKeys: readonly string[];
  revision?: string;
  source: "mockable-envelope" | "runtime-provider";
};

export type McpCreateResourceOutput = {
  kind: "agentCore.basicTool.mcp.createResource";
  target: McpCreateResourceTarget;
  dryRun: boolean;
  executionBlocked: boolean;
  providerCalled: boolean;
  permissionsRequired: readonly McpCreateResourcePermission[];
  unsafeSideEffects: true;
  acceptedScopes: readonly string[];
  resourceEnvelope: McpCreateResourceEnvelope;
  providerMetadata?: Readonly<Record<string, unknown>>;
};

export type McpCreateResourceErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_CONTEXT"
  | "MISSING_SERVER_ID"
  | "INVALID_SERVER_ID"
  | "MISSING_RESOURCE_URI"
  | "INVALID_RESOURCE_URI"
  | "INVALID_TARGET"
  | "INVALID_METADATA"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "REAL_EXECUTION_BLOCKED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_REJECTED";

export type McpCreateResourceResult = McpToolResult<McpCreateResourceOutput, McpCreateResourceErrorCode>;

export const mcpCreateResourceDescriptor = {
  toolId: "mcp.createResource",
  capability: "create-resource",
  route: "agent_executionEngine.basic_toolLayer.baseTools.mcpBase.resource",
  defaultDryRun: true,
  tapOwnsApproval: true,
  runtimeOwnsMcpClient: true,
  permissionsRequired: ["mcp:connection:read", "mcp:resource:create"],
  unsafeSideEffects: true,
  providerBoundary: "BaseToolExecutorPort.mcp.createResource",
} as const;

type Boundary = "input" | "context" | "scope" | "permission" | "contract" | "governance" | "provider";
type ValidationFailure = { ok: false; code: McpCreateResourceErrorCode; message: string; boundary: Boundary; context?: McpCreateResourceContext };
type ValidationSuccess = {
  ok: true;
  target: McpCreateResourceTarget;
  initialContent?: unknown;
  metadata?: Readonly<Record<string, unknown>>;
  context: McpCreateResourceContext;
  acceptedScopes: readonly string[];
};

function uriMatchesAllowedPrefix(uri: string, prefix: string): boolean {
  return uri === prefix || uri.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`);
}

function normalizeContext(value: unknown): McpCreateResourceContext | ValidationFailure {
  if (value === undefined) return {};
  if (!isJsonObject(value)) return { ok: false, code: "INVALID_CONTEXT", message: "mcp.createResource context must be a JSON object.", boundary: "context" };
  const allowedServerIds = cleanStringList(value.allowedServerIds);
  const allowedUriPrefixes = cleanStringList(value.allowedUriPrefixes);
  const requestedScopes = cleanStringList(value.requestedScopes);
  const allowedScopes = cleanStringList(value.allowedScopes);
  const grantedPermissions = cleanStringList(value.grantedPermissions) as readonly McpCreateResourcePermission[] | undefined;
  if (
    (value.allowedServerIds !== undefined && allowedServerIds === undefined) ||
    (value.allowedUriPrefixes !== undefined && allowedUriPrefixes === undefined) ||
    (value.requestedScopes !== undefined && requestedScopes === undefined) ||
    (value.allowedScopes !== undefined && allowedScopes === undefined) ||
    (value.grantedPermissions !== undefined && grantedPermissions === undefined)
  ) {
    return { ok: false, code: "INVALID_CONTEXT", message: "mcp.createResource context lists must contain strings.", boundary: "context" };
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
    allowedUriPrefixes,
    requestedScopes,
    allowedScopes,
    grantedPermissions,
    auditMetadata: isJsonObject(value.auditMetadata) ? value.auditMetadata : undefined,
  };
}

function validate(request: unknown): ValidationSuccess | ValidationFailure {
  const root = request === undefined ? {} : request;
  if (!isJsonObject(root)) return { ok: false, code: "INVALID_REQUEST", message: "mcp.createResource request must be a JSON object.", boundary: "input" };
  const context = normalizeContext(root.context);
  if ("ok" in context) return context;
  if (!isJsonObject(root.target)) return { ok: false, code: "MISSING_SERVER_ID", message: "mcp.createResource requires target.serverId.", boundary: "input", context };
  if (root.target.serverId !== undefined && typeof root.target.serverId !== "string") return { ok: false, code: "INVALID_SERVER_ID", message: "mcp.createResource target.serverId must be a string.", boundary: "input", context };
  if (root.target.uri !== undefined && typeof root.target.uri !== "string") return { ok: false, code: "INVALID_RESOURCE_URI", message: "mcp.createResource target.uri must be a string.", boundary: "input", context };
  if (root.metadata !== undefined && !isJsonObject(root.metadata)) return { ok: false, code: "INVALID_METADATA", message: "mcp.createResource metadata must be a JSON object.", boundary: "input", context };
  const serverId = optionalTrimmedString(root.target.serverId);
  const uri = optionalTrimmedString(root.target.uri);
  if (serverId === undefined) return { ok: false, code: "MISSING_SERVER_ID", message: "mcp.createResource requires target.serverId.", boundary: "input", context };
  if (uri === undefined) return { ok: false, code: "MISSING_RESOURCE_URI", message: "mcp.createResource requires target.uri.", boundary: "input", context };
  if (context.allowedServerIds !== undefined && !context.allowedServerIds.includes(serverId)) return { ok: false, code: "SCOPE_REJECTED", message: "mcp.createResource target server is outside allowed MCP server ids.", boundary: "scope", context };
  if (context.allowedUriPrefixes !== undefined && !context.allowedUriPrefixes.some((prefix) => uriMatchesAllowedPrefix(uri, prefix))) return { ok: false, code: "SCOPE_REJECTED", message: "mcp.createResource target uri is outside allowed resource prefixes.", boundary: "scope", context };
  const requested = context.requestedScopes ?? [];
  const allowed = context.allowedScopes ?? [];
  if (requested.length > 0 && allowed.length > 0 && requested.some((scope) => !allowed.includes(scope))) return { ok: false, code: "SCOPE_REJECTED", message: "mcp.createResource requested scope is outside runtime governance.", boundary: "scope", context };
  const missing = context.grantedPermissions === undefined ? [] : mcpCreateResourceDescriptor.permissionsRequired.filter((permission) => !context.grantedPermissions?.includes(permission));
  if (missing.length > 0) return { ok: false, code: "PERMISSION_DENIED", message: `mcp.createResource is missing permissions: ${missing.join(", ")}`, boundary: "permission", context };
  return {
    ok: true,
    target: {
      serverId,
      uri,
      resourceType: optionalTrimmedString(root.target.resourceType),
      mimeType: optionalTrimmedString(root.target.mimeType),
    },
    initialContent: root.initialContent,
    metadata: isJsonObject(root.metadata) ? root.metadata : undefined,
    context,
    acceptedScopes: requested,
  };
}

function auditEvent(type: string, dryRun: boolean, context: McpCreateResourceContext): McpToolAuditEvent {
  return { type, toolId: "mcp.createResource", invocationId: context.invocationId ?? "mcp.createResource:dry-run", dryRun, metadata: { runtimeId: context.runtimeId, sessionId: context.sessionId, ...(context.auditMetadata ?? {}) } };
}

function failure(error: ValidationFailure, context: McpCreateResourceContext = {}, event = "basicTool.mcp.createResource.rejected"): McpCreateResourceResult {
  return { ok: false, toolId: "mcp.createResource", error: { code: error.code, message: error.message, boundary: error.boundary, publicSafe: true, safeForRuntimeInspection: true, internalDetailExposed: false }, audit: [auditEvent("mcp.createResource.rejected", context.dryRun !== false, context)], events: [event] };
}

function policyFailure(context: McpCreateResourceContext): ValidationFailure | undefined {
  if (context.contract?.accepted === false) return { ok: false, code: "CONTRACT_REJECTED", message: context.contract.reason ?? "mcp.createResource was rejected by runtime contract surface.", boundary: "contract", context };
  if (context.governance?.accepted === false) return { ok: false, code: "GOVERNANCE_REJECTED", message: context.governance.reason ?? "mcp.createResource was rejected by runtime governance.", boundary: "governance", context };
  return undefined;
}

function envelope(uri: string, metadata: Readonly<Record<string, unknown>> | undefined, hasInitialContent: boolean, result?: McpCreateResourceProviderResult): McpCreateResourceEnvelope {
  return {
    uri: result?.uri ?? uri,
    state: result?.status ?? "planned",
    created: result?.status === "created",
    contentAccepted: hasInitialContent,
    metadataKeys: Object.keys(metadata ?? {}).sort(),
    revision: result?.revision,
    source: result === undefined ? "mockable-envelope" : "runtime-provider",
  };
}

function output(normalized: ValidationSuccess, options: { dryRun: boolean; providerCalled: boolean; result?: McpCreateResourceProviderResult }): McpCreateResourceOutput {
  return {
    kind: "agentCore.basicTool.mcp.createResource",
    target: normalized.target,
    dryRun: options.dryRun,
    executionBlocked: options.dryRun,
    providerCalled: options.providerCalled,
    permissionsRequired: mcpCreateResourceDescriptor.permissionsRequired,
    unsafeSideEffects: true,
    acceptedScopes: normalized.acceptedScopes,
    resourceEnvelope: envelope(normalized.target.uri, normalized.metadata, normalized.initialContent !== undefined, options.result),
    providerMetadata: options.result?.providerMetadata,
  };
}

export function planMcpCreateResource(request: unknown = {}): McpCreateResourceResult {
  const normalized = validate(request);
  if (!normalized.ok) return failure(normalized, normalized.context);
  const blocked = policyFailure(normalized.context);
  if (blocked !== undefined) return failure(blocked, normalized.context);
  if (normalized.context.dryRun === false) return failure({ ok: false, code: "REAL_EXECUTION_BLOCKED", message: "planMcpCreateResource only produces dry-run envelopes.", boundary: "contract", context: normalized.context }, normalized.context);
  return { ok: true, toolId: "mcp.createResource", output: output(normalized, { dryRun: true, providerCalled: false }), audit: [auditEvent("mcp.createResource.planned", true, normalized.context)], events: ["basicTool.mcp.createResource.dryRun"] };
}

export async function executeMcpCreateResource(request: unknown = {}, provider?: McpCreateResourceProvider): Promise<McpCreateResourceResult> {
  const normalized = validate(request);
  if (!normalized.ok) return failure(normalized, normalized.context);
  const blocked = policyFailure(normalized.context);
  if (blocked !== undefined) return failure(blocked, normalized.context);
  if (normalized.context.dryRun !== false) return { ok: true, toolId: "mcp.createResource", output: output(normalized, { dryRun: true, providerCalled: false }), audit: [auditEvent("mcp.createResource.planned", true, normalized.context)], events: ["basicTool.mcp.createResource.dryRun"] };
  if (!guardAccepted(normalized.context.guard)) return failure({ ok: false, code: "GOVERNANCE_REJECTED", message: "mcp.createResource requires an accepted runtime guard before real dispatch.", boundary: "governance", context: normalized.context }, normalized.context);
  if (provider === undefined) return failure({ ok: false, code: "PROVIDER_UNAVAILABLE", message: "Runtime MCP createResource provider is unavailable.", boundary: "provider", context: normalized.context }, normalized.context, "basicTool.mcp.createResource.providerUnavailable");
  try {
    const result = await provider({ ...normalized.target, initialContent: normalized.initialContent, metadata: normalized.metadata }, { runtimeId: normalized.context.runtimeId, sessionId: normalized.context.sessionId, invocationId: normalized.context.invocationId, auditMetadata: normalized.context.auditMetadata });
    return { ok: true, toolId: "mcp.createResource", output: output(normalized, { dryRun: false, providerCalled: true, result }), audit: [auditEvent("mcp.createResource.executed", false, normalized.context)], events: ["basicTool.mcp.createResource.executed"] };
  } catch {
    return failure({ ok: false, code: "PROVIDER_REJECTED", message: "Runtime MCP provider failed createResource.", boundary: "provider", context: normalized.context }, normalized.context, "basicTool.mcp.createResource.providerRejected");
  }
}
