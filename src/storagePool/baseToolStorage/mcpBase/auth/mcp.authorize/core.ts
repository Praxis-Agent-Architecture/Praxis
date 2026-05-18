import {
  cleanStringList,
  guardAccepted,
  isJsonObject,
  optionalTrimmedString,
  type McpToolAuditEvent,
  type McpToolResult,
} from "../../_shared/baseToolAdapter.js";

export type McpAuthorizeAction = "call-tool" | "read-resource" | "subscribe" | "cache-access";
export type McpAuthorizePermission = "mcp:auth" | "mcp:read";
export type McpAuthorizeContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: { accepted?: boolean; allowed?: boolean; reason?: string };
  allowedServerIds?: readonly string[];
  allowedScopes?: readonly string[];
  grantedPermissions?: readonly McpAuthorizePermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type McpAuthorizeTarget = {
  serverId: string;
  subjectId: string;
  action: McpAuthorizeAction;
  toolName?: string;
  resourceUri?: string;
  requestedScopes: readonly string[];
};

export type McpAuthorizeRequest = {
  target?: Partial<McpAuthorizeTarget> | null;
  context?: McpAuthorizeContext;
};

export type McpAuthorizeProviderResult = {
  decision: "allowed" | "denied" | "conditional" | "pending";
  reason?: string;
  policyId?: string;
  scopesGranted?: readonly string[];
  providerMetadata?: Readonly<Record<string, unknown>>;
  raw?: unknown;
};

export type McpAuthorizeProvider = (
  request: McpAuthorizeTarget,
  context: Readonly<Record<string, unknown>>,
) => Promise<McpAuthorizeProviderResult> | McpAuthorizeProviderResult;

export type McpAuthorizeOutput = {
  kind: "agentCore.basicTool.mcp.authorize";
  target: McpAuthorizeTarget;
  dryRun: boolean;
  executionBlocked: boolean;
  providerCalled: boolean;
  permissionsRequired: readonly McpAuthorizePermission[];
  unsafeSideEffects: false;
  authorizationGranted: boolean;
  decision: "dry-run-policy-envelope" | "allowed" | "denied" | "conditional" | "pending";
  policyInput: {
    serverId: string;
    subjectId: string;
    action: McpAuthorizeAction;
    toolName?: string;
    resourceUri?: string;
    requestedScopes: readonly string[];
  };
  policyEnvelope: {
    decision: "planned" | "allowed" | "denied" | "conditional" | "pending";
    reason?: string;
    policyId?: string;
    scopesGranted?: readonly string[];
    source: "dry-run" | "runtime-provider";
  };
  providerMetadata?: Readonly<Record<string, unknown>>;
};

export type McpAuthorizeErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_CONTEXT"
  | "MISSING_SERVER_ID"
  | "INVALID_SERVER_ID"
  | "MISSING_SUBJECT_ID"
  | "MISSING_AUTH_ACTION"
  | "INVALID_REQUESTED_SCOPES"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "GOVERNANCE_REJECTED"
  | "REAL_EXECUTION_BLOCKED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_REJECTED";

export type McpAuthorizeResult = McpToolResult<McpAuthorizeOutput, McpAuthorizeErrorCode>;

export const mcpAuthorizeDescriptor = {
  toolId: "mcp.authorize",
  capability: "authorize-mcp-operation",
  route: "agent_executionEngine.basic_toolLayer.baseTools.mcpBase.auth",
  permissionsRequired: ["mcp:auth", "mcp:read"] as const,
  defaultDryRun: true,
  tapOwnsApproval: true,
} as const;

type ValidationFailure = {
  ok: false;
  code: McpAuthorizeErrorCode;
  message: string;
  boundary: "input" | "context" | "scope" | "permission" | "contract" | "governance" | "provider";
  context?: McpAuthorizeContext;
};
type ValidationSuccess = { ok: true; target: McpAuthorizeTarget; context: McpAuthorizeContext };

