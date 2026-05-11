export type MouseScrollBoundary = "input" | "contract" | "governance" | "scope" | "provider";

export type MouseScrollGate = {
  accepted?: boolean;
  allowed?: boolean;
  reason?: string;
};

export type MouseScrollContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: MouseScrollGate;
  contract?: MouseScrollGate;
  governance?: MouseScrollGate;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type MouseScrollCoordinateSpace = "screen" | "window" | "normalized";

export type MouseScrollPoint = {
  x: number;
  y: number;
};

export type MouseScrollTarget = {
  deltaX: number;
  deltaY: number;
  unit: "pixel";
  coordinateSpace: MouseScrollCoordinateSpace;
  at?: MouseScrollPoint;
  displayId?: string;
  windowId?: string;
  durationMs: number;
};

export type MouseScrollProviderRequest = {
  operation: "computeruse.mouseScroll.pointerAction";
  target: MouseScrollTarget;
  context: {
    runtimeId?: string;
    sessionId?: string;
    invocationId?: string;
    auditMetadata?: Readonly<Record<string, unknown>>;
  };
  purpose: string;
};

export type MouseScrollProviderResult = {
  actionId: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type MouseScrollProvider = (
  request: MouseScrollProviderRequest,
) => Promise<MouseScrollProviderResult> | MouseScrollProviderResult;

export type MouseScrollRequest = {
  target?: unknown;
  context?: unknown;
  deltaX?: unknown;
  deltaY?: unknown;
  at?: unknown;
  coordinateSpace?: unknown;
  displayId?: unknown;
  windowId?: unknown;
  durationMs?: unknown;
  purpose?: unknown;
  metadata?: unknown;
  provider?: MouseScrollProvider;
};

export type MouseScrollErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_TARGET"
  | "INVALID_CONTEXT"
  | "MISSING_RUNTIME_ID"
  | "MISSING_PURPOSE"
  | "MISSING_SCROLL_DELTA"
  | "INVALID_SCROLL_DELTA"
  | "INVALID_POINT"
  | "INVALID_DURATION"
  | "INVALID_COORDINATE_SPACE"
  | "INVALID_DISPLAY_ID"
  | "INVALID_WINDOW_ID"
  | "SCOPE_DENIED"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_FAILURE";

export type MouseScrollError = {
  code: MouseScrollErrorCode;
  message: string;
  boundary: MouseScrollBoundary;
  publicSafe: true;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type MouseScrollAuditEvent = {
  type: string;
  toolId: "computeruse.mouseScroll";
  invocationId: string;
  dryRun: boolean;
  metadata: Readonly<Record<string, unknown>>;
};

export type MouseScrollOutput = {
  kind: "agentCore.basicTool.computeruse.mouseScroll";
  target: MouseScrollTarget & {
    usesCurrentCursor: boolean;
  };
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
    operation: "computeruse.mouseScroll.pointerAction";
    runtimeOwnsPointerEvents: true;
    runtimeOwnsInputPolicy: true;
    baseToolOwnsTapStrategy: false;
  };
  actionEnvelope: {
    resource: "pointer";
    action: "scroll";
    executed: boolean;
    metadataOnly: boolean;
    actionId?: string;
  };
  providerMetadata?: Readonly<Record<string, unknown>>;
};

export type MouseScrollResult =
  | {
      ok: true;
      toolId: "computeruse.mouseScroll";
      output: MouseScrollOutput;
      audit: readonly MouseScrollAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "computeruse.mouseScroll";
      error: MouseScrollError;
      audit: readonly MouseScrollAuditEvent[];
      events: readonly string[];
    };

export const mouseScrollDescriptor = {
  toolId: "computeruse.mouseScroll",
  capability: "scroll-pointer",
  route: "agent_executionEngine.basic_toolLayer.baseTools.computeruseBase.mouseEmulation",
  defaultDryRun: true,
  defaultCoordinateSpace: "screen",
  defaultDurationMs: 0,
  maxScrollDelta: 100_000,
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

function cleanGate(value: unknown): MouseScrollGate | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return undefined;
  const gate: MouseScrollGate = {};
  if (typeof value.accepted === "boolean") gate.accepted = value.accepted;
  if (typeof value.allowed === "boolean") gate.allowed = value.allowed;
  const reason = cleanString(value.reason);
  if (reason !== undefined) gate.reason = reason;
  return gate;
}

function cleanAuditMetadata(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return isRecord(value) ? value : undefined;
}

function cleanCoordinateSpace(value: unknown): MouseScrollCoordinateSpace | undefined {
  if (value === undefined) return mouseScrollDescriptor.defaultCoordinateSpace;
  return value === "screen" || value === "window" || value === "normalized" ? value : undefined;
}

function cleanDuration(value: unknown): number | undefined {
  if (value === undefined) return mouseScrollDescriptor.defaultDurationMs;
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= mouseScrollDescriptor.maxDurationMs
    ? value
    : undefined;
}

function cleanCoordinate(value: unknown): number | undefined {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= mouseScrollDescriptor.maxCoordinate
    ? Math.round(value)
    : undefined;
}

function cleanDelta(value: unknown): number | undefined {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    Math.abs(value) <= mouseScrollDescriptor.maxScrollDelta
    ? Math.round(value)
    : undefined;
}

function auditEvent(type: string, context: MouseScrollContext | undefined, metadata?: Readonly<Record<string, unknown>>): MouseScrollAuditEvent {
  return {
    type,
    toolId: mouseScrollDescriptor.toolId,
    invocationId: context?.invocationId ?? "computeruse.mouseScroll:dry-run",
    dryRun: context?.dryRun !== false,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: MouseScrollErrorCode,
  message: string,
  boundary: MouseScrollBoundary,
  context: MouseScrollContext | undefined,
): MouseScrollResult {
  return {
    ok: false,
    toolId: mouseScrollDescriptor.toolId,
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("agentCore.basicTool.computeruse.mouseScroll.rejected", context, { code })],
    events: ["basicTool.computeruse.mouseScroll.rejected"],
  };
}

function normalizeContext(value: unknown): MouseScrollContext | MouseScrollResult {
  if (value === undefined) return {};
  if (!isRecord(value)) return failure("INVALID_CONTEXT", "computeruse.mouseScroll context must be an object", "input", undefined);

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
      "computeruse.mouseScroll context contains malformed guard, governance, or scope fields",
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

function normalizePoint(value: unknown, context: MouseScrollContext): MouseScrollPoint | MouseScrollResult | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    return failure("INVALID_POINT", "computeruse.mouseScroll at must be an object when provided", "input", context);
  }
  const x = cleanCoordinate(value.x);
  const y = cleanCoordinate(value.y);
  if (x === undefined || y === undefined) {
    return failure("INVALID_POINT", "computeruse.mouseScroll at must use finite non-negative coordinates", "input", context);
  }
  return { x, y };
}

