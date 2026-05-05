import {
  cleanStringList,
  guardAccepted,
  isJsonObject,
  optionalTrimmedString,
  type McpToolAuditEvent,
  type McpToolResult,
} from "../../_shared/baseToolAdapter.js";

export type McpSubscribePermission = "mcp:subscription:write";
export type McpSubscribeSubjectType = "resource" | "event" | "tool";
export type McpSubscribeReplayPolicy = "none" | "latest";
export type McpSubscribeContext = {
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
  grantedPermissions?: readonly McpSubscribePermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};
export type McpSubscribeTarget = {
  serverId: string;
  connectionId?: string;
  subjectType: McpSubscribeSubjectType;
  subject: string;
  eventKinds?: readonly string[];
  replayPolicy: McpSubscribeReplayPolicy;
};
export type McpSubscribeProviderRequest = McpSubscribeTarget;
export type McpSubscribeRequest = { target?: Partial<McpSubscribeTarget> | null; context?: McpSubscribeContext };
export type McpSubscriptionEnvelope = {
  subscriptionId: string;
  serverId: string;
  connectionId?: string;
  subjectType: McpSubscribeSubjectType;
  subject: string;
  eventKinds: readonly string[];
  replayPolicy: McpSubscribeReplayPolicy;
  state: "planned" | "subscribed" | "already_subscribed" | "pending";
  status?: string;
};
export type McpSubscribeProviderResult = {
  subscriptionId: string;
  status: "subscribed" | "already_subscribed" | "pending";
  serverId?: string;
  connectionId?: string;
  providerMetadata?: Readonly<Record<string, unknown>>;
  raw?: unknown;
};
export type McpSubscribeProvider = (
  request: McpSubscribeProviderRequest,
  context: Readonly<Record<string, unknown>>,
) => Promise<McpSubscribeProviderResult> | McpSubscribeProviderResult;
export type McpSubscribeOutput = {
  kind: "agentCore.basicTool.mcp.subscribe";
  target: McpSubscribeTarget;
  subscriptionEnvelope: McpSubscriptionEnvelope;
  dryRun: boolean;
  executionBlocked: boolean;
  providerCalled: boolean;
  permissionsRequired: readonly McpSubscribePermission[];
  unsafeSideEffects: true;
  acceptedScopes: readonly string[];
  providerMetadata?: Readonly<Record<string, unknown>>;
};
export type McpSubscribeErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_CONTEXT"
  | "MISSING_SERVER_ID"
  | "INVALID_SERVER_ID"
  | "INVALID_CONNECTION_ID"
  | "MISSING_SUBJECT_TYPE"
  | "INVALID_SUBJECT_TYPE"
  | "MISSING_SUBJECT"
  | "INVALID_SUBJECT"
  | "INVALID_EVENT_KINDS"
  | "INVALID_REPLAY_POLICY"
  | "SCOPE_DENIED"
  | "PERMISSION_DENIED"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "REAL_EXECUTION_BLOCKED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_REJECTED";
export type McpSubscribeResult = McpToolResult<McpSubscribeOutput, McpSubscribeErrorCode>;

export const mcpSubscribeDescriptor = {
  toolId: "mcp.subscribe",
  capability: "subscribe-mcp-events-or-resources",
  route: "agent_executionEngine.basic_toolLayer.baseTools.mcpBase.subscription",
  defaultDryRun: true,
  tapOwnsApproval: true,
  permissionsRequired: ["mcp:subscription:write"],
  unsafeSideEffects: true,
} as const;

type Boundary = "input" | "context" | "scope" | "permission" | "contract" | "governance" | "provider";
type ValidationFailure = { ok: false; code: McpSubscribeErrorCode; message: string; boundary: Boundary; context?: McpSubscribeContext };
type ValidationSuccess = {
  ok: true;
  target: McpSubscribeTarget;
  context: McpSubscribeContext;
  acceptedScopes: readonly string[];
};

