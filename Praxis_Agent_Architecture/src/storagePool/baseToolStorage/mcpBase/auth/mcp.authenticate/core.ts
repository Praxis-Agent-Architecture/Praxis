import {
  cleanStringList,
  guardAccepted,
  isJsonObject,
  optionalTrimmedString,
  type McpToolAuditEvent,
  type McpToolResult,
} from "../../_shared/baseToolAdapter.js";

export type McpAuthStrategy = "oauth" | "api-key" | "bearer-token" | "custom";
export type McpAuthenticatePermission = "mcp:connect" | "mcp:auth";
export type McpAuthenticateContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: { accepted?: boolean; allowed?: boolean; reason?: string };
  allowedServerIds?: readonly string[];
  allowedScopes?: readonly string[];
  grantedPermissions?: readonly McpAuthenticatePermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type McpAuthenticateTarget = {
  serverId: string;
  authStrategy: McpAuthStrategy;
  credentialRef: string;
  requestedScopes: readonly string[];
};

export type McpAuthenticateRequest = {
  target?: Partial<McpAuthenticateTarget> | null;
  context?: McpAuthenticateContext;
};

export type McpAuthenticateProviderResult = {
  status: "authenticated" | "already_authenticated" | "pending";
  serverId?: string;
  authSessionId?: string;
  expiresAt?: string;
  scopesGranted?: readonly string[];
  providerMetadata?: Readonly<Record<string, unknown>>;
  raw?: unknown;
};

export type McpAuthenticateProvider = (
  request: McpAuthenticateTarget,
  context: Readonly<Record<string, unknown>>,
) => Promise<McpAuthenticateProviderResult> | McpAuthenticateProviderResult;

export type McpAuthenticateOutput = {
  kind: "agentCore.basicTool.mcp.authenticate";
  target: McpAuthenticateTarget;
  dryRun: boolean;
  executionBlocked: boolean;
  providerCalled: boolean;
  permissionsRequired: readonly McpAuthenticatePermission[];
  unsafeSideEffects: true;
  credentialMaterialAccepted: false;
  tokenIssued: boolean;
  authEnvelope: {
    serverId: string;
    authStrategy: McpAuthStrategy;
    credentialRef: string;
    requestedScopes: readonly string[];
    state: "planned" | "authenticated" | "already_authenticated" | "pending";
    authSessionId?: string;
    expiresAt?: string;
    scopesGranted?: readonly string[];
    source: "dry-run" | "runtime-provider";
  };
  providerMetadata?: Readonly<Record<string, unknown>>;
};

export type McpAuthenticateErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_CONTEXT"
  | "MISSING_SERVER_ID"
  | "INVALID_SERVER_ID"
  | "INVALID_AUTH_STRATEGY"
  | "MISSING_CREDENTIAL_REF"
  | "INVALID_REQUESTED_SCOPES"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "GOVERNANCE_REJECTED"
  | "REAL_EXECUTION_BLOCKED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_REJECTED";

export type McpAuthenticateResult = McpToolResult<McpAuthenticateOutput, McpAuthenticateErrorCode>;

export const mcpAuthenticateDescriptor = {
  toolId: "mcp.authenticate",
  capability: "authenticate-mcp-server",
  route: "agent_executionEngine.basic_toolLayer.baseTools.mcpBase.auth",
  permissionsRequired: ["mcp:connect", "mcp:auth"] as const,
  defaultDryRun: true,
  acceptsRawSecrets: false,
  tapOwnsApproval: true,
} as const;

type ValidationFailure = {
  ok: false;
  code: McpAuthenticateErrorCode;
  message: string;
  boundary: "input" | "context" | "scope" | "permission" | "contract" | "governance" | "provider";
  context?: McpAuthenticateContext;
};
type ValidationSuccess = { ok: true; target: McpAuthenticateTarget; context: McpAuthenticateContext };

