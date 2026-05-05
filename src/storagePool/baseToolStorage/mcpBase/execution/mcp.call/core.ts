import { guardAccepted, isJsonObject, readStringArray, type McpToolAuditEvent, type McpToolResult } from "../../_shared/baseToolAdapter.js";

export type McpCallPermission = "mcp:call" | "mcp:read" | "mcp:service";
export type McpCallMode = "tool" | "service";

export type McpCallGuard = {
  accepted?: boolean;
  allowed?: boolean;
  reason?: string;
};

export type McpCallContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: McpCallGuard;
  allowedServerIds?: readonly string[];
  grantedPermissions?: readonly McpCallPermission[];
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type McpCallTarget = {
  serverId: string;
  name: string;
  mode: McpCallMode;
  arguments?: Readonly<Record<string, unknown>>;
  timeoutMs?: number;
};

export type McpCallTargetInput = Partial<McpCallTarget> & {
  toolName?: string;
};

export type McpCallRequest = {
  target?: McpCallTargetInput | null;
  context?: McpCallContext;
};

export type McpCallProviderRequest = {
  serverId: string;
  toolName: string;
  mode: McpCallMode;
  arguments?: Readonly<Record<string, unknown>>;
  timeoutMs?: number;
};

export type McpCallProvider = (
  request: McpCallProviderRequest,
  context: Readonly<Record<string, unknown>>,
) => Promise<unknown> | unknown;

export type McpCallProviderContext = {
  provider?: McpCallProvider;
};

