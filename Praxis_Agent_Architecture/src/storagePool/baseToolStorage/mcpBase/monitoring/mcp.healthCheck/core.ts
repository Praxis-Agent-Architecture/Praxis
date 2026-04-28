import { cleanStringList, guardAccepted, isJsonObject, optionalTrimmedString, type McpToolAuditEvent, type McpToolResult } from "../../_shared/baseToolAdapter.js";

export type McpHealthCheckPermission = "mcp:connection:read" | "mcp:monitor:read";
export type McpHealthCheckContext = { runtimeId?: string; sessionId?: string; invocationId?: string; dryRun?: boolean; guard?: { accepted?: boolean; allowed?: boolean; reason?: string }; allowedServerIds?: readonly string[]; grantedPermissions?: readonly McpHealthCheckPermission[]; auditMetadata?: Readonly<Record<string, unknown>> };
export type McpHealthCheckTarget = { serverId: string; connectionId?: string; timeoutMs?: number; includeCapabilities?: boolean; includeLatencyProbe?: boolean };
export type McpHealthCheckRequest = { target?: Partial<McpHealthCheckTarget> | null; context?: McpHealthCheckContext };
export type McpHealthCheckProbeEnvelope = { connection: string; latencyMs?: number; capabilities: readonly string[]; status: "healthy" | "degraded" | "unhealthy" | "unknown" };
export type McpHealthCheckProviderResult = { status: "healthy" | "degraded" | "unhealthy" | "unknown"; connection?: string; latencyMs?: number; capabilities?: readonly string[]; providerMetadata?: Readonly<Record<string, unknown>>; raw?: unknown };
export type McpHealthCheckProvider = (request: McpHealthCheckTarget, context: Readonly<Record<string, unknown>>) => Promise<McpHealthCheckProviderResult> | McpHealthCheckProviderResult;
export type McpHealthCheckOutput = { kind: "agentCore.basicTool.mcp.healthCheck"; target: McpHealthCheckTarget; dryRun: boolean; executionBlocked: boolean; providerCalled: boolean; permissionsRequired: readonly McpHealthCheckPermission[]; unsafeSideEffects: false; probeEnvelope: McpHealthCheckProbeEnvelope; providerMetadata?: Readonly<Record<string, unknown>> };
export type McpHealthCheckErrorCode = "INVALID_REQUEST" | "INVALID_CONTEXT" | "MISSING_SERVER_ID" | "INVALID_SERVER_ID" | "INVALID_TIMEOUT" | "SCOPE_REJECTED" | "PERMISSION_DENIED" | "GOVERNANCE_REJECTED" | "REAL_EXECUTION_BLOCKED" | "PROVIDER_UNAVAILABLE" | "PROVIDER_REJECTED";
export type McpHealthCheckResult = McpToolResult<McpHealthCheckOutput, McpHealthCheckErrorCode>;

export const mcpHealthCheckDescriptor = { toolId: "mcp.healthCheck", capability: "health-check", route: "agent_executionEngine.basic_toolLayer.baseTools.mcpBase.monitoring", defaultDryRun: true, tapOwnsApproval: true, permissionsRequired: ["mcp:connection:read", "mcp:monitor:read"], defaultTimeoutMs: 5_000, maxTimeoutMs: 60_000 } as const;

type ValidationFailure = { ok: false; code: McpHealthCheckErrorCode; message: string; boundary: "input" | "context" | "scope" | "permission" | "contract" | "governance" | "provider"; context?: McpHealthCheckContext };
type ValidationSuccess = { ok: true; target: McpHealthCheckTarget; context: McpHealthCheckContext };

function normalizeContext(value: unknown): McpHealthCheckContext | ValidationFailure {
  if (value === undefined) return {};
  if (!isJsonObject(value)) return { ok: false, code: "INVALID_CONTEXT", message: "mcp.healthCheck context must be a JSON object.", boundary: "context" };
  const allowedServerIds = cleanStringList(value.allowedServerIds);
  const grantedPermissions = cleanStringList(value.grantedPermissions) as readonly McpHealthCheckPermission[] | undefined;
  if ((value.allowedServerIds !== undefined && allowedServerIds === undefined) || (value.grantedPermissions !== undefined && grantedPermissions === undefined)) return { ok: false, code: "INVALID_CONTEXT", message: "mcp.healthCheck context lists must contain strings.", boundary: "context" };
  return { runtimeId: optionalTrimmedString(value.runtimeId), sessionId: optionalTrimmedString(value.sessionId), invocationId: optionalTrimmedString(value.invocationId), dryRun: typeof value.dryRun === "boolean" ? value.dryRun : undefined, guard: isJsonObject(value.guard) ? value.guard : undefined, allowedServerIds, grantedPermissions, auditMetadata: isJsonObject(value.auditMetadata) ? value.auditMetadata : undefined };
}

