export type MouseMoveBoundary = "input" | "contract" | "governance" | "scope" | "provider";

export type MouseMoveGate = {
  accepted?: boolean;
  allowed?: boolean;
  reason?: string;
};

export type MouseMoveContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: MouseMoveGate;
  contract?: MouseMoveGate;
  governance?: MouseMoveGate;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type MouseMoveCoordinateSpace = "screen" | "window" | "normalized";

export type MouseMovePoint = {
  x: number;
  y: number;
};

export type MouseMoveTarget = MouseMovePoint & {
  coordinateSpace: MouseMoveCoordinateSpace;
  displayId?: string;
  windowId?: string;
  durationMs: number;
};

export type MouseMoveProviderRequest = {
  operation: "computeruse.mouseMove.pointerAction";
  target: MouseMoveTarget;
  context: {
    runtimeId?: string;
    sessionId?: string;
    invocationId?: string;
    auditMetadata?: Readonly<Record<string, unknown>>;
  };
  purpose: string;
};

export type MouseMoveProviderResult = {
  actionId: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type MouseMoveProvider = (
  request: MouseMoveProviderRequest,
) => Promise<MouseMoveProviderResult> | MouseMoveProviderResult;

export type MouseMoveRequest = {
  target?: unknown;
  context?: unknown;
  x?: unknown;
  y?: unknown;
  coordinateSpace?: unknown;
  displayId?: unknown;
  windowId?: unknown;
  durationMs?: unknown;
  purpose?: unknown;
  metadata?: unknown;
  provider?: MouseMoveProvider;
};

export type MouseMoveErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_TARGET"
  | "INVALID_CONTEXT"
  | "MISSING_RUNTIME_ID"
  | "MISSING_PURPOSE"
  | "MISSING_TARGET"
  | "INVALID_DURATION"
  | "INVALID_COORDINATE_SPACE"
  | "INVALID_DISPLAY_ID"
  | "INVALID_WINDOW_ID"
  | "SCOPE_DENIED"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_FAILURE";

export type MouseMoveError = {
  code: MouseMoveErrorCode;
  message: string;
  boundary: MouseMoveBoundary;
  publicSafe: true;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type MouseMoveAuditEvent = {
  type: string;
  toolId: "computeruse.mouseMove";
  invocationId: string;
  dryRun: boolean;
  metadata: Readonly<Record<string, unknown>>;
};

export type MouseMoveOutput = {
  kind: "agentCore.basicTool.computeruse.mouseMove";
  target: MouseMoveTarget;
  purpose: string;
  dispatch: "dry-run" | "runtime-computeruse";
  dryRun: boolean;
  providerCalled: boolean;
  executionBlocked: boolean;
  unsafeSideEffects: true;
  permissionsRequired: readonly ["pointer:write", "ui:action"];
  requiresTapApproval: true;
  acceptedScopes: readonly string[];
  runtimeEntry: {
    port: "BaseToolExecutorPort.computeruse.pointerAction";
    operation: "computeruse.mouseMove.pointerAction";
    runtimeOwnsPointerEvents: true;
    runtimeOwnsInputPolicy: true;
    baseToolOwnsTapStrategy: false;
  };
  actionEnvelope: {
    resource: "pointer";
    action: "move";
    executed: boolean;
    metadataOnly: boolean;
    actionId?: string;
  };
  providerMetadata?: Readonly<Record<string, unknown>>;
};

export type MouseMoveResult =
  | {
      ok: true;
      toolId: "computeruse.mouseMove";
      output: MouseMoveOutput;
      audit: readonly MouseMoveAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "computeruse.mouseMove";
      error: MouseMoveError;
      audit: readonly MouseMoveAuditEvent[];
      events: readonly string[];
    };

export const mouseMoveDescriptor = {
  toolId: "computeruse.mouseMove",
  capability: "move-pointer",
  route: "agent_executionEngine.basic_toolLayer.baseTools.computeruseBase.mouseEmulation",
  defaultDryRun: true,
  defaultCoordinateSpace: "screen",
  defaultDurationMs: 0,
  maxCoordinate: 100_000,
  maxDurationMs: 10_000,
  tapOwnsApproval: true,
  runtimeEntry: "BaseToolExecutorPort.computeruse.pointerAction",
  permissionsRequired: ["pointer:write", "ui:action"],
  unsafeSideEffects: true,
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 && !value.includes("\0") ? value.trim() : undefined;
}

function cleanStringList(value: unknown): readonly string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return undefined;
  const cleaned: string[] = [];
  for (const item of value) {
    const text = cleanString(item);
    if (text === undefined) return undefined;
    if (!cleaned.includes(text)) cleaned.push(text);
  }
  return cleaned;
}

function cleanGate(value: unknown): MouseMoveGate | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return undefined;
  const gate: MouseMoveGate = {};
  if (typeof value.accepted === "boolean") gate.accepted = value.accepted;
  if (typeof value.allowed === "boolean") gate.allowed = value.allowed;
  const reason = cleanString(value.reason);
  if (reason !== undefined) gate.reason = reason;
  return gate;
}