function normalizeContext(value: unknown): McpSubscribeContext | ValidationFailure {
  if (value === undefined) return {};
  if (!isJsonObject(value)) {
    return { ok: false, code: "INVALID_CONTEXT", message: "mcp.subscribe context must be a JSON object.", boundary: "context" };
  }
  const allowedServerIds = cleanStringList(value.allowedServerIds);
  const requestedScopes = cleanStringList(value.requestedScopes);
  const allowedScopes = cleanStringList(value.allowedScopes);
  const grantedPermissions = cleanStringList(value.grantedPermissions) as readonly McpSubscribePermission[] | undefined;
  if (
    (value.allowedServerIds !== undefined && allowedServerIds === undefined) ||
    (value.requestedScopes !== undefined && requestedScopes === undefined) ||
    (value.allowedScopes !== undefined && allowedScopes === undefined) ||
    (value.grantedPermissions !== undefined && grantedPermissions === undefined)
  ) {
    return { ok: false, code: "INVALID_CONTEXT", message: "mcp.subscribe context lists must contain strings.", boundary: "context" };
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

function normalizeSubjectType(value: unknown, context: McpSubscribeContext): McpSubscribeSubjectType | ValidationFailure {
  const subjectType = optionalTrimmedString(value);
  if (subjectType === undefined) {
    return { ok: false, code: "MISSING_SUBJECT_TYPE", message: "mcp.subscribe requires target.subjectType.", boundary: "input", context };
  }
  if (subjectType === "resource" || subjectType === "event" || subjectType === "tool") return subjectType;
  return { ok: false, code: "INVALID_SUBJECT_TYPE", message: "mcp.subscribe target.subjectType must be resource, event, or tool.", boundary: "input", context };
}

function normalizeReplayPolicy(value: unknown, context: McpSubscribeContext): McpSubscribeReplayPolicy | ValidationFailure {
  if (value === undefined) return "none";
  const replayPolicy = optionalTrimmedString(value);
  if (replayPolicy === undefined) return "none";
  if (replayPolicy === "none" || replayPolicy === "latest") return replayPolicy;
  return { ok: false, code: "INVALID_REPLAY_POLICY", message: "mcp.subscribe target.replayPolicy must be none or latest.", boundary: "input", context };
}

function normalizeEventKinds(value: unknown, context: McpSubscribeContext): readonly string[] | ValidationFailure {
  if (value === undefined) return [];
  const eventKinds = cleanStringList(value);
  if (eventKinds === undefined) {
    return { ok: false, code: "INVALID_EVENT_KINDS", message: "mcp.subscribe target.eventKinds must be an array of strings.", boundary: "input", context };
  }
  return eventKinds;
}

function validate(request: unknown): ValidationSuccess | ValidationFailure {
  const root = request === undefined ? {} : request;
  if (!isJsonObject(root)) {
    return { ok: false, code: "INVALID_REQUEST", message: "mcp.subscribe request must be a JSON object.", boundary: "input" };
  }
  const context = normalizeContext(root.context);
  if ("ok" in context) return context;
  if (!isJsonObject(root.target)) {
    return { ok: false, code: "MISSING_SERVER_ID", message: "mcp.subscribe requires target.serverId.", boundary: "input", context };
  }
  if (root.target.serverId !== undefined && typeof root.target.serverId !== "string") {
    return { ok: false, code: "INVALID_SERVER_ID", message: "mcp.subscribe target.serverId must be a string.", boundary: "input", context };
  }
  const serverId = optionalTrimmedString(root.target.serverId);
  if (serverId === undefined) {
    return { ok: false, code: "MISSING_SERVER_ID", message: "mcp.subscribe requires target.serverId.", boundary: "input", context };
  }
  if (root.target.connectionId !== undefined && typeof root.target.connectionId !== "string") {
    return { ok: false, code: "INVALID_CONNECTION_ID", message: "mcp.subscribe target.connectionId must be a string.", boundary: "input", context };
  }
  const subjectType = normalizeSubjectType(root.target.subjectType, context);
  if (isJsonObject(subjectType)) return subjectType;
  if (root.target.subject !== undefined && typeof root.target.subject !== "string") {
    return { ok: false, code: "INVALID_SUBJECT", message: "mcp.subscribe target.subject must be a string.", boundary: "input", context };
  }
  const subject = optionalTrimmedString(root.target.subject);
  if (subject === undefined) {
    return { ok: false, code: "MISSING_SUBJECT", message: "mcp.subscribe requires target.subject.", boundary: "input", context };
  }
  const eventKinds = normalizeEventKinds(root.target.eventKinds, context);
  if (isJsonObject(eventKinds)) return eventKinds;
  const replayPolicy = normalizeReplayPolicy(root.target.replayPolicy, context);
  if (isJsonObject(replayPolicy)) return replayPolicy;
  if (context.allowedServerIds !== undefined && !context.allowedServerIds.includes(serverId)) {
    return { ok: false, code: "SCOPE_DENIED", message: "mcp.subscribe target server is outside allowed MCP server ids.", boundary: "scope", context };
  }
  const requestedScopes = context.requestedScopes ?? [];
  const allowedScopes = context.allowedScopes ?? [];
  if (requestedScopes.length > 0 && allowedScopes.length > 0) {
    const denied = requestedScopes.filter((scope) => !allowedScopes.includes(scope));
    if (denied.length > 0) {
      return { ok: false, code: "SCOPE_DENIED", message: `mcp.subscribe scope ${denied[0]} is outside runtime governance.`, boundary: "scope", context };
    }
  }
  const missing = context.grantedPermissions === undefined ? [] : mcpSubscribeDescriptor.permissionsRequired.filter((permission) => !context.grantedPermissions?.includes(permission));
  if (missing.length > 0) {
    return { ok: false, code: "PERMISSION_DENIED", message: `mcp.subscribe is missing permissions: ${missing.join(", ")}`, boundary: "permission", context };
  }
  return {
    ok: true,
    target: {
      serverId,
      connectionId: optionalTrimmedString(root.target.connectionId),
      subjectType,
      subject,
      eventKinds,
      replayPolicy,
    },
    context,
    acceptedScopes: requestedScopes,
  };
}

function auditEvent(type: string, dryRun: boolean, context: McpSubscribeContext): McpToolAuditEvent {
  return {
    type,
    toolId: "mcp.subscribe",
    invocationId: context.invocationId ?? "mcp.subscribe:dry-run",
    dryRun,
    metadata: { runtimeId: context.runtimeId, sessionId: context.sessionId, ...(context.auditMetadata ?? {}) },
  };
}

function failure(error: ValidationFailure, context: McpSubscribeContext = {}, event = "basicTool.mcp.subscribe.rejected"): McpSubscribeResult {
  return {
    ok: false,
    toolId: "mcp.subscribe",
    error: {
      code: error.code,
      message: error.message,
      boundary: error.boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("mcp.subscribe.rejected", context.dryRun !== false, context)],
    events: [event],
  };
}

function plannedSubscriptionId(target: McpSubscribeTarget, context: McpSubscribeContext): string {
  return `${context.invocationId ?? "mcp.subscribe:dry-run"}:${target.serverId}:${target.subjectType}:${target.subject}`;
}

function envelope(target: McpSubscribeTarget, context: McpSubscribeContext, result?: McpSubscribeProviderResult): McpSubscriptionEnvelope {
  return {
    subscriptionId: result?.subscriptionId ?? plannedSubscriptionId(target, context),
    serverId: result?.serverId ?? target.serverId,
    connectionId: result?.connectionId ?? target.connectionId,
    subjectType: target.subjectType,
    subject: target.subject,
    eventKinds: target.eventKinds ?? [],
    replayPolicy: target.replayPolicy,
    state: result?.status ?? "planned",
    status: result?.status,
  };
}

function output(
  target: McpSubscribeTarget,
  context: McpSubscribeContext,
  acceptedScopes: readonly string[],
  options: { dryRun: boolean; providerCalled: boolean; result?: McpSubscribeProviderResult },
): McpSubscribeOutput {
  return {
    kind: "agentCore.basicTool.mcp.subscribe",
    target,
    subscriptionEnvelope: envelope(target, context, options.result),
    dryRun: options.dryRun,
    executionBlocked: options.dryRun,
    providerCalled: options.providerCalled,
    permissionsRequired: mcpSubscribeDescriptor.permissionsRequired,
    unsafeSideEffects: true,
    acceptedScopes,
    providerMetadata: options.result?.providerMetadata,
  };
}

function policyFailure(context: McpSubscribeContext, target: McpSubscribeTarget): ValidationFailure | undefined {
  if (context.contract?.accepted === false) {
    return {
      ok: false,
      code: "CONTRACT_REJECTED",
      message: context.contract.reason ?? "mcp.subscribe was rejected by runtime contract surface.",
      boundary: "contract",
      context,
    };
  }
  if (context.governance?.accepted === false) {
    return {
      ok: false,
      code: "GOVERNANCE_REJECTED",
      message: context.governance.reason ?? "mcp.subscribe was rejected by runtime governance.",
      boundary: "governance",
      context,
    };
  }
  void target;
  return undefined;
}

export function planMcpSubscribe(request: unknown = {}): McpSubscribeResult {
  const normalized = validate(request);
  if (!normalized.ok) return failure(normalized, normalized.context);
  const blocked = policyFailure(normalized.context, normalized.target);
  if (blocked !== undefined) return failure(blocked, normalized.context);
  if (normalized.context.dryRun === false) {
    return failure(
      { ok: false, code: "REAL_EXECUTION_BLOCKED", message: "planMcpSubscribe only produces dry-run envelopes.", boundary: "contract", context: normalized.context },
      normalized.context,
    );
  }
  return {
    ok: true,
    toolId: "mcp.subscribe",
    output: output(normalized.target, normalized.context, normalized.acceptedScopes, { dryRun: true, providerCalled: false }),
    audit: [auditEvent("mcp.subscribe.planned", true, normalized.context)],
    events: ["basicTool.mcp.subscribe.dryRun"],
  };
}

export async function executeMcpSubscribe(request: unknown = {}, provider?: McpSubscribeProvider): Promise<McpSubscribeResult> {
  const normalized = validate(request);
  if (!normalized.ok) return failure(normalized, normalized.context);
  const blocked = policyFailure(normalized.context, normalized.target);
  if (blocked !== undefined) return failure(blocked, normalized.context);
  if (normalized.context.dryRun !== false) {
    return {
      ok: true,
      toolId: "mcp.subscribe",
      output: output(normalized.target, normalized.context, normalized.acceptedScopes, { dryRun: true, providerCalled: false }),
      audit: [auditEvent("mcp.subscribe.planned", true, normalized.context)],
      events: ["basicTool.mcp.subscribe.dryRun"],
    };
  }
  if (!guardAccepted(normalized.context.guard)) {
    return failure(
      { ok: false, code: "GOVERNANCE_REJECTED", message: "mcp.subscribe requires an accepted runtime guard before real dispatch.", boundary: "governance", context: normalized.context },
      normalized.context,
    );
  }
  if (provider === undefined) {
    return failure(
      { ok: false, code: "PROVIDER_UNAVAILABLE", message: "Runtime MCP subscribe provider is unavailable.", boundary: "provider", context: normalized.context },
      normalized.context,
      "basicTool.mcp.subscribe.providerUnavailable",
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
      toolId: "mcp.subscribe",
      output: output(normalized.target, normalized.context, normalized.acceptedScopes, { dryRun: false, providerCalled: true, result }),
      audit: [auditEvent("mcp.subscribe.executed", false, normalized.context)],
      events: ["basicTool.mcp.subscribe.executed"],
    };
  } catch {
    return failure(
      { ok: false, code: "PROVIDER_REJECTED", message: "Runtime MCP provider failed subscribe.", boundary: "provider", context: normalized.context },
      normalized.context,
      "basicTool.mcp.subscribe.providerRejected",
    );
  }
}