function normalizeTarget(request: Record<string, unknown>, context: MouseScrollContext): MouseScrollTarget | MouseScrollResult {
  const targetValue = request.target;
  if (targetValue !== undefined && !isRecord(targetValue)) {
    return failure("INVALID_TARGET", "computeruse.mouseScroll target must be an object when provided", "input", context);
  }
  const target = isRecord(targetValue) ? targetValue : {};

  if ((target.deltaX ?? request.deltaX) === undefined && (target.deltaY ?? request.deltaY) === undefined) {
    return failure("MISSING_SCROLL_DELTA", "computeruse.mouseScroll requires deltaX and/or deltaY", "input", context);
  }

  const deltaX = cleanDelta(target.deltaX ?? request.deltaX ?? 0);
  const deltaY = cleanDelta(target.deltaY ?? request.deltaY ?? 0);
  if (deltaX === undefined || deltaY === undefined || (deltaX === 0 && deltaY === 0)) {
    return failure(
      "INVALID_SCROLL_DELTA",
      `computeruse.mouseScroll deltaX/deltaY must be finite bounded values and not both zero`,
      "input",
      context,
    );
  }

  const at = normalizePoint(target.at ?? request.at, context);
  if (at !== undefined && "ok" in at) return at;

  const coordinateSpace = cleanCoordinateSpace(target.coordinateSpace ?? request.coordinateSpace);
  if (coordinateSpace === undefined) {
    return failure("INVALID_COORDINATE_SPACE", "computeruse.mouseScroll coordinateSpace must be screen, window, or normalized", "input", context);
  }

  const durationMs = cleanDuration(target.durationMs ?? request.durationMs);
  if (durationMs === undefined) {
    return failure(
      "INVALID_DURATION",
      `computeruse.mouseScroll durationMs must be an integer from 0 to ${mouseScrollDescriptor.maxDurationMs}`,
      "input",
      context,
    );
  }

  const displayId = cleanString(target.displayId ?? request.displayId);
  if ((target.displayId ?? request.displayId) !== undefined && displayId === undefined) {
    return failure("INVALID_DISPLAY_ID", "computeruse.mouseScroll displayId must be a safe string", "input", context);
  }

  const windowId = cleanString(target.windowId ?? request.windowId);
  if ((target.windowId ?? request.windowId) !== undefined && windowId === undefined) {
    return failure("INVALID_WINDOW_ID", "computeruse.mouseScroll windowId must be a safe string", "input", context);
  }

  return { deltaX, deltaY, unit: "pixel", coordinateSpace, at, displayId, windowId, durationMs };
}