function cleanAuditMetadata(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return isRecord(value) ? value : undefined;
}

function cleanCoordinateSpace(value: unknown): MouseMoveCoordinateSpace | undefined {
  if (value === undefined) return mouseMoveDescriptor.defaultCoordinateSpace;
  return value === "screen" || value === "window" || value === "normalized" ? value : undefined;
}

function cleanDuration(value: unknown): number | undefined {
  if (value === undefined) return mouseMoveDescriptor.defaultDurationMs;
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= mouseMoveDescriptor.maxDurationMs
    ? value
    : undefined;
}

function cleanCoordinate(value: unknown): number | undefined {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= mouseMoveDescriptor.maxCoordinate
    ? Math.round(value)
    : undefined;
}

function auditEvent(type: string, context: MouseMoveContext | undefined, metadata?: Readonly<Record<string, unknown>>): MouseMoveAuditEvent {
  return {
    type,
    toolId: mouseMoveDescriptor.toolId,
    invocationId: context?.invocationId ?? "computeruse.mouseMove:dry-run",
    dryRun: context?.dryRun !== false,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: MouseMoveErrorCode,
  message: string,
  boundary: MouseMoveBoundary,
  context: MouseMoveContext | undefined,
): MouseMoveResult {
  return {
    ok: false,
    toolId: mouseMoveDescriptor.toolId,
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("agentCore.basicTool.computeruse.mouseMove.rejected", context, { code })],
    events: ["basicTool.computeruse.mouseMove.rejected"],
  };
}

function normalizeContext(value: unknown): MouseMoveContext | MouseMoveResult {
  if (value === undefined) return {};
  if (!isRecord(value)) return failure("INVALID_CONTEXT", "computeruse.mouseMove context must be an object", "input", undefined);

  const requestedScopes = cleanStringList(value.requestedScopes);
  const allowedScopes = cleanStringList(value.allowedScopes);
  const guard = cleanGate(value.guard);
  const contract = cleanGate(value.contract);
  const governance = cleanGate(value.governance);
  if (
    (value.requestedScopes !== undefined && requestedScopes === undefined) ||
    (value.allowedScopes !== undefined && allowedScopes === undefined) ||
    (value.guard !== undefined && guard === undefined) ||
    (value.contract !== undefined && contract === undefined) ||
    (value.governance !== undefined && governance === undefined) ||
    (value.dryRun !== undefined && typeof value.dryRun !== "boolean")
  ) {
    return failure(
      "INVALID_CONTEXT",
      "computeruse.mouseMove context contains malformed guard, governance, or scope fields",
      "input",
      undefined,
    );
  }

  return {
    runtimeId: cleanString(value.runtimeId),
    sessionId: cleanString(value.sessionId),
    invocationId: cleanString(value.invocationId),
    dryRun: typeof value.dryRun === "boolean" ? value.dryRun : undefined,
    guard,
    contract,
    governance,
    requestedScopes,
    allowedScopes,
    auditMetadata: cleanAuditMetadata(value.auditMetadata),
  };
}

