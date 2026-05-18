import {
  cleanStringList,
  guardAccepted,
  isJsonObject,
  optionalTrimmedString,
  type McpToolAuditEvent,
  type McpToolResult,
} from "../../_shared/baseToolAdapter.js";

export type McpUnsubscribePermission = "mcp:subscription:write";
export type McpUnsubscribeContext = {
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
  grantedPermissions?: readonly McpUnsubscribePermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};
export type McpUnsubscribeTarget = {
  serverId: string;
  subscriptionId: string;
  reason?: string;
};
export type McpUnsubscribeProviderRequest = McpUnsubscribeTarget;
export type McpUnsubscribeRequest = { target?: Partial<McpUnsubscribeTarget> | null; context?: McpUnsubscribeContext };
export type McpUnsubscribeEnvelope = {
  subscriptionId: string;
  serverId: string;
  state: "cancel-planned" | "unsubscribed" | "not_found" | "already_unsubscribed";
  reason?: string;
  status?: string;
};
export type McpUnsubscribeProviderResult = {
  subscriptionId?: string;
  status: "unsubscribed" | "not_found" | "already_unsubscribed";
  serverId?: string;
  providerMetadata?: Readonly<Record<string, unknown>>;
  raw?: unknown;
};
export type McpUnsubscribeProvider = (
  request: McpUnsubscribeProviderRequest,
  context: Readonly<Record<string, unknown>>,
) => Promise<McpUnsubscribeProviderResult> | McpUnsubscribeProviderResult;
export type McpUnsubscribeOutput = {
  kind: "agentCore.basicTool.mcp.unsubscribe";
  target: McpUnsubscribeTarget;
  unsubscribeEnvelope: McpUnsubscribeEnvelope;
  dryRun: boolean;
  executionBlocked: boolean;
  providerCalled: boolean;
  permissionsRequired: readonly McpUnsubscribePermission[];
  unsafeSideEffects: true;
  acceptedScopes: readonly string[];
  providerMetadata?: Readonly<Record<string, unknown>>;
};
export type McpUnsubscribeErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_CONTEXT"
  | "MISSING_SERVER_ID"
  | "INVALID_SERVER_ID"
  | "MISSING_SUBSCRIPTION_ID"
  | "INVALID_SUBSCRIPTION_ID"
  | "INVALID_REASON"
  | "SCOPE_DENIED"
  | "PERMISSION_DENIED"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "REAL_EXECUTION_BLOCKED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_REJECTED";
export type McpUnsubscribeResult = McpToolResult<McpUnsubscribeOutput, McpUnsubscribeErrorCode>;

export const mcpUnsubscribeDescriptor = {
  toolId: "mcp.unsubscribe",
  capability: "unsubscribe-mcp-events-or-resources",
  route: "agent_executionEngine.basic_toolLayer.baseTools.mcpBase.subscription",
  defaultDryRun: true,
  tapOwnsApproval: true,
  permissionsRequired: ["mcp:subscription:write"],
  unsafeSideEffects: true,
} as const;

type Boundary = "input" | "context" | "scope" | "permission" | "contract" | "governance" | "provider";
type ValidationFailure = { ok: false; code: McpUnsubscribeErrorCode; message: string; boundary: Boundary; context?: McpUnsubscribeContext };
type ValidationSuccess = {
  ok: true;
  target: McpUnsubscribeTarget;
  context: McpUnsubscribeContext;
  acceptedScopes: readonly string[];
};

