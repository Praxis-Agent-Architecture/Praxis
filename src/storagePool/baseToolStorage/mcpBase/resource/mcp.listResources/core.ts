import { cleanStringList, guardAccepted, isJsonObject, optionalTrimmedString, type McpToolAuditEvent, type McpToolResult } from "../../_shared/baseToolAdapter.js";

export type McpListResourcesPermission = "mcp:connection:read" | "mcp:resource:list";
export type McpListedResourceEnvelope = { uri: string; name?: string; mimeType?: string; raw?: unknown };
export type McpListResourcesEnvelope = { resources: readonly McpListedResourceEnvelope[]; nextCursor?: string; exhausted: boolean };
export type McpListResourcesContext = { runtimeId?: string; sessionId?: string; invocationId?: string; dryRun?: boolean; guard?: { accepted?: boolean; allowed?: boolean; reason?: string }; allowedServerIds?: readonly string[]; allowedUriPrefixes?: readonly string[]; grantedPermissions?: readonly McpListResourcesPermission[]; auditMetadata?: Readonly<Record<string, unknown>> };
export type McpListResourcesTarget = { serverId: string; uriPrefix?: string; cursor?: string; limit?: number };
export type McpListResourcesRequest = { target?: Partial<McpListResourcesTarget> | null; context?: McpListResourcesContext };
export type McpListResourcesProviderResult = McpListResourcesEnvelope & { providerMetadata?: Readonly<Record<string, unknown>>; raw?: unknown };
export type McpListResourcesProvider = (request: McpListResourcesTarget, context: Readonly<Record<string, unknown>>) => Promise<McpListResourcesProviderResult> | McpListResourcesProviderResult;
export type McpListResourcesOutput = { kind: "agentCore.basicTool.mcp.listResources"; target: McpListResourcesTarget; dryRun: boolean; executionBlocked: boolean; providerCalled: boolean; permissionsRequired: readonly McpListResourcesPermission[]; unsafeSideEffects: false; resourceEnvelope: McpListResourcesEnvelope; providerMetadata?: Readonly<Record<string, unknown>> };
export type McpListResourcesErrorCode = "INVALID_REQUEST" | "INVALID_CONTEXT" | "MISSING_SERVER_ID" | "INVALID_SERVER_ID" | "INVALID_LIMIT" | "SCOPE_REJECTED" | "PERMISSION_DENIED" | "GOVERNANCE_REJECTED" | "REAL_EXECUTION_BLOCKED" | "PROVIDER_UNAVAILABLE" | "PROVIDER_REJECTED";
export type McpListResourcesResult = McpToolResult<McpListResourcesOutput, McpListResourcesErrorCode>;

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

type ValidationFailure = { ok: false; code: McpListResourcesErrorCode; message: string; boundary: "input" | "context" | "scope" | "permission" | "contract" | "governance" | "provider"; context?: McpListResourcesContext };
type ValidationSuccess = { ok: true; target: McpListResourcesTarget; context: McpListResourcesContext };

function normalizeContext(value: unknown): McpListResourcesContext | ValidationFailure {
  if (value === undefined) return {};
  if (!isJsonObject(value)) return { ok: false, code: "INVALID_CONTEXT", message: "mcp.listResources context must be a JSON object.", boundary: "context" };
  const allowedServerIds = cleanStringList(value.allowedServerIds);
  const allowedUriPrefixes = cleanStringList(value.allowedUriPrefixes);
  const grantedPermissions = cleanStringList(value.grantedPermissions) as readonly McpListResourcesPermission[] | undefined;
  if ((value.allowedServerIds !== undefined && allowedServerIds === undefined) || (value.allowedUriPrefixes !== undefined && allowedUriPrefixes === undefined) || (value.grantedPermissions !== undefined && grantedPermissions === undefined)) {
    return { ok: false, code: "INVALID_CONTEXT", message: "mcp.listResources context lists must contain strings.", boundary: "context" };
  }
  return { runtimeId: optionalTrimmedString(value.runtimeId), sessionId: optionalTrimmedString(value.sessionId), invocationId: optionalTrimmedString(value.invocationId), dryRun: typeof value.dryRun === "boolean" ? value.dryRun : undefined, guard: isJsonObject(value.guard) ? value.guard : undefined, allowedServerIds, allowedUriPrefixes, grantedPermissions, auditMetadata: isJsonObject(value.auditMetadata) ? value.auditMetadata : undefined };
}