function normalizeContext(value: unknown): McpAuthorizeContext | ValidationFailure {
  if (value === undefined) return {};
  if (!isJsonObject(value)) {
    return { ok: false, code: "INVALID_CONTEXT", message: "mcp.authorize context must be a JSON object.", boundary: "context" };
  }
  const allowedServerIds = cleanStringList(value.allowedServerIds);
  const allowedScopes = cleanStringList(value.allowedScopes);
  const grantedPermissions = cleanStringList(value.grantedPermissions) as readonly McpAuthorizePermission[] | undefined;
  if (
    (value.allowedServerIds !== undefined && allowedServerIds === undefined) ||
    (value.allowedScopes !== undefined && allowedScopes === undefined) ||
    (value.grantedPermissions !== undefined && grantedPermissions === undefined)
  ) {
    return {
      ok: false,
      code: "INVALID_CONTEXT",
      message: "mcp.authorize context lists must contain strings.",
      boundary: "context",
    };
  }
  return {
    runtimeId: optionalTrimmedString(value.runtimeId),
    sessionId: optionalTrimmedString(value.sessionId),
    invocationId: optionalTrimmedString(value.invocationId),
    dryRun: typeof value.dryRun === "boolean" ? value.dryRun : undefined,
    guard: isJsonObject(value.guard) ? value.guard : undefined,
    allowedServerIds,
    allowedScopes,
    grantedPermissions,
    auditMetadata: isJsonObject(value.auditMetadata) ? value.auditMetadata : undefined,
  };
}

function normalizeAction(value: unknown): McpAuthorizeAction | undefined {
  return value === "call-tool" || value === "read-resource" || value === "subscribe" || value === "cache-access"
    ? value
    : undefined;
}

function validate(request: unknown): ValidationSuccess | ValidationFailure {
  const root = request === undefined ? {} : request;
  if (!isJsonObject(root)) {
    return { ok: false, code: "INVALID_REQUEST", message: "mcp.authorize request must be a JSON object.", boundary: "input" };
  }
  const context = normalizeContext(root.context);
  if ("ok" in context) return context;
  if (!isJsonObject(root.target)) {
    return { ok: false, code: "MISSING_SERVER_ID", message: "mcp.authorize requires target.serverId.", boundary: "input", context };
  }
  if (root.target.serverId !== undefined && typeof root.target.serverId !== "string") {
    return { ok: false, code: "INVALID_SERVER_ID", message: "mcp.authorize target.serverId must be a string.", boundary: "input", context };
  }
  const serverId = optionalTrimmedString(root.target.serverId);
  if (serverId === undefined) {
    return { ok: false, code: "MISSING_SERVER_ID", message: "mcp.authorize requires target.serverId.", boundary: "input", context };
  }
  const subjectId = optionalTrimmedString(root.target.subjectId);
  if (subjectId === undefined) {
    return { ok: false, code: "MISSING_SUBJECT_ID", message: "mcp.authorize requires target.subjectId.", boundary: "input", context };
  }
  const action = normalizeAction(root.target.action);
  if (action === undefined) {
    return {
      ok: false,
      code: "MISSING_AUTH_ACTION",
      message: "mcp.authorize requires target.action to be call-tool, read-resource, subscribe, or cache-access.",
      boundary: "input",
      context,
    };
  }
  const requestedScopes = cleanStringList(root.target.requestedScopes) ?? [];
  if (root.target.requestedScopes !== undefined && !Array.isArray(root.target.requestedScopes)) {
    return {
      ok: false,
      code: "INVALID_REQUESTED_SCOPES",
      message: "mcp.authorize target.requestedScopes must be an array of strings.",
      boundary: "input",
      context,
    };
  }
  if (context.allowedServerIds !== undefined && !context.allowedServerIds.includes(serverId)) {
    return { ok: false, code: "SCOPE_REJECTED", message: "mcp.authorize target server is outside allowed MCP server ids.", boundary: "scope", context };
  }
  if (context.allowedScopes !== undefined && requestedScopes.some((scope) => !context.allowedScopes?.includes(scope))) {
    return { ok: false, code: "SCOPE_REJECTED", message: "mcp.authorize requested scopes are outside allowed MCP scopes.", boundary: "scope", context };
  }
  const missingPermissions = mcpAuthorizeDescriptor.permissionsRequired.filter((permission) => !context.grantedPermissions?.includes(permission));
  if (context.grantedPermissions !== undefined && missingPermissions.length > 0) {
    return {
      ok: false,
      code: "PERMISSION_DENIED",
      message: `mcp.authorize is missing permissions: ${missingPermissions.join(", ")}`,
      boundary: "permission",
      context,
    };
  }
  return {
    ok: true,
    target: {
      serverId,
      subjectId,
      action,
      toolName: optionalTrimmedString(root.target.toolName),
      resourceUri: optionalTrimmedString(root.target.resourceUri),
      requestedScopes,
    },
    context,
  };
}

