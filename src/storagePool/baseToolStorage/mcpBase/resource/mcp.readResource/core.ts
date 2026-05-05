import { cleanStringList, guardAccepted, isJsonObject, optionalTrimmedString, type McpToolAuditEvent, type McpToolResult } from "../../_shared/baseToolAdapter.js";

export type McpReadResourcePermission = "mcp:resource:read";
export type McpReadResourceContext = { runtimeId?: string; sessionId?: string; invocationId?: string; dryRun?: boolean; guard?: { accepted?: boolean; allowed?: boolean; reason?: string }; requestedScopes?: readonly string[]; allowedScopes?: readonly string[]; grantedPermissions?: readonly McpReadResourcePermission[]; auditMetadata?: Readonly<Record<string, unknown>> };
export type McpReadResourceTarget = { serverId: string; resourceUri: string; acceptMimeTypes?: readonly string[]; maxBytes?: number };
export type McpReadResourceRequest = { target?: Partial<McpReadResourceTarget> | null; context?: McpReadResourceContext };
export type McpReadResourceContent = { mimeType?: string; text?: string; bytesBase64?: string; raw?: unknown };
export type McpReadResourceContentEnvelope = { uri: string; contents: readonly McpReadResourceContent[]; truncated: boolean; source: "mockable-envelope" | "runtime-provider" };
export type McpReadResourceProviderResult = { uri?: string; contents: readonly McpReadResourceContent[]; truncated?: boolean; providerMetadata?: Readonly<Record<string, unknown>>; raw?: unknown };
export type McpReadResourceProvider = (request: McpReadResourceTarget, context: Readonly<Record<string, unknown>>) => Promise<McpReadResourceProviderResult> | McpReadResourceProviderResult;
export type McpReadResourceOutput = { kind: "agentCore.basicTool.mcp.readResource"; target: McpReadResourceTarget; dryRun: boolean; executionBlocked: boolean; providerCalled: boolean; permissionsRequired: readonly McpReadResourcePermission[]; unsafeSideEffects: false; acceptedScopes: readonly string[]; resourceEnvelope: McpReadResourceContentEnvelope; providerMetadata?: Readonly<Record<string, unknown>> };
export type McpReadResourceErrorCode = "INVALID_REQUEST" | "INVALID_CONTEXT" | "MISSING_SERVER_ID" | "INVALID_SERVER_ID" | "MISSING_RESOURCE_URI" | "INVALID_RESOURCE_URI" | "INVALID_MAX_BYTES" | "SCOPE_DENIED" | "PERMISSION_DENIED" | "GOVERNANCE_REJECTED" | "REAL_EXECUTION_BLOCKED" | "PROVIDER_UNAVAILABLE" | "PROVIDER_REJECTED";
export type McpReadResourceResult = McpToolResult<McpReadResourceOutput, McpReadResourceErrorCode>;

export const mcpReadResourceDescriptor = { toolId: "mcp.readResource", capability: "read-mcp-resource", route: "agent_executionEngine.basic_toolLayer.baseTools.mcpBase.resource", defaultDryRun: true, tapOwnsApproval: true, permissionsRequired: ["mcp:resource:read"], unsafeSideEffects: false } as const;

type ValidationFailure = { ok: false; code: McpReadResourceErrorCode; message: string; boundary: "input" | "context" | "scope" | "permission" | "contract" | "governance" | "provider"; context?: McpReadResourceContext };
type ValidationSuccess = { ok: true; target: McpReadResourceTarget; context: McpReadResourceContext; acceptedScopes: readonly string[] };

