import { guardAccepted, isJsonObject, optionalTrimmedString, type McpToolAuditEvent } from "../../_shared/baseToolAdapter.js";
import {
  createMcpToolRegistryAuditEvent,
  createMcpToolRegistryFailure,
  ensureMcpToolRegistryPermissions,
  ensureMcpToolRegistryScope,
  mcpRegisterToolDescriptor,
  normalizeMcpServerId,
  normalizeMcpToolName,
  policyFailure,
  type McpToolRegistryContext,
  type McpToolRegistryErrorCode,
  type McpToolRegistryPermission,
  type McpToolRegistryResult,
} from "../mcp.registerTool/core.js";

export type UnregisterMcpToolTarget = { serverId: string; toolName: string; keepAuditRecord?: boolean };
export type UnregisterMcpToolRequest = { target?: { serverId?: unknown; toolName?: unknown; keepAuditRecord?: unknown } | null; context?: McpToolRegistryContext };
export type UnregisterMcpToolProviderRequest = UnregisterMcpToolTarget;
export type UnregisterMcpToolProviderResult = {
  toolName?: string;
  status: "unregistered" | "not_found" | "pending";
  providerMetadata?: Readonly<Record<string, unknown>>;
  raw?: unknown;
};
export type UnregisterMcpToolProvider = (
  request: UnregisterMcpToolProviderRequest,
  context: Readonly<Record<string, unknown>>,
) => Promise<UnregisterMcpToolProviderResult> | UnregisterMcpToolProviderResult;

export type UnregisterMcpToolEnvelope = {
  toolName: string;
  state: "planned" | "unregistered" | "not_found" | "pending";
  keepAuditRecord: boolean;
  source: "mockable-envelope" | "runtime-provider";
};
export type UnregisterMcpToolOutput = {
  kind: "agentCore.basicTool.mcp.unregisterTool";
  target: UnregisterMcpToolTarget;
  dryRun: boolean;
  executionBlocked: boolean;
  providerCalled: boolean;
  permissionsRequired: readonly McpToolRegistryPermission[];
  unsafeSideEffects: true;
  acceptedScopes: readonly string[];
  registryEnvelope: UnregisterMcpToolEnvelope;
  providerMetadata?: Readonly<Record<string, unknown>>;
};
export type UnregisterMcpToolResult = McpToolRegistryResult<UnregisterMcpToolOutput>;

export const mcpUnregisterToolDescriptor = {
  toolId: "mcp.unregisterTool",
  capability: "unregister-mcp-tool",
  route: "agent_executionEngine.basic_toolLayer.baseTools.mcpBase.tool",
  permissionsRequired: mcpRegisterToolDescriptor.permissionsRequired,
  defaultDryRun: true,
  unsafeSideEffects: true,
  tapOwnsApproval: true,
  runtimeOwnsMcpClient: true,
  providerBoundary: "BaseToolExecutorPort.mcp.unregisterTool",
} as const;

type ValidationFailure = { ok: false; code: McpToolRegistryErrorCode; message: string; boundary: "input" | "contract" | "permission" | "scope" | "governance" | "provider"; context?: McpToolRegistryContext };
type EarlyFailure = Extract<McpToolRegistryResult<UnregisterMcpToolOutput>, { ok: false }>;
type ValidationSuccess = { ok: true; target: UnregisterMcpToolTarget; context: McpToolRegistryContext; acceptedScopes: readonly string[] };

function normalizeContext(value: unknown): McpToolRegistryContext | ValidationFailure {
  if (value === undefined) return {};
  if (!isJsonObject(value)) return { ok: false, code: "INVALID_CONTEXT", message: "mcp.unregisterTool context must be a JSON object.", boundary: "input" };
  const base = value as McpToolRegistryContext;
  return {
    ...base,
    serverId: optionalTrimmedString(base.serverId),
    invocationId: optionalTrimmedString(base.invocationId),
    runtimeId: optionalTrimmedString(base.runtimeId),
    sessionId: optionalTrimmedString(base.sessionId),
  };
}

function validate(request: unknown): ValidationSuccess | ValidationFailure | EarlyFailure {
  const root = request === undefined ? {} : request;
  if (!isJsonObject(root)) return { ok: false, code: "INVALID_REQUEST", message: "mcp.unregisterTool request must be a JSON object.", boundary: "input" };
  const context = normalizeContext(root.context);
  if ("ok" in context) return context;
  if (root.target !== undefined && root.target !== null && !isJsonObject(root.target)) return { ok: false, code: "MISSING_SERVER_ID", message: "mcp.unregisterTool requires target.serverId or context.serverId", boundary: "input", context };
  const target = isJsonObject(root.target) ? root.target : {};
  const serverId = normalizeMcpServerId("mcp.unregisterTool", target.serverId, context);
  if (typeof serverId !== "string") return serverId;
  const toolName = normalizeMcpToolName("mcp.unregisterTool", target.toolName, context, serverId);
  if (typeof toolName !== "string") return toolName;
  const scope = ensureMcpToolRegistryScope<UnregisterMcpToolOutput>("mcp.unregisterTool", serverId, context);
  if (scope !== undefined) return scope;
  const permissions = ensureMcpToolRegistryPermissions<UnregisterMcpToolOutput>("mcp.unregisterTool", mcpUnregisterToolDescriptor.permissionsRequired, context, serverId);
  if (permissions !== undefined) return permissions;
  return { ok: true, target: { serverId, toolName, keepAuditRecord: target.keepAuditRecord !== false }, context, acceptedScopes: context.requestedScopes ?? [] };
}

