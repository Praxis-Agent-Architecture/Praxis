import {
  cleanStringList,
  guardAccepted,
  isJsonObject,
  optionalTrimmedString,
  type McpToolAuditEvent,
  type McpToolResult,
} from "../../_shared/baseToolAdapter.js";

export type McpStreamPermission = "mcp:stream" | "mcp:call";
export type McpStreamChannel = "events" | "chunks";

export type McpStreamContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: { accepted?: boolean; allowed?: boolean; reason?: string };
  contract?: { accepted?: boolean; reason?: string };
  governance?: { accepted?: boolean; reason?: string };
  allowedServerIds?: readonly string[];
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  grantedPermissions?: readonly McpStreamPermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type McpStreamTarget = {
  serverId: string;
  name: string;
  channel: McpStreamChannel;
  arguments?: Readonly<Record<string, unknown>>;
  maxEvents?: number;
};

export type McpStreamRequest = {
  target?: Partial<McpStreamTarget> | null;
  context?: McpStreamContext;
};

export type McpStreamProviderRequest = McpStreamTarget;
export type McpStreamProviderResult = {
  executionId?: string;
  streamId?: string;
  status: "streaming" | "started" | "completed" | "pending";
  channel?: McpStreamChannel;
  chunks?: readonly unknown[];
  events?: readonly unknown[];
  providerMetadata?: Readonly<Record<string, unknown>>;
  raw?: unknown;
};

export type McpStreamProvider = (
  request: McpStreamProviderRequest,
  context: Readonly<Record<string, unknown>>,
) => Promise<McpStreamProviderResult> | McpStreamProviderResult;

export type McpStreamEnvelope = {
  transport: "mcp";
  operation: "stream";
  serverId: string;
  name: string;
  channel: McpStreamChannel;
  arguments: Readonly<Record<string, unknown>>;
  maxEvents?: number;
  executionId?: string;
  streamId?: string;
  state: "planned" | "streaming" | "started" | "completed" | "pending";
  chunks?: readonly unknown[];
  events?: readonly unknown[];
};

export type McpStreamOutput = {
  kind: "agentCore.basicTool.mcp.stream";
  target: McpStreamTarget;
  streamEnvelope: McpStreamEnvelope;
  dryRun: boolean;
  executionBlocked: boolean;
  providerCalled: boolean;
  permissionsRequired: readonly McpStreamPermission[];
  unsafeSideEffects: true;
  acceptedScopes: readonly string[];
  providerMetadata?: Readonly<Record<string, unknown>>;
};

export type McpStreamErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_CONTEXT"
  | "MISSING_SERVER_ID"
  | "INVALID_SERVER_ID"
  | "MISSING_STREAM_NAME"
  | "INVALID_STREAM_NAME"
  | "INVALID_CHANNEL"
  | "INVALID_ARGUMENTS"
  | "INVALID_MAX_EVENTS"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "REAL_EXECUTION_BLOCKED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_REJECTED";

export type McpStreamResult = McpToolResult<McpStreamOutput, McpStreamErrorCode>;

export const mcpStreamDescriptor = {
  toolId: "mcp.stream",
  capability: "stream-mcp-execution",
  route: "agent_executionEngine.basic_toolLayer.baseTools.mcpBase.execution",
  defaultDryRun: true,
  tapOwnsApproval: true,
  runtimeOwnsMcpClient: true,
  permissionsRequired: ["mcp:stream", "mcp:call"],
  unsafeSideEffects: true,
  providerBoundary: "BaseToolExecutorPort.mcp.streamTool",
} as const;

type Boundary = "input" | "context" | "scope" | "permission" | "contract" | "governance" | "provider";
type ValidationFailure = {
  ok: false;
  code: McpStreamErrorCode;
  message: string;
  boundary: Boundary;
  context?: McpStreamContext;
};
type ValidationSuccess = {
  ok: true;
  target: McpStreamTarget;
  context: McpStreamContext;
  acceptedScopes: readonly string[];
};

function normalizeContext(value: unknown): McpStreamContext | ValidationFailure {
  if (value === undefined) return {};
  if (!isJsonObject(value)) {
    return { ok: false, code: "INVALID_CONTEXT", message: "mcp.stream context must be a JSON object.", boundary: "context" };
  }
  const allowedServerIds = cleanStringList(value.allowedServerIds);
  const requestedScopes = cleanStringList(value.requestedScopes);
  const allowedScopes = cleanStringList(value.allowedScopes);
  const grantedPermissions = cleanStringList(value.grantedPermissions) as readonly McpStreamPermission[] | undefined;
  if (
    (value.allowedServerIds !== undefined && allowedServerIds === undefined) ||
    (value.requestedScopes !== undefined && requestedScopes === undefined) ||
    (value.allowedScopes !== undefined && allowedScopes === undefined) ||
    (value.grantedPermissions !== undefined && grantedPermissions === undefined)
  ) {
    return { ok: false, code: "INVALID_CONTEXT", message: "mcp.stream context lists must contain strings.", boundary: "context" };
  }
  return {
    runtimeId: optionalTrimmedString(value.runtimeId),
    sessionId: optionalTrimmedString(value.sessionId),
    invocationId: optionalTrimmedString(value.invocationId),
    dryRun: typeof value.dryRun === "boolean" ? value.dryRun : undefined,
    guard: isJsonObject(value.guard) ? value.guard : undefined,
    contract: isJsonObject(value.contract) ? value.contract : undefined,
    governance: isJsonObject(value.governance) ? value.governance : undefined,
    allowedServerIds,
    requestedScopes,
    allowedScopes,
    grantedPermissions,
    auditMetadata: isJsonObject(value.auditMetadata) ? value.auditMetadata : undefined,
  };
}

