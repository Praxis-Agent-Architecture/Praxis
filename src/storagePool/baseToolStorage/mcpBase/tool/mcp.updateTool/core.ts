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
  type McpToolDefinition,
  type McpToolRegistryContext,
  type McpToolRegistryErrorCode,
  type McpToolRegistryPermission,
  type McpToolRegistryResult,
} from "../mcp.registerTool/core.js";

export type UpdateMcpToolPatch = Partial<Omit<McpToolDefinition, "name">> & { name?: string };
export type UpdateMcpToolTarget = { serverId: string; toolName: string; patch: UpdateMcpToolPatch };
export type UpdateMcpToolRequest = {
  target?: {
    serverId?: unknown;
    toolName?: unknown;
    patch?: unknown;
  } | null;
  context?: McpToolRegistryContext;
};
export type UpdateMcpToolProviderRequest = UpdateMcpToolTarget;
export type UpdateMcpToolProviderResult = {
  toolName?: string;
  status: "updated" | "not_found" | "pending";
  providerMetadata?: Readonly<Record<string, unknown>>;
  raw?: unknown;
};
export type UpdateMcpToolProvider = (
  request: UpdateMcpToolProviderRequest,
  context: Readonly<Record<string, unknown>>,
) => Promise<UpdateMcpToolProviderResult> | UpdateMcpToolProviderResult;

export type UpdateMcpToolEnvelope = {
  toolName: string;
  state: "planned" | "updated" | "not_found" | "pending";
  patchKeys: readonly string[];
  source: "mockable-envelope" | "runtime-provider";
};
export type UpdateMcpToolOutput = {
  kind: "agentCore.basicTool.mcp.updateTool";
  target: UpdateMcpToolTarget;
  dryRun: boolean;
  executionBlocked: boolean;
  providerCalled: boolean;
  permissionsRequired: readonly McpToolRegistryPermission[];
  unsafeSideEffects: true;
  acceptedScopes: readonly string[];
  registryEnvelope: UpdateMcpToolEnvelope;
  providerMetadata?: Readonly<Record<string, unknown>>;
};
export type UpdateMcpToolResult = McpToolRegistryResult<UpdateMcpToolOutput>;

export const mcpUpdateToolDescriptor = {
  toolId: "mcp.updateTool",
  capability: "update-mcp-tool-definition",
  route: "agent_executionEngine.basic_toolLayer.baseTools.mcpBase.tool",
  permissionsRequired: mcpRegisterToolDescriptor.permissionsRequired,
  defaultDryRun: true,
  unsafeSideEffects: true,
  tapOwnsApproval: true,
  runtimeOwnsMcpClient: true,
  providerBoundary: "BaseToolExecutorPort.mcp.updateTool",
} as const;

type ValidationFailure = { ok: false; code: McpToolRegistryErrorCode; message: string; boundary: "input" | "contract" | "permission" | "scope" | "governance" | "provider"; context?: McpToolRegistryContext };
type EarlyFailure = Extract<McpToolRegistryResult<UpdateMcpToolOutput>, { ok: false }>;
type ValidationSuccess = { ok: true; target: UpdateMcpToolTarget; context: McpToolRegistryContext; acceptedScopes: readonly string[] };

function normalizeContext(value: unknown): McpToolRegistryContext | ValidationFailure {
  if (value === undefined) return {};
  if (!isJsonObject(value)) return { ok: false, code: "INVALID_CONTEXT", message: "mcp.updateTool context must be a JSON object.", boundary: "input" };
  const base = value as McpToolRegistryContext;
  return {
    ...base,
    serverId: optionalTrimmedString(base.serverId),
    invocationId: optionalTrimmedString(base.invocationId),
    runtimeId: optionalTrimmedString(base.runtimeId),
    sessionId: optionalTrimmedString(base.sessionId),
  };
}

