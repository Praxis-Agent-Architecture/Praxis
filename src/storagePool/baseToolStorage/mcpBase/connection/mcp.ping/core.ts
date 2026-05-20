import { cleanStringList, guardAccepted, isJsonObject, optionalTrimmedString, type McpToolAuditEvent, type McpToolResult } from "../../_shared/baseToolAdapter.js";

export type McpPingPermission = "mcp:ping";
export type McpPingContext = { runtimeId?: string; sessionId?: string; invocationId?: string; dryRun?: boolean; guard?: { accepted?: boolean; allowed?: boolean; reason?: string }; allowedServerIds?: readonly string[]; grantedPermissions?: readonly McpPingPermission[]; auditMetadata?: Readonly<Record<string, unknown>> };
export type McpPingTarget = { serverId: string; connectionId?: string; timeoutMs: number };
export type McpPingRequest = { target?: Partial<McpPingTarget> | null; context?: McpPingContext };
export type McpPingEnvelope = { serverId: string; connectionId?: string; probeState: "planned" | "probed"; timeoutMs: number; healthy: boolean | "unknown"; status?: string; latencyMs?: number };
export type McpPingProviderResult = { healthy: boolean | "unknown"; status?: string; latencyMs?: number; providerMetadata?: Readonly<Record<string, unknown>>; raw?: unknown };
export type McpPingProvider = (request: McpPingTarget, context: Readonly<Record<string, unknown>>) => Promise<McpPingProviderResult> | McpPingProviderResult;
export type McpPingOutput = { kind: "agentCore.basicTool.mcp.ping"; target: McpPingTarget; operationPreview: McpPingEnvelope; dryRun: boolean; executionBlocked: boolean; providerCalled: boolean; permissionsRequired: readonly McpPingPermission[]; unsafeSideEffects: false; providerMetadata?: Readonly<Record<string, unknown>> };
export type McpPingErrorCode = "INVALID_REQUEST" | "INVALID_CONTEXT" | "MISSING_SERVER_ID" | "INVALID_SERVER_ID" | "INVALID_TIMEOUT" | "SCOPE_REJECTED" | "PERMISSION_DENIED" | "GOVERNANCE_REJECTED" | "REAL_EXECUTION_BLOCKED" | "PROVIDER_UNAVAILABLE" | "PROVIDER_REJECTED";
export type McpPingResult = McpToolResult<McpPingOutput, McpPingErrorCode>;

export const mcpPingDescriptor = { toolId: "mcp.ping", capability: "ping-mcp-connection", route: "agent_executionEngine.basic_toolLayer.baseTools.mcpBase.connection", defaultDryRun: true, tapOwnsApproval: true, permissionsRequired: ["mcp:ping"], defaultTimeoutMs: 5_000, maxTimeoutMs: 60_000 } as const;

type ValidationFailure = { ok: false; code: McpPingErrorCode; message: string; boundary: "input" | "context" | "scope" | "permission" | "contract" | "governance" | "provider"; context?: McpPingContext };
type ValidationSuccess = { ok: true; target: McpPingTarget; context: McpPingContext };

function normalizeContext(value: unknown): McpPingContext | ValidationFailure {
  if (value === undefined) return {};
  if (!isJsonObject(value)) return { ok: false, code: "INVALID_CONTEXT", message: "mcp.ping context must be a JSON object.", boundary: "context" };
  const allowedServerIds = cleanStringList(value.allowedServerIds);
  const grantedPermissions = cleanStringList(value.grantedPermissions) as readonly McpPingPermission[] | undefined;
  if ((value.allowedServerIds !== undefined && allowedServerIds === undefined) || (value.grantedPermissions !== undefined && grantedPermissions === undefined)) return { ok: false, code: "INVALID_CONTEXT", message: "mcp.ping context lists must contain strings.", boundary: "context" };
  return { runtimeId: optionalTrimmedString(value.runtimeId), sessionId: optionalTrimmedString(value.sessionId), invocationId: optionalTrimmedString(value.invocationId), dryRun: typeof value.dryRun === "boolean" ? value.dryRun : undefined, guard: isJsonObject(value.guard) ? value.guard : undefined, allowedServerIds, grantedPermissions, auditMetadata: isJsonObject(value.auditMetadata) ? value.auditMetadata : undefined };
}

