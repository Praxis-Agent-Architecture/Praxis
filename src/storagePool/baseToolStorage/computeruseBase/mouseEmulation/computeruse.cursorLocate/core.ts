export type CursorLocateBoundary = "input" | "contract" | "governance" | "scope" | "provider";

export type CursorLocateGate = {
  accepted?: boolean;
  allowed?: boolean;
  reason?: string;
};

export type CursorLocateContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: CursorLocateGate;
  contract?: CursorLocateGate;
  governance?: CursorLocateGate;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type CursorLocateCoordinateSpace = "screen" | "window" | "normalized";

export type CursorLocateTarget = {
  coordinateSpace: CursorLocateCoordinateSpace;
  displayId?: string;
};

export type CursorPosition = {
  x: number;
  y: number;
  coordinateSpace: CursorLocateCoordinateSpace;
  displayId?: string;
};

export type CursorLocateProviderRequest = {
  operation: "computeruse.cursorLocate.locateCursor";
  target: CursorLocateTarget;
  context: {
    runtimeId?: string;
    sessionId?: string;
    invocationId?: string;
    auditMetadata?: Readonly<Record<string, unknown>>;
  };
  purpose: string;
};

export type CursorLocateProviderResult = {
  position: CursorPosition;
  capturedAt?: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type CursorLocateProvider = (
  request: CursorLocateProviderRequest,
) => Promise<CursorLocateProviderResult> | CursorLocateProviderResult;

export type CursorLocateRequest = {
  target?: unknown;
  context?: unknown;
  coordinateSpace?: unknown;
  displayId?: unknown;
  purpose?: unknown;
  metadata?: unknown;
  provider?: CursorLocateProvider;
};

export type CursorLocateErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_TARGET"
  | "INVALID_CONTEXT"
  | "MISSING_RUNTIME_ID"
  | "MISSING_PURPOSE"
  | "INVALID_COORDINATE_SPACE"
  | "INVALID_DISPLAY_ID"
  | "SCOPE_DENIED"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_FAILURE"
  | "INVALID_CURSOR_POSITION";

export type CursorLocateError = {
  code: CursorLocateErrorCode;
  message: string;
  boundary: CursorLocateBoundary;
  publicSafe: true;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type CursorLocateAuditEvent = {
  type: string;
  toolId: "computeruse.cursorLocate";
  invocationId: string;
  dryRun: boolean;
  metadata: Readonly<Record<string, unknown>>;
};

export type CursorLocateOutput = {
  kind: "agentCore.basicTool.computeruse.cursorLocate";
  target: CursorLocateTarget;
  purpose: string;
  dispatch: "dry-run" | "runtime-computeruse";
  dryRun: boolean;
  providerCalled: boolean;
  executionBlocked: boolean;
  unsafeSideEffects: false;
  permissionsRequired: readonly ["pointer:read", "ui:observe"];
  requiresTapApproval: true;
  acceptedScopes: readonly string[];
  runtimeEntry: {
    port: "BaseToolExecutorPort.computeruse.locateCursor";
    operation: "computeruse.cursorLocate.locateCursor";
    runtimeOwnsCursorRead: true;
    runtimeOwnsInputPolicy: true;
    baseToolOwnsTapStrategy: false;
  };
  observationEnvelope: {
    resource: "pointer";
    action: "locate";
    observed: boolean;
    metadataOnly: boolean;
    capturedAt?: string;
  };
  position?: CursorPosition;
  providerMetadata?: Readonly<Record<string, unknown>>;
};

export type CursorLocateResult =
  | {
      ok: true;
      toolId: "computeruse.cursorLocate";
      output: CursorLocateOutput;
      audit: readonly CursorLocateAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "computeruse.cursorLocate";
      error: CursorLocateError;
      audit: readonly CursorLocateAuditEvent[];
      events: readonly string[];
    };

export const cursorLocateDescriptor = {
  toolId: "computeruse.cursorLocate",
  capability: "locate-cursor",
  route: "agent_executionEngine.basic_toolLayer.baseTools.computeruseBase.mouseEmulation",
  defaultDryRun: true,
  defaultCoordinateSpace: "screen",
  maxCoordinate: 100_000,
  tapOwnsApproval: true,
  runtimeEntry: "BaseToolExecutorPort.computeruse.locateCursor",
  permissionsRequired: ["pointer:read", "ui:observe"],
  unsafeSideEffects: false,
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

function cleanGate(value: unknown): CursorLocateGate | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return undefined;
  const gate: CursorLocateGate = {};
  if (typeof value.accepted === "boolean") gate.accepted = value.accepted;
  if (typeof value.allowed === "boolean") gate.allowed = value.allowed;
  const reason = cleanString(value.reason);
  if (reason !== undefined) gate.reason = reason;
  return gate;
}

function cleanAuditMetadata(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return isRecord(value) ? value : undefined;
}

function cleanCoordinateSpace(value: unknown): CursorLocateCoordinateSpace | undefined {
  if (value === undefined) return cursorLocateDescriptor.defaultCoordinateSpace;
  return value === "screen" || value === "window" || value === "normalized" ? value : undefined;
}

function cleanCoordinate(value: unknown): number | undefined {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= cursorLocateDescriptor.maxCoordinate
    ? Math.round(value)
    : undefined;
}

function auditEvent(type: string, context: CursorLocateContext | undefined, metadata?: Readonly<Record<string, unknown>>): CursorLocateAuditEvent {
  return {
    type,
    toolId: cursorLocateDescriptor.toolId,
    invocationId: context?.invocationId ?? "computeruse.cursorLocate:dry-run",
    dryRun: context?.dryRun !== false,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: CursorLocateErrorCode,
  message: string,
  boundary: CursorLocateBoundary,
  context: CursorLocateContext | undefined,
): CursorLocateResult {
  return {
    ok: false,
    toolId: cursorLocateDescriptor.toolId,
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("agentCore.basicTool.computeruse.cursorLocate.rejected", context, { code })],
    events: ["basicTool.computeruse.cursorLocate.rejected"],
  };
}

function normalizeContext(value: unknown): CursorLocateContext | CursorLocateResult {
  if (value === undefined) return {};
  if (!isRecord(value)) return failure("INVALID_CONTEXT", "computeruse.cursorLocate context must be an object", "input", undefined);

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
      "computeruse.cursorLocate context contains malformed guard, governance, or scope fields",
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

function normalizeTarget(request: Record<string, unknown>, context: CursorLocateContext): CursorLocateTarget | CursorLocateResult {
  const targetValue = request.target;
  if (targetValue !== undefined && !isRecord(targetValue)) {
    return failure("INVALID_TARGET", "computeruse.cursorLocate target must be an object when provided", "input", context);
  }
  const target = isRecord(targetValue) ? targetValue : {};

  const coordinateSpace = cleanCoordinateSpace(target.coordinateSpace ?? request.coordinateSpace);
  if (coordinateSpace === undefined) {
    return failure("INVALID_COORDINATE_SPACE", "computeruse.cursorLocate coordinateSpace must be screen, window, or normalized", "input", context);
  }

  const displayId = cleanString(target.displayId ?? request.displayId);
  if ((target.displayId ?? request.displayId) !== undefined && displayId === undefined) {
    return failure("INVALID_DISPLAY_ID", "computeruse.cursorLocate displayId must be a safe string", "input", context);
  }

  return { coordinateSpace, displayId };
}

function ensureScopes(context: CursorLocateContext): CursorLocateResult | undefined {
  const requested = context.requestedScopes ?? [];
  const allowed = context.allowedScopes ?? [];
  if (requested.length === 0) return undefined;

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length === 0) return undefined;

  return failure(
    "SCOPE_DENIED",
    `computeruse.cursorLocate scope ${denied[0]} is outside runtime governance`,
    "scope",
    context,
  );
}

function ensureStaticGates(context: CursorLocateContext): CursorLocateResult | undefined {
  if (context.contract?.accepted === false || context.contract?.allowed === false) {
    return failure(
      "CONTRACT_REJECTED",
      context.contract.reason ?? "computeruse.cursorLocate was rejected by runtime contract surface",
      "contract",
      context,
    );
  }

  if (context.governance?.accepted === false || context.governance?.allowed === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      context.governance.reason ?? "computeruse.cursorLocate was rejected by runtime governance",
      "governance",
      context,
    );
  }

  return undefined;
}

function ensureRealExecutionGuard(context: CursorLocateContext): CursorLocateResult | undefined {
  if (context.dryRun !== false) return undefined;
  if (context.guard?.accepted === true || context.guard?.allowed === true) return undefined;

  return failure(
    "GOVERNANCE_REJECTED",
    context.guard?.reason ?? "computeruse.cursorLocate dryRun:false requires an affirmative runtime guard",
    "governance",
    context,
  );
}

function baseOutput(
  target: CursorLocateTarget,
  purpose: string,
  acceptedScopes: readonly string[],
  dryRun: boolean,
  providerCalled: boolean,
): Omit<CursorLocateOutput, "observationEnvelope"> {
  return {
    kind: "agentCore.basicTool.computeruse.cursorLocate",
    target,
    purpose,
    dispatch: dryRun ? "dry-run" : "runtime-computeruse",
    dryRun,
    providerCalled,
    executionBlocked: dryRun,
    unsafeSideEffects: false,
    permissionsRequired: cursorLocateDescriptor.permissionsRequired,
    requiresTapApproval: true,
    acceptedScopes,
    runtimeEntry: {
      port: "BaseToolExecutorPort.computeruse.locateCursor",
      operation: "computeruse.cursorLocate.locateCursor",
      runtimeOwnsCursorRead: true,
      runtimeOwnsInputPolicy: true,
      baseToolOwnsTapStrategy: false,
    },
  };
}

function normalizeProviderResult(value: unknown, context: CursorLocateContext): CursorLocateProviderResult | CursorLocateResult {
  if (!isRecord(value) || !isRecord(value.position)) {
    return failure(
      "PROVIDER_FAILURE",
      "computeruse.cursorLocate runtime provider returned a malformed public-safe cursor envelope",
      "provider",
      context,
    );
  }

  const coordinateSpace = cleanCoordinateSpace(value.position.coordinateSpace);
  const x = cleanCoordinate(value.position.x);
  const y = cleanCoordinate(value.position.y);
  if (coordinateSpace === undefined || x === undefined || y === undefined) {
    return failure(
      "INVALID_CURSOR_POSITION",
      "computeruse.cursorLocate runtime provider returned an invalid cursor position",
      "provider",
      context,
    );
  }

  const displayId = cleanString(value.position.displayId);
  if (value.position.displayId !== undefined && displayId === undefined) {
    return failure(
      "INVALID_CURSOR_POSITION",
      "computeruse.cursorLocate runtime provider returned an invalid display id",
      "provider",
      context,
    );
  }

  const capturedAt = cleanString(value.capturedAt);
  if (value.capturedAt !== undefined && capturedAt === undefined) {
    return failure(
      "PROVIDER_FAILURE",
      "computeruse.cursorLocate runtime provider returned a malformed capture timestamp",
      "provider",
      context,
    );
  }

  return {
    position: { x, y, coordinateSpace, displayId },
    capturedAt,
    metadata: cleanAuditMetadata(value.metadata),
  };
}

function normalizeRequest(request: unknown): {
  target: CursorLocateTarget;
  context: CursorLocateContext;
  purpose: string;
  metadata?: Readonly<Record<string, unknown>>;
  provider?: CursorLocateProvider;
} | CursorLocateResult {
  if (request === undefined) request = {};
  if (!isRecord(request)) return failure("INVALID_REQUEST", "computeruse.cursorLocate request must be an object", "input", undefined);

  const context = normalizeContext(request.context);
  if ("ok" in context) return context;

  const target = normalizeTarget(request, context);
  if ("ok" in target) return target;

  const purpose = cleanString(request.purpose);
  if (purpose === undefined) {
    return failure("MISSING_PURPOSE", "computeruse.cursorLocate requires an explicit purpose", "input", context);
  }

  if (context.runtimeId === undefined) {
    return failure("MISSING_RUNTIME_ID", "computeruse.cursorLocate requires context.runtimeId for audit", "input", context);
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
    provider: typeof request.provider === "function" ? (request.provider as CursorLocateProvider) : undefined,
  };
}

export async function executeCursorLocate(request: unknown = {}): Promise<CursorLocateResult> {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) return normalized;

  const { target, context, purpose, metadata, provider } = normalized;
  const acceptedScopes = context.requestedScopes ?? [];
  const dryRun = context.dryRun !== false;

  if (dryRun) {
    return {
      ok: true,
      toolId: cursorLocateDescriptor.toolId,
      output: {
        ...baseOutput(target, purpose, acceptedScopes, true, false),
        observationEnvelope: {
          resource: "pointer",
          action: "locate",
          observed: false,
          metadataOnly: true,
        },
      },
      audit: [auditEvent("agentCore.basicTool.computeruse.cursorLocate.dryRun", context, metadata)],
      events: ["basicTool.computeruse.cursorLocate.dryRun"],
    };
  }

  if (provider === undefined) {
    return failure(
      "PROVIDER_UNAVAILABLE",
      "computeruse.cursorLocate requires runtime executor.computeruse.locateCursor for dryRun:false",
      "provider",
      context,
    );
  }

  let providerResult: CursorLocateProviderResult;
  try {
    const result = await provider({
      operation: "computeruse.cursorLocate.locateCursor",
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
  } catch {
    return failure(
      "PROVIDER_FAILURE",
      "computeruse.cursorLocate runtime provider failed without exposing private details",
      "provider",
      context,
    );
  }

  return {
    ok: true,
    toolId: cursorLocateDescriptor.toolId,
    output: {
      ...baseOutput(target, purpose, acceptedScopes, false, true),
      observationEnvelope: {
        resource: "pointer",
        action: "locate",
        observed: true,
        metadataOnly: false,
        capturedAt: providerResult.capturedAt,
      },
      position: providerResult.position,
      providerMetadata: providerResult.metadata,
    },
    audit: [
      auditEvent("agentCore.basicTool.computeruse.cursorLocate.located", context, {
        capturedAt: providerResult.capturedAt,
        ...(providerResult.metadata ?? {}),
      }),
    ],
    events: ["basicTool.computeruse.cursorLocate.located"],
  };
}

export function planCursorLocate(request: unknown = {}): Promise<CursorLocateResult> {
  return executeCursorLocate(request);
}