function normalizeTarget(request: Record<string, unknown>, context: MouseMoveContext): MouseMoveTarget | MouseMoveResult {
  const targetValue = request.target;
  if (targetValue !== undefined && !isRecord(targetValue)) {
    return failure("INVALID_TARGET", "computeruse.mouseMove target must be an object when provided", "input", context);
  }
  const target = isRecord(targetValue) ? targetValue : {};

  const x = cleanCoordinate(target.x ?? request.x);
  const y = cleanCoordinate(target.y ?? request.y);
  if ((target.x ?? request.x) === undefined || (target.y ?? request.y) === undefined) {
    return failure("MISSING_TARGET", "computeruse.mouseMove requires target.x and target.y", "input", context);
  }
  if (x === undefined || y === undefined) {
    return failure("INVALID_TARGET", "computeruse.mouseMove target must use finite non-negative coordinates", "input", context);
  }

  const coordinateSpace = cleanCoordinateSpace(target.coordinateSpace ?? request.coordinateSpace);
  if (coordinateSpace === undefined) {
    return failure("INVALID_COORDINATE_SPACE", "computeruse.mouseMove coordinateSpace must be screen, window, or normalized", "input", context);
  }

  const durationMs = cleanDuration(target.durationMs ?? request.durationMs);
  if (durationMs === undefined) {
    return failure(
      "INVALID_DURATION",
      `computeruse.mouseMove durationMs must be an integer from 0 to ${mouseMoveDescriptor.maxDurationMs}`,
      "input",
      context,
    );
  }

  const displayId = cleanString(target.displayId ?? request.displayId);
  if ((target.displayId ?? request.displayId) !== undefined && displayId === undefined) {
    return failure("INVALID_DISPLAY_ID", "computeruse.mouseMove displayId must be a safe string", "input", context);
  }

  const windowId = cleanString(target.windowId ?? request.windowId);
  if ((target.windowId ?? request.windowId) !== undefined && windowId === undefined) {
    return failure("INVALID_WINDOW_ID", "computeruse.mouseMove windowId must be a safe string", "input", context);
  }

  return { x, y, coordinateSpace, displayId, windowId, durationMs };
}

function ensureScopes(context: MouseMoveContext): MouseMoveResult | undefined {
  const requested = context.requestedScopes ?? [];
  const allowed = context.allowedScopes ?? [];
  if (requested.length === 0) return undefined;

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length === 0) return undefined;

  return failure(
    "SCOPE_DENIED",
    `computeruse.mouseMove scope ${denied[0]} is outside runtime governance`,
    "scope",
    context,
  );
}

function ensureStaticGates(context: MouseMoveContext): MouseMoveResult | undefined {
  if (context.contract?.accepted === false || context.contract?.allowed === false) {
    return failure(
      "CONTRACT_REJECTED",
      context.contract.reason ?? "computeruse.mouseMove was rejected by runtime contract surface",
      "contract",
      context,
    );
  }

  if (context.governance?.accepted === false || context.governance?.allowed === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      context.governance.reason ?? "computeruse.mouseMove was rejected by runtime governance",
      "governance",
      context,
    );
  }

  return undefined;
}

function ensureRealExecutionGuard(context: MouseMoveContext): MouseMoveResult | undefined {
  if (context.dryRun !== false) return undefined;
  if (context.guard?.accepted === true || context.guard?.allowed === true) return undefined;

  return failure(
    "GOVERNANCE_REJECTED",
    context.guard?.reason ?? "computeruse.mouseMove dryRun:false requires an affirmative runtime guard",
    "governance",
    context,
  );
}

function baseOutput(
  target: MouseMoveTarget,
  purpose: string,
  acceptedScopes: readonly string[],
  dryRun: boolean,
  providerCalled: boolean,
): Omit<MouseMoveOutput, "actionEnvelope"> {
  return {
    kind: "agentCore.basicTool.computeruse.mouseMove",
    target,
    purpose,
    dispatch: dryRun ? "dry-run" : "runtime-computeruse",
    dryRun,
    providerCalled,
    executionBlocked: dryRun,
    unsafeSideEffects: true,
    permissionsRequired: mouseMoveDescriptor.permissionsRequired,
    requiresTapApproval: true,
    acceptedScopes,
    runtimeEntry: {
      port: "BaseToolExecutorPort.computeruse.pointerAction",
      operation: "computeruse.mouseMove.pointerAction",
      runtimeOwnsPointerEvents: true,
      runtimeOwnsInputPolicy: true,
      baseToolOwnsTapStrategy: false,
    },
  };
}

function normalizeProviderResult(value: unknown, context: MouseMoveContext): MouseMoveProviderResult | MouseMoveResult {
  if (!isRecord(value) || cleanString(value.actionId) === undefined) {
    return failure(
      "PROVIDER_FAILURE",
      "computeruse.mouseMove runtime provider returned a malformed public-safe action envelope",
      "provider",
      context,
    );
  }

  return {
    actionId: cleanString(value.actionId) ?? "",
    metadata: cleanAuditMetadata(value.metadata),
  };
}

const publicSafeProviderFailurePrefix = "PUBLIC_SAFE_PROVIDER_FAILURE:";

