import {
  cleanStringList,
  guardAccepted,
  isJsonObject,
  optionalTrimmedString,
  type McpToolAuditEvent,
  type McpToolResult,
} from "../../_shared/baseToolAdapter.js";

export type McpCancelPermission = "mcp:cancel" | "mcp:control";

export type McpCancelContext = {
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
  grantedPermissions?: readonly McpCancelPermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type McpCancelTarget = {
  serverId: string;
  executionId: string;
  reason?: string;
  force?: boolean;
};

export type McpCancelRequest = {
  target?: Partial<McpCancelTarget> | null;
  context?: McpCancelContext;
};

export type McpCancelProviderRequest = McpCancelTarget;
export type McpCancelProviderResult = {
  executionId?: string;
  status: "cancelled" | "not_found" | "already_finished" | "pending";
  serverId?: string;
  providerMetadata?: Readonly<Record<string, unknown>>;
  raw?: unknown;
};

export type McpCancelProvider = (
  request: McpCancelProviderRequest,
  context: Readonly<Record<string, unknown>>,
) => Promise<McpCancelProviderResult> | McpCancelProviderResult;

export type McpCancelEnvelope = {
  transport: "mcp";
  operation: "cancel";
  serverId: string;
  executionId: string;
  reason?: string;
  force: boolean;
  state: "planned" | "cancelled" | "not_found" | "already_finished" | "pending";
};

export type McpCancelOutput = {
  kind: "agentCore.basicTool.mcp.cancel";
  target: McpCancelTarget;
  cancelEnvelope: McpCancelEnvelope;
  dryRun: boolean;
  executionBlocked: boolean;
  providerCalled: boolean;
  permissionsRequired: readonly McpCancelPermission[];
  unsafeSideEffects: true;
  acceptedScopes: readonly string[];
  providerMetadata?: Readonly<Record<string, unknown>>;
};

export type McpCancelErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_CONTEXT"
  | "MISSING_SERVER_ID"
  | "INVALID_SERVER_ID"
  | "MISSING_EXECUTION_ID"
  | "INVALID_EXECUTION_ID"
  | "INVALID_REASON"
  | "INVALID_FORCE"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "REAL_EXECUTION_BLOCKED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_REJECTED";

export type McpCancelResult = McpToolResult<McpCancelOutput, McpCancelErrorCode>;

export const mcpCancelDescriptor = {
  toolId: "mcp.cancel",
  capability: "cancel-mcp-execution",
  route: "agent_executionEngine.basic_toolLayer.baseTools.mcpBase.execution",
  defaultDryRun: true,
  tapOwnsApproval: true,
  runtimeOwnsMcpClient: true,
  permissionsRequired: ["mcp:cancel"],
  unsafeSideEffects: true,
  providerBoundary: "BaseToolExecutorPort.mcp.cancelExecution",
} as const;

type Boundary = "input" | "context" | "scope" | "permission" | "contract" | "governance" | "provider";
type ValidationFailure = {
  ok: false;
  code: McpCancelErrorCode;
  message: string;
  boundary: Boundary;
  context?: McpCancelContext;
};
type ValidationSuccess = {
  ok: true;
  target: McpCancelTarget;
  context: McpCancelContext;
  permissionsRequired: readonly McpCancelPermission[];
  acceptedScopes: readonly string[];
};

function normalizeContext(value: unknown): McpCancelContext | ValidationFailure {
  if (value === undefined) return {};
  if (!isJsonObject(value)) {
    return { ok: false, code: "INVALID_CONTEXT", message: "mcp.cancel context must be a JSON object.", boundary: "context" };
  }
  const allowedServerIds = cleanStringList(value.allowedServerIds);
  const requestedScopes = cleanStringList(value.requestedScopes);
  const allowedScopes = cleanStringList(value.allowedScopes);
  const grantedPermissions = cleanStringList(value.grantedPermissions) as readonly McpCancelPermission[] | undefined;
  if (
    (value.allowedServerIds !== undefined && allowedServerIds === undefined) ||
    (value.requestedScopes !== undefined && requestedScopes === undefined) ||
    (value.allowedScopes !== undefined && allowedScopes === undefined) ||
    (value.grantedPermissions !== undefined && grantedPermissions === undefined)
  ) {
    return { ok: false, code: "INVALID_CONTEXT", message: "mcp.cancel context lists must contain strings.", boundary: "context" };
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
    return { ok: false, code: "INVALID_REQUEST", message: "mcp.cancel request must be a JSON object.", boundary: "input" };
  }
  const context = normalizeContext(root.context);
  if ("ok" in context) return context;
  if (!isJsonObject(root.target)) {
    return { ok: false, code: "MISSING_SERVER_ID", message: "mcp.cancel requires target.serverId.", boundary: "input", context };
  }
  if (root.target.serverId !== undefined && typeof root.target.serverId !== "string") {
    return { ok: false, code: "INVALID_SERVER_ID", message: "mcp.cancel target.serverId must be a string.", boundary: "input", context };
  }
  const serverId = optionalTrimmedString(root.target.serverId);
  if (serverId === undefined) {
    return { ok: false, code: "MISSING_SERVER_ID", message: "mcp.cancel requires target.serverId.", boundary: "input", context };
  }
  if (root.target.executionId !== undefined && typeof root.target.executionId !== "string") {
    return { ok: false, code: "INVALID_EXECUTION_ID", message: "mcp.cancel target.executionId must be a string.", boundary: "input", context };
  }
  const executionId = optionalTrimmedString(root.target.executionId);
  if (executionId === undefined) {
    return { ok: false, code: "MISSING_EXECUTION_ID", message: "mcp.cancel requires target.executionId.", boundary: "input", context };
  }
  if (root.target.reason !== undefined && typeof root.target.reason !== "string") {
    return { ok: false, code: "INVALID_REASON", message: "mcp.cancel target.reason must be a string.", boundary: "input", context };
  }
  const reason = optionalTrimmedString(root.target.reason);
  if (root.target.reason !== undefined && reason === undefined) {
    return { ok: false, code: "INVALID_REASON", message: "mcp.cancel target.reason must not be blank when provided.", boundary: "input", context };
  }
  if (root.target.force !== undefined && typeof root.target.force !== "boolean") {
    return { ok: false, code: "INVALID_FORCE", message: "mcp.cancel target.force must be boolean when provided.", boundary: "input", context };
  }
  if (context.allowedServerIds !== undefined && !context.allowedServerIds.includes(serverId)) {
    return { ok: false, code: "SCOPE_REJECTED", message: "mcp.cancel target server is outside allowed MCP server ids.", boundary: "scope", context };
  }
  const requestedScopes = context.requestedScopes ?? [];
  const allowedScopes = context.allowedScopes ?? [];
  if (requestedScopes.length > 0 && allowedScopes.length > 0) {
    const denied = requestedScopes.filter((scope) => !allowedScopes.includes(scope));
    if (denied.length > 0) {
      return { ok: false, code: "SCOPE_REJECTED", message: `mcp.cancel scope ${denied[0]} is outside runtime governance.`, boundary: "scope", context };
    }
  }
  const force = root.target.force === true;
  const permissionsRequired: readonly McpCancelPermission[] = force ? ["mcp:cancel", "mcp:control"] : ["mcp:cancel"];
  const missing = context.grantedPermissions === undefined ? [] : permissionsRequired.filter((permission) => !context.grantedPermissions?.includes(permission));
  if (missing.length > 0) {
    return { ok: false, code: "PERMISSION_DENIED", message: `mcp.cancel is missing permissions: ${missing.join(", ")}`, boundary: "permission", context };
  }
  return {
    ok: true,
    target: { serverId, executionId, reason, force },
    context,
    permissionsRequired,
    acceptedScopes: requestedScopes,
  };
}

function auditEvent(type: string, dryRun: boolean, context: McpCancelContext): McpToolAuditEvent {
  return {
    type,
    toolId: "mcp.cancel",
    invocationId: context.invocationId ?? "mcp.cancel:dry-run",
    dryRun,
    metadata: { runtimeId: context.runtimeId, sessionId: context.sessionId, ...(context.auditMetadata ?? {}) },
  };
}

function failure(error: ValidationFailure, context: McpCancelContext = {}, event = "basicTool.mcp.cancel.rejected"): McpCancelResult {
  return {
    ok: false,
    toolId: "mcp.cancel",
    error: {
      code: error.code,
      message: error.message,
      boundary: error.boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("mcp.cancel.rejected", context.dryRun !== false, context)],
    events: [event],
  };
}

function envelope(target: McpCancelTarget, result?: McpCancelProviderResult): McpCancelEnvelope {
  return {
    transport: "mcp",
    operation: "cancel",
    serverId: result?.serverId ?? target.serverId,
    executionId: result?.executionId ?? target.executionId,
    reason: target.reason,
    force: target.force === true,
    state: result?.status ?? "planned",
  };
}

function output(
  target: McpCancelTarget,
  context: McpCancelContext,
  permissionsRequired: readonly McpCancelPermission[],
  acceptedScopes: readonly string[],
  options: { dryRun: boolean; providerCalled: boolean; result?: McpCancelProviderResult },
): McpCancelOutput {
  return {
    kind: "agentCore.basicTool.mcp.cancel",
    target,
    cancelEnvelope: envelope(target, options.result),
    dryRun: options.dryRun,
    executionBlocked: options.dryRun,
    providerCalled: options.providerCalled,
    permissionsRequired,
    unsafeSideEffects: true,
    acceptedScopes,
    providerMetadata: options.result?.providerMetadata,
  };
}

function policyFailure(context: McpCancelContext): ValidationFailure | undefined {
  if (context.contract?.accepted === false) {
    return {
      ok: false,
      code: "CONTRACT_REJECTED",
      message: context.contract.reason ?? "mcp.cancel was rejected by runtime contract surface.",
      boundary: "contract",
      context,
    };
  }
  if (context.governance?.accepted === false) {
    return {
      ok: false,
      code: "GOVERNANCE_REJECTED",
      message: context.governance.reason ?? "mcp.cancel was rejected by runtime governance.",
      boundary: "governance",
      context,
    };
  }
  return undefined;
}

export function planMcpCancel(request: unknown = {}): McpCancelResult {
  const normalized = validate(request);
  if (!normalized.ok) return failure(normalized, normalized.context);
  const blocked = policyFailure(normalized.context);
  if (blocked !== undefined) return failure(blocked, normalized.context);
  if (normalized.context.dryRun === false) {
    return failure(
      { ok: false, code: "REAL_EXECUTION_BLOCKED", message: "planMcpCancel only produces dry-run envelopes.", boundary: "contract", context: normalized.context },
      normalized.context,
    );
  }
  return {
    ok: true,
    toolId: "mcp.cancel",
    output: output(normalized.target, normalized.context, normalized.permissionsRequired, normalized.acceptedScopes, { dryRun: true, providerCalled: false }),
    audit: [auditEvent("mcp.cancel.planned", true, normalized.context)],
    events: ["basicTool.mcp.cancel.dryRun"],
  };
}

export async function executeMcpCancel(request: unknown = {}, provider?: McpCancelProvider): Promise<McpCancelResult> {
  const normalized = validate(request);
  if (!normalized.ok) return failure(normalized, normalized.context);
  const blocked = policyFailure(normalized.context);
  if (blocked !== undefined) return failure(blocked, normalized.context);
  if (normalized.context.dryRun !== false) {
    return {
      ok: true,
      toolId: "mcp.cancel",
      output: output(normalized.target, normalized.context, normalized.permissionsRequired, normalized.acceptedScopes, { dryRun: true, providerCalled: false }),
      audit: [auditEvent("mcp.cancel.planned", true, normalized.context)],
      events: ["basicTool.mcp.cancel.dryRun"],
    };
  }
  if (!guardAccepted(normalized.context.guard)) {
    return failure(
      { ok: false, code: "GOVERNANCE_REJECTED", message: "mcp.cancel requires an accepted runtime guard before real dispatch.", boundary: "governance", context: normalized.context },
      normalized.context,
    );
  }
  if (provider === undefined) {
    return failure(
      { ok: false, code: "PROVIDER_UNAVAILABLE", message: "Runtime MCP cancel provider is unavailable.", boundary: "provider", context: normalized.context },
      normalized.context,
      "basicTool.mcp.cancel.providerUnavailable",
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
      toolId: "mcp.cancel",
      output: output(normalized.target, normalized.context, normalized.permissionsRequired, normalized.acceptedScopes, { dryRun: false, providerCalled: true, result }),
      audit: [auditEvent("mcp.cancel.executed", false, normalized.context)],
      events: ["basicTool.mcp.cancel.executed"],
    };
  } catch {
    return failure(
      { ok: false, code: "PROVIDER_REJECTED", message: "Runtime MCP provider failed cancel dispatch.", boundary: "provider", context: normalized.context },
      normalized.context,
      "basicTool.mcp.cancel.providerRejected",
    );
  }
}