function auditEvent(type: string, dryRun: boolean, context: McpToolRegistryContext, serverId: string, metadata?: Readonly<Record<string, unknown>>): McpToolAuditEvent {
  return createMcpToolRegistryAuditEvent("mcp.unregisterTool", type, { ...context, dryRun }, serverId, metadata);
}

function envelope(target: UnregisterMcpToolTarget, result?: UnregisterMcpToolProviderResult): UnregisterMcpToolEnvelope {
  return {
    toolName: result?.toolName ?? target.toolName,
    state: result?.status ?? "planned",
    keepAuditRecord: target.keepAuditRecord !== false,
    source: result === undefined ? "mockable-envelope" : "runtime-provider",
  };
}

function output(normalized: ValidationSuccess, options: { dryRun: boolean; providerCalled: boolean; result?: UnregisterMcpToolProviderResult }): UnregisterMcpToolOutput {
  return {
    kind: "agentCore.basicTool.mcp.unregisterTool",
    target: normalized.target,
    dryRun: options.dryRun,
    executionBlocked: options.dryRun,
    providerCalled: options.providerCalled,
    permissionsRequired: mcpUnregisterToolDescriptor.permissionsRequired,
    unsafeSideEffects: true,
    acceptedScopes: normalized.acceptedScopes,
    registryEnvelope: envelope(normalized.target, options.result),
    providerMetadata: options.result?.providerMetadata,
  };
}

export function planMcpToolUnregistration(request: unknown = {}): UnregisterMcpToolResult {
  const normalized = validate(request);
  if (!normalized.ok) {
    if ("error" in normalized) return normalized as unknown as UnregisterMcpToolResult;
    return createMcpToolRegistryFailure("mcp.unregisterTool", normalized.code, normalized.message, normalized.boundary, normalized.context);
  }
  const blocked = policyFailure<UnregisterMcpToolOutput>("mcp.unregisterTool", normalized.context, normalized.target.serverId);
  if (blocked !== undefined) return blocked;
  if (normalized.context.dryRun === false) return createMcpToolRegistryFailure("mcp.unregisterTool", "REAL_EXECUTION_BLOCKED", "mcp.unregisterTool only returns a guarded dry-run plan through plan* helpers", "contract", normalized.context, normalized.target.serverId);
  return { ok: true, toolId: "mcp.unregisterTool", output: output(normalized, { dryRun: true, providerCalled: false }), audit: [auditEvent("agentCore.basicTool.mcp.unregisterTool.dryRun", true, normalized.context, normalized.target.serverId, { toolName: normalized.target.toolName, keepAuditRecord: normalized.target.keepAuditRecord })], events: ["basicTool.mcp.unregisterTool.dryRun"] };
}

export async function executeMcpToolUnregistration(request: unknown = {}, provider?: UnregisterMcpToolProvider): Promise<UnregisterMcpToolResult> {
  const normalized = validate(request);
  if (!normalized.ok) {
    if ("error" in normalized) return normalized as unknown as UnregisterMcpToolResult;
    return createMcpToolRegistryFailure("mcp.unregisterTool", normalized.code, normalized.message, normalized.boundary, normalized.context);
  }
  const blocked = policyFailure<UnregisterMcpToolOutput>("mcp.unregisterTool", normalized.context, normalized.target.serverId);
  if (blocked !== undefined) return blocked;
  if (normalized.context.dryRun !== false) return { ok: true, toolId: "mcp.unregisterTool", output: output(normalized, { dryRun: true, providerCalled: false }), audit: [auditEvent("agentCore.basicTool.mcp.unregisterTool.dryRun", true, normalized.context, normalized.target.serverId, { toolName: normalized.target.toolName, keepAuditRecord: normalized.target.keepAuditRecord })], events: ["basicTool.mcp.unregisterTool.dryRun"] };
  if (!guardAccepted(normalized.context.guard)) return createMcpToolRegistryFailure("mcp.unregisterTool", "GOVERNANCE_REJECTED", "mcp.unregisterTool requires an accepted runtime guard before real dispatch.", "governance", normalized.context, normalized.target.serverId);
  if (provider === undefined) return createMcpToolRegistryFailure("mcp.unregisterTool", "PROVIDER_UNAVAILABLE", "Runtime MCP unregisterTool provider is unavailable.", "provider", normalized.context, normalized.target.serverId, "basicTool.mcp.unregisterTool.providerUnavailable");
  try {
    const result = await provider(normalized.target, { runtimeId: normalized.context.runtimeId, sessionId: normalized.context.sessionId, invocationId: normalized.context.invocationId, auditMetadata: normalized.context.auditMetadata });
    return { ok: true, toolId: "mcp.unregisterTool", output: output(normalized, { dryRun: false, providerCalled: true, result }), audit: [auditEvent("agentCore.basicTool.mcp.unregisterTool.executed", false, normalized.context, normalized.target.serverId, { toolName: normalized.target.toolName })], events: ["basicTool.mcp.unregisterTool.executed"] };
  } catch {
    return createMcpToolRegistryFailure("mcp.unregisterTool", "PROVIDER_REJECTED", "Runtime MCP provider failed unregisterTool.", "provider", normalized.context, normalized.target.serverId, "basicTool.mcp.unregisterTool.providerRejected");
  }
}
