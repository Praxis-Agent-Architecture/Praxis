import {
  cleanStringList,
  guardAccepted,
  isJsonObject,
  optionalTrimmedString,
  type McpToolAuditEvent,
  type McpToolResult,
} from "../../_shared/baseToolAdapter.js";

export type McpNativeExecutePermission = "mcp:native-execute" | "mcp:raw";
export type McpNativeExecuteErrorBoundary = "input" | "context" | "scope" | "permission" | "governance" | "contract" | "provider";

export type McpNativeExecuteContext = {
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
  grantedPermissions?: readonly McpNativeExecutePermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type McpNativeExecuteTarget = {
  serverId: string;
  method: string;
  params: Readonly<Record<string, unknown>>;
  protocolVersion?: string;
  idempotencyKey?: string;
};

export type McpNativeExecuteRequest = {
  target?: {
    serverId?: unknown;
    method?: unknown;
    params?: unknown;
    protocolVersion?: unknown;
    idempotencyKey?: unknown;
  } | null;
  context?: McpNativeExecuteContext;
};

export type McpNativeExecuteProviderRequest = McpNativeExecuteTarget;
export type McpNativeExecuteProviderResult = {
  status: "executed" | "pending" | "rejected";
  result?: unknown;
  providerMetadata?: Readonly<Record<string, unknown>>;
  raw?: unknown;
};
export type McpNativeExecuteProvider = (
  request: McpNativeExecuteProviderRequest,
  context: Readonly<Record<string, unknown>>,
) => Promise<McpNativeExecuteProviderResult> | McpNativeExecuteProviderResult;

export type McpNativeExecuteEnvelope = {
  transport: "mcp";
  operation: "nativeExecute";
  serverId: string;
  method: string;
  params: Readonly<Record<string, unknown>>;
  protocolVersion?: string;
  idempotencyKey?: string;
  state: "planned" | "executed" | "pending" | "rejected";
  result?: unknown;
};

export type McpNativeExecuteOutput = {
  kind: "agentCore.basicTool.mcp.nativeExecute";
  target: McpNativeExecuteTarget;
  dryRun: boolean;
  executionBlocked: boolean;
  providerCalled: boolean;
  permissionsRequired: readonly McpNativeExecutePermission[];
  unsafeSideEffects: true;
  acceptedScopes: readonly string[];
  nativeEnvelope: McpNativeExecuteEnvelope;
  providerMetadata?: Readonly<Record<string, unknown>>;
};

export type McpNativeExecuteErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_CONTEXT"
  | "MISSING_SERVER_ID"
  | "INVALID_SERVER_ID"
  | "MISSING_METHOD"
  | "INVALID_METHOD"
  | "INVALID_PARAMS"
  | "INVALID_PROTOCOL_VERSION"
  | "INVALID_IDEMPOTENCY_KEY"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "REAL_EXECUTION_BLOCKED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_REJECTED";

export type McpNativeExecuteResult = McpToolResult<McpNativeExecuteOutput, McpNativeExecuteErrorCode>;

export const mcpNativeExecuteDescriptor = {
  toolId: "mcp.nativeExecute",
  capability: "execute-native-mcp-call",
  route: "agent_executionEngine.basic_toolLayer.baseTools.mcpBase.execution",
  defaultDryRun: true,
  tapOwnsApproval: true,
  runtimeOwnsMcpClient: true,
  permissionsRequired: ["mcp:native-execute", "mcp:raw"],
  unsafeSideEffects: true,
  providerBoundary: "BaseToolExecutorPort.mcp.nativeExecute",
} as const;

type ValidationFailure = {
  ok: false;
  code: McpNativeExecuteErrorCode;
  message: string;
  boundary: McpNativeExecuteErrorBoundary;
  context?: McpNativeExecuteContext;
};
type ValidationSuccess = {
  ok: true;
  target: McpNativeExecuteTarget;
  context: McpNativeExecuteContext;
  acceptedScopes: readonly string[];
};

function normalizeContext(value: unknown): McpNativeExecuteContext | ValidationFailure {
  if (value === undefined) return {};
  if (!isJsonObject(value)) {
    return { ok: false, code: "INVALID_CONTEXT", message: "mcp.nativeExecute context must be a JSON object.", boundary: "context" };
  }
  const allowedServerIds = cleanStringList(value.allowedServerIds);
  const requestedScopes = cleanStringList(value.requestedScopes);
  const allowedScopes = cleanStringList(value.allowedScopes);
  const grantedPermissions = cleanStringList(value.grantedPermissions) as readonly McpNativeExecutePermission[] | undefined;
  if (
    (value.allowedServerIds !== undefined && allowedServerIds === undefined) ||
    (value.requestedScopes !== undefined && requestedScopes === undefined) ||
    (value.allowedScopes !== undefined && allowedScopes === undefined) ||
    (value.grantedPermissions !== undefined && grantedPermissions === undefined)
  ) {
    return { ok: false, code: "INVALID_CONTEXT", message: "mcp.nativeExecute context lists must contain strings.", boundary: "context" };
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

function auditEvent(
  type: string,
  dryRun: boolean,
  context: McpNativeExecuteContext | undefined,
  serverId?: string,
  metadata?: Readonly<Record<string, unknown>>,
): McpToolAuditEvent {
  return {
    type,
    toolId: mcpNativeExecuteDescriptor.toolId,
    invocationId: context?.invocationId ?? "mcp.nativeExecute:dry-run",
    dryRun,
    metadata: {
      serverId,
      runtimeId: context?.runtimeId,
      sessionId: context?.sessionId,
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: McpNativeExecuteErrorCode,
  message: string,
  boundary: McpNativeExecuteErrorBoundary,
  context: McpNativeExecuteContext | undefined,
  serverId?: string,
  event = "basicTool.mcp.nativeExecute.rejected",
): Extract<McpNativeExecuteResult, { ok: false }> {
  return {
    ok: false,
    toolId: mcpNativeExecuteDescriptor.toolId,
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("agentCore.basicTool.mcp.nativeExecute.rejected", context?.dryRun !== false, context, serverId, { code })],
    events: [event],
  };
}

function validate(request: unknown): ValidationSuccess | ValidationFailure {
  const root = request === undefined ? {} : request;
  if (!isJsonObject(root)) {
    return { ok: false, code: "INVALID_REQUEST", message: "mcp.nativeExecute request must be a JSON object.", boundary: "input" };
  }
  const context = normalizeContext(root.context);
  if ("ok" in context) return context;
  if (!isJsonObject(root.target)) {
    return { ok: false, code: "MISSING_SERVER_ID", message: "mcp.nativeExecute requires target.serverId.", boundary: "input", context };
  }
  if (root.target.serverId !== undefined && typeof root.target.serverId !== "string") {
    return { ok: false, code: "INVALID_SERVER_ID", message: "mcp.nativeExecute target.serverId must be a string.", boundary: "input", context };
  }
  const serverId = optionalTrimmedString(root.target.serverId);
  if (serverId === undefined) {
    return { ok: false, code: "MISSING_SERVER_ID", message: "mcp.nativeExecute requires target.serverId.", boundary: "input", context };
  }
  if (root.target.method !== undefined && typeof root.target.method !== "string") {
    return { ok: false, code: "INVALID_METHOD", message: "mcp.nativeExecute target.method must be a string.", boundary: "input", context };
  }
  const method = optionalTrimmedString(root.target.method);
  if (method === undefined) {
    return { ok: false, code: "MISSING_METHOD", message: "mcp.nativeExecute requires target.method.", boundary: "input", context };
  }
  if (root.target.params !== undefined && !isJsonObject(root.target.params)) {
    return { ok: false, code: "INVALID_PARAMS", message: "mcp.nativeExecute target.params must be a JSON object.", boundary: "input", context };
  }
  if (root.target.protocolVersion !== undefined && typeof root.target.protocolVersion !== "string") {
    return { ok: false, code: "INVALID_PROTOCOL_VERSION", message: "mcp.nativeExecute target.protocolVersion must be a string.", boundary: "input", context };
  }
  const protocolVersion = optionalTrimmedString(root.target.protocolVersion);
  if (root.target.protocolVersion !== undefined && protocolVersion === undefined) {
    return { ok: false, code: "INVALID_PROTOCOL_VERSION", message: "mcp.nativeExecute target.protocolVersion must not be blank.", boundary: "input", context };
  }
  if (root.target.idempotencyKey !== undefined && typeof root.target.idempotencyKey !== "string") {
    return { ok: false, code: "INVALID_IDEMPOTENCY_KEY", message: "mcp.nativeExecute target.idempotencyKey must be a string.", boundary: "input", context };
  }
  const idempotencyKey = optionalTrimmedString(root.target.idempotencyKey);
  if (root.target.idempotencyKey !== undefined && idempotencyKey === undefined) {
    return { ok: false, code: "INVALID_IDEMPOTENCY_KEY", message: "mcp.nativeExecute target.idempotencyKey must not be blank.", boundary: "input", context };
  }
  if (context.allowedServerIds !== undefined && !context.allowedServerIds.includes(serverId)) {
    return { ok: false, code: "SCOPE_REJECTED", message: "mcp.nativeExecute target server is outside allowed MCP server ids.", boundary: "scope", context };
  }
  const requestedScopes = context.requestedScopes ?? [];
  const allowedScopes = context.allowedScopes ?? [];
  if (requestedScopes.length > 0 && allowedScopes.length > 0) {
    const denied = requestedScopes.filter((scope) => !allowedScopes.includes(scope));
    if (denied.length > 0) {
      return { ok: false, code: "SCOPE_REJECTED", message: `mcp.nativeExecute scope ${denied[0]} is outside runtime governance.`, boundary: "scope", context };
    }
  }
  if (
    context.grantedPermissions !== undefined &&
    !mcpNativeExecuteDescriptor.permissionsRequired.every((permission) => context.grantedPermissions?.includes(permission))
  ) {
    return {
      ok: false,
      code: "PERMISSION_DENIED",
      message: "mcp.nativeExecute requires mcp:native-execute and mcp:raw.",
      boundary: "permission",
      context,
    };
  }
  return {
    ok: true,
    target: {
      serverId,
      method,
      params: isJsonObject(root.target.params) ? root.target.params : {},
      protocolVersion,
      idempotencyKey,
    },
    context,
    acceptedScopes: requestedScopes,
  };
}

function policyFailure(normalized: ValidationSuccess): Extract<McpNativeExecuteResult, { ok: false }> | undefined {
  if (normalized.context.contract !== undefined && !guardAccepted(normalized.context.contract)) {
    return failure("CONTRACT_REJECTED", "mcp.nativeExecute contract guard rejected the request.", "contract", normalized.context, normalized.target.serverId);
  }
  if (normalized.context.governance !== undefined && !guardAccepted(normalized.context.governance)) {
    return failure("GOVERNANCE_REJECTED", "mcp.nativeExecute governance rejected the request.", "governance", normalized.context, normalized.target.serverId);
  }
  return undefined;
}

function envelope(target: McpNativeExecuteTarget, result?: McpNativeExecuteProviderResult): McpNativeExecuteEnvelope {
  return {
    transport: "mcp",
    operation: "nativeExecute",
    serverId: target.serverId,
    method: target.method,
    params: target.params,
    protocolVersion: target.protocolVersion,
    idempotencyKey: target.idempotencyKey,
    state: result?.status ?? "planned",
    result: result?.result,
  };
}

function output(
  normalized: ValidationSuccess,
  options: { dryRun: boolean; providerCalled: boolean; result?: McpNativeExecuteProviderResult },
): McpNativeExecuteOutput {
  return {
    kind: "agentCore.basicTool.mcp.nativeExecute",
    target: normalized.target,
    dryRun: options.dryRun,
    executionBlocked: options.dryRun,
    providerCalled: options.providerCalled,
    permissionsRequired: mcpNativeExecuteDescriptor.permissionsRequired,
    unsafeSideEffects: true,
    acceptedScopes: normalized.acceptedScopes,
    nativeEnvelope: envelope(normalized.target, options.result),
    providerMetadata: options.result?.providerMetadata,
  };
}

export function planMcpNativeExecute(request: unknown = {}): McpNativeExecuteResult {
  const normalized = validate(request);
  if (!normalized.ok) return failure(normalized.code, normalized.message, normalized.boundary, normalized.context);
  const blocked = policyFailure(normalized);
  if (blocked !== undefined) return blocked;
  if (normalized.context.dryRun === false) {
    return failure(
      "REAL_EXECUTION_BLOCKED",
      "mcp.nativeExecute plan helper only returns a governed dry-run envelope.",
      "contract",
      normalized.context,
      normalized.target.serverId,
    );
  }
  return {
    ok: true,
    toolId: mcpNativeExecuteDescriptor.toolId,
    output: output(normalized, { dryRun: true, providerCalled: false }),
    audit: [
      auditEvent("agentCore.basicTool.mcp.nativeExecute.dryRun", true, normalized.context, normalized.target.serverId, {
        method: normalized.target.method,
        protocolVersion: normalized.target.protocolVersion,
      }),
    ],
    events: ["basicTool.mcp.nativeExecute.dryRun"],
  };
}

export async function executeMcpNativeExecute(
  request: unknown = {},
  provider?: McpNativeExecuteProvider,
): Promise<McpNativeExecuteResult> {
  const normalized = validate(request);
  if (!normalized.ok) return failure(normalized.code, normalized.message, normalized.boundary, normalized.context);
  const blocked = policyFailure(normalized);
  if (blocked !== undefined) return blocked;
  if (normalized.context.dryRun !== false) {
    return {
      ok: true,
      toolId: mcpNativeExecuteDescriptor.toolId,
      output: output(normalized, { dryRun: true, providerCalled: false }),
      audit: [
        auditEvent("agentCore.basicTool.mcp.nativeExecute.dryRun", true, normalized.context, normalized.target.serverId, {
          method: normalized.target.method,
          protocolVersion: normalized.target.protocolVersion,
        }),
      ],
      events: ["basicTool.mcp.nativeExecute.dryRun"],
    };
  }
  if (!guardAccepted(normalized.context.guard)) {
    return failure(
      "GOVERNANCE_REJECTED",
      "mcp.nativeExecute requires an accepted runtime guard before raw MCP dispatch.",
      "governance",
      normalized.context,
      normalized.target.serverId,
    );
  }
  if (provider === undefined) {
    return failure(
      "PROVIDER_UNAVAILABLE",
      "Runtime MCP nativeExecute provider is unavailable.",
      "provider",
      normalized.context,
      normalized.target.serverId,
      "basicTool.mcp.nativeExecute.providerUnavailable",
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
      toolId: mcpNativeExecuteDescriptor.toolId,
      output: output(normalized, { dryRun: false, providerCalled: true, result }),
      audit: [
        auditEvent("agentCore.basicTool.mcp.nativeExecute.executed", false, normalized.context, normalized.target.serverId, {
          method: normalized.target.method,
          status: result.status,
        }),
      ],
      events: ["basicTool.mcp.nativeExecute.executed"],
    };
  } catch {
    return failure(
      "PROVIDER_REJECTED",
      "Runtime MCP provider failed nativeExecute.",
      "provider",
      normalized.context,
      normalized.target.serverId,
      "basicTool.mcp.nativeExecute.providerRejected",
    );
  }
}
