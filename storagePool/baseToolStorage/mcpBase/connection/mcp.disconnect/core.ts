import { cleanStringList, guardAccepted, isJsonObject, optionalTrimmedString, type McpToolAuditEvent, type McpToolResult } from "../../_shared/baseToolAdapter.js";

export type McpDisconnectPermission = "mcp:disconnect";
export type McpDisconnectContext = { runtimeId?: string; sessionId?: string; invocationId?: string; dryRun?: boolean; guard?: { accepted?: boolean; allowed?: boolean; reason?: string }; allowedServerIds?: readonly string[]; grantedPermissions?: readonly McpDisconnectPermission[]; auditMetadata?: Readonly<Record<string, unknown>> };
export type McpDisconnectTarget = { serverId: string; connectionId?: string; reason?: string; force: boolean };
export type McpDisconnectProviderRequest = McpDisconnectTarget;
export type McpDisconnectRequest = { target?: Partial<McpDisconnectTarget> | null; context?: McpDisconnectContext };
export type McpDisconnectEnvelope = { serverId: string; connectionId?: string; reason?: string; force: boolean; connectionState: "disconnect-planned" | "disconnected" | "not_found" | "already_disconnected"; status?: string };
export type McpDisconnectProviderResult = { connectionId?: string; status: "disconnected" | "not_found" | "already_disconnected"; serverId?: string; providerMetadata?: Readonly<Record<string, unknown>>; raw?: unknown };
export type McpDisconnectProvider = (request: McpDisconnectProviderRequest, context: Readonly<Record<string, unknown>>) => Promise<McpDisconnectProviderResult> | McpDisconnectProviderResult;
export type McpDisconnectOutput = { kind: "agentCore.basicTool.mcp.disconnect"; target: McpDisconnectTarget; operationPreview: McpDisconnectEnvelope; dryRun: boolean; executionBlocked: boolean; providerCalled: boolean; permissionsRequired: readonly McpDisconnectPermission[]; unsafeSideEffects: true; providerMetadata?: Readonly<Record<string, unknown>> };
export type McpDisconnectErrorCode = "INVALID_REQUEST" | "INVALID_CONTEXT" | "MISSING_SERVER_ID" | "INVALID_SERVER_ID" | "INVALID_CONNECTION_ID" | "INVALID_REASON" | "SCOPE_REJECTED" | "PERMISSION_DENIED" | "GOVERNANCE_REJECTED" | "REAL_EXECUTION_BLOCKED" | "PROVIDER_UNAVAILABLE" | "PROVIDER_REJECTED";
export type McpDisconnectResult = McpToolResult<McpDisconnectOutput, McpDisconnectErrorCode>;

export const mcpDisconnectDescriptor = { toolId: "mcp.disconnect", capability: "disconnect-mcp-server", route: "agent_executionEngine.basic_toolLayer.baseTools.mcpBase.connection", defaultDryRun: true, tapOwnsApproval: true, permissionsRequired: ["mcp:disconnect"] } as const;

type Boundary = "input" | "context" | "scope" | "permission" | "contract" | "governance" | "provider";
type ValidationFailure = { ok: false; code: McpDisconnectErrorCode; message: string; boundary: Boundary; context?: McpDisconnectContext };
type ValidationSuccess = { ok: true; target: McpDisconnectTarget; context: McpDisconnectContext };

function normalizeContext(value: unknown): McpDisconnectContext | ValidationFailure {
  if (value === undefined) return {};
  if (!isJsonObject(value)) return { ok: false, code: "INVALID_CONTEXT", message: "mcp.disconnect context must be a JSON object.", boundary: "context" };
  const allowedServerIds = cleanStringList(value.allowedServerIds);
  const grantedPermissions = cleanStringList(value.grantedPermissions) as readonly McpDisconnectPermission[] | undefined;
  if ((value.allowedServerIds !== undefined && allowedServerIds === undefined) || (value.grantedPermissions !== undefined && grantedPermissions === undefined)) return { ok: false, code: "INVALID_CONTEXT", message: "mcp.disconnect context lists must contain strings.", boundary: "context" };
  return { runtimeId: optionalTrimmedString(value.runtimeId), sessionId: optionalTrimmedString(value.sessionId), invocationId: optionalTrimmedString(value.invocationId), dryRun: typeof value.dryRun === "boolean" ? value.dryRun : undefined, guard: isJsonObject(value.guard) ? value.guard : undefined, allowedServerIds, grantedPermissions, auditMetadata: isJsonObject(value.auditMetadata) ? value.auditMetadata : undefined };
}

