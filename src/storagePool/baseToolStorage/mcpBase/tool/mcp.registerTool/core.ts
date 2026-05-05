import {
  cleanStringList,
  guardAccepted,
  isJsonObject,
  optionalTrimmedString,
  type McpToolAuditEvent,
  type McpToolResult,
} from "../../_shared/baseToolAdapter.js";

export type McpToolRegistryBoundary = "input" | "context" | "contract" | "permission" | "scope" | "governance" | "provider";
export type McpToolRegistryPermission = "mcp:tool:read" | "mcp:tool:write";

export type McpToolRegistryContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: { accepted?: boolean; allowed?: boolean; reason?: string };
  contract?: { accepted?: boolean; reason?: string };
  governance?: { accepted?: boolean; reason?: string };
  serverId?: string;
  allowedServerIds?: readonly string[];
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  grantedPermissions?: readonly McpToolRegistryPermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type McpToolDefinition = {
  name: string;
  description?: string;
  inputSchema?: Readonly<Record<string, unknown>>;
  outputSchema?: Readonly<Record<string, unknown>>;
  metadata?: Readonly<Record<string, unknown>>;
};

export type RegisterMcpToolTarget = {
  serverId: string;
  tool: McpToolDefinition;
  replaceExisting?: boolean;
};

export type RegisterMcpToolRequest = {
  target?: {
    serverId?: unknown;
    tool?: unknown;
    replaceExisting?: unknown;
  } | null;
  context?: McpToolRegistryContext;
};

export type RegisterMcpToolProviderRequest = RegisterMcpToolTarget;
export type RegisterMcpToolProviderResult = {
  name?: string;
  status: "registered" | "already_exists" | "pending";
  providerMetadata?: Readonly<Record<string, unknown>>;
  raw?: unknown;
};
export type RegisterMcpToolProvider = (
  request: RegisterMcpToolProviderRequest,
  context: Readonly<Record<string, unknown>>,
) => Promise<RegisterMcpToolProviderResult> | RegisterMcpToolProviderResult;

export type RegisterMcpToolEnvelope = {
  toolName: string;
  state: "planned" | "registered" | "already_exists" | "pending";
  replaceExisting: boolean;
  source: "mockable-envelope" | "runtime-provider";
};

export type RegisterMcpToolOutput = {
  kind: "agentCore.basicTool.mcp.registerTool";
  target: RegisterMcpToolTarget;
  dryRun: boolean;
  executionBlocked: boolean;
  providerCalled: boolean;
  permissionsRequired: readonly McpToolRegistryPermission[];
  unsafeSideEffects: true;
  acceptedScopes: readonly string[];
  registryEnvelope: RegisterMcpToolEnvelope;
  providerMetadata?: Readonly<Record<string, unknown>>;
};

export type McpToolRegistryErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_CONTEXT"
  | "MISSING_SERVER_ID"
  | "INVALID_SERVER_ID"
  | "MISSING_TOOL_NAME"
  | "MISSING_TOOL_DEFINITION"
  | "MISSING_UPDATE_PATCH"
  | "INVALID_TOOL_DEFINITION"
  | "INVALID_UPDATE_PATCH"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "REAL_EXECUTION_BLOCKED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_REJECTED";

export type McpToolRegistryResult<Output> = McpToolResult<Output, McpToolRegistryErrorCode>;
export type RegisterMcpToolResult = McpToolRegistryResult<RegisterMcpToolOutput>;

export const mcpRegisterToolDescriptor = {
  toolId: "mcp.registerTool",
  capability: "register-mcp-tool",
  route: "agent_executionEngine.basic_toolLayer.baseTools.mcpBase.tool",
  permissionsRequired: ["mcp:tool:read", "mcp:tool:write"],
  defaultDryRun: true,
  unsafeSideEffects: true,
  tapOwnsApproval: true,
  runtimeOwnsMcpClient: true,
  providerBoundary: "BaseToolExecutorPort.mcp.registerTool",
} as const;