function ensureScopes(context: MouseScrollContext): MouseScrollResult | undefined {
  const requested = context.requestedScopes ?? [];
  const allowed = context.allowedScopes ?? [];
  if (requested.length === 0) return undefined;

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length === 0) return undefined;

  return failure(
    "SCOPE_DENIED",
    `computeruse.mouseScroll scope ${denied[0]} is outside runtime governance`,
    "scope",
    context,
  );
}

function ensureStaticGates(context: MouseScrollContext): MouseScrollResult | undefined {
  if (context.contract?.accepted === false || context.contract?.allowed === false) {
    return failure(
      "CONTRACT_REJECTED",
      context.contract.reason ?? "computeruse.mouseScroll was rejected by runtime contract surface",
      "contract",
      context,
    );
  }

  if (context.governance?.accepted === false || context.governance?.allowed === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      context.governance.reason ?? "computeruse.mouseScroll was rejected by runtime governance",
      "governance",
      context,
    );
  }

  return undefined;
}

function ensureRealExecutionGuard(context: MouseScrollContext): MouseScrollResult | undefined {
  if (context.dryRun !== false) return undefined;
  if (context.guard?.accepted === true || context.guard?.allowed === true) return undefined;

  return failure(
    "GOVERNANCE_REJECTED",
    context.guard?.reason ?? "computeruse.mouseScroll dryRun:false requires an affirmative runtime guard",
    "governance",
    context,
  );
}

function baseOutput(
  target: MouseScrollTarget,
  purpose: string,
  acceptedScopes: readonly string[],
  dryRun: boolean,
  providerCalled: boolean,
): Omit<MouseScrollOutput, "actionEnvelope"> {
  return {
    kind: "agentCore.basicTool.computeruse.mouseScroll",
    target: {
      ...target,
      usesCurrentCursor: target.at === undefined,
    },
    purpose,
    dispatch: dryRun ? "dry-run" : "runtime-computeruse",
    dryRun,
    providerCalled,
    executionBlocked: dryRun,
    unsafeSideEffects: true,
    permissionsRequired: mouseScrollDescriptor.permissionsRequired,
    requiresTapApproval: true,
    acceptedScopes,
    runtimeEntry: {
      port: "BaseToolExecutorPort.computeruse.pointerAction",
      operation: "computeruse.mouseScroll.pointerAction",
      runtimeOwnsPointerEvents: true,
      runtimeOwnsInputPolicy: true,
      baseToolOwnsTapStrategy: false,
    },
  };
}