function normalizeContext(value: unknown): McpReadResourceContext | ValidationFailure {
  if (value === undefined) return {};
  if (!isJsonObject(value)) return { ok: false, code: "INVALID_CONTEXT", message: "mcp.readResource context must be a JSON object.", boundary: "context" };
  const requestedScopes = cleanStringList(value.requestedScopes);
  const allowedScopes = cleanStringList(value.allowedScopes);
  const grantedPermissions = cleanStringList(value.grantedPermissions) as readonly McpReadResourcePermission[] | undefined;
  if ((value.requestedScopes !== undefined && requestedScopes === undefined) || (value.allowedScopes !== undefined && allowedScopes === undefined) || (value.grantedPermissions !== undefined && grantedPermissions === undefined)) return { ok: false, code: "INVALID_CONTEXT", message: "mcp.readResource context lists must contain strings.", boundary: "context" };
  return { runtimeId: optionalTrimmedString(value.runtimeId), sessionId: optionalTrimmedString(value.sessionId), invocationId: optionalTrimmedString(value.invocationId), dryRun: typeof value.dryRun === "boolean" ? value.dryRun : undefined, guard: isJsonObject(value.guard) ? value.guard : undefined, requestedScopes, allowedScopes, grantedPermissions, auditMetadata: isJsonObject(value.auditMetadata) ? value.auditMetadata : undefined };
}

function validate(request: unknown): ValidationSuccess | ValidationFailure {
  const root = request === undefined ? {} : request;
  if (!isJsonObject(root)) return { ok: false, code: "INVALID_REQUEST", message: "mcp.readResource request must be a JSON object.", boundary: "input" };
  const context = normalizeContext(root.context);
  if ("ok" in context) return context;
  if (!isJsonObject(root.target)) return { ok: false, code: "MISSING_SERVER_ID", message: "mcp.readResource requires target.serverId.", boundary: "input", context };
  if (root.target.serverId !== undefined && typeof root.target.serverId !== "string") return { ok: false, code: "INVALID_SERVER_ID", message: "mcp.readResource target.serverId must be a string.", boundary: "input", context };
  if (root.target.resourceUri !== undefined && typeof root.target.resourceUri !== "string") return { ok: false, code: "INVALID_RESOURCE_URI", message: "mcp.readResource target.resourceUri must be a string.", boundary: "input", context };
  const serverId = optionalTrimmedString(root.target.serverId);
  const resourceUri = optionalTrimmedString(root.target.resourceUri);
  if (serverId === undefined) return { ok: false, code: "MISSING_SERVER_ID", message: "mcp.readResource requires target.serverId.", boundary: "input", context };
  if (resourceUri === undefined) return { ok: false, code: "MISSING_RESOURCE_URI", message: "mcp.readResource requires target.resourceUri.", boundary: "input", context };
  const rawMaxBytes = root.target.maxBytes;
  if (rawMaxBytes !== undefined && (typeof rawMaxBytes !== "number" || !Number.isInteger(rawMaxBytes) || rawMaxBytes <= 0)) return { ok: false, code: "INVALID_MAX_BYTES", message: "mcp.readResource target.maxBytes must be a positive integer.", boundary: "input", context };
  const maxBytes = rawMaxBytes === undefined ? undefined : rawMaxBytes;
  const acceptMimeTypes = cleanStringList(root.target.acceptMimeTypes);
  if (root.target.acceptMimeTypes !== undefined && acceptMimeTypes === undefined) return { ok: false, code: "INVALID_CONTEXT", message: "mcp.readResource target.acceptMimeTypes must contain strings.", boundary: "input", context };
  const requested = context.requestedScopes ?? [];
  const allowed = context.allowedScopes ?? [];
  if (requested.length > 0 && allowed.length > 0 && requested.some((scope) => !allowed.includes(scope))) return { ok: false, code: "SCOPE_DENIED", message: "mcp.readResource scope is outside runtime governance.", boundary: "scope", context };
  if (context.grantedPermissions !== undefined && !context.grantedPermissions.includes("mcp:resource:read")) return { ok: false, code: "PERMISSION_DENIED", message: "mcp.readResource requires mcp:resource:read.", boundary: "permission", context };
  return { ok: true, target: { serverId, resourceUri, acceptMimeTypes: acceptMimeTypes ?? [], maxBytes: maxBytes === undefined ? undefined : maxBytes }, context, acceptedScopes: requested };
}

function auditEvent(type: string, dryRun: boolean, context: McpReadResourceContext): McpToolAuditEvent {
  return { type, toolId: "mcp.readResource", invocationId: context.invocationId ?? "mcp.readResource:dry-run", dryRun, metadata: { runtimeId: context.runtimeId, sessionId: context.sessionId, ...(context.auditMetadata ?? {}) } };
}

