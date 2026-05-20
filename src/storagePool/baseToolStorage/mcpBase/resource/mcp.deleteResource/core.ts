import {
  cleanStringList,
  guardAccepted,
  isJsonObject,
  optionalTrimmedString,
  type McpToolAuditEvent,
  type McpToolResult,
} from "../../_shared/baseToolAdapter.js";

export type McpDeleteResourcePermission = "mcp:connection:read" | "mcp:resource:delete";
export type McpDeleteResourceContext = {
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
  grantedPermissions?: readonly McpDeleteResourcePermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type McpDeleteResourceTarget = { serverId: string; uri: string; expectedRevision?: string };
export type McpDeleteResourceRequest = { target?: Partial<McpDeleteResourceTarget> | null; reason?: string; context?: McpDeleteResourceContext };
export type McpDeleteResourceProviderRequest = McpDeleteResourceTarget & { reason?: string };
export type McpDeleteResourceProviderResult = { uri?: string; status: "deleted" | "not_found" | "conflict" | "pending"; providerMetadata?: Readonly<Record<string, unknown>>; raw?: unknown };
export type McpDeleteResourceProvider = (request: McpDeleteResourceProviderRequest, context: Readonly<Record<string, unknown>>) => Promise<McpDeleteResourceProviderResult> | McpDeleteResourceProviderResult;
export type McpDeleteResourceEnvelope = { uri: string; state: "planned" | "deleted" | "not_found" | "conflict" | "pending"; deleted: boolean; deletionPlanned: boolean; reason?: string; source: "mockable-envelope" | "runtime-provider" };
export type McpDeleteResourceOutput = { kind: "agentCore.basicTool.mcp.deleteResource"; target: McpDeleteResourceTarget; dryRun: boolean; executionBlocked: boolean; providerCalled: boolean; permissionsRequired: readonly McpDeleteResourcePermission[]; unsafeSideEffects: true; acceptedScopes: readonly string[]; resourceEnvelope: McpDeleteResourceEnvelope; providerMetadata?: Readonly<Record<string, unknown>> };
export type McpDeleteResourceErrorCode = "INVALID_REQUEST" | "INVALID_CONTEXT" | "MISSING_SERVER_ID" | "INVALID_SERVER_ID" | "MISSING_RESOURCE_URI" | "INVALID_RESOURCE_URI" | "INVALID_REASON" | "SCOPE_REJECTED" | "PERMISSION_DENIED" | "CONTRACT_REJECTED" | "GOVERNANCE_REJECTED" | "REAL_EXECUTION_BLOCKED" | "PROVIDER_UNAVAILABLE" | "PROVIDER_REJECTED";
export type McpDeleteResourceResult = McpToolResult<McpDeleteResourceOutput, McpDeleteResourceErrorCode>;

export const mcpDeleteResourceDescriptor = { toolId: "mcp.deleteResource", capability: "delete-resource", route: "agent_executionEngine.basic_toolLayer.baseTools.mcpBase.resource", defaultDryRun: true, tapOwnsApproval: true, runtimeOwnsMcpClient: true, permissionsRequired: ["mcp:connection:read", "mcp:resource:delete"], unsafeSideEffects: true, providerBoundary: "BaseToolExecutorPort.mcp.deleteResource" } as const;

type ValidationFailure = { ok: false; code: McpDeleteResourceErrorCode; message: string; boundary: "input" | "context" | "scope" | "permission" | "contract" | "governance" | "provider"; context?: McpDeleteResourceContext };
type ValidationSuccess = { ok: true; target: McpDeleteResourceTarget; reason?: string; context: McpDeleteResourceContext; acceptedScopes: readonly string[] };

function uriMatchesAllowedPrefix(uri: string, prefix: string): boolean {
  return uri === prefix || uri.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`);
}

function normalizeContext(value: unknown): McpDeleteResourceContext | ValidationFailure {
  if (value === undefined) return {};
  if (!isJsonObject(value)) return { ok: false, code: "INVALID_CONTEXT", message: "mcp.deleteResource context must be a JSON object.", boundary: "context" };
  const allowedServerIds = cleanStringList(value.allowedServerIds);
  const allowedUriPrefixes = cleanStringList(value.allowedUriPrefixes);
  const requestedScopes = cleanStringList(value.requestedScopes);
  const allowedScopes = cleanStringList(value.allowedScopes);
  const grantedPermissions = cleanStringList(value.grantedPermissions) as readonly McpDeleteResourcePermission[] | undefined;
  if ((value.allowedServerIds !== undefined && allowedServerIds === undefined) || (value.allowedUriPrefixes !== undefined && allowedUriPrefixes === undefined) || (value.requestedScopes !== undefined && requestedScopes === undefined) || (value.allowedScopes !== undefined && allowedScopes === undefined) || (value.grantedPermissions !== undefined && grantedPermissions === undefined)) return { ok: false, code: "INVALID_CONTEXT", message: "mcp.deleteResource context lists must contain strings.", boundary: "context" };
  return { runtimeId: optionalTrimmedString(value.runtimeId), sessionId: optionalTrimmedString(value.sessionId), invocationId: optionalTrimmedString(value.invocationId), dryRun: typeof value.dryRun === "boolean" ? value.dryRun : undefined, guard: isJsonObject(value.guard) ? value.guard : undefined, contract: isJsonObject(value.contract) ? value.contract : undefined, governance: isJsonObject(value.governance) ? value.governance : undefined, allowedServerIds, allowedUriPrefixes, requestedScopes, allowedScopes, grantedPermissions, auditMetadata: isJsonObject(value.auditMetadata) ? value.auditMetadata : undefined };
}

function validate(request: unknown): ValidationSuccess | ValidationFailure {
  const root = request === undefined ? {} : request;
  if (!isJsonObject(root)) return { ok: false, code: "INVALID_REQUEST", message: "mcp.deleteResource request must be a JSON object.", boundary: "input" };
  const context = normalizeContext(root.context);
  if ("ok" in context) return context;
  if (!isJsonObject(root.target)) return { ok: false, code: "MISSING_SERVER_ID", message: "mcp.deleteResource requires target.serverId.", boundary: "input", context };
  if (root.target.serverId !== undefined && typeof root.target.serverId !== "string") return { ok: false, code: "INVALID_SERVER_ID", message: "mcp.deleteResource target.serverId must be a string.", boundary: "input", context };
  if (root.target.uri !== undefined && typeof root.target.uri !== "string") return { ok: false, code: "INVALID_RESOURCE_URI", message: "mcp.deleteResource target.uri must be a string.", boundary: "input", context };
  if (root.reason !== undefined && typeof root.reason !== "string") return { ok: false, code: "INVALID_REASON", message: "mcp.deleteResource reason must be a string.", boundary: "input", context };
  const serverId = optionalTrimmedString(root.target.serverId);
  const uri = optionalTrimmedString(root.target.uri);
  if (serverId === undefined) return { ok: false, code: "MISSING_SERVER_ID", message: "mcp.deleteResource requires target.serverId.", boundary: "input", context };
  if (uri === undefined) return { ok: false, code: "MISSING_RESOURCE_URI", message: "mcp.deleteResource requires target.uri.", boundary: "input", context };
  if (context.allowedServerIds !== undefined && !context.allowedServerIds.includes(serverId)) return { ok: false, code: "SCOPE_REJECTED", message: "mcp.deleteResource target server is outside allowed MCP server ids.", boundary: "scope", context };
  if (context.allowedUriPrefixes !== undefined && !context.allowedUriPrefixes.some((prefix) => uriMatchesAllowedPrefix(uri, prefix))) return { ok: false, code: "SCOPE_REJECTED", message: "mcp.deleteResource target uri is outside allowed resource prefixes.", boundary: "scope", context };
  const requested = context.requestedScopes ?? [];
  const allowed = context.allowedScopes ?? [];
  if (requested.length > 0 && allowed.length > 0 && requested.some((scope) => !allowed.includes(scope))) return { ok: false, code: "SCOPE_REJECTED", message: "mcp.deleteResource requested scope is outside runtime governance.", boundary: "scope", context };
  const missing = context.grantedPermissions === undefined ? [] : mcpDeleteResourceDescriptor.permissionsRequired.filter((permission) => !context.grantedPermissions?.includes(permission));
  if (missing.length > 0) return { ok: false, code: "PERMISSION_DENIED", message: `mcp.deleteResource is missing permissions: ${missing.join(", ")}`, boundary: "permission", context };
  return { ok: true, target: { serverId, uri, expectedRevision: optionalTrimmedString(root.target.expectedRevision) }, reason: optionalTrimmedString(root.reason), context, acceptedScopes: requested };
}

function auditEvent(type: string, dryRun: boolean, context: McpDeleteResourceContext): McpToolAuditEvent {
  return { type, toolId: "mcp.deleteResource", invocationId: context.invocationId ?? "mcp.deleteResource:dry-run", dryRun, metadata: { runtimeId: context.runtimeId, sessionId: context.sessionId, ...(context.auditMetadata ?? {}) } };
}

function failure(error: ValidationFailure, context: McpDeleteResourceContext = {}, event = "basicTool.mcp.deleteResource.rejected"): McpDeleteResourceResult {
  return { ok: false, toolId: "mcp.deleteResource", error: { code: error.code, message: error.message, boundary: error.boundary, publicSafe: true, safeForRuntimeInspection: true, internalDetailExposed: false }, audit: [auditEvent("mcp.deleteResource.rejected", context.dryRun !== false, context)], events: [event] };
}

function policyFailure(context: McpDeleteResourceContext): ValidationFailure | undefined {
  if (context.contract?.accepted === false) return { ok: false, code: "CONTRACT_REJECTED", message: context.contract.reason ?? "mcp.deleteResource was rejected by runtime contract surface.", boundary: "contract", context };
  if (context.governance?.accepted === false) return { ok: false, code: "GOVERNANCE_REJECTED", message: context.governance.reason ?? "mcp.deleteResource was rejected by runtime governance.", boundary: "governance", context };
  return undefined;
}

function output(normalized: ValidationSuccess, options: { dryRun: boolean; providerCalled: boolean; result?: McpDeleteResourceProviderResult }): McpDeleteResourceOutput {
  return { kind: "agentCore.basicTool.mcp.deleteResource", target: normalized.target, dryRun: options.dryRun, executionBlocked: options.dryRun, providerCalled: options.providerCalled, permissionsRequired: mcpDeleteResourceDescriptor.permissionsRequired, unsafeSideEffects: true, acceptedScopes: normalized.acceptedScopes, resourceEnvelope: { uri: options.result?.uri ?? normalized.target.uri, state: options.result?.status ?? "planned", deleted: options.result?.status === "deleted", deletionPlanned: options.result === undefined, reason: normalized.reason, source: options.result === undefined ? "mockable-envelope" : "runtime-provider" }, providerMetadata: options.result?.providerMetadata };
}

export function planMcpDeleteResource(request: unknown = {}): McpDeleteResourceResult {
  const normalized = validate(request);
  if (!normalized.ok) return failure(normalized, normalized.context);
  const blocked = policyFailure(normalized.context);
  if (blocked !== undefined) return failure(blocked, normalized.context);
  if (normalized.context.dryRun === false) return failure({ ok: false, code: "REAL_EXECUTION_BLOCKED", message: "planMcpDeleteResource only produces dry-run envelopes.", boundary: "contract", context: normalized.context }, normalized.context);
  return { ok: true, toolId: "mcp.deleteResource", output: output(normalized, { dryRun: true, providerCalled: false }), audit: [auditEvent("mcp.deleteResource.planned", true, normalized.context)], events: ["basicTool.mcp.deleteResource.dryRun"] };
}

export async function executeMcpDeleteResource(request: unknown = {}, provider?: McpDeleteResourceProvider): Promise<McpDeleteResourceResult> {
  const normalized = validate(request);
  if (!normalized.ok) return failure(normalized, normalized.context);
  const blocked = policyFailure(normalized.context);
  if (blocked !== undefined) return failure(blocked, normalized.context);
  if (normalized.context.dryRun !== false) return { ok: true, toolId: "mcp.deleteResource", output: output(normalized, { dryRun: true, providerCalled: false }), audit: [auditEvent("mcp.deleteResource.planned", true, normalized.context)], events: ["basicTool.mcp.deleteResource.dryRun"] };
  if (!guardAccepted(normalized.context.guard)) return failure({ ok: false, code: "GOVERNANCE_REJECTED", message: "mcp.deleteResource requires an accepted runtime guard before real dispatch.", boundary: "governance", context: normalized.context }, normalized.context);
  if (provider === undefined) return failure({ ok: false, code: "PROVIDER_UNAVAILABLE", message: "Runtime MCP deleteResource provider is unavailable.", boundary: "provider", context: normalized.context }, normalized.context, "basicTool.mcp.deleteResource.providerUnavailable");
  try {
    const result = await provider({ ...normalized.target, reason: normalized.reason }, { runtimeId: normalized.context.runtimeId, sessionId: normalized.context.sessionId, invocationId: normalized.context.invocationId, auditMetadata: normalized.context.auditMetadata });
    return { ok: true, toolId: "mcp.deleteResource", output: output(normalized, { dryRun: false, providerCalled: true, result }), audit: [auditEvent("mcp.deleteResource.executed", false, normalized.context)], events: ["basicTool.mcp.deleteResource.executed"] };
  } catch {
    return failure({ ok: false, code: "PROVIDER_REJECTED", message: "Runtime MCP provider failed deleteResource.", boundary: "provider", context: normalized.context }, normalized.context, "basicTool.mcp.deleteResource.providerRejected");
  }
}