function normalizeProviderResult(value: unknown, context: MouseScrollContext): MouseScrollProviderResult | MouseScrollResult {
  if (!isRecord(value) || cleanString(value.actionId) === undefined) {
    return failure(
      "PROVIDER_FAILURE",
      "computeruse.mouseScroll runtime provider returned a malformed public-safe action envelope",
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
  target: MouseScrollTarget;
  context: MouseScrollContext;
  purpose: string;
  metadata?: Readonly<Record<string, unknown>>;
  provider?: MouseScrollProvider;
} | MouseScrollResult {
  if (request === undefined) request = {};
  if (!isRecord(request)) return failure("INVALID_REQUEST", "computeruse.mouseScroll request must be an object", "input", undefined);

  const context = normalizeContext(request.context);
  if ("ok" in context) return context;

  const target = normalizeTarget(request, context);
  if ("ok" in target) return target;

  const purpose = cleanString(request.purpose);
  if (purpose === undefined) {
    return failure("MISSING_PURPOSE", "computeruse.mouseScroll requires an explicit purpose", "input", context);
  }

  if (context.runtimeId === undefined) {
    return failure("MISSING_RUNTIME_ID", "computeruse.mouseScroll requires context.runtimeId for audit", "input", context);
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
    provider: typeof request.provider === "function" ? (request.provider as MouseScrollProvider) : undefined,
  };
}

export async function executeMouseScroll(request: unknown = {}): Promise<MouseScrollResult> {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) return normalized;

  const { target, context, purpose, metadata, provider } = normalized;
  const acceptedScopes = context.requestedScopes ?? [];
  const dryRun = context.dryRun !== false;

  if (dryRun) {
    return {
      ok: true,
      toolId: mouseScrollDescriptor.toolId,
      output: {
        ...baseOutput(target, purpose, acceptedScopes, true, false),
        actionEnvelope: {
          resource: "pointer",
          action: "scroll",
          executed: false,
          metadataOnly: true,
        },
      },
      audit: [auditEvent("agentCore.basicTool.computeruse.mouseScroll.dryRun", context, metadata)],
      events: ["basicTool.computeruse.mouseScroll.dryRun"],
    };
  }

  if (provider === undefined) {
    return failure(
      "PROVIDER_UNAVAILABLE",
      "computeruse.mouseScroll requires runtime executor.computeruse.pointerAction for dryRun:false",
      "provider",
      context,
    );
  }

  let providerResult: MouseScrollProviderResult;
  try {
    const result = await provider({
      operation: "computeruse.mouseScroll.pointerAction",
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
        ? "computeruse.mouseScroll runtime provider failed without exposing private details"
        : `computeruse.mouseScroll runtime provider failed: ${providerMessage}`,
      "provider",
      context,
    );
  }

  return {
    ok: true,
    toolId: mouseScrollDescriptor.toolId,
    output: {
      ...baseOutput(target, purpose, acceptedScopes, false, true),
      actionEnvelope: {
        resource: "pointer",
        action: "scroll",
        executed: true,
        metadataOnly: false,
        actionId: providerResult.actionId,
      },
      providerMetadata: providerResult.metadata,
    },
    audit: [
      auditEvent("agentCore.basicTool.computeruse.mouseScroll.scrolled", context, {
        actionId: providerResult.actionId,
        ...(providerResult.metadata ?? {}),
      }),
    ],
    events: ["basicTool.computeruse.mouseScroll.scrolled"],
  };
}

export function planMouseScroll(request: unknown = {}): Promise<MouseScrollResult> {
  return executeMouseScroll(request);
}