function normalizeChannel(value: unknown, context: McpStreamContext): McpStreamChannel | ValidationFailure {
  if (value === undefined) return "events";
  if (typeof value !== "string") {
    return { ok: false, code: "INVALID_CHANNEL", message: "mcp.stream target.channel must be events or chunks.", boundary: "input", context };
  }
  const channel = optionalTrimmedString(value) ?? "events";
  if (channel === "events" || channel === "chunks") return channel;
  return { ok: false, code: "INVALID_CHANNEL", message: "mcp.stream target.channel must be events or chunks.", boundary: "input", context };
}

function validate(request: unknown): ValidationSuccess | ValidationFailure {
  const root = request === undefined ? {} : request;
  if (!isJsonObject(root)) {
    return { ok: false, code: "INVALID_REQUEST", message: "mcp.stream request must be a JSON object.", boundary: "input" };
  }
  const context = normalizeContext(root.context);
  if ("ok" in context) return context;
  if (!isJsonObject(root.target)) {
    return { ok: false, code: "MISSING_SERVER_ID", message: "mcp.stream requires target.serverId.", boundary: "input", context };
  }
  if (root.target.serverId !== undefined && typeof root.target.serverId !== "string") {
    return { ok: false, code: "INVALID_SERVER_ID", message: "mcp.stream target.serverId must be a string.", boundary: "input", context };
  }
  const serverId = optionalTrimmedString(root.target.serverId);
  if (serverId === undefined) {
    return { ok: false, code: "MISSING_SERVER_ID", message: "mcp.stream requires target.serverId.", boundary: "input", context };
  }
  if (root.target.name !== undefined && typeof root.target.name !== "string") {
    return { ok: false, code: "INVALID_STREAM_NAME", message: "mcp.stream target.name must be a string.", boundary: "input", context };
  }
  const name = optionalTrimmedString(root.target.name);
  if (name === undefined) {
    return { ok: false, code: "MISSING_STREAM_NAME", message: "mcp.stream requires target.name.", boundary: "input", context };
  }
  const channel = normalizeChannel(root.target.channel, context);
  if (isJsonObject(channel)) return channel;
  if (root.target.arguments !== undefined && !isJsonObject(root.target.arguments)) {
    return { ok: false, code: "INVALID_ARGUMENTS", message: "mcp.stream target.arguments must be a JSON object.", boundary: "input", context };
  }
  if (
    root.target.maxEvents !== undefined &&
    (typeof root.target.maxEvents !== "number" || !Number.isInteger(root.target.maxEvents) || root.target.maxEvents <= 0)
  ) {
    return { ok: false, code: "INVALID_MAX_EVENTS", message: "mcp.stream target.maxEvents must be a positive integer.", boundary: "input", context };
  }
  if (context.allowedServerIds !== undefined && !context.allowedServerIds.includes(serverId)) {
    return { ok: false, code: "SCOPE_REJECTED", message: "mcp.stream target server is outside allowed MCP server ids.", boundary: "scope", context };
  }
  const requestedScopes = context.requestedScopes ?? [];
  const allowedScopes = context.allowedScopes ?? [];
  if (requestedScopes.length > 0 && allowedScopes.length > 0) {
    const denied = requestedScopes.filter((scope) => !allowedScopes.includes(scope));
    if (denied.length > 0) {
      return { ok: false, code: "SCOPE_REJECTED", message: `mcp.stream scope ${denied[0]} is outside runtime governance.`, boundary: "scope", context };
    }
  }
  const missing =
    context.grantedPermissions === undefined
      ? []
      : mcpStreamDescriptor.permissionsRequired.filter((permission) => !context.grantedPermissions?.includes(permission));
  if (missing.length > 0) {
    return { ok: false, code: "PERMISSION_DENIED", message: `mcp.stream is missing permissions: ${missing.join(", ")}`, boundary: "permission", context };
  }
  return {
    ok: true,
    target: {
      serverId,
      name,
      channel,
      arguments: root.target.arguments ?? {},
      maxEvents: root.target.maxEvents,
    },
    context,
    acceptedScopes: requestedScopes,
  };
}

function auditEvent(type: string, dryRun: boolean, context: McpStreamContext): McpToolAuditEvent {
  return {
    type,
    toolId: "mcp.stream",
    invocationId: context.invocationId ?? "mcp.stream:dry-run",
    dryRun,
    metadata: { runtimeId: context.runtimeId, sessionId: context.sessionId, ...(context.auditMetadata ?? {}) },
  };
}

