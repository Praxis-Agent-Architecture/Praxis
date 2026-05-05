import { cleanStringList, guardAccepted, isJsonObject, optionalTrimmedString, type McpToolAuditEvent, type McpToolResult } from "../../_shared/baseToolAdapter.js";

export type McpConnectTransport = "stdio" | "http" | "sse";
export type McpConnectPermission = "mcp:connect" | "network:connect" | "process:spawn";
export type McpConnectContext = { runtimeId?: string; sessionId?: string; invocationId?: string; dryRun?: boolean; guard?: { accepted?: boolean; allowed?: boolean; reason?: string }; allowedServerIds?: readonly string[]; grantedPermissions?: readonly McpConnectPermission[]; auditMetadata?: Readonly<Record<string, unknown>> };
export type McpConnectTarget = { serverId: string; connectionId?: string; transport?: McpConnectTransport; transportHint?: McpConnectTransport; endpoint?: string; command?: string; timeoutMs: number };
export type McpConnectProviderRequest = { serverId: string; connectionId?: string; transportHint?: McpConnectTransport; timeoutMs?: number };
export type McpConnectRequest = { target?: Partial<McpConnectTarget> | null; context?: McpConnectContext };
export type McpConnectEnvelope = { serverId: string; connectionId?: string; transport?: McpConnectTransport; transportHint?: McpConnectTransport; connectionState: "planned" | "connected" | "reused" | "pending"; endpoint?: string; command?: string; timeoutMs: number; status?: string };
export type McpConnectProviderResult = { connectionId?: string; status: "connected" | "reused" | "pending"; serverId?: string; providerMetadata?: Readonly<Record<string, unknown>>; raw?: unknown };
export type McpConnectProvider = (request: McpConnectProviderRequest, context: Readonly<Record<string, unknown>>) => Promise<McpConnectProviderResult> | McpConnectProviderResult;
export type McpConnectOutput = { kind: "agentCore.basicTool.mcp.connect"; target: McpConnectTarget; operationPreview: McpConnectEnvelope; dryRun: boolean; executionBlocked: boolean; providerCalled: boolean; permissionsRequired: readonly McpConnectPermission[]; unsafeSideEffects: true; providerMetadata?: Readonly<Record<string, unknown>> };
export type McpConnectErrorCode = "INVALID_REQUEST" | "INVALID_CONTEXT" | "MISSING_SERVER_ID" | "INVALID_SERVER_ID" | "MISSING_TRANSPORT" | "INVALID_TRANSPORT" | "MISSING_ENDPOINT" | "INVALID_ENDPOINT" | "MISSING_COMMAND" | "INVALID_TIMEOUT" | "SCOPE_REJECTED" | "PERMISSION_DENIED" | "GOVERNANCE_REJECTED" | "REAL_EXECUTION_BLOCKED" | "PROVIDER_UNAVAILABLE" | "PROVIDER_REJECTED";
export type McpConnectResult = McpToolResult<McpConnectOutput, McpConnectErrorCode>;

export const mcpConnectDescriptor = { toolId: "mcp.connect", capability: "connect-mcp-server", route: "agent_executionEngine.basic_toolLayer.baseTools.mcpBase.connection", defaultDryRun: true, tapOwnsApproval: true, basePermissionsRequired: ["mcp:connect"], transportPermissions: { stdio: ["process:spawn"], http: ["network:connect"], sse: ["network:connect"] }, defaultTimeoutMs: 30_000, maxTimeoutMs: 120_000 } as const;

type Boundary = "input" | "context" | "scope" | "permission" | "contract" | "governance" | "provider";
type ValidationFailure = { ok: false; code: McpConnectErrorCode; message: string; boundary: Boundary; context?: McpConnectContext };
type ValidationSuccess = { ok: true; target: McpConnectTarget; context: McpConnectContext };

function isTransport(value: unknown): value is McpConnectTransport {
  return value === "stdio" || value === "http" || value === "sse";
}

function normalizeContext(value: unknown): McpConnectContext | ValidationFailure {
  if (value === undefined) return {};
  if (!isJsonObject(value)) return { ok: false, code: "INVALID_CONTEXT", message: "mcp.connect context must be a JSON object.", boundary: "context" };
  const allowedServerIds = cleanStringList(value.allowedServerIds);
  const grantedPermissions = cleanStringList(value.grantedPermissions) as readonly McpConnectPermission[] | undefined;
  if ((value.allowedServerIds !== undefined && allowedServerIds === undefined) || (value.grantedPermissions !== undefined && grantedPermissions === undefined)) return { ok: false, code: "INVALID_CONTEXT", message: "mcp.connect context lists must contain strings.", boundary: "context" };
  return { runtimeId: optionalTrimmedString(value.runtimeId), sessionId: optionalTrimmedString(value.sessionId), invocationId: optionalTrimmedString(value.invocationId), dryRun: typeof value.dryRun === "boolean" ? value.dryRun : undefined, guard: isJsonObject(value.guard) ? value.guard : undefined, allowedServerIds, grantedPermissions, auditMetadata: isJsonObject(value.auditMetadata) ? value.auditMetadata : undefined };
}