export type McpCallOutput = {
  kind: "agentCore.basicTool.mcp.call";
  target: McpCallTarget;
  requestEnvelope: {
    serverId: string;
    toolName: string;
    mode: McpCallMode;
    arguments?: Readonly<Record<string, unknown>>;
    timeoutMs?: number;
  };
  dryRun: boolean;
  executionBlocked: boolean;
  providerCalled: boolean;
  providerResult?: unknown;
  permissionsRequired: readonly McpCallPermission[];
  unsafeSideEffects: true;
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type McpCallErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_CONTEXT"
  | "MISSING_SERVER_ID"
  | "INVALID_SERVER_ID"
  | "MISSING_CALL_NAME"
  | "INVALID_CALL_NAME"
  | "INVALID_CALL_MODE"
  | "INVALID_ARGUMENTS"
  | "INVALID_TIMEOUT"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "GOVERNANCE_REJECTED"
  | "REAL_EXECUTION_BLOCKED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_REJECTED";

export type McpCallResult = McpToolResult<McpCallOutput, McpCallErrorCode>;

export const mcpCallDescriptor = {
  toolId: "mcp.call",
  title: "Call MCP Tool",
  category: "mcpBase.execution",
  purpose: "Normalize and govern a runtime-owned MCP tool invocation without creating a hidden MCP client.",
  tapOwnsApproval: true,
  runtimeOwnsMcpClient: true,
  unsafeSideEffects: true,
  requiredFields: ["target.serverId", "target.name"],
  canonicalStoragePath: "src/storagePool/baseToolStorage/mcpBase/execution/mcp.call/",
  providerBoundary: "BaseToolExecutorPort.mcp.callTool",
} as const;

type ValidationSuccess = {
  ok: true;
  target: McpCallTarget;
  context: McpCallContext;
  requiredPermissions: readonly McpCallPermission[];
};

type ValidationFailure = {
  ok: false;
  code: McpCallErrorCode;
  message: string;
  boundary: "input" | "context" | "scope" | "permission" | "governance" | "provider";
};

function isValidationFailure(value: McpCallContext | ValidationFailure): value is ValidationFailure {
  return "ok" in value && value.ok === false;
}

function trimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function hasAllPermissions(required: readonly McpCallPermission[], granted: readonly string[] | undefined): boolean {
  if (granted === undefined) return true;
  return required.every((permission) => granted.includes(permission));
}

function contextFromUnknown(value: unknown): McpCallContext | ValidationFailure {
  if (value === undefined) return {};
  if (!isJsonObject(value)) {
    return {
      ok: false,
      code: "INVALID_CONTEXT",
      message: "MCP call context must be a JSON object when provided.",
      boundary: "context",
    };
  }

  const allowedServerIds = readStringArray(value.allowedServerIds);
  const grantedPermissions = readStringArray(value.grantedPermissions) as readonly McpCallPermission[] | undefined;
  const requestedScopes = readStringArray(value.requestedScopes);
  const allowedScopes = readStringArray(value.allowedScopes);

  if (
    (value.allowedServerIds !== undefined && allowedServerIds === undefined) ||
    (value.grantedPermissions !== undefined && grantedPermissions === undefined) ||
    (value.requestedScopes !== undefined && requestedScopes === undefined) ||
    (value.allowedScopes !== undefined && allowedScopes === undefined)
  ) {
    return {
      ok: false,
      code: "INVALID_CONTEXT",
      message: "MCP call context scope and permission lists must contain strings only.",
      boundary: "context",
    };
  }

  return {
    runtimeId: trimmedString(value.runtimeId),
    sessionId: trimmedString(value.sessionId),
    invocationId: trimmedString(value.invocationId),
    dryRun: typeof value.dryRun === "boolean" ? value.dryRun : undefined,
    guard: isJsonObject(value.guard) ? value.guard : undefined,
    allowedServerIds,
    grantedPermissions,
    requestedScopes,
    allowedScopes,
    auditMetadata: isJsonObject(value.auditMetadata) ? value.auditMetadata : undefined,
  };
}

function validateMcpCall(request: unknown): ValidationSuccess | ValidationFailure {
  const root = request === undefined ? {} : request;
  if (!isJsonObject(root)) {
    return { ok: false, code: "INVALID_REQUEST", message: "MCP call request must be a JSON object.", boundary: "input" };
  }

  const rawContext = contextFromUnknown(root.context);
  if (isValidationFailure(rawContext)) return rawContext;
  const context = rawContext;

  if (!isJsonObject(root.target)) {
    return {
      ok: false,
      code: "MISSING_SERVER_ID",
      message: "MCP call target.serverId is required.",
      boundary: "input",
    };
  }

  const rawServerId = root.target.serverId;
  if (rawServerId !== undefined && typeof rawServerId !== "string") {
    return { ok: false, code: "INVALID_SERVER_ID", message: "MCP call target.serverId must be a string.", boundary: "input" };
  }
  const serverId = trimmedString(rawServerId);
  if (serverId === undefined) {
    return { ok: false, code: "MISSING_SERVER_ID", message: "MCP call target.serverId is required.", boundary: "input" };
  }

  const rawName = root.target.name ?? root.target.toolName;
  if (rawName !== undefined && typeof rawName !== "string") {
    return { ok: false, code: "INVALID_CALL_NAME", message: "MCP call target.name must be a string.", boundary: "input" };
  }
  const name = trimmedString(rawName);
  if (name === undefined) {
    return { ok: false, code: "MISSING_CALL_NAME", message: "MCP call target.name is required.", boundary: "input" };
  }

  const mode = root.target.mode === undefined ? "tool" : root.target.mode;
  if (mode !== "tool" && mode !== "service") {
    return {
      ok: false,
      code: "INVALID_CALL_MODE",
      message: "MCP call target.mode must be 'tool' or 'service'.",
      boundary: "input",
    };
  }

  const args = root.target.arguments;
  if (args !== undefined && !isJsonObject(args)) {
    return {
      ok: false,
      code: "INVALID_ARGUMENTS",
      message: "MCP call target.arguments must be a JSON object when provided.",
      boundary: "input",
    };
  }

  const timeoutMs = root.target.timeoutMs;
  if (timeoutMs !== undefined && (typeof timeoutMs !== "number" || !Number.isFinite(timeoutMs) || timeoutMs <= 0)) {
    return {
      ok: false,
      code: "INVALID_TIMEOUT",
      message: "MCP call target.timeoutMs must be a positive finite number.",
      boundary: "input",
    };
  }

  if (context.allowedServerIds !== undefined && !context.allowedServerIds.includes(serverId)) {
    return {
      ok: false,
      code: "SCOPE_REJECTED",
      message: "MCP call target.serverId is outside the allowed server scope.",
      boundary: "scope",
    };
  }

  if (
    context.requestedScopes !== undefined &&
    context.allowedScopes !== undefined &&
    context.requestedScopes.some((scope) => !context.allowedScopes?.includes(scope))
  ) {
    return {
      ok: false,
      code: "SCOPE_REJECTED",
      message: "MCP call requested scope is outside the allowed MCP scope.",
      boundary: "scope",
    };
  }

  const requiredPermissions: readonly McpCallPermission[] =
    mode === "tool" ? ["mcp:call"] : ["mcp:call", "mcp:service"];
  if (!hasAllPermissions(requiredPermissions, context.grantedPermissions)) {
    return {
      ok: false,
      code: "PERMISSION_DENIED",
      message: "MCP call requires mcp:call permission and mcp:service for service mode.",
      boundary: "permission",
    };
  }

  return {
    ok: true,
    target: {
      serverId,
      name,
      mode,
      arguments: args,
      timeoutMs,
    },
    context,
    requiredPermissions,
  };
}

function auditEvent(type: string, dryRun: boolean, context: McpCallContext): McpToolAuditEvent {
  return {
    type,
    toolId: "mcp.call",
    invocationId: context.invocationId ?? "unbound",
    dryRun,
    metadata: {
      runtimeId: context.runtimeId,
      sessionId: context.sessionId,
      ...(context.auditMetadata ?? {}),
    },
  };
}

function failure(
  error: ValidationFailure,
  context: McpCallContext = {},
  event = "basicTool.mcp.call.rejected",
): McpCallResult {
  return {
    ok: false,
    toolId: "mcp.call",
    error: {
      code: error.code,
      message: error.message,
      boundary: error.boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("mcp.call.rejected", context.dryRun !== false, context)],
    events: [event],
  };
}

function outputFor(
  target: McpCallTarget,
  context: McpCallContext,
  requiredPermissions: readonly McpCallPermission[],
  options: { dryRun: boolean; executionBlocked: boolean; providerCalled: boolean; providerResult?: unknown },
): McpCallOutput {
  return {
    kind: "agentCore.basicTool.mcp.call",
    target,
    requestEnvelope: {
      serverId: target.serverId,
      toolName: target.name,
      mode: target.mode,
      arguments: target.arguments,
      timeoutMs: target.timeoutMs,
    },
    dryRun: options.dryRun,
    executionBlocked: options.executionBlocked,
    providerCalled: options.providerCalled,
    providerResult: options.providerResult,
    permissionsRequired: requiredPermissions,
    unsafeSideEffects: true,
    auditMetadata: context.auditMetadata,
  };
}

export function planMcpCall(request: unknown = {}): McpCallResult {
  const normalized = validateMcpCall(request);
  if (!normalized.ok) return failure(normalized);

  if (normalized.context.dryRun === false) {
    return failure(
      {
        ok: false,
        code: "REAL_EXECUTION_BLOCKED",
        message: "planMcpCall only produces dry-run envelopes; use executeMcpCall with an accepted guard for real runtime dispatch.",
        boundary: "governance",
      },
      normalized.context,
    );
  }

  return {
    ok: true,
    toolId: "mcp.call",
    output: outputFor(normalized.target, normalized.context, normalized.requiredPermissions, {
      dryRun: true,
      executionBlocked: true,
      providerCalled: false,
    }),
    audit: [auditEvent("mcp.call.planned", true, normalized.context)],
    events: ["basicTool.mcp.call.dryRun"],
  };
}

export async function executeMcpCall(
  request: unknown = {},
  providerContext: McpCallProviderContext = {},
): Promise<McpCallResult> {
  const normalized = validateMcpCall(request);
  if (!normalized.ok) return failure(normalized);

  if (normalized.context.dryRun !== false) {
    return {
      ok: true,
      toolId: "mcp.call",
      output: outputFor(normalized.target, normalized.context, normalized.requiredPermissions, {
        dryRun: true,
        executionBlocked: true,
        providerCalled: false,
      }),
      audit: [auditEvent("mcp.call.planned", true, normalized.context)],
      events: ["basicTool.mcp.call.dryRun"],
    };
  }

  if (!guardAccepted(normalized.context.guard)) {
    return failure(
      {
        ok: false,
        code: "GOVERNANCE_REJECTED",
        message: "MCP call requires an accepted runtime guard before real dispatch.",
        boundary: "governance",
      },
      normalized.context,
    );
  }

  const provider = providerContext.provider;
  if (provider === undefined) {
    return failure(
      {
        ok: false,
        code: "PROVIDER_UNAVAILABLE",
        message: "Runtime MCP call provider is unavailable.",
        boundary: "provider",
      },
      normalized.context,
      "basicTool.mcp.call.providerUnavailable",
    );
  }

  try {
    const providerResult = await provider(
      {
        serverId: normalized.target.serverId,
        toolName: normalized.target.name,
        mode: normalized.target.mode,
        arguments: normalized.target.arguments,
        timeoutMs: normalized.target.timeoutMs,
      },
      {
        runtimeId: normalized.context.runtimeId,
        sessionId: normalized.context.sessionId,
        invocationId: normalized.context.invocationId,
        auditMetadata: normalized.context.auditMetadata,
      },
    );

    return {
      ok: true,
      toolId: "mcp.call",
      output: outputFor(normalized.target, normalized.context, normalized.requiredPermissions, {
        dryRun: false,
        executionBlocked: false,
        providerCalled: true,
        providerResult,
      }),
      audit: [auditEvent("mcp.call.executed", false, normalized.context)],
      events: ["basicTool.mcp.call.executed"],
    };
  } catch {
    return failure(
      {
        ok: false,
        code: "PROVIDER_REJECTED",
        message: "Runtime MCP provider failed the call.",
        boundary: "provider",
      },
      normalized.context,
      "basicTool.mcp.call.providerRejected",
    );
  }
}