function auditEvent(type: string, dryRun: boolean, context: McpAuthorizeContext): McpToolAuditEvent {
  return {
    type,
    toolId: "mcp.authorize",
    invocationId: context.invocationId ?? "mcp.authorize:dry-run",
    dryRun,
    metadata: {
      runtimeId: context.runtimeId,
      sessionId: context.sessionId,
      ...(context.auditMetadata ?? {}),
    },
  };
}

function failure(error: ValidationFailure, context: McpAuthorizeContext = {}, event = "basicTool.mcp.authorize.rejected"): McpAuthorizeResult {
  return {
    ok: false,
    toolId: "mcp.authorize",
    error: {
      code: error.code,
      message: error.message,
      boundary: error.boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("mcp.authorize.rejected", context.dryRun !== false, context)],
    events: [event],
  };
}

function output(target: McpAuthorizeTarget, options: { dryRun: boolean; providerCalled: boolean; result?: McpAuthorizeProviderResult }): McpAuthorizeOutput {
  const decision = options.result?.decision;
  return {
    kind: "agentCore.basicTool.mcp.authorize",
    target,
    dryRun: options.dryRun,
    executionBlocked: options.dryRun,
    providerCalled: options.providerCalled,
    permissionsRequired: mcpAuthorizeDescriptor.permissionsRequired,
    unsafeSideEffects: false,
    authorizationGranted: decision === "allowed",
    decision: decision ?? "dry-run-policy-envelope",
    policyInput: {
      serverId: target.serverId,
      subjectId: target.subjectId,
      action: target.action,
      toolName: target.toolName,
      resourceUri: target.resourceUri,
      requestedScopes: target.requestedScopes,
    },
    policyEnvelope: {
      decision: decision ?? "planned",
      reason: options.result?.reason,
      policyId: options.result?.policyId,
      scopesGranted: options.result?.scopesGranted,
      source: options.result === undefined ? "dry-run" : "runtime-provider",
    },
    providerMetadata: options.result?.providerMetadata,
  };
}

export function planMcpAuthorize(request: unknown = {}): McpAuthorizeResult {
  const normalized = validate(request);
  if (!normalized.ok) return failure(normalized, normalized.context);
  if (normalized.context.dryRun === false) {
    return failure(
      { ok: false, code: "REAL_EXECUTION_BLOCKED", message: "planMcpAuthorize only produces dry-run envelopes.", boundary: "contract", context: normalized.context },
      normalized.context,
    );
  }
  return {
    ok: true,
    toolId: "mcp.authorize",
    output: output(normalized.target, { dryRun: true, providerCalled: false }),
    audit: [auditEvent("mcp.authorize.planned", true, normalized.context)],
    events: ["basicTool.mcp.authorize.dryRun"],
  };
}

export async function executeMcpAuthorize(request: unknown = {}, provider?: McpAuthorizeProvider): Promise<McpAuthorizeResult> {
  const normalized = validate(request);
  if (!normalized.ok) return failure(normalized, normalized.context);
  if (normalized.context.dryRun !== false) {
    return {
      ok: true,
      toolId: "mcp.authorize",
      output: output(normalized.target, { dryRun: true, providerCalled: false }),
      audit: [auditEvent("mcp.authorize.planned", true, normalized.context)],
      events: ["basicTool.mcp.authorize.dryRun"],
    };
  }
  if (!guardAccepted(normalized.context.guard)) {
    return failure(
      { ok: false, code: "GOVERNANCE_REJECTED", message: "mcp.authorize requires an accepted runtime guard before real dispatch.", boundary: "governance", context: normalized.context },
      normalized.context,
    );
  }
  if (provider === undefined) {
    return failure(
      { ok: false, code: "PROVIDER_UNAVAILABLE", message: "Runtime MCP authorization provider is unavailable.", boundary: "provider", context: normalized.context },
      normalized.context,
      "basicTool.mcp.authorize.providerUnavailable",
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
      toolId: "mcp.authorize",
      output: output(normalized.target, { dryRun: false, providerCalled: true, result }),
      audit: [auditEvent("mcp.authorize.executed", false, normalized.context)],
      events: ["basicTool.mcp.authorize.executed"],
    };
  } catch {
    return failure(
      { ok: false, code: "PROVIDER_REJECTED", message: "Runtime MCP provider failed authorization.", boundary: "provider", context: normalized.context },
      normalized.context,
      "basicTool.mcp.authorize.providerRejected",
    );
  }
}