function readTransport(target: Record<string, unknown>, key: "transport" | "transportHint", context: McpConnectContext): McpConnectTransport | ValidationFailure | undefined {
  const value = target[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !isTransport(value.trim())) return { ok: false, code: "INVALID_TRANSPORT", message: `mcp.connect target.${key} must be stdio, http, or sse.`, boundary: "input", context };
  return value.trim() as McpConnectTransport;
}

function validateUrl(endpoint: string, context: McpConnectContext): ValidationFailure | undefined {
  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    return { ok: false, code: "INVALID_ENDPOINT", message: "mcp.connect target.endpoint must be an http or https URL.", boundary: "input", context };
  }
  if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || parsed.hostname.length === 0) return { ok: false, code: "INVALID_ENDPOINT", message: "mcp.connect target.endpoint must be an http or https URL.", boundary: "input", context };
  return undefined;
}

function permissionsRequired(target: Pick<McpConnectTarget, "transport">): readonly McpConnectPermission[] {
  const transport = target.transport;
  return transport === undefined ? mcpConnectDescriptor.basePermissionsRequired : [...mcpConnectDescriptor.basePermissionsRequired, ...mcpConnectDescriptor.transportPermissions[transport]] as readonly McpConnectPermission[];
}

function validate(request: unknown, options: { legacyPlan: boolean }): ValidationSuccess | ValidationFailure {
  const root = request === undefined ? {} : request;
  if (!isJsonObject(root)) return { ok: false, code: "INVALID_REQUEST", message: "mcp.connect request must be a JSON object.", boundary: "input" };
  const context = normalizeContext(root.context);
  if ("ok" in context) return context;
  if (!isJsonObject(root.target)) return { ok: false, code: "MISSING_SERVER_ID", message: "mcp.connect requires target.serverId.", boundary: "input", context };
  if (root.target.serverId !== undefined && typeof root.target.serverId !== "string") return { ok: false, code: "INVALID_SERVER_ID", message: "mcp.connect target.serverId must be a string.", boundary: "input", context };
  const serverId = optionalTrimmedString(root.target.serverId);
  if (serverId === undefined) return { ok: false, code: "MISSING_SERVER_ID", message: "mcp.connect requires target.serverId.", boundary: "input", context };
  const transport = readTransport(root.target, "transport", context);
  if (isJsonObject(transport)) return transport;
  const transportHint = readTransport(root.target, "transportHint", context);
  if (isJsonObject(transportHint)) return transportHint;
  if (options.legacyPlan && transport === undefined) return { ok: false, code: "MISSING_TRANSPORT", message: "mcp.connect requires target.transport for dry-run connection previews.", boundary: "input", context };
  const endpoint = optionalTrimmedString(root.target.endpoint);
  const command = optionalTrimmedString(root.target.command);
  if (transport === "stdio" && command === undefined) return { ok: false, code: "MISSING_COMMAND", message: "mcp.connect requires target.command for stdio dry-run previews.", boundary: "input", context };
  if ((transport === "http" || transport === "sse") && endpoint === undefined) return { ok: false, code: "MISSING_ENDPOINT", message: "mcp.connect requires target.endpoint for network dry-run previews.", boundary: "input", context };
  if (endpoint !== undefined && (transport === "http" || transport === "sse")) {
    const endpointFailure = validateUrl(endpoint, context);
    if (endpointFailure !== undefined) return endpointFailure;
  }
  const rawTimeout = root.target.timeoutMs;
  if (rawTimeout !== undefined && (typeof rawTimeout !== "number" || !Number.isInteger(rawTimeout) || rawTimeout < 1 || rawTimeout > mcpConnectDescriptor.maxTimeoutMs)) return { ok: false, code: "INVALID_TIMEOUT", message: "mcp.connect target.timeoutMs must be an integer between 1 and 120000.", boundary: "input", context };
  const timeoutMs = rawTimeout === undefined ? mcpConnectDescriptor.defaultTimeoutMs : rawTimeout;
  if (context.allowedServerIds !== undefined && !context.allowedServerIds.includes(serverId)) return { ok: false, code: "SCOPE_REJECTED", message: "mcp.connect target server is outside allowed MCP server ids.", boundary: "scope", context };
  const required = permissionsRequired({ transport });
  const missing = context.grantedPermissions === undefined ? [] : required.filter((permission) => !context.grantedPermissions?.includes(permission));
  if (missing.length > 0) return { ok: false, code: "PERMISSION_DENIED", message: `mcp.connect is missing permissions: ${missing.join(", ")}`, boundary: "permission", context };
  return { ok: true, target: { serverId, connectionId: optionalTrimmedString(root.target.connectionId), transport, transportHint, endpoint, command, timeoutMs }, context };
}