function validate(request: unknown): ValidationSuccess | ValidationFailure {
  const root = request === undefined ? {} : request;
  if (!isJsonObject(root)) return { ok: false, code: "INVALID_REQUEST", message: "mcp.healthCheck request must be a JSON object.", boundary: "input" };
  const context = normalizeContext(root.context);
  if ("ok" in context) return context;
  if (!isJsonObject(root.target)) return { ok: false, code: "MISSING_SERVER_ID", message: "mcp.healthCheck requires target.serverId.", boundary: "input", context };
  if (root.target.serverId !== undefined && typeof root.target.serverId !== "string") return { ok: false, code: "INVALID_SERVER_ID", message: "mcp.healthCheck target.serverId must be a string.", boundary: "input", context };
  const serverId = optionalTrimmedString(root.target.serverId);
  if (serverId === undefined) return { ok: false, code: "MISSING_SERVER_ID", message: "mcp.healthCheck requires target.serverId.", boundary: "input", context };
  const rawTimeoutMs = root.target.timeoutMs;
  if (rawTimeoutMs !== undefined && (typeof rawTimeoutMs !== "number" || !Number.isInteger(rawTimeoutMs) || rawTimeoutMs < 1 || rawTimeoutMs > mcpHealthCheckDescriptor.maxTimeoutMs)) return { ok: false, code: "INVALID_TIMEOUT", message: "mcp.healthCheck target.timeoutMs must be an integer between 1 and 60000.", boundary: "input", context };
  const timeoutMs = rawTimeoutMs === undefined ? undefined : rawTimeoutMs;
  if (context.allowedServerIds !== undefined && !context.allowedServerIds.includes(serverId)) return { ok: false, code: "SCOPE_REJECTED", message: "mcp.healthCheck target server is outside the allowed MCP server scope.", boundary: "scope", context };
  if (context.grantedPermissions !== undefined && !mcpHealthCheckDescriptor.permissionsRequired.every((permission) => context.grantedPermissions?.includes(permission))) return { ok: false, code: "PERMISSION_DENIED", message: "mcp.healthCheck requires mcp:connection:read and mcp:monitor:read.", boundary: "permission", context };
  return { ok: true, target: { serverId, connectionId: optionalTrimmedString(root.target.connectionId), timeoutMs: timeoutMs === undefined ? undefined : timeoutMs, includeCapabilities: root.target.includeCapabilities === true, includeLatencyProbe: root.target.includeLatencyProbe === true }, context };
}

function auditEvent(type: string, dryRun: boolean, context: McpHealthCheckContext): McpToolAuditEvent {
  return { type, toolId: "mcp.healthCheck", invocationId: context.invocationId ?? "mcp.healthCheck:dry-run", dryRun, metadata: { runtimeId: context.runtimeId, sessionId: context.sessionId, ...(context.auditMetadata ?? {}) } };
}

function failure(error: ValidationFailure, context: McpHealthCheckContext = {}, event = "basicTool.mcp.healthCheck.rejected"): McpHealthCheckResult {
  return { ok: false, toolId: "mcp.healthCheck", error: { code: error.code, message: error.message, boundary: error.boundary, publicSafe: true, safeForRuntimeInspection: true, internalDetailExposed: false }, audit: [auditEvent("mcp.healthCheck.rejected", context.dryRun !== false, context)], events: [event] };
}

function probe(result?: McpHealthCheckProviderResult): McpHealthCheckProbeEnvelope {
  return { connection: result?.connection ?? "not-probed", latencyMs: result?.latencyMs, capabilities: result?.capabilities ?? [], status: result?.status ?? "unknown" };
}

function output(target: McpHealthCheckTarget, options: { dryRun: boolean; providerCalled: boolean; result?: McpHealthCheckProviderResult }): McpHealthCheckOutput {
  return { kind: "agentCore.basicTool.mcp.healthCheck", target, dryRun: options.dryRun, executionBlocked: options.dryRun, providerCalled: options.providerCalled, permissionsRequired: mcpHealthCheckDescriptor.permissionsRequired, unsafeSideEffects: false, probeEnvelope: probe(options.result), providerMetadata: options.result?.providerMetadata };
}

export function planMcpHealthCheck(request: unknown = {}): McpHealthCheckResult {
  const normalized = validate(request);
  if (!normalized.ok) return failure(normalized, normalized.context);
  if (normalized.context.dryRun === false) return failure({ ok: false, code: "REAL_EXECUTION_BLOCKED", message: "planMcpHealthCheck only produces dry-run envelopes.", boundary: "contract", context: normalized.context }, normalized.context);
  return { ok: true, toolId: "mcp.healthCheck", output: output(normalized.target, { dryRun: true, providerCalled: false }), audit: [auditEvent("mcp.healthCheck.planned", true, normalized.context)], events: ["basicTool.mcp.healthCheck.dryRun"] };
}

export async function executeMcpHealthCheck(request: unknown = {}, provider?: McpHealthCheckProvider): Promise<McpHealthCheckResult> {
  const normalized = validate(request);
  if (!normalized.ok) return failure(normalized, normalized.context);
  if (normalized.context.dryRun !== false) return { ok: true, toolId: "mcp.healthCheck", output: output(normalized.target, { dryRun: true, providerCalled: false }), audit: [auditEvent("mcp.healthCheck.planned", true, normalized.context)], events: ["basicTool.mcp.healthCheck.dryRun"] };
  if (!guardAccepted(normalized.context.guard)) return failure({ ok: false, code: "GOVERNANCE_REJECTED", message: "mcp.healthCheck requires an accepted runtime guard before real dispatch.", boundary: "governance", context: normalized.context }, normalized.context);
  if (provider === undefined) return failure({ ok: false, code: "PROVIDER_UNAVAILABLE", message: "Runtime MCP healthCheck provider is unavailable.", boundary: "provider", context: normalized.context }, normalized.context, "basicTool.mcp.healthCheck.providerUnavailable");
  try {
    const result = await provider(normalized.target, { runtimeId: normalized.context.runtimeId, sessionId: normalized.context.sessionId, invocationId: normalized.context.invocationId, auditMetadata: normalized.context.auditMetadata });
    return { ok: true, toolId: "mcp.healthCheck", output: output(normalized.target, { dryRun: false, providerCalled: true, result }), audit: [auditEvent("mcp.healthCheck.executed", false, normalized.context)], events: ["basicTool.mcp.healthCheck.executed"] };
  } catch {
    return failure({ ok: false, code: "PROVIDER_REJECTED", message: "Runtime MCP provider failed healthCheck.", boundary: "provider", context: normalized.context }, normalized.context, "basicTool.mcp.healthCheck.providerRejected");
  }
}