function failure(error: ValidationFailure, context: McpStreamContext = {}, event = "basicTool.mcp.stream.rejected"): McpStreamResult {
  return {
    ok: false,
    toolId: "mcp.stream",
    error: {
      code: error.code,
      message: error.message,
      boundary: error.boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("mcp.stream.rejected", context.dryRun !== false, context)],
    events: [event],
  };
}

function envelope(target: McpStreamTarget, result?: McpStreamProviderResult): McpStreamEnvelope {
  return {
    transport: "mcp",
    operation: "stream",
    serverId: target.serverId,
    name: target.name,
    channel: result?.channel ?? target.channel,
    arguments: target.arguments ?? {},
    maxEvents: target.maxEvents,
    executionId: result?.executionId,
    streamId: result?.streamId,
    state: result?.status ?? "planned",
    chunks: result?.chunks,
    events: result?.events,
  };
}

function output(
  target: McpStreamTarget,
  context: McpStreamContext,
  acceptedScopes: readonly string[],
  options: { dryRun: boolean; providerCalled: boolean; result?: McpStreamProviderResult },
): McpStreamOutput {
  return {
    kind: "agentCore.basicTool.mcp.stream",
    target,
    streamEnvelope: envelope(target, options.result),
    dryRun: options.dryRun,
    executionBlocked: options.dryRun,
    providerCalled: options.providerCalled,
    permissionsRequired: mcpStreamDescriptor.permissionsRequired,
    unsafeSideEffects: true,
    acceptedScopes,
    providerMetadata: options.result?.providerMetadata,
  };
}

function policyFailure(context: McpStreamContext): ValidationFailure | undefined {
  if (context.contract?.accepted === false) {
    return {
      ok: false,
      code: "CONTRACT_REJECTED",
      message: context.contract.reason ?? "mcp.stream was rejected by runtime contract surface.",
      boundary: "contract",
      context,
    };
  }
  if (context.governance?.accepted === false) {
    return {
      ok: false,
      code: "GOVERNANCE_REJECTED",
      message: context.governance.reason ?? "mcp.stream was rejected by runtime governance.",
      boundary: "governance",
      context,
    };
  }
  return undefined;
}

export function planMcpStream(request: unknown = {}): McpStreamResult {
  const normalized = validate(request);
  if (!normalized.ok) return failure(normalized, normalized.context);
  const blocked = policyFailure(normalized.context);
  if (blocked !== undefined) return failure(blocked, normalized.context);
  if (normalized.context.dryRun === false) {
    return failure(
      { ok: false, code: "REAL_EXECUTION_BLOCKED", message: "planMcpStream only produces dry-run envelopes.", boundary: "contract", context: normalized.context },
      normalized.context,
    );
  }
  return {
    ok: true,
    toolId: "mcp.stream",
    output: output(normalized.target, normalized.context, normalized.acceptedScopes, { dryRun: true, providerCalled: false }),
    audit: [auditEvent("mcp.stream.planned", true, normalized.context)],
    events: ["basicTool.mcp.stream.dryRun"],
  };
}

export async function executeMcpStream(request: unknown = {}, provider?: McpStreamProvider): Promise<McpStreamResult> {
  const normalized = validate(request);
  if (!normalized.ok) return failure(normalized, normalized.context);
  const blocked = policyFailure(normalized.context);
  if (blocked !== undefined) return failure(blocked, normalized.context);
  if (normalized.context.dryRun !== false) {
    return {
      ok: true,
      toolId: "mcp.stream",
      output: output(normalized.target, normalized.context, normalized.acceptedScopes, { dryRun: true, providerCalled: false }),
      audit: [auditEvent("mcp.stream.planned", true, normalized.context)],
      events: ["basicTool.mcp.stream.dryRun"],
    };
  }
  if (!guardAccepted(normalized.context.guard)) {
    return failure(
      { ok: false, code: "GOVERNANCE_REJECTED", message: "mcp.stream requires an accepted runtime guard before real dispatch.", boundary: "governance", context: normalized.context },
      normalized.context,
    );
  }
  if (provider === undefined) {
    return failure(
      { ok: false, code: "PROVIDER_UNAVAILABLE", message: "Runtime MCP stream provider is unavailable.", boundary: "provider", context: normalized.context },
      normalized.context,
      "basicTool.mcp.stream.providerUnavailable",
    );
  }
  try {
    const result = await provider(normalized.target, {
      runtimeId: normalized.context.runtimeId,
      sessionId: normalized.context.sessionId,
      invocationId: normalized.context.invocationId,
      auditMetadata: normalized.context.auditMetadata,
    });
    return {
      ok: true,
      toolId: "mcp.stream",
      output: output(normalized.target, normalized.context, normalized.acceptedScopes, { dryRun: false, providerCalled: true, result }),
      audit: [auditEvent("mcp.stream.executed", false, normalized.context)],
      events: ["basicTool.mcp.stream.executed"],
    };
  } catch {
    return failure(
      { ok: false, code: "PROVIDER_REJECTED", message: "Runtime MCP provider failed stream dispatch.", boundary: "provider", context: normalized.context },
      normalized.context,
      "basicTool.mcp.stream.providerRejected",
    );
  }
}