function auditEvent(type: string, dryRun: boolean, context: McpConnectContext): McpToolAuditEvent {
  return { type, toolId: "mcp.connect", invocationId: context.invocationId ?? "mcp.connect:dry-run", dryRun, metadata: { runtimeId: context.runtimeId, sessionId: context.sessionId, ...(context.auditMetadata ?? {}) } };
}

function failure(error: ValidationFailure, context: McpConnectContext = {}, event = "basicTool.mcp.connect.rejected"): McpConnectResult {
  return { ok: false, toolId: "mcp.connect", error: { code: error.code, message: error.message, boundary: error.boundary, publicSafe: true, safeForRuntimeInspection: true, internalDetailExposed: false }, audit: [auditEvent("mcp.connect.rejected", context.dryRun !== false, context)], events: [event] };
}

function preview(target: McpConnectTarget, result?: McpConnectProviderResult): McpConnectEnvelope {
  return { serverId: result?.serverId ?? target.serverId, connectionId: result?.connectionId ?? target.connectionId, transport: target.transport, transportHint: target.transportHint ?? target.transport, connectionState: result?.status ?? "planned", endpoint: target.endpoint, command: target.command, timeoutMs: target.timeoutMs, status: result?.status };
}

function output(target: McpConnectTarget, options: { dryRun: boolean; providerCalled: boolean; result?: McpConnectProviderResult }): McpConnectOutput {
  return { kind: "agentCore.basicTool.mcp.connect", target, operationPreview: preview(target, options.result), dryRun: options.dryRun, executionBlocked: options.dryRun, providerCalled: options.providerCalled, permissionsRequired: permissionsRequired(target), unsafeSideEffects: true, providerMetadata: options.result?.providerMetadata };
}

export function planMcpConnect(request: unknown = {}): McpConnectResult {
  const normalized = validate(request, { legacyPlan: true });
  if (!normalized.ok) return failure(normalized, normalized.context);
  if (normalized.context.dryRun === false) return failure({ ok: false, code: "REAL_EXECUTION_BLOCKED", message: "planMcpConnect only produces dry-run envelopes.", boundary: "contract", context: normalized.context }, normalized.context);
  return { ok: true, toolId: "mcp.connect", output: output(normalized.target, { dryRun: true, providerCalled: false }), audit: [auditEvent("mcp.connect.planned", true, normalized.context)], events: ["basicTool.mcp.connect.dryRun"] };
}

export async function executeMcpConnect(request: unknown = {}, provider?: McpConnectProvider): Promise<McpConnectResult> {
  const normalized = validate(request, { legacyPlan: false });
  if (!normalized.ok) return failure(normalized, normalized.context);
  if (normalized.context.dryRun !== false) return { ok: true, toolId: "mcp.connect", output: output(normalized.target, { dryRun: true, providerCalled: false }), audit: [auditEvent("mcp.connect.planned", true, normalized.context)], events: ["basicTool.mcp.connect.dryRun"] };
  if (!guardAccepted(normalized.context.guard)) return failure({ ok: false, code: "GOVERNANCE_REJECTED", message: "mcp.connect requires an accepted runtime guard before real dispatch.", boundary: "governance", context: normalized.context }, normalized.context);
  if (provider === undefined) return failure({ ok: false, code: "PROVIDER_UNAVAILABLE", message: "Runtime MCP connect provider is unavailable.", boundary: "provider", context: normalized.context }, normalized.context, "basicTool.mcp.connect.providerUnavailable");
  try {
    const result = await provider({ serverId: normalized.target.serverId, connectionId: normalized.target.connectionId, transportHint: normalized.target.transportHint ?? normalized.target.transport, timeoutMs: normalized.target.timeoutMs }, { runtimeId: normalized.context.runtimeId, sessionId: normalized.context.sessionId, invocationId: normalized.context.invocationId, auditMetadata: normalized.context.auditMetadata });
    return { ok: true, toolId: "mcp.connect", output: output(normalized.target, { dryRun: false, providerCalled: true, result }), audit: [auditEvent("mcp.connect.executed", false, normalized.context)], events: ["basicTool.mcp.connect.executed"] };
  } catch {
    return failure({ ok: false, code: "PROVIDER_REJECTED", message: "Runtime MCP provider failed connect.", boundary: "provider", context: normalized.context }, normalized.context, "basicTool.mcp.connect.providerRejected");
  }
}