function validate(request: unknown): ValidationSuccess | ValidationFailure {
  const root = request === undefined ? {} : request;
  if (!isJsonObject(root)) return { ok: false, code: "INVALID_REQUEST", message: "mcp.disconnect request must be a JSON object.", boundary: "input" };
  const context = normalizeContext(root.context);
  if ("ok" in context) return context;
  if (!isJsonObject(root.target)) return { ok: false, code: "MISSING_SERVER_ID", message: "mcp.disconnect requires target.serverId.", boundary: "input", context };
  if (root.target.serverId !== undefined && typeof root.target.serverId !== "string") return { ok: false, code: "INVALID_SERVER_ID", message: "mcp.disconnect target.serverId must be a string.", boundary: "input", context };
  const serverId = optionalTrimmedString(root.target.serverId);
  if (serverId === undefined) return { ok: false, code: "MISSING_SERVER_ID", message: "mcp.disconnect requires target.serverId.", boundary: "input", context };
  if (root.target.connectionId !== undefined && typeof root.target.connectionId !== "string") return { ok: false, code: "INVALID_CONNECTION_ID", message: "mcp.disconnect target.connectionId must be a string.", boundary: "input", context };
  const reason = optionalTrimmedString(root.target.reason);
  if (reason !== undefined && reason.length > 256) return { ok: false, code: "INVALID_REASON", message: "mcp.disconnect target.reason must be at most 256 characters.", boundary: "input", context };
  if (context.allowedServerIds !== undefined && !context.allowedServerIds.includes(serverId)) return { ok: false, code: "SCOPE_REJECTED", message: "mcp.disconnect target server is outside allowed MCP server ids.", boundary: "scope", context };
  const missing = context.grantedPermissions === undefined ? [] : mcpDisconnectDescriptor.permissionsRequired.filter((permission) => !context.grantedPermissions?.includes(permission));
  if (missing.length > 0) return { ok: false, code: "PERMISSION_DENIED", message: `mcp.disconnect is missing permissions: ${missing.join(", ")}`, boundary: "permission", context };
  return { ok: true, target: { serverId, connectionId: optionalTrimmedString(root.target.connectionId), reason, force: root.target.force === true }, context };
}

function auditEvent(type: string, dryRun: boolean, context: McpDisconnectContext): McpToolAuditEvent {
  return { type, toolId: "mcp.disconnect", invocationId: context.invocationId ?? "mcp.disconnect:dry-run", dryRun, metadata: { runtimeId: context.runtimeId, sessionId: context.sessionId, ...(context.auditMetadata ?? {}) } };
}

function failure(error: ValidationFailure, context: McpDisconnectContext = {}, event = "basicTool.mcp.disconnect.rejected"): McpDisconnectResult {
  return { ok: false, toolId: "mcp.disconnect", error: { code: error.code, message: error.message, boundary: error.boundary, publicSafe: true, safeForRuntimeInspection: true, internalDetailExposed: false }, audit: [auditEvent("mcp.disconnect.rejected", context.dryRun !== false, context)], events: [event] };
}

function preview(target: McpDisconnectTarget, result?: McpDisconnectProviderResult): McpDisconnectEnvelope {
  return { serverId: result?.serverId ?? target.serverId, connectionId: result?.connectionId ?? target.connectionId, reason: target.reason, force: target.force, connectionState: result?.status ?? "disconnect-planned", status: result?.status };
}

function output(target: McpDisconnectTarget, options: { dryRun: boolean; providerCalled: boolean; result?: McpDisconnectProviderResult }): McpDisconnectOutput {
  return { kind: "agentCore.basicTool.mcp.disconnect", target, operationPreview: preview(target, options.result), dryRun: options.dryRun, executionBlocked: options.dryRun, providerCalled: options.providerCalled, permissionsRequired: mcpDisconnectDescriptor.permissionsRequired, unsafeSideEffects: true, providerMetadata: options.result?.providerMetadata };
}

export function planMcpDisconnect(request: unknown = {}): McpDisconnectResult {
  const normalized = validate(request);
  if (!normalized.ok) return failure(normalized, normalized.context);
  if (normalized.context.dryRun === false) return failure({ ok: false, code: "REAL_EXECUTION_BLOCKED", message: "planMcpDisconnect only produces dry-run envelopes.", boundary: "contract", context: normalized.context }, normalized.context);
  return { ok: true, toolId: "mcp.disconnect", output: output(normalized.target, { dryRun: true, providerCalled: false }), audit: [auditEvent("mcp.disconnect.planned", true, normalized.context)], events: ["basicTool.mcp.disconnect.dryRun"] };
}

export async function executeMcpDisconnect(request: unknown = {}, provider?: McpDisconnectProvider): Promise<McpDisconnectResult> {
  const normalized = validate(request);
  if (!normalized.ok) return failure(normalized, normalized.context);
  if (normalized.context.dryRun !== false) return { ok: true, toolId: "mcp.disconnect", output: output(normalized.target, { dryRun: true, providerCalled: false }), audit: [auditEvent("mcp.disconnect.planned", true, normalized.context)], events: ["basicTool.mcp.disconnect.dryRun"] };
  if (!guardAccepted(normalized.context.guard)) return failure({ ok: false, code: "GOVERNANCE_REJECTED", message: "mcp.disconnect requires an accepted runtime guard before real dispatch.", boundary: "governance", context: normalized.context }, normalized.context);
  if (provider === undefined) return failure({ ok: false, code: "PROVIDER_UNAVAILABLE", message: "Runtime MCP disconnect provider is unavailable.", boundary: "provider", context: normalized.context }, normalized.context, "basicTool.mcp.disconnect.providerUnavailable");
  try {
    const result = await provider(normalized.target, { runtimeId: normalized.context.runtimeId, sessionId: normalized.context.sessionId, invocationId: normalized.context.invocationId, auditMetadata: normalized.context.auditMetadata });
    return { ok: true, toolId: "mcp.disconnect", output: output(normalized.target, { dryRun: false, providerCalled: true, result }), audit: [auditEvent("mcp.disconnect.executed", false, normalized.context)], events: ["basicTool.mcp.disconnect.executed"] };
  } catch {
    return failure({ ok: false, code: "PROVIDER_REJECTED", message: "Runtime MCP provider failed disconnect.", boundary: "provider", context: normalized.context }, normalized.context, "basicTool.mcp.disconnect.providerRejected");
  }
}