function normalizeUpdatePatch(patch: unknown, context: McpToolRegistryContext, serverId: string): UpdateMcpToolPatch | EarlyFailure {
  if (!isJsonObject(patch) || Object.keys(patch).length === 0) {
    return createMcpToolRegistryFailure("mcp.updateTool", "MISSING_UPDATE_PATCH", "mcp.updateTool requires a non-empty target.patch", "input", context, serverId);
  }
  if (patch.inputSchema !== undefined && !isJsonObject(patch.inputSchema)) {
    return createMcpToolRegistryFailure("mcp.updateTool", "INVALID_UPDATE_PATCH", "mcp.updateTool target.patch.inputSchema must be an object when provided", "contract", context, serverId);
  }
  if (patch.outputSchema !== undefined && !isJsonObject(patch.outputSchema)) {
    return createMcpToolRegistryFailure("mcp.updateTool", "INVALID_UPDATE_PATCH", "mcp.updateTool target.patch.outputSchema must be an object when provided", "contract", context, serverId);
  }
  if (patch.metadata !== undefined && !isJsonObject(patch.metadata)) {
    return createMcpToolRegistryFailure("mcp.updateTool", "INVALID_UPDATE_PATCH", "mcp.updateTool target.patch.metadata must be an object when provided", "contract", context, serverId);
  }
  const normalized: UpdateMcpToolPatch = {};
  const name = optionalTrimmedString(patch.name);
  const description = optionalTrimmedString(patch.description);
  if (name !== undefined) normalized.name = name;
  if (description !== undefined) normalized.description = description;
  if (isJsonObject(patch.inputSchema)) normalized.inputSchema = patch.inputSchema;
  if (isJsonObject(patch.outputSchema)) normalized.outputSchema = patch.outputSchema;
  if (isJsonObject(patch.metadata)) normalized.metadata = patch.metadata;
  if (Object.keys(normalized).length === 0) {
    return createMcpToolRegistryFailure("mcp.updateTool", "MISSING_UPDATE_PATCH", "mcp.updateTool requires a non-empty target.patch", "input", context, serverId);
  }
  return normalized;
}

function validate(request: unknown): ValidationSuccess | ValidationFailure | EarlyFailure {
  const root = request === undefined ? {} : request;
  if (!isJsonObject(root)) return { ok: false, code: "INVALID_REQUEST", message: "mcp.updateTool request must be a JSON object.", boundary: "input" };
  const context = normalizeContext(root.context);
  if ("ok" in context) return context;
  if (root.target !== undefined && root.target !== null && !isJsonObject(root.target)) return { ok: false, code: "MISSING_SERVER_ID", message: "mcp.updateTool requires target.serverId or context.serverId", boundary: "input", context };
  const target = isJsonObject(root.target) ? root.target : {};
  const serverId = normalizeMcpServerId("mcp.updateTool", target.serverId, context);
  if (typeof serverId !== "string") return serverId;
  const toolName = normalizeMcpToolName("mcp.updateTool", target.toolName, context, serverId);
  if (typeof toolName !== "string") return toolName;
  const patch = normalizeUpdatePatch(target.patch, context, serverId);
  if ("ok" in patch) return patch;
  const scope = ensureMcpToolRegistryScope<UpdateMcpToolOutput>("mcp.updateTool", serverId, context);
  if (scope !== undefined) return scope;
  const permissions = ensureMcpToolRegistryPermissions<UpdateMcpToolOutput>("mcp.updateTool", mcpUpdateToolDescriptor.permissionsRequired, context, serverId);
  if (permissions !== undefined) return permissions;
  return { ok: true, target: { serverId, toolName, patch }, context, acceptedScopes: context.requestedScopes ?? [] };
}

function auditEvent(type: string, dryRun: boolean, context: McpToolRegistryContext, serverId: string, metadata?: Readonly<Record<string, unknown>>): McpToolAuditEvent {
  return createMcpToolRegistryAuditEvent("mcp.updateTool", type, { ...context, dryRun }, serverId, metadata);
}

function envelope(target: UpdateMcpToolTarget, result?: UpdateMcpToolProviderResult): UpdateMcpToolEnvelope {
  return {
    toolName: result?.toolName ?? target.toolName,
    state: result?.status ?? "planned",
    patchKeys: Object.keys(target.patch).sort(),
    source: result === undefined ? "mockable-envelope" : "runtime-provider",
  };
}