function validate(request: unknown): ValidationSuccess | ValidationFailure {
  const root = request === undefined ? {} : request;
  if (!isJsonObject(root)) return { ok: false, code: "INVALID_REQUEST", message: "mcp.ping request must be a JSON object.", boundary: "input" };
  const context = normalizeContext(root.context);
  if ("ok" in context) return context;
  if (!isJsonObject(root.target)) return { ok: false, code: "MISSING_SERVER_ID", message: "mcp.ping requires target.serverId.", boundary: "input", context };
  if (root.target.serverId !== undefined && typeof root.target.serverId !== "string") return { ok: false, code: "INVALID_SERVER_ID", message: "mcp.ping target.serverId must be a string.", boundary: "input", context };
  const serverId = optionalTrimmedString(root.target.serverId);
  if (serverId === undefined) return { ok: false, code: "MISSING_SERVER_ID", message: "mcp.ping requires target.serverId.", boundary: "input", context };
  const rawTimeout = root.target.timeoutMs;
  if (rawTimeout !== undefined && (typeof rawTimeout !== "number" || !Number.isInteger(rawTimeout) || rawTimeout < 1 || rawTimeout > mcpPingDescriptor.maxTimeoutMs)) return { ok: false, code: "INVALID_TIMEOUT", message: "mcp.ping target.timeoutMs must be an integer between 1 and 60000.", boundary: "input", context };
  const timeoutMs = rawTimeout === undefined ? mcpPingDescriptor.defaultTimeoutMs : rawTimeout;
  if (context.allowedServerIds !== undefined && !context.allowedServerIds.includes(serverId)) return { ok: false, code: "SCOPE_REJECTED", message: "mcp.ping target server is outside allowed MCP server ids.", boundary: "scope", context };
  if (context.grantedPermissions !== undefined && !context.grantedPermissions.includes("mcp:ping")) return { ok: false, code: "PERMISSION_DENIED", message: "mcp.ping requires mcp:ping.", boundary: "permission", context };
  return { ok: true, target: { serverId, connectionId: optionalTrimmedString(root.target.connectionId), timeoutMs }, context };
}

function auditEvent(type: string, dryRun: boolean, context: McpPingContext): McpToolAuditEvent {
  return { type, toolId: "mcp.ping", invocationId: context.invocationId ?? "mcp.ping:dry-run", dryRun, metadata: { runtimeId: context.runtimeId, sessionId: context.sessionId, ...(context.auditMetadata ?? {}) } };
}

function failure(error: ValidationFailure, context: McpPingContext = {}, event = "basicTool.mcp.ping.rejected"): McpPingResult {
  return { ok: false, toolId: "mcp.ping", error: { code: error.code, message: error.message, boundary: error.boundary, publicSafe: true, safeForRuntimeInspection: true, internalDetailExposed: false }, audit: [auditEvent("mcp.ping.rejected", context.dryRun !== false, context)], events: [event] };
}

function preview(target: McpPingTarget, result?: McpPingProviderResult): McpPingEnvelope {
  return { serverId: target.serverId, connectionId: target.connectionId, probeState: result === undefined ? "planned" : "probed", timeoutMs: target.timeoutMs, healthy: result?.healthy ?? "unknown", status: result?.status, latencyMs: result?.latencyMs };
}

function output(target: McpPingTarget, options: { dryRun: boolean; providerCalled: boolean; result?: McpPingProviderResult }): McpPingOutput {
  return { kind: "agentCore.basicTool.mcp.ping", target, operationPreview: preview(target, options.result), dryRun: options.dryRun, executionBlocked: options.dryRun, providerCalled: options.providerCalled, permissionsRequired: mcpPingDescriptor.permissionsRequired, unsafeSideEffects: false, providerMetadata: options.result?.providerMetadata };
}

export function planMcpPing(request: unknown = {}): McpPingResult {
  const normalized = validate(request);
  if (!normalized.ok) return failure(normalized, normalized.context);
  if (normalized.context.dryRun === false) return failure({ ok: false, code: "REAL_EXECUTION_BLOCKED", message: "planMcpPing only produces dry-run envelopes.", boundary: "contract", context: normalized.context }, normalized.context);
  return { ok: true, toolId: "mcp.ping", output: output(normalized.target, { dryRun: true, providerCalled: false }), audit: [auditEvent("mcp.ping.planned", true, normalized.context)], events: ["basicTool.mcp.ping.dryRun"] };
}

export async function executeMcpPing(request: unknown = {}, provider?: McpPingProvider): Promise<McpPingResult> {
  const normalized = validate(request);
  if (!normalized.ok) return failure(normalized, normalized.context);
  if (normalized.context.dryRun !== false) return { ok: true, toolId: "mcp.ping", output: output(normalized.target, { dryRun: true, providerCalled: false }), audit: [auditEvent("mcp.ping.planned", true, normalized.context)], events: ["basicTool.mcp.ping.dryRun"] };
  if (!guardAccepted(normalized.context.guard)) return failure({ ok: false, code: "GOVERNANCE_REJECTED", message: "mcp.ping requires an accepted runtime guard before real dispatch.", boundary: "governance", context: normalized.context }, normalized.context);
  if (provider === undefined) return failure({ ok: false, code: "PROVIDER_UNAVAILABLE", message: "Runtime MCP ping provider is unavailable.", boundary: "provider", context: normalized.context }, normalized.context, "basicTool.mcp.ping.providerUnavailable");
  try {
    const result = await provider(normalized.target, { runtimeId: normalized.context.runtimeId, sessionId: normalized.context.sessionId, invocationId: normalized.context.invocationId, auditMetadata: normalized.context.auditMetadata });
    return { ok: true, toolId: "mcp.ping", output: output(normalized.target, { dryRun: false, providerCalled: true, result }), audit: [auditEvent("mcp.ping.executed", false, normalized.context)], events: ["basicTool.mcp.ping.executed"] };
  } catch {
    return failure({ ok: false, code: "PROVIDER_REJECTED", message: "Runtime MCP provider failed ping.", boundary: "provider", context: normalized.context }, normalized.context, "basicTool.mcp.ping.providerRejected");
  }
}