function normalizeContext(value: unknown): McpUnsubscribeContext | ValidationFailure {
  if (value === undefined) return {};
  if (!isJsonObject(value)) {
    return { ok: false, code: "INVALID_CONTEXT", message: "mcp.unsubscribe context must be a JSON object.", boundary: "context" };
  }
  const allowedServerIds = cleanStringList(value.allowedServerIds);
  const requestedScopes = cleanStringList(value.requestedScopes);
  const allowedScopes = cleanStringList(value.allowedScopes);
  const grantedPermissions = cleanStringList(value.grantedPermissions) as readonly McpUnsubscribePermission[] | undefined;
  if (
    (value.allowedServerIds !== undefined && allowedServerIds === undefined) ||
    (value.requestedScopes !== undefined && requestedScopes === undefined) ||
    (value.allowedScopes !== undefined && allowedScopes === undefined) ||
    (value.grantedPermissions !== undefined && grantedPermissions === undefined)
  ) {
    return { ok: false, code: "INVALID_CONTEXT", message: "mcp.unsubscribe context lists must contain strings.", boundary: "context" };
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

function validate(request: unknown): ValidationSuccess | ValidationFailure {
  const root = request === undefined ? {} : request;
  if (!isJsonObject(root)) {
    return { ok: false, code: "INVALID_REQUEST", message: "mcp.unsubscribe request must be a JSON object.", boundary: "input" };
  }
  const context = normalizeContext(root.context);
  if ("ok" in context) return context;
  if (!isJsonObject(root.target)) {
    return { ok: false, code: "MISSING_SERVER_ID", message: "mcp.unsubscribe requires target.serverId.", boundary: "input", context };
  }
  if (root.target.serverId !== undefined && typeof root.target.serverId !== "string") {
    return { ok: false, code: "INVALID_SERVER_ID", message: "mcp.unsubscribe target.serverId must be a string.", boundary: "input", context };
  }
  const serverId = optionalTrimmedString(root.target.serverId);
  if (serverId === undefined) {
    return { ok: false, code: "MISSING_SERVER_ID", message: "mcp.unsubscribe requires target.serverId.", boundary: "input", context };
  }
  if (root.target.subscriptionId !== undefined && typeof root.target.subscriptionId !== "string") {
    return { ok: false, code: "INVALID_SUBSCRIPTION_ID", message: "mcp.unsubscribe target.subscriptionId must be a string.", boundary: "input", context };
  }
  const subscriptionId = optionalTrimmedString(root.target.subscriptionId);
  if (subscriptionId === undefined) {
    return { ok: false, code: "MISSING_SUBSCRIPTION_ID", message: "mcp.unsubscribe requires target.subscriptionId.", boundary: "input", context };
  }
  if (root.target.reason !== undefined && typeof root.target.reason !== "string") {
    return { ok: false, code: "INVALID_REASON", message: "mcp.unsubscribe target.reason must be a string.", boundary: "input", context };
  }
  const reason = optionalTrimmedString(root.target.reason);
  if (reason !== undefined && reason.length > 256) {
    return { ok: false, code: "INVALID_REASON", message: "mcp.unsubscribe target.reason must be at most 256 characters.", boundary: "input", context };
  }
  if (context.allowedServerIds !== undefined && !context.allowedServerIds.includes(serverId)) {
    return { ok: false, code: "SCOPE_DENIED", message: "mcp.unsubscribe target server is outside allowed MCP server ids.", boundary: "scope", context };
  }
  const requestedScopes = context.requestedScopes ?? [];
  const allowedScopes = context.allowedScopes ?? [];
  if (requestedScopes.length > 0 && allowedScopes.length > 0) {
    const denied = requestedScopes.filter((scope) => !allowedScopes.includes(scope));
    if (denied.length > 0) {
      return { ok: false, code: "SCOPE_DENIED", message: `mcp.unsubscribe scope ${denied[0]} is outside runtime governance.`, boundary: "scope", context };
    }
  }
  const missing = context.grantedPermissions === undefined ? [] : mcpUnsubscribeDescriptor.permissionsRequired.filter((permission) => !context.grantedPermissions?.includes(permission));
  if (missing.length > 0) {
    return { ok: false, code: "PERMISSION_DENIED", message: `mcp.unsubscribe is missing permissions: ${missing.join(", ")}`, boundary: "permission", context };
  }
  return { ok: true, target: { serverId, subscriptionId, reason }, context, acceptedScopes: requestedScopes };
}

function auditEvent(type: string, dryRun: boolean, context: McpUnsubscribeContext): McpToolAuditEvent {
  return {
    type,
    toolId: "mcp.unsubscribe",
    invocationId: context.invocationId ?? "mcp.unsubscribe:dry-run",
    dryRun,
    metadata: { runtimeId: context.runtimeId, sessionId: context.sessionId, ...(context.auditMetadata ?? {}) },
  };
}

function failure(error: ValidationFailure, context: McpUnsubscribeContext = {}, event = "basicTool.mcp.unsubscribe.rejected"): McpUnsubscribeResult {
  return {
    ok: false,
    toolId: "mcp.unsubscribe",
    error: {
      code: error.code,
      message: error.message,
      boundary: error.boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("mcp.unsubscribe.rejected", context.dryRun !== false, context)],
    events: [event],
  };
}

function envelope(target: McpUnsubscribeTarget, result?: McpUnsubscribeProviderResult): McpUnsubscribeEnvelope {
  return {
    subscriptionId: result?.subscriptionId ?? target.subscriptionId,
    serverId: result?.serverId ?? target.serverId,
    state: result?.status ?? "cancel-planned",
    reason: target.reason,
    status: result?.status,
  };
}

function output(
  target: McpUnsubscribeTarget,
  acceptedScopes: readonly string[],
  options: { dryRun: boolean; providerCalled: boolean; result?: McpUnsubscribeProviderResult },
): McpUnsubscribeOutput {
  return {
    kind: "agentCore.basicTool.mcp.unsubscribe",
    target,
    unsubscribeEnvelope: envelope(target, options.result),
    dryRun: options.dryRun,
    executionBlocked: options.dryRun,
    providerCalled: options.providerCalled,
    permissionsRequired: mcpUnsubscribeDescriptor.permissionsRequired,
    unsafeSideEffects: true,
    acceptedScopes,
    providerMetadata: options.result?.providerMetadata,
  };
}

function policyFailure(context: McpUnsubscribeContext): ValidationFailure | undefined {
  if (context.contract?.accepted === false) {
    return {
      ok: false,
      code: "CONTRACT_REJECTED",
      message: context.contract.reason ?? "mcp.unsubscribe was rejected by runtime contract surface.",
      boundary: "contract",
      context,
    };
  }
  if (context.governance?.accepted === false) {
    return {
      ok: false,
      code: "GOVERNANCE_REJECTED",
      message: context.governance.reason ?? "mcp.unsubscribe was rejected by runtime governance.",
      boundary: "governance",
      context,
    };
  }
  return undefined;
}

export function planMcpUnsubscribe(request: unknown = {}): McpUnsubscribeResult {
  const normalized = validate(request);
  if (!normalized.ok) return failure(normalized, normalized.context);
  const blocked = policyFailure(normalized.context);
  if (blocked !== undefined) return failure(blocked, normalized.context);
  if (normalized.context.dryRun === false) {
    return failure(
      { ok: false, code: "REAL_EXECUTION_BLOCKED", message: "planMcpUnsubscribe only produces dry-run envelopes.", boundary: "contract", context: normalized.context },
      normalized.context,
    );
  }
  return {
    ok: true,
    toolId: "mcp.unsubscribe",
    output: output(normalized.target, normalized.acceptedScopes, { dryRun: true, providerCalled: false }),
    audit: [auditEvent("mcp.unsubscribe.planned", true, normalized.context)],
    events: ["basicTool.mcp.unsubscribe.dryRun"],
  };
}

export async function executeMcpUnsubscribe(request: unknown = {}, provider?: McpUnsubscribeProvider): Promise<McpUnsubscribeResult> {
  const normalized = validate(request);
  if (!normalized.ok) return failure(normalized, normalized.context);
  const blocked = policyFailure(normalized.context);
  if (blocked !== undefined) return failure(blocked, normalized.context);
  if (normalized.context.dryRun !== false) {
    return {
      ok: true,
      toolId: "mcp.unsubscribe",
      output: output(normalized.target, normalized.acceptedScopes, { dryRun: true, providerCalled: false }),
      audit: [auditEvent("mcp.unsubscribe.planned", true, normalized.context)],
      events: ["basicTool.mcp.unsubscribe.dryRun"],
    };
  }
  if (!guardAccepted(normalized.context.guard)) {
    return failure(
      { ok: false, code: "GOVERNANCE_REJECTED", message: "mcp.unsubscribe requires an accepted runtime guard before real dispatch.", boundary: "governance", context: normalized.context },
      normalized.context,
    );
  }
  if (provider === undefined) {
    return failure(
      { ok: false, code: "PROVIDER_UNAVAILABLE", message: "Runtime MCP unsubscribe provider is unavailable.", boundary: "provider", context: normalized.context },
      normalized.context,
      "basicTool.mcp.unsubscribe.providerUnavailable",
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
      toolId: "mcp.unsubscribe",
      output: output(normalized.target, normalized.acceptedScopes, { dryRun: false, providerCalled: true, result }),
      audit: [auditEvent("mcp.unsubscribe.executed", false, normalized.context)],
      events: ["basicTool.mcp.unsubscribe.executed"],
    };
  } catch {
    return failure(
      { ok: false, code: "PROVIDER_REJECTED", message: "Runtime MCP provider failed unsubscribe.", boundary: "provider", context: normalized.context },
      normalized.context,
      "basicTool.mcp.unsubscribe.providerRejected",
    );
  }
}