type ValidationFailure = { ok: false; code: McpToolRegistryErrorCode; message: string; boundary: McpToolRegistryBoundary; context?: McpToolRegistryContext };
type EarlyFailure<Output> = Extract<McpToolRegistryResult<Output>, { ok: false }>;
type ValidationSuccess = {
  ok: true;
  target: RegisterMcpToolTarget;
  context: McpToolRegistryContext;
  acceptedScopes: readonly string[];
};

export function cleanMcpToolList<T extends string>(values: readonly T[] | undefined): readonly T[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean) as T[])];
}

export function isBlankMcpToolValue(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

export function mcpToolDryRunEnabled(context: McpToolRegistryContext | undefined): boolean {
  return context?.dryRun !== false;
}

function normalizeContext(value: unknown): McpToolRegistryContext | ValidationFailure {
  if (value === undefined) return {};
  if (!isJsonObject(value)) return { ok: false, code: "INVALID_CONTEXT", message: "MCP tool registry context must be a JSON object.", boundary: "context" };
  const allowedServerIds = cleanStringList(value.allowedServerIds);
  const requestedScopes = cleanStringList(value.requestedScopes);
  const allowedScopes = cleanStringList(value.allowedScopes);
  const grantedPermissions = cleanStringList(value.grantedPermissions) as readonly McpToolRegistryPermission[] | undefined;
  if (
    (value.allowedServerIds !== undefined && allowedServerIds === undefined) ||
    (value.requestedScopes !== undefined && requestedScopes === undefined) ||
    (value.allowedScopes !== undefined && allowedScopes === undefined) ||
    (value.grantedPermissions !== undefined && grantedPermissions === undefined)
  ) {
    return { ok: false, code: "INVALID_CONTEXT", message: "MCP tool registry context lists must contain strings.", boundary: "context" };
  }
  return {
    runtimeId: optionalTrimmedString(value.runtimeId),
    sessionId: optionalTrimmedString(value.sessionId),
    invocationId: optionalTrimmedString(value.invocationId),
    dryRun: typeof value.dryRun === "boolean" ? value.dryRun : undefined,
    guard: isJsonObject(value.guard) ? value.guard : undefined,
    contract: isJsonObject(value.contract) ? value.contract : undefined,
    governance: isJsonObject(value.governance) ? value.governance : undefined,
    serverId: optionalTrimmedString(value.serverId),
    allowedServerIds,
    requestedScopes,
    allowedScopes,
    grantedPermissions,
    auditMetadata: isJsonObject(value.auditMetadata) ? value.auditMetadata : undefined,
  };
}

export function createMcpToolRegistryAuditEvent(
  toolId: string,
  type: string,
  context: McpToolRegistryContext | undefined,
  serverId?: string,
  metadata?: Readonly<Record<string, unknown>>,
): McpToolAuditEvent {
  return {
    type,
    toolId,
    invocationId: context?.invocationId ?? `${toolId}:dry-run`,
    dryRun: context?.dryRun !== false,
    metadata: {
      serverId,
      runtimeId: context?.runtimeId,
      sessionId: context?.sessionId,
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

export function createMcpToolRegistryFailure<Output>(
  toolId: string,
  code: McpToolRegistryErrorCode,
  message: string,
  boundary: McpToolRegistryBoundary,
  context: McpToolRegistryContext | undefined,
  serverId?: string,
  event = "basicTool.mcp.toolRegistry.rejected",
): EarlyFailure<Output> {
  return {
    ok: false,
    toolId,
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [createMcpToolRegistryAuditEvent(toolId, "agentCore.basicTool.mcp.toolRegistry.rejected", context, serverId, { code })],
    events: [event],
  };
}

export function normalizeMcpServerId(
  toolId: string,
  serverId: unknown,
  context: McpToolRegistryContext | undefined,
): string | EarlyFailure<never> {
  if (serverId !== undefined && typeof serverId !== "string") {
    return createMcpToolRegistryFailure(toolId, "INVALID_SERVER_ID", `${toolId} target.serverId must be a string.`, "input", context);
  }
  const normalizedServerId = optionalTrimmedString(serverId) ?? context?.serverId;
  if (isBlankMcpToolValue(normalizedServerId)) {
    return createMcpToolRegistryFailure(toolId, "MISSING_SERVER_ID", `${toolId} requires target.serverId or context.serverId`, "input", context);
  }
  return normalizedServerId as string;
}

export function normalizeMcpToolName(
  toolId: string,
  name: unknown,
  context: McpToolRegistryContext | undefined,
  serverId: string,
): string | EarlyFailure<never> {
  if (name !== undefined && typeof name !== "string") {
    return createMcpToolRegistryFailure(toolId, "MISSING_TOOL_NAME", `${toolId} requires target.toolName or target.tool.name`, "input", context, serverId);
  }
  const normalizedName = optionalTrimmedString(name);
  if (normalizedName === undefined) {
    return createMcpToolRegistryFailure(toolId, "MISSING_TOOL_NAME", `${toolId} requires target.toolName or target.tool.name`, "input", context, serverId);
  }
  return normalizedName;
}

export function normalizeMcpToolDefinition(
  toolId: string,
  tool: unknown,
  context: McpToolRegistryContext | undefined,
  serverId: string,
): McpToolDefinition | EarlyFailure<never> {
  if (tool === undefined) {
    return createMcpToolRegistryFailure(toolId, "MISSING_TOOL_DEFINITION", `${toolId} requires target.tool`, "input", context, serverId);
  }
  if (!isJsonObject(tool)) {
    return createMcpToolRegistryFailure(toolId, "INVALID_TOOL_DEFINITION", `${toolId} target.tool must be a JSON object.`, "contract", context, serverId);
  }
  const name = normalizeMcpToolName(toolId, tool.name, context, serverId);
  if (typeof name !== "string") return name;
  if (tool.inputSchema !== undefined && !isJsonObject(tool.inputSchema)) {
    return createMcpToolRegistryFailure(toolId, "INVALID_TOOL_DEFINITION", `${toolId} target.tool.inputSchema must be an object when provided`, "contract", context, serverId);
  }
  if (tool.outputSchema !== undefined && !isJsonObject(tool.outputSchema)) {
    return createMcpToolRegistryFailure(toolId, "INVALID_TOOL_DEFINITION", `${toolId} target.tool.outputSchema must be an object when provided`, "contract", context, serverId);
  }
  if (tool.metadata !== undefined && !isJsonObject(tool.metadata)) {
    return createMcpToolRegistryFailure(toolId, "INVALID_TOOL_DEFINITION", `${toolId} target.tool.metadata must be an object when provided`, "contract", context, serverId);
  }
  return {
    name,
    description: optionalTrimmedString(tool.description),
    inputSchema: isJsonObject(tool.inputSchema) ? tool.inputSchema : undefined,
    outputSchema: isJsonObject(tool.outputSchema) ? tool.outputSchema : undefined,
    metadata: isJsonObject(tool.metadata) ? tool.metadata : undefined,
  };
}

export function ensureMcpToolRegistryScope<Output>(
  toolId: string,
  serverId: string,
  context: McpToolRegistryContext | undefined,
): EarlyFailure<Output> | undefined {
  if (context?.allowedServerIds !== undefined && !context.allowedServerIds.includes(serverId)) {
    return createMcpToolRegistryFailure(toolId, "SCOPE_REJECTED", `${toolId} target server is outside the allowed MCP server scope`, "scope", context, serverId);
  }
  const requested = context?.requestedScopes ?? [];
  const allowed = context?.allowedScopes ?? [];
  if (requested.length > 0 && allowed.length > 0 && requested.some((scope) => !allowed.includes(scope))) {
    return createMcpToolRegistryFailure(toolId, "SCOPE_REJECTED", `${toolId} requested scope is outside runtime governance`, "scope", context, serverId);
  }
  return undefined;
}

export function ensureMcpToolRegistryPermissions<Output>(
  toolId: string,
  permissionsRequired: readonly McpToolRegistryPermission[],
  context: McpToolRegistryContext | undefined,
  serverId: string,
): EarlyFailure<Output> | undefined {
  if (context?.grantedPermissions === undefined) return undefined;
  const missing = permissionsRequired.filter((permission) => !context.grantedPermissions?.includes(permission));
  if (missing.length === 0) return undefined;
  return createMcpToolRegistryFailure(toolId, "PERMISSION_DENIED", `${toolId} is missing permissions: ${missing.join(", ")}`, "permission", context, serverId);
}

export function blockMcpToolRegistryRealExecution<Output>(
  toolId: string,
  context: McpToolRegistryContext | undefined,
  serverId: string,
): EarlyFailure<Output> | undefined {
  if (mcpToolDryRunEnabled(context)) return undefined;
  return createMcpToolRegistryFailure(toolId, "REAL_EXECUTION_BLOCKED", `${toolId} only returns a guarded dry-run plan through plan* helpers`, "contract", context, serverId);
}

export function policyFailure<Output>(toolId: string, context: McpToolRegistryContext, serverId: string): EarlyFailure<Output> | undefined {
  if (context.contract?.accepted === false) {
    return createMcpToolRegistryFailure(toolId, "CONTRACT_REJECTED", context.contract.reason ?? `${toolId} was rejected by runtime contract surface.`, "contract", context, serverId);
  }
  if (context.governance?.accepted === false) {
    return createMcpToolRegistryFailure(toolId, "GOVERNANCE_REJECTED", context.governance.reason ?? `${toolId} was rejected by runtime governance.`, "governance", context, serverId);
  }
  return undefined;
}

function validate(request: unknown): ValidationSuccess | ValidationFailure | EarlyFailure<RegisterMcpToolOutput> {
  const root = request === undefined ? {} : request;
  if (!isJsonObject(root)) return { ok: false, code: "INVALID_REQUEST", message: "mcp.registerTool request must be a JSON object.", boundary: "input" };
  const context = normalizeContext(root.context);
  if ("ok" in context) return context;
  if (root.target !== undefined && root.target !== null && !isJsonObject(root.target)) {
    return { ok: false, code: "MISSING_SERVER_ID", message: "mcp.registerTool requires target.serverId or context.serverId", boundary: "input", context };
  }
  const target = isJsonObject(root.target) ? root.target : {};
  const serverId = normalizeMcpServerId(mcpRegisterToolDescriptor.toolId, target.serverId, context);
  if (typeof serverId !== "string") return serverId;
  const tool = normalizeMcpToolDefinition(mcpRegisterToolDescriptor.toolId, target.tool, context, serverId);
  if ("ok" in tool) return tool;
  const scope = ensureMcpToolRegistryScope<RegisterMcpToolOutput>(mcpRegisterToolDescriptor.toolId, serverId, context);
  if (scope !== undefined) return scope;
  const permissions = ensureMcpToolRegistryPermissions<RegisterMcpToolOutput>(mcpRegisterToolDescriptor.toolId, mcpRegisterToolDescriptor.permissionsRequired, context, serverId);
  if (permissions !== undefined) return permissions;
  return {
    ok: true,
    target: { serverId, tool, replaceExisting: target.replaceExisting === true },
    context,
    acceptedScopes: context.requestedScopes ?? [],
  };
}

function envelope(target: RegisterMcpToolTarget, result?: RegisterMcpToolProviderResult): RegisterMcpToolEnvelope {
  return {
    toolName: result?.name ?? target.tool.name,
    state: result?.status ?? "planned",
    replaceExisting: target.replaceExisting === true,
    source: result === undefined ? "mockable-envelope" : "runtime-provider",
  };
}

function output(normalized: ValidationSuccess, options: { dryRun: boolean; providerCalled: boolean; result?: RegisterMcpToolProviderResult }): RegisterMcpToolOutput {
  return {
    kind: "agentCore.basicTool.mcp.registerTool",
    target: normalized.target,
    dryRun: options.dryRun,
    executionBlocked: options.dryRun,
    providerCalled: options.providerCalled,
    permissionsRequired: mcpRegisterToolDescriptor.permissionsRequired,
    unsafeSideEffects: true,
    acceptedScopes: normalized.acceptedScopes,
    registryEnvelope: envelope(normalized.target, options.result),
    providerMetadata: options.result?.providerMetadata,
  };
}

export function planMcpToolRegistration(request: unknown = {}): RegisterMcpToolResult {
  const normalized = validate(request);
  if (!normalized.ok) {
    if ("error" in normalized) return normalized as unknown as RegisterMcpToolResult;
    return createMcpToolRegistryFailure("mcp.registerTool", normalized.code, normalized.message, normalized.boundary, normalized.context);
  }
  const blocked = policyFailure<RegisterMcpToolOutput>("mcp.registerTool", normalized.context, normalized.target.serverId);
  if (blocked !== undefined) return blocked;
  const realExecutionFailure = blockMcpToolRegistryRealExecution<RegisterMcpToolOutput>("mcp.registerTool", normalized.context, normalized.target.serverId);
  if (realExecutionFailure !== undefined) return realExecutionFailure;
  return {
    ok: true,
    toolId: "mcp.registerTool",
    output: output(normalized, { dryRun: true, providerCalled: false }),
    audit: [createMcpToolRegistryAuditEvent("mcp.registerTool", "agentCore.basicTool.mcp.registerTool.dryRun", normalized.context, normalized.target.serverId, { toolName: normalized.target.tool.name, replaceExisting: normalized.target.replaceExisting })],
    events: ["basicTool.mcp.registerTool.dryRun"],
  };
}

export async function executeMcpToolRegistration(request: unknown = {}, provider?: RegisterMcpToolProvider): Promise<RegisterMcpToolResult> {
  const normalized = validate(request);
  if (!normalized.ok) {
    if ("error" in normalized) return normalized as unknown as RegisterMcpToolResult;
    return createMcpToolRegistryFailure("mcp.registerTool", normalized.code, normalized.message, normalized.boundary, normalized.context);
  }
  const blocked = policyFailure<RegisterMcpToolOutput>("mcp.registerTool", normalized.context, normalized.target.serverId);
  if (blocked !== undefined) return blocked;
  if (normalized.context.dryRun !== false) {
    return {
      ok: true,
      toolId: "mcp.registerTool",
      output: output(normalized, { dryRun: true, providerCalled: false }),
      audit: [createMcpToolRegistryAuditEvent("mcp.registerTool", "agentCore.basicTool.mcp.registerTool.dryRun", normalized.context, normalized.target.serverId, { toolName: normalized.target.tool.name, replaceExisting: normalized.target.replaceExisting })],
      events: ["basicTool.mcp.registerTool.dryRun"],
    };
  }
  if (!guardAccepted(normalized.context.guard)) {
    return createMcpToolRegistryFailure("mcp.registerTool", "GOVERNANCE_REJECTED", "mcp.registerTool requires an accepted runtime guard before real dispatch.", "governance", normalized.context, normalized.target.serverId);
  }
  if (provider === undefined) {
    return createMcpToolRegistryFailure("mcp.registerTool", "PROVIDER_UNAVAILABLE", "Runtime MCP registerTool provider is unavailable.", "provider", normalized.context, normalized.target.serverId, "basicTool.mcp.registerTool.providerUnavailable");
  }
  try {
    const result = await provider(normalized.target, { runtimeId: normalized.context.runtimeId, sessionId: normalized.context.sessionId, invocationId: normalized.context.invocationId, auditMetadata: normalized.context.auditMetadata });
    return {
      ok: true,
      toolId: "mcp.registerTool",
      output: output(normalized, { dryRun: false, providerCalled: true, result }),
      audit: [createMcpToolRegistryAuditEvent("mcp.registerTool", "agentCore.basicTool.mcp.registerTool.executed", normalized.context, normalized.target.serverId, { toolName: normalized.target.tool.name })],
      events: ["basicTool.mcp.registerTool.executed"],
    };
  } catch {
    return createMcpToolRegistryFailure("mcp.registerTool", "PROVIDER_REJECTED", "Runtime MCP provider failed registerTool.", "provider", normalized.context, normalized.target.serverId, "basicTool.mcp.registerTool.providerRejected");
  }
}
