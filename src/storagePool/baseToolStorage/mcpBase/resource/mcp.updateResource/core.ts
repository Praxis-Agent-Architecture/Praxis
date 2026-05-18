import {
  cleanStringList,
  guardAccepted,
  isJsonObject,
  optionalTrimmedString,
  type McpToolAuditEvent,
  type McpToolResult,
} from "../../_shared/baseToolAdapter.js";

export type McpUpdateResourcePermission = "mcp:resource:write";
export type McpUpdateResourceContext = {
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
  grantedPermissions?: readonly McpUpdateResourcePermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type McpUpdateResourceContent = { mimeType?: string; text?: string; bytesBase64?: string; metadata?: Readonly<Record<string, unknown>> };
export type McpUpdateResourceTarget = { serverId: string; resourceUri: string; content: McpUpdateResourceContent; expectedRevision?: string };
export type McpUpdateResourceRequest = { target?: (Partial<Omit<McpUpdateResourceTarget, "content">> & { content?: McpUpdateResourceContent }) | null; context?: McpUpdateResourceContext };
export type McpUpdateResourceProviderRequest = McpUpdateResourceTarget;
export type McpUpdateResourceProviderResult = { uri?: string; status: "updated" | "not_found" | "conflict" | "pending"; revision?: string; providerMetadata?: Readonly<Record<string, unknown>>; raw?: unknown };
export type McpUpdateResourceProvider = (request: McpUpdateResourceProviderRequest, context: Readonly<Record<string, unknown>>) => Promise<McpUpdateResourceProviderResult> | McpUpdateResourceProviderResult;
export type McpUpdateResourceMutationEnvelope = { uri: string; expectedRevision?: string; contentKind: "text" | "bytes" | "metadata" | "mixed"; state: "planned" | "updated" | "not_found" | "conflict" | "pending"; committed: boolean; revision?: string; source: "mockable-envelope" | "runtime-provider" };
export type McpUpdateResourceOutput = { kind: "agentCore.basicTool.mcp.updateResource"; target: McpUpdateResourceTarget; dryRun: boolean; executionBlocked: boolean; providerCalled: boolean; permissionsRequired: readonly McpUpdateResourcePermission[]; unsafeSideEffects: true; acceptedScopes: readonly string[]; mutationEnvelope: McpUpdateResourceMutationEnvelope; providerMetadata?: Readonly<Record<string, unknown>> };
export type McpUpdateResourceErrorCode = "INVALID_REQUEST" | "INVALID_CONTEXT" | "MISSING_SERVER_ID" | "INVALID_SERVER_ID" | "MISSING_RESOURCE_URI" | "INVALID_RESOURCE_URI" | "MISSING_CONTENT" | "INVALID_CONTENT" | "SCOPE_DENIED" | "PERMISSION_DENIED" | "CONTRACT_REJECTED" | "GOVERNANCE_REJECTED" | "REAL_EXECUTION_BLOCKED" | "PROVIDER_UNAVAILABLE" | "PROVIDER_REJECTED";
export type McpUpdateResourceResult = McpToolResult<McpUpdateResourceOutput, McpUpdateResourceErrorCode>;

export const mcpUpdateResourceDescriptor = { toolId: "mcp.updateResource", capability: "update-mcp-resource", route: "agent_executionEngine.basic_toolLayer.baseTools.mcpBase.resource", defaultDryRun: true, tapOwnsApproval: true, runtimeOwnsMcpClient: true, permissionsRequired: ["mcp:resource:write"], unsafeSideEffects: true, providerBoundary: "BaseToolExecutorPort.mcp.updateResource" } as const;

type ValidationFailure = { ok: false; code: McpUpdateResourceErrorCode; message: string; boundary: "input" | "context" | "scope" | "permission" | "contract" | "governance" | "provider"; context?: McpUpdateResourceContext };
type ValidationSuccess = { ok: true; target: McpUpdateResourceTarget; context: McpUpdateResourceContext; acceptedScopes: readonly string[] };

function uriMatchesAllowedPrefix(uri: string, prefix: string): boolean {
  return uri === prefix || uri.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`);
}

function contentKind(content: McpUpdateResourceContent): McpUpdateResourceMutationEnvelope["contentKind"] {
  const kinds = [optionalTrimmedString(content.text) ? "text" : undefined, optionalTrimmedString(content.bytesBase64) ? "bytes" : undefined, content.metadata !== undefined && Object.keys(content.metadata).length > 0 ? "metadata" : undefined].filter((kind): kind is "text" | "bytes" | "metadata" => kind !== undefined);
  return kinds.length === 1 ? kinds[0] : "mixed";
}

function normalizeContext(value: unknown): McpUpdateResourceContext | ValidationFailure {
  if (value === undefined) return {};
  if (!isJsonObject(value)) return { ok: false, code: "INVALID_CONTEXT", message: "mcp.updateResource context must be a JSON object.", boundary: "context" };
  const allowedServerIds = cleanStringList(value.allowedServerIds);
  const allowedUriPrefixes = cleanStringList(value.allowedUriPrefixes);
  const requestedScopes = cleanStringList(value.requestedScopes);
  const allowedScopes = cleanStringList(value.allowedScopes);
  const grantedPermissions = cleanStringList(value.grantedPermissions) as readonly McpUpdateResourcePermission[] | undefined;
  if ((value.allowedServerIds !== undefined && allowedServerIds === undefined) || (value.allowedUriPrefixes !== undefined && allowedUriPrefixes === undefined) || (value.requestedScopes !== undefined && requestedScopes === undefined) || (value.allowedScopes !== undefined && allowedScopes === undefined) || (value.grantedPermissions !== undefined && grantedPermissions === undefined)) return { ok: false, code: "INVALID_CONTEXT", message: "mcp.updateResource context lists must contain strings.", boundary: "context" };
  return { runtimeId: optionalTrimmedString(value.runtimeId), sessionId: optionalTrimmedString(value.sessionId), invocationId: optionalTrimmedString(value.invocationId), dryRun: typeof value.dryRun === "boolean" ? value.dryRun : undefined, guard: isJsonObject(value.guard) ? value.guard : undefined, contract: isJsonObject(value.contract) ? value.contract : undefined, governance: isJsonObject(value.governance) ? value.governance : undefined, allowedServerIds, allowedUriPrefixes, requestedScopes, allowedScopes, grantedPermissions, auditMetadata: isJsonObject(value.auditMetadata) ? value.auditMetadata : undefined };
}

function normalizeContent(value: unknown, context: McpUpdateResourceContext): McpUpdateResourceContent | ValidationFailure {
  if (value === undefined) return { ok: false, code: "MISSING_CONTENT", message: "mcp.updateResource requires target.content.", boundary: "input", context };
  if (!isJsonObject(value)) return { ok: false, code: "INVALID_CONTENT", message: "mcp.updateResource target.content must be a JSON object.", boundary: "input", context };
  if (value.metadata !== undefined && !isJsonObject(value.metadata)) return { ok: false, code: "INVALID_CONTENT", message: "mcp.updateResource target.content.metadata must be a JSON object.", boundary: "input", context };
  const content = { mimeType: optionalTrimmedString(value.mimeType), text: typeof value.text === "string" ? value.text : undefined, bytesBase64: typeof value.bytesBase64 === "string" ? value.bytesBase64 : undefined, metadata: isJsonObject(value.metadata) ? value.metadata : undefined };
  if (optionalTrimmedString(content.text) === undefined && optionalTrimmedString(content.bytesBase64) === undefined && (content.metadata === undefined || Object.keys(content.metadata).length === 0)) return { ok: false, code: "INVALID_CONTENT", message: "mcp.updateResource target.content must include text, bytesBase64, or metadata.", boundary: "input", context };
  return content;
}

function validate(request: unknown): ValidationSuccess | ValidationFailure {
  const root = request === undefined ? {} : request;
  if (!isJsonObject(root)) return { ok: false, code: "INVALID_REQUEST", message: "mcp.updateResource request must be a JSON object.", boundary: "input" };
  const context = normalizeContext(root.context);
  if ("ok" in context) return context;
  if (!isJsonObject(root.target)) return { ok: false, code: "MISSING_SERVER_ID", message: "mcp.updateResource requires target.serverId.", boundary: "input", context };
  if (root.target.serverId !== undefined && typeof root.target.serverId !== "string") return { ok: false, code: "INVALID_SERVER_ID", message: "mcp.updateResource target.serverId must be a string.", boundary: "input", context };
  if (root.target.resourceUri !== undefined && typeof root.target.resourceUri !== "string") return { ok: false, code: "INVALID_RESOURCE_URI", message: "mcp.updateResource target.resourceUri must be a string.", boundary: "input", context };
  const serverId = optionalTrimmedString(root.target.serverId);
  const resourceUri = optionalTrimmedString(root.target.resourceUri);
  if (serverId === undefined) return { ok: false, code: "MISSING_SERVER_ID", message: "mcp.updateResource requires target.serverId.", boundary: "input", context };
  if (resourceUri === undefined) return { ok: false, code: "MISSING_RESOURCE_URI", message: "mcp.updateResource requires target.resourceUri.", boundary: "input", context };
  const content = normalizeContent(root.target.content, context);
  if ("ok" in content) return content;
  if (context.allowedServerIds !== undefined && !context.allowedServerIds.includes(serverId)) return { ok: false, code: "SCOPE_DENIED", message: "mcp.updateResource target server is outside allowed MCP server ids.", boundary: "scope", context };
  if (context.allowedUriPrefixes !== undefined && !context.allowedUriPrefixes.some((prefix) => uriMatchesAllowedPrefix(resourceUri, prefix))) return { ok: false, code: "SCOPE_DENIED", message: "mcp.updateResource target uri is outside allowed resource prefixes.", boundary: "scope", context };
  const requested = context.requestedScopes ?? [];
  const allowed = context.allowedScopes ?? [];
  if (requested.length > 0 && allowed.length > 0 && requested.some((scope) => !allowed.includes(scope))) return { ok: false, code: "SCOPE_DENIED", message: "mcp.updateResource scope is outside runtime governance.", boundary: "scope", context };
  if (context.grantedPermissions !== undefined && !context.grantedPermissions.includes("mcp:resource:write")) return { ok: false, code: "PERMISSION_DENIED", message: "mcp.updateResource requires mcp:resource:write.", boundary: "permission", context };
  return { ok: true, target: { serverId, resourceUri, content, expectedRevision: optionalTrimmedString(root.target.expectedRevision) }, context, acceptedScopes: requested };
}

function auditEvent(type: string, dryRun: boolean, context: McpUpdateResourceContext): McpToolAuditEvent {
  return { type, toolId: "mcp.updateResource", invocationId: context.invocationId ?? "mcp.updateResource:dry-run", dryRun, metadata: { runtimeId: context.runtimeId, sessionId: context.sessionId, ...(context.auditMetadata ?? {}) } };
}

function failure(error: ValidationFailure, context: McpUpdateResourceContext = {}, event = "basicTool.mcp.updateResource.rejected"): McpUpdateResourceResult {
  return { ok: false, toolId: "mcp.updateResource", error: { code: error.code, message: error.message, boundary: error.boundary, publicSafe: true, safeForRuntimeInspection: true, internalDetailExposed: false }, audit: [auditEvent("mcp.updateResource.rejected", context.dryRun !== false, context)], events: [event] };
}

function policyFailure(context: McpUpdateResourceContext): ValidationFailure | undefined {
  if (context.contract?.accepted === false) return { ok: false, code: "CONTRACT_REJECTED", message: context.contract.reason ?? "mcp.updateResource was rejected by runtime contract surface.", boundary: "contract", context };
  if (context.governance?.accepted === false) return { ok: false, code: "GOVERNANCE_REJECTED", message: context.governance.reason ?? "mcp.updateResource was rejected by runtime governance.", boundary: "governance", context };
  return undefined;
}

function output(normalized: ValidationSuccess, options: { dryRun: boolean; providerCalled: boolean; result?: McpUpdateResourceProviderResult }): McpUpdateResourceOutput {
  return { kind: "agentCore.basicTool.mcp.updateResource", target: normalized.target, dryRun: options.dryRun, executionBlocked: options.dryRun, providerCalled: options.providerCalled, permissionsRequired: mcpUpdateResourceDescriptor.permissionsRequired, unsafeSideEffects: true, acceptedScopes: normalized.acceptedScopes, mutationEnvelope: { uri: options.result?.uri ?? normalized.target.resourceUri, expectedRevision: normalized.target.expectedRevision, contentKind: contentKind(normalized.target.content), state: options.result?.status ?? "planned", committed: options.result?.status === "updated", revision: options.result?.revision, source: options.result === undefined ? "mockable-envelope" : "runtime-provider" }, providerMetadata: options.result?.providerMetadata };
}

export function planMcpResourceUpdate(request: unknown = {}): McpUpdateResourceResult {
  const normalized = validate(request);
  if (!normalized.ok) return failure(normalized, normalized.context);
  const blocked = policyFailure(normalized.context);
  if (blocked !== undefined) return failure(blocked, normalized.context);
  if (normalized.context.dryRun === false) return failure({ ok: false, code: "REAL_EXECUTION_BLOCKED", message: "planMcpResourceUpdate only produces dry-run envelopes.", boundary: "contract", context: normalized.context }, normalized.context);
  return { ok: true, toolId: "mcp.updateResource", output: output(normalized, { dryRun: true, providerCalled: false }), audit: [auditEvent("mcp.updateResource.planned", true, normalized.context)], events: ["basicTool.mcp.updateResource.dryRun"] };
}

export async function executeMcpResourceUpdate(request: unknown = {}, provider?: McpUpdateResourceProvider): Promise<McpUpdateResourceResult> {
  const normalized = validate(request);
  if (!normalized.ok) return failure(normalized, normalized.context);
  const blocked = policyFailure(normalized.context);
  if (blocked !== undefined) return failure(blocked, normalized.context);
  if (normalized.context.dryRun !== false) return { ok: true, toolId: "mcp.updateResource", output: output(normalized, { dryRun: true, providerCalled: false }), audit: [auditEvent("mcp.updateResource.planned", true, normalized.context)], events: ["basicTool.mcp.updateResource.dryRun"] };
  if (!guardAccepted(normalized.context.guard)) return failure({ ok: false, code: "GOVERNANCE_REJECTED", message: "mcp.updateResource requires an accepted runtime guard before real dispatch.", boundary: "governance", context: normalized.context }, normalized.context);
  if (provider === undefined) return failure({ ok: false, code: "PROVIDER_UNAVAILABLE", message: "Runtime MCP updateResource provider is unavailable.", boundary: "provider", context: normalized.context }, normalized.context, "basicTool.mcp.updateResource.providerUnavailable");
  try {
    const result = await provider(normalized.target, { runtimeId: normalized.context.runtimeId, sessionId: normalized.context.sessionId, invocationId: normalized.context.invocationId, auditMetadata: normalized.context.auditMetadata });
    return { ok: true, toolId: "mcp.updateResource", output: output(normalized, { dryRun: false, providerCalled: true, result }), audit: [auditEvent("mcp.updateResource.executed", false, normalized.context)], events: ["basicTool.mcp.updateResource.executed"] };
  } catch {
    return failure({ ok: false, code: "PROVIDER_REJECTED", message: "Runtime MCP provider failed updateResource.", boundary: "provider", context: normalized.context }, normalized.context, "basicTool.mcp.updateResource.providerRejected");
  }
}