function failure(error: ValidationFailure, context: McpReadResourceContext = {}, event = "basicTool.mcp.readResource.rejected"): McpReadResourceResult {
  return { ok: false, toolId: "mcp.readResource", error: { code: error.code, message: error.message, boundary: error.boundary, publicSafe: true, safeForRuntimeInspection: true, internalDetailExposed: false }, audit: [auditEvent("mcp.readResource.rejected", context.dryRun !== false, context)], events: [event] };
}

function output(target: McpReadResourceTarget, acceptedScopes: readonly string[], options: { dryRun: boolean; providerCalled: boolean; envelope: McpReadResourceContentEnvelope; providerMetadata?: Readonly<Record<string, unknown>> }): McpReadResourceOutput {
  return { kind: "agentCore.basicTool.mcp.readResource", target, dryRun: options.dryRun, executionBlocked: options.dryRun, providerCalled: options.providerCalled, permissionsRequired: mcpReadResourceDescriptor.permissionsRequired, unsafeSideEffects: false, acceptedScopes, resourceEnvelope: options.envelope, providerMetadata: options.providerMetadata };
}

export function planMcpResourceRead(request: unknown = {}): McpReadResourceResult {
  const normalized = validate(request);
  if (!normalized.ok) return failure(normalized, normalized.context);
  if (normalized.context.dryRun === false) return failure({ ok: false, code: "REAL_EXECUTION_BLOCKED", message: "planMcpResourceRead only produces dry-run envelopes.", boundary: "contract", context: normalized.context }, normalized.context);
  return { ok: true, toolId: "mcp.readResource", output: output(normalized.target, normalized.acceptedScopes, { dryRun: true, providerCalled: false, envelope: { uri: normalized.target.resourceUri, contents: [], truncated: false, source: "mockable-envelope" } }), audit: [auditEvent("mcp.readResource.planned", true, normalized.context)], events: ["basicTool.mcp.readResource.dryRun"] };
}

export async function executeMcpResourceRead(request: unknown = {}, provider?: McpReadResourceProvider): Promise<McpReadResourceResult> {
  const normalized = validate(request);
  if (!normalized.ok) return failure(normalized, normalized.context);
  if (normalized.context.dryRun !== false) return { ok: true, toolId: "mcp.readResource", output: output(normalized.target, normalized.acceptedScopes, { dryRun: true, providerCalled: false, envelope: { uri: normalized.target.resourceUri, contents: [], truncated: false, source: "mockable-envelope" } }), audit: [auditEvent("mcp.readResource.planned", true, normalized.context)], events: ["basicTool.mcp.readResource.dryRun"] };
  if (!guardAccepted(normalized.context.guard)) return failure({ ok: false, code: "GOVERNANCE_REJECTED", message: "mcp.readResource requires an accepted runtime guard before real dispatch.", boundary: "governance", context: normalized.context }, normalized.context);
  if (provider === undefined) return failure({ ok: false, code: "PROVIDER_UNAVAILABLE", message: "Runtime MCP readResource provider is unavailable.", boundary: "provider", context: normalized.context }, normalized.context, "basicTool.mcp.readResource.providerUnavailable");
  try {
    const result = await provider(normalized.target, { runtimeId: normalized.context.runtimeId, sessionId: normalized.context.sessionId, invocationId: normalized.context.invocationId, auditMetadata: normalized.context.auditMetadata });
    return { ok: true, toolId: "mcp.readResource", output: output(normalized.target, normalized.acceptedScopes, { dryRun: false, providerCalled: true, envelope: { uri: result.uri ?? normalized.target.resourceUri, contents: result.contents, truncated: result.truncated === true, source: "runtime-provider" }, providerMetadata: result.providerMetadata }), audit: [auditEvent("mcp.readResource.executed", false, normalized.context)], events: ["basicTool.mcp.readResource.executed"] };
  } catch {
    return failure({ ok: false, code: "PROVIDER_REJECTED", message: "Runtime MCP provider failed readResource.", boundary: "provider", context: normalized.context }, normalized.context, "basicTool.mcp.readResource.providerRejected");
  }
}