function uriMatchesAllowedPrefix(uri: string, prefix: string): boolean {
  return uri === prefix || uri.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`);
}

function validate(request: unknown): ValidationSuccess | ValidationFailure {
  const root = request === undefined ? {} : request;
  if (!isJsonObject(root)) return { ok: false, code: "INVALID_REQUEST", message: "mcp.listResources request must be a JSON object.", boundary: "input" };
  const context = normalizeContext(root.context);
  if ("ok" in context) return context;
  if (!isJsonObject(root.target)) return { ok: false, code: "MISSING_SERVER_ID", message: "mcp.listResources requires target.serverId.", boundary: "input", context };
  if (root.target.serverId !== undefined && typeof root.target.serverId !== "string") return { ok: false, code: "INVALID_SERVER_ID", message: "mcp.listResources target.serverId must be a string.", boundary: "input", context };
  const serverId = optionalTrimmedString(root.target.serverId);
  if (serverId === undefined) return { ok: false, code: "MISSING_SERVER_ID", message: "mcp.listResources requires target.serverId.", boundary: "input", context };
  const rawLimit = root.target.limit;
  if (rawLimit !== undefined && (typeof rawLimit !== "number" || !Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > mcpListResourcesDescriptor.maxLimit)) return { ok: false, code: "INVALID_LIMIT", message: "mcp.listResources target.limit must be an integer from 1 to 500.", boundary: "input", context };
  const limit = rawLimit === undefined ? undefined : rawLimit;
  const uriPrefix = optionalTrimmedString(root.target.uriPrefix);
  if (context.allowedServerIds !== undefined && !context.allowedServerIds.includes(serverId)) return { ok: false, code: "SCOPE_REJECTED", message: "mcp.listResources target server is outside the allowed MCP server scope.", boundary: "scope", context };
  if (uriPrefix !== undefined && context.allowedUriPrefixes !== undefined && !context.allowedUriPrefixes.some((prefix) => uriMatchesAllowedPrefix(uriPrefix, prefix))) return { ok: false, code: "SCOPE_REJECTED", message: "mcp.listResources uriPrefix is outside the allowed resource prefixes.", boundary: "scope", context };
  if (context.grantedPermissions !== undefined && !mcpListResourcesDescriptor.permissionsRequired.every((permission) => context.grantedPermissions?.includes(permission))) return { ok: false, code: "PERMISSION_DENIED", message: "mcp.listResources requires mcp:connection:read and mcp:resource:list.", boundary: "permission", context };
  return { ok: true, target: { serverId, uriPrefix, cursor: optionalTrimmedString(root.target.cursor), limit: limit === undefined ? mcpListResourcesDescriptor.defaultLimit : limit }, context };
}

function auditEvent(type: string, dryRun: boolean, context: McpListResourcesContext): McpToolAuditEvent {
  return { type, toolId: "mcp.listResources", invocationId: context.invocationId ?? "mcp.listResources:dry-run", dryRun, metadata: { runtimeId: context.runtimeId, sessionId: context.sessionId, ...(context.auditMetadata ?? {}) } };
}

function failure(error: ValidationFailure, context: McpListResourcesContext = {}, event = "basicTool.mcp.listResources.rejected"): McpListResourcesResult {
  return { ok: false, toolId: "mcp.listResources", error: { code: error.code, message: error.message, boundary: error.boundary, publicSafe: true, safeForRuntimeInspection: true, internalDetailExposed: false }, audit: [auditEvent("mcp.listResources.rejected", context.dryRun !== false, context)], events: [event] };
}

function output(target: McpListResourcesTarget, options: { dryRun: boolean; providerCalled: boolean; envelope: McpListResourcesEnvelope; providerMetadata?: Readonly<Record<string, unknown>> }): McpListResourcesOutput {
  return { kind: "agentCore.basicTool.mcp.listResources", target, dryRun: options.dryRun, executionBlocked: options.dryRun, providerCalled: options.providerCalled, permissionsRequired: mcpListResourcesDescriptor.permissionsRequired, unsafeSideEffects: false, resourceEnvelope: options.envelope, providerMetadata: options.providerMetadata };
}

export function planMcpListResources(request: unknown = {}): McpListResourcesResult {
  const normalized = validate(request);
  if (!normalized.ok) return failure(normalized, normalized.context);
  if (normalized.context.dryRun === false) return failure({ ok: false, code: "REAL_EXECUTION_BLOCKED", message: "planMcpListResources only produces dry-run envelopes.", boundary: "contract", context: normalized.context }, normalized.context);
  return { ok: true, toolId: "mcp.listResources", output: output(normalized.target, { dryRun: true, providerCalled: false, envelope: { resources: [], exhausted: false } }), audit: [auditEvent("mcp.listResources.planned", true, normalized.context)], events: ["basicTool.mcp.listResources.dryRun"] };
}

export async function executeMcpListResources(request: unknown = {}, provider?: McpListResourcesProvider): Promise<McpListResourcesResult> {
  const normalized = validate(request);
  if (!normalized.ok) return failure(normalized, normalized.context);
  if (normalized.context.dryRun !== false) return { ok: true, toolId: "mcp.listResources", output: output(normalized.target, { dryRun: true, providerCalled: false, envelope: { resources: [], exhausted: false } }), audit: [auditEvent("mcp.listResources.planned", true, normalized.context)], events: ["basicTool.mcp.listResources.dryRun"] };
  if (!guardAccepted(normalized.context.guard)) return failure({ ok: false, code: "GOVERNANCE_REJECTED", message: "mcp.listResources requires an accepted runtime guard before real dispatch.", boundary: "governance", context: normalized.context }, normalized.context);
  if (provider === undefined) return failure({ ok: false, code: "PROVIDER_UNAVAILABLE", message: "Runtime MCP listResources provider is unavailable.", boundary: "provider", context: normalized.context }, normalized.context, "basicTool.mcp.listResources.providerUnavailable");
  try {
    const result = await provider(normalized.target, { runtimeId: normalized.context.runtimeId, sessionId: normalized.context.sessionId, invocationId: normalized.context.invocationId, auditMetadata: normalized.context.auditMetadata });
    return { ok: true, toolId: "mcp.listResources", output: output(normalized.target, { dryRun: false, providerCalled: true, envelope: { resources: result.resources, nextCursor: result.nextCursor, exhausted: result.exhausted }, providerMetadata: result.providerMetadata }), audit: [auditEvent("mcp.listResources.executed", false, normalized.context)], events: ["basicTool.mcp.listResources.executed"] };
  } catch {
    return failure({ ok: false, code: "PROVIDER_REJECTED", message: "Runtime MCP provider failed listResources.", boundary: "provider", context: normalized.context }, normalized.context, "basicTool.mcp.listResources.providerRejected");
  }
}