function output(normalized: ValidationSuccess, options: { dryRun: boolean; providerCalled: boolean; result?: UpdateMcpToolProviderResult }): UpdateMcpToolOutput {
  return {
    kind: "agentCore.basicTool.mcp.updateTool",
    target: normalized.target,
    dryRun: options.dryRun,
    executionBlocked: options.dryRun,
    providerCalled: options.providerCalled,
    permissionsRequired: mcpUpdateToolDescriptor.permissionsRequired,
    unsafeSideEffects: true,
    acceptedScopes: normalized.acceptedScopes,
    registryEnvelope: envelope(normalized.target, options.result),
    providerMetadata: options.result?.providerMetadata,
  };
}

export function planMcpToolUpdate(request: unknown = {}): UpdateMcpToolResult {
  const normalized = validate(request);
  if (!normalized.ok) {
    if ("error" in normalized) return normalized as unknown as UpdateMcpToolResult;
    return createMcpToolRegistryFailure("mcp.updateTool", normalized.code, normalized.message, normalized.boundary, normalized.context);
  }
  const blocked = policyFailure<UpdateMcpToolOutput>("mcp.updateTool", normalized.context, normalized.target.serverId);
  if (blocked !== undefined) return blocked;
  if (normalized.context.dryRun === false) return createMcpToolRegistryFailure("mcp.updateTool", "REAL_EXECUTION_BLOCKED", "mcp.updateTool only returns a guarded dry-run plan through plan* helpers", "contract", normalized.context, normalized.target.serverId);
  return { ok: true, toolId: "mcp.updateTool", output: output(normalized, { dryRun: true, providerCalled: false }), audit: [auditEvent("agentCore.basicTool.mcp.updateTool.dryRun", true, normalized.context, normalized.target.serverId, { toolName: normalized.target.toolName, patchKeys: Object.keys(normalized.target.patch).sort() })], events: ["basicTool.mcp.updateTool.dryRun"] };
}

export async function executeMcpToolUpdate(request: unknown = {}, provider?: UpdateMcpToolProvider): Promise<UpdateMcpToolResult> {
  const normalized = validate(request);
  if (!normalized.ok) {
    if ("error" in normalized) return normalized as unknown as UpdateMcpToolResult;
    return createMcpToolRegistryFailure("mcp.updateTool", normalized.code, normalized.message, normalized.boundary, normalized.context);
  }
  const blocked = policyFailure<UpdateMcpToolOutput>("mcp.updateTool", normalized.context, normalized.target.serverId);
  if (blocked !== undefined) return blocked;
  if (normalized.context.dryRun !== false) return { ok: true, toolId: "mcp.updateTool", output: output(normalized, { dryRun: true, providerCalled: false }), audit: [auditEvent("agentCore.basicTool.mcp.updateTool.dryRun", true, normalized.context, normalized.target.serverId, { toolName: normalized.target.toolName, patchKeys: Object.keys(normalized.target.patch).sort() })], events: ["basicTool.mcp.updateTool.dryRun"] };
  if (!guardAccepted(normalized.context.guard)) return createMcpToolRegistryFailure("mcp.updateTool", "GOVERNANCE_REJECTED", "mcp.updateTool requires an accepted runtime guard before real dispatch.", "governance", normalized.context, normalized.target.serverId);
  if (provider === undefined) return createMcpToolRegistryFailure("mcp.updateTool", "PROVIDER_UNAVAILABLE", "Runtime MCP updateTool provider is unavailable.", "provider", normalized.context, normalized.target.serverId, "basicTool.mcp.updateTool.providerUnavailable");
  try {
    const result = await provider(normalized.target, { runtimeId: normalized.context.runtimeId, sessionId: normalized.context.sessionId, invocationId: normalized.context.invocationId, auditMetadata: normalized.context.auditMetadata });
    return { ok: true, toolId: "mcp.updateTool", output: output(normalized, { dryRun: false, providerCalled: true, result }), audit: [auditEvent("agentCore.basicTool.mcp.updateTool.executed", false, normalized.context, normalized.target.serverId, { toolName: normalized.target.toolName })], events: ["basicTool.mcp.updateTool.executed"] };
  } catch {
    return createMcpToolRegistryFailure("mcp.updateTool", "PROVIDER_REJECTED", "Runtime MCP provider failed updateTool.", "provider", normalized.context, normalized.target.serverId, "basicTool.mcp.updateTool.providerRejected");
  }
}