function publicSafeProviderFailureMessage(error: unknown): string | undefined {
  const message = error instanceof Error && error.message.trim().length > 0 ? error.message.trim() : undefined;
  if (message === undefined || !message.startsWith(publicSafeProviderFailurePrefix)) return undefined;
  const publicSafeMessage = message.slice(publicSafeProviderFailurePrefix.length).trim();
  return publicSafeMessage.length > 0 ? publicSafeMessage : undefined;
}

function normalizeRequest(request: unknown): {
  target: MouseMoveTarget;
  context: MouseMoveContext;
  purpose: string;
  metadata?: Readonly<Record<string, unknown>>;
  provider?: MouseMoveProvider;
} | MouseMoveResult {
  if (request === undefined) request = {};
  if (!isRecord(request)) return failure("INVALID_REQUEST", "computeruse.mouseMove request must be an object", "input", undefined);

  const context = normalizeContext(request.context);
  if ("ok" in context) return context;

  const target = normalizeTarget(request, context);
  if ("ok" in target) return target;

  const purpose = cleanString(request.purpose);
  if (purpose === undefined) {
    return failure("MISSING_PURPOSE", "computeruse.mouseMove requires an explicit purpose", "input", context);
  }

  if (context.runtimeId === undefined) {
    return failure("MISSING_RUNTIME_ID", "computeruse.mouseMove requires context.runtimeId for audit", "input", context);
  }

  const scopes = ensureScopes(context);
  if (scopes !== undefined) return scopes;

  const staticGates = ensureStaticGates(context);
  if (staticGates !== undefined) return staticGates;

  const realGuard = ensureRealExecutionGuard(context);
  if (realGuard !== undefined) return realGuard;

  return {
    target,
    context,
    purpose,
    metadata: cleanAuditMetadata(request.metadata),
    provider: typeof request.provider === "function" ? (request.provider as MouseMoveProvider) : undefined,
  };
}

export async function executeMouseMove(request: unknown = {}): Promise<MouseMoveResult> {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) return normalized;

  const { target, context, purpose, metadata, provider } = normalized;
  const acceptedScopes = context.requestedScopes ?? [];
  const dryRun = context.dryRun !== false;

  if (dryRun) {
    return {
      ok: true,
      toolId: mouseMoveDescriptor.toolId,
      output: {
        ...baseOutput(target, purpose, acceptedScopes, true, false),
        actionEnvelope: {
          resource: "pointer",
          action: "move",
          executed: false,
          metadataOnly: true,
        },
      },
      audit: [auditEvent("agentCore.basicTool.computeruse.mouseMove.dryRun", context, metadata)],
      events: ["basicTool.computeruse.mouseMove.dryRun"],
    };
  }

  if (provider === undefined) {
    return failure(
      "PROVIDER_UNAVAILABLE",
      "computeruse.mouseMove requires runtime executor.computeruse.pointerAction for dryRun:false",
      "provider",
      context,
    );
  }

  let providerResult: MouseMoveProviderResult;
  try {
    const result = await provider({
      operation: "computeruse.mouseMove.pointerAction",
      target,
      purpose,
      context: {
        runtimeId: context.runtimeId,
        sessionId: context.sessionId,
        invocationId: context.invocationId,
        auditMetadata: {
          ...(context.auditMetadata ?? {}),
          ...(metadata ?? {}),
        },
      },
    });
    const normalizedResult = normalizeProviderResult(result, context);
    if ("ok" in normalizedResult) return normalizedResult;
    providerResult = normalizedResult;
  } catch (error) {
    const providerMessage = publicSafeProviderFailureMessage(error);
    return failure(
      "PROVIDER_FAILURE",
      providerMessage === undefined
        ? "computeruse.mouseMove runtime provider failed without exposing private details"
        : `computeruse.mouseMove runtime provider failed: ${providerMessage}`,
      "provider",
      context,
    );
  }

  return {
    ok: true,
    toolId: mouseMoveDescriptor.toolId,
    output: {
      ...baseOutput(target, purpose, acceptedScopes, false, true),
      actionEnvelope: {
        resource: "pointer",
        action: "move",
        executed: true,
        metadataOnly: false,
        actionId: providerResult.actionId,
      },
      providerMetadata: providerResult.metadata,
    },
    audit: [
      auditEvent("agentCore.basicTool.computeruse.mouseMove.moved", context, {
        actionId: providerResult.actionId,
        ...(providerResult.metadata ?? {}),
      }),
    ],
    events: ["basicTool.computeruse.mouseMove.moved"],
  };
}

export function planMouseMove(request: unknown = {}): Promise<MouseMoveResult> {
  return executeMouseMove(request);
}