function normalizeContext(value: unknown): McpAuthenticateContext | ValidationFailure {
  if (value === undefined) return {};
  if (!isJsonObject(value)) {
    return { ok: false, code: "INVALID_CONTEXT", message: "mcp.authenticate context must be a JSON object.", boundary: "context" };
  }
  const allowedServerIds = cleanStringList(value.allowedServerIds);
  const allowedScopes = cleanStringList(value.allowedScopes);
  const grantedPermissions = cleanStringList(value.grantedPermissions) as readonly McpAuthenticatePermission[] | undefined;
  if (
    (value.allowedServerIds !== undefined && allowedServerIds === undefined) ||
    (value.allowedScopes !== undefined && allowedScopes === undefined) ||
    (value.grantedPermissions !== undefined && grantedPermissions === undefined)
  ) {
    return {
      ok: false,
      code: "INVALID_CONTEXT",
      message: "mcp.authenticate context lists must contain strings.",
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

function normalizeAuthStrategy(value: unknown): McpAuthStrategy | undefined {
  return value === "oauth" || value === "api-key" || value === "bearer-token" || value === "custom" ? value : undefined;
}

function validate(request: unknown): ValidationSuccess | ValidationFailure {
  const root = request === undefined ? {} : request;
  if (!isJsonObject(root)) {
    return { ok: false, code: "INVALID_REQUEST", message: "mcp.authenticate request must be a JSON object.", boundary: "input" };
  }
  const context = normalizeContext(root.context);
  if ("ok" in context) return context;
  if (!isJsonObject(root.target)) {
    return { ok: false, code: "MISSING_SERVER_ID", message: "mcp.authenticate requires target.serverId.", boundary: "input", context };
  }
  if (root.target.serverId !== undefined && typeof root.target.serverId !== "string") {
    return { ok: false, code: "INVALID_SERVER_ID", message: "mcp.authenticate target.serverId must be a string.", boundary: "input", context };
  }
  const serverId = optionalTrimmedString(root.target.serverId);
  if (serverId === undefined) {
    return { ok: false, code: "MISSING_SERVER_ID", message: "mcp.authenticate requires target.serverId.", boundary: "input", context };
  }
  const authStrategy = normalizeAuthStrategy(root.target.authStrategy);
  if (authStrategy === undefined) {
    return {
      ok: false,
      code: "INVALID_AUTH_STRATEGY",
      message: "mcp.authenticate requires target.authStrategy to be oauth, api-key, bearer-token, or custom.",
      boundary: "input",
      context,
    };
  }
  const credentialRef = optionalTrimmedString(root.target.credentialRef);
  if (credentialRef === undefined) {
    return {
      ok: false,
      code: "MISSING_CREDENTIAL_REF",
      message: "mcp.authenticate requires target.credentialRef instead of raw credential material.",
      boundary: "input",
      context,
    };
  }
  const requestedScopes = cleanStringList(root.target.requestedScopes) ?? [];
  if (root.target.requestedScopes !== undefined && !Array.isArray(root.target.requestedScopes)) {
    return {
      ok: false,
      code: "INVALID_REQUESTED_SCOPES",
      message: "mcp.authenticate target.requestedScopes must be an array of strings.",
      boundary: "input",
      context,
    };
  }
  if (context.allowedServerIds !== undefined && !context.allowedServerIds.includes(serverId)) {
    return { ok: false, code: "SCOPE_REJECTED", message: "mcp.authenticate target server is outside allowed MCP server ids.", boundary: "scope", context };
  }
  if (context.allowedScopes !== undefined && requestedScopes.some((scope) => !context.allowedScopes?.includes(scope))) {
    return { ok: false, code: "SCOPE_REJECTED", message: "mcp.authenticate requested scopes are outside allowed MCP scopes.", boundary: "scope", context };
  }
  const missingPermissions = mcpAuthenticateDescriptor.permissionsRequired.filter((permission) => !context.grantedPermissions?.includes(permission));
  if (context.grantedPermissions !== undefined && missingPermissions.length > 0) {
    return {
      ok: false,
      code: "PERMISSION_DENIED",
      message: `mcp.authenticate is missing permissions: ${missingPermissions.join(", ")}`,
      boundary: "permission",
      context,
    };
  }
  return { ok: true, target: { serverId, authStrategy, credentialRef, requestedScopes }, context };
}

function auditEvent(type: string, dryRun: boolean, context: McpAuthenticateContext): McpToolAuditEvent {
  return {
    type,
    toolId: "mcp.authenticate",
    invocationId: context.invocationId ?? "mcp.authenticate:dry-run",
    dryRun,
    metadata: {
      runtimeId: context.runtimeId,
      sessionId: context.sessionId,
      ...(context.auditMetadata ?? {}),
    },
  };
}

function failure(error: ValidationFailure, context: McpAuthenticateContext = {}, event = "basicTool.mcp.authenticate.rejected"): McpAuthenticateResult {
  return {
    ok: false,
    toolId: "mcp.authenticate",
    error: {
      code: error.code,
      message: error.message,
      boundary: error.boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("mcp.authenticate.rejected", context.dryRun !== false, context)],
    events: [event],
  };
}

function output(target: McpAuthenticateTarget, options: { dryRun: boolean; providerCalled: boolean; result?: McpAuthenticateProviderResult }): McpAuthenticateOutput {
  return {
    kind: "agentCore.basicTool.mcp.authenticate",
    target,
    dryRun: options.dryRun,
    executionBlocked: options.dryRun,
    providerCalled: options.providerCalled,
    permissionsRequired: mcpAuthenticateDescriptor.permissionsRequired,
    unsafeSideEffects: true,
    credentialMaterialAccepted: false,
    tokenIssued: options.result?.status === "authenticated" || options.result?.status === "already_authenticated",
    authEnvelope: {
      serverId: options.result?.serverId ?? target.serverId,
      authStrategy: target.authStrategy,
      credentialRef: target.credentialRef,
      requestedScopes: target.requestedScopes,
      state: options.result?.status ?? "planned",
      authSessionId: options.result?.authSessionId,
      expiresAt: options.result?.expiresAt,
      scopesGranted: options.result?.scopesGranted,
      source: options.result === undefined ? "dry-run" : "runtime-provider",
    },
    providerMetadata: options.result?.providerMetadata,
  };
}

export function planMcpAuthenticate(request: unknown = {}): McpAuthenticateResult {
  const normalized = validate(request);
  if (!normalized.ok) return failure(normalized, normalized.context);
  if (normalized.context.dryRun === false) {
    return failure(
      { ok: false, code: "REAL_EXECUTION_BLOCKED", message: "planMcpAuthenticate only produces dry-run envelopes.", boundary: "contract", context: normalized.context },
      normalized.context,
    );
  }
  return {
    ok: true,
    toolId: "mcp.authenticate",
    output: output(normalized.target, { dryRun: true, providerCalled: false }),
    audit: [auditEvent("mcp.authenticate.planned", true, normalized.context)],
    events: ["basicTool.mcp.authenticate.dryRun"],
  };
}

export async function executeMcpAuthenticate(request: unknown = {}, provider?: McpAuthenticateProvider): Promise<McpAuthenticateResult> {
  const normalized = validate(request);
  if (!normalized.ok) return failure(normalized, normalized.context);
  if (normalized.context.dryRun !== false) {
    return {
      ok: true,
      toolId: "mcp.authenticate",
      output: output(normalized.target, { dryRun: true, providerCalled: false }),
      audit: [auditEvent("mcp.authenticate.planned", true, normalized.context)],
      events: ["basicTool.mcp.authenticate.dryRun"],
    };
  }
  if (!guardAccepted(normalized.context.guard)) {
    return failure(
      { ok: false, code: "GOVERNANCE_REJECTED", message: "mcp.authenticate requires an accepted runtime guard before real dispatch.", boundary: "governance", context: normalized.context },
      normalized.context,
    );
  }
  if (provider === undefined) {
    return failure(
      { ok: false, code: "PROVIDER_UNAVAILABLE", message: "Runtime MCP authentication provider is unavailable.", boundary: "provider", context: normalized.context },
      normalized.context,
      "basicTool.mcp.authenticate.providerUnavailable",
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
      toolId: "mcp.authenticate",
      output: output(normalized.target, { dryRun: false, providerCalled: true, result }),
      audit: [auditEvent("mcp.authenticate.executed", false, normalized.context)],
      events: ["basicTool.mcp.authenticate.executed"],
    };
  } catch {
    return failure(
      { ok: false, code: "PROVIDER_REJECTED", message: "Runtime MCP provider failed authentication.", boundary: "provider", context: normalized.context },
      normalized.context,
      "basicTool.mcp.authenticate.providerRejected",
    );
  }
}
