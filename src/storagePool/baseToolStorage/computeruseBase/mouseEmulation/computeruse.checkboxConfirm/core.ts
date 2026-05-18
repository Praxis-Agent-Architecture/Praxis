export type CheckboxConfirmBoundary = "input" | "contract" | "governance" | "scope" | "provider";

export type CheckboxConfirmGate = {
  accepted?: boolean;
  allowed?: boolean;
  reason?: string;
};

export type CheckboxConfirmContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: CheckboxConfirmGate;
  contract?: CheckboxConfirmGate;
  governance?: CheckboxConfirmGate;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type CheckboxConfirmState = "checked" | "unchecked";
export type CheckboxConfirmCoordinateSpace = "screen" | "window" | "normalized";
export type CheckboxConfirmClickMode = "single-click" | "double-click";

export type CheckboxConfirmPoint = {
  x: number;
  y: number;
};

export type CheckboxConfirmTarget = {
  expectedState: CheckboxConfirmState;
  currentState?: CheckboxConfirmState;
  label?: string;
  selectorHint?: string;
  point?: CheckboxConfirmPoint;
  coordinateSpace: CheckboxConfirmCoordinateSpace;
  displayId?: string;
  windowId?: string;
  clickMode: CheckboxConfirmClickMode;
  clickCount: 1 | 2;
  wouldToggle: boolean;
};

export type CheckboxConfirmProviderRequest = {
  operation: "computeruse.checkboxConfirm.pointerAction";
  target: CheckboxConfirmTarget;
  context: {
    runtimeId?: string;
    sessionId?: string;
    invocationId?: string;
    auditMetadata?: Readonly<Record<string, unknown>>;
  };
  purpose: string;
};

export type CheckboxConfirmProviderResult = {
  actionId: string;
  finalState?: CheckboxConfirmState;
  metadata?: Readonly<Record<string, unknown>>;
};

export type CheckboxConfirmProvider = (
  request: CheckboxConfirmProviderRequest,
) => Promise<CheckboxConfirmProviderResult> | CheckboxConfirmProviderResult;

export type CheckboxConfirmRequest = {
  target?: unknown;
  context?: unknown;
  label?: unknown;
  selectorHint?: unknown;
  point?: unknown;
  expectedState?: unknown;
  currentState?: unknown;
  coordinateSpace?: unknown;
  displayId?: unknown;
  windowId?: unknown;
  clickMode?: unknown;
  purpose?: unknown;
  metadata?: unknown;
  provider?: CheckboxConfirmProvider;
};

export type CheckboxConfirmErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_TARGET"
  | "INVALID_CONTEXT"
  | "MISSING_RUNTIME_ID"
  | "MISSING_PURPOSE"
  | "MISSING_TARGET"
  | "INVALID_POINT"
  | "INVALID_STATE"
  | "INVALID_CLICK_MODE"
  | "INVALID_COORDINATE_SPACE"
  | "INVALID_DISPLAY_ID"
  | "INVALID_WINDOW_ID"
  | "SCOPE_DENIED"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_FAILURE";

export type CheckboxConfirmError = {
  code: CheckboxConfirmErrorCode;
  message: string;
  boundary: CheckboxConfirmBoundary;
  publicSafe: true;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type CheckboxConfirmAuditEvent = {
  type: string;
  toolId: "computeruse.checkboxConfirm";
  invocationId: string;
  dryRun: boolean;
  metadata: Readonly<Record<string, unknown>>;
};

export type CheckboxConfirmOutput = {
  kind: "agentCore.basicTool.computeruse.checkboxConfirm";
  target: CheckboxConfirmTarget;
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
    operation: "computeruse.checkboxConfirm.pointerAction";
    runtimeOwnsPointerEvents: true;
    runtimeOwnsInputPolicy: true;
    baseToolOwnsTapStrategy: false;
  };
  actionEnvelope: {
    resource: "pointer";
    action: "confirm";
    executed: boolean;
    metadataOnly: boolean;
    actionId?: string;
  };
  finalState?: CheckboxConfirmState;
  providerMetadata?: Readonly<Record<string, unknown>>;
};

export type CheckboxConfirmResult =
  | {
      ok: true;
      toolId: "computeruse.checkboxConfirm";
      output: CheckboxConfirmOutput;
      audit: readonly CheckboxConfirmAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "computeruse.checkboxConfirm";
      error: CheckboxConfirmError;
      audit: readonly CheckboxConfirmAuditEvent[];
      events: readonly string[];
    };

export const checkboxConfirmDescriptor = {
  toolId: "computeruse.checkboxConfirm",
  capability: "confirm-mouse-checkbox",
  route: "agent_executionEngine.basic_toolLayer.baseTools.computeruseBase.mouseEmulation",
  defaultDryRun: true,
  defaultExpectedState: "checked",
  defaultClickMode: "single-click",
  defaultCoordinateSpace: "screen",
  maxCoordinate: 100_000,
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

function cleanGate(value: unknown): CheckboxConfirmGate | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return undefined;
  const gate: CheckboxConfirmGate = {};
  if (typeof value.accepted === "boolean") gate.accepted = value.accepted;
  if (typeof value.allowed === "boolean") gate.allowed = value.allowed;
  const reason = cleanString(value.reason);
  if (reason !== undefined) gate.reason = reason;
  return gate;
}

function cleanAuditMetadata(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return isRecord(value) ? value : undefined;
}

function cleanState(value: unknown, fallback?: CheckboxConfirmState): CheckboxConfirmState | undefined {
  if (value === undefined) return fallback;
  return value === "checked" || value === "unchecked" ? value : undefined;
}

function cleanClickMode(value: unknown): CheckboxConfirmClickMode | undefined {
  if (value === undefined) return checkboxConfirmDescriptor.defaultClickMode;
  return value === "single-click" || value === "double-click" ? value : undefined;
}

function cleanCoordinateSpace(value: unknown): CheckboxConfirmCoordinateSpace | undefined {
  if (value === undefined) return checkboxConfirmDescriptor.defaultCoordinateSpace;
  return value === "screen" || value === "window" || value === "normalized" ? value : undefined;
}

function cleanCoordinate(value: unknown): number | undefined {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= checkboxConfirmDescriptor.maxCoordinate
    ? Math.round(value)
    : undefined;
}

function auditEvent(type: string, context: CheckboxConfirmContext | undefined, metadata?: Readonly<Record<string, unknown>>): CheckboxConfirmAuditEvent {
  return {
    type,
    toolId: checkboxConfirmDescriptor.toolId,
    invocationId: context?.invocationId ?? "computeruse.checkboxConfirm:dry-run",
    dryRun: context?.dryRun !== false,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: CheckboxConfirmErrorCode,
  message: string,
  boundary: CheckboxConfirmBoundary,
  context: CheckboxConfirmContext | undefined,
): CheckboxConfirmResult {
  return {
    ok: false,
    toolId: checkboxConfirmDescriptor.toolId,
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("agentCore.basicTool.computeruse.checkboxConfirm.rejected", context, { code })],
    events: ["basicTool.computeruse.checkboxConfirm.rejected"],
  };
}

function normalizeContext(value: unknown): CheckboxConfirmContext | CheckboxConfirmResult {
  if (value === undefined) return {};
  if (!isRecord(value)) return failure("INVALID_CONTEXT", "computeruse.checkboxConfirm context must be an object", "input", undefined);

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
      "computeruse.checkboxConfirm context contains malformed guard, governance, or scope fields",
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

function normalizePoint(value: unknown, context: CheckboxConfirmContext): CheckboxConfirmPoint | CheckboxConfirmResult | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return failure("INVALID_POINT", "computeruse.checkboxConfirm point must be an object when provided", "input", context);
  const x = cleanCoordinate(value.x);
  const y = cleanCoordinate(value.y);
  if (x === undefined || y === undefined) {
    return failure("INVALID_POINT", "computeruse.checkboxConfirm point must use finite non-negative coordinates", "input", context);
  }
  return { x, y };
}

function normalizeTarget(request: Record<string, unknown>, context: CheckboxConfirmContext): CheckboxConfirmTarget | CheckboxConfirmResult {
  const targetValue = request.target;
  if (targetValue !== undefined && !isRecord(targetValue)) {
    return failure("INVALID_TARGET", "computeruse.checkboxConfirm target must be an object when provided", "input", context);
  }
  const target = isRecord(targetValue) ? targetValue : {};

  const label = cleanString(target.label ?? request.label);
  if ((target.label ?? request.label) !== undefined && label === undefined) {
    return failure("INVALID_TARGET", "computeruse.checkboxConfirm label must be a safe string", "input", context);
  }

  const selectorHint = cleanString(target.selectorHint ?? request.selectorHint);
  if ((target.selectorHint ?? request.selectorHint) !== undefined && selectorHint === undefined) {
    return failure("INVALID_TARGET", "computeruse.checkboxConfirm selectorHint must be a safe string", "input", context);
  }

  const point = normalizePoint(target.point ?? request.point, context);
  if (point !== undefined && "ok" in point) return point;

  if (label === undefined && selectorHint === undefined && point === undefined) {
    return failure("MISSING_TARGET", "computeruse.checkboxConfirm requires label, selectorHint, or point", "input", context);
  }

  const expectedState = cleanState(target.expectedState ?? request.expectedState, checkboxConfirmDescriptor.defaultExpectedState);
  if (expectedState === undefined) {
    return failure("INVALID_STATE", "computeruse.checkboxConfirm expectedState must be checked or unchecked", "input", context);
  }

  const currentState = cleanState(target.currentState ?? request.currentState);
  if ((target.currentState ?? request.currentState) !== undefined && currentState === undefined) {
    return failure("INVALID_STATE", "computeruse.checkboxConfirm currentState must be checked or unchecked", "input", context);
  }

  const clickMode = cleanClickMode(target.clickMode ?? request.clickMode);
  if (clickMode === undefined) {
    return failure("INVALID_CLICK_MODE", "computeruse.checkboxConfirm clickMode must be single-click or double-click", "input", context);
  }

  const coordinateSpace = cleanCoordinateSpace(target.coordinateSpace ?? request.coordinateSpace);
  if (coordinateSpace === undefined) {
    return failure("INVALID_COORDINATE_SPACE", "computeruse.checkboxConfirm coordinateSpace must be screen, window, or normalized", "input", context);
  }

  const displayId = cleanString(target.displayId ?? request.displayId);
  if ((target.displayId ?? request.displayId) !== undefined && displayId === undefined) {
    return failure("INVALID_DISPLAY_ID", "computeruse.checkboxConfirm displayId must be a safe string", "input", context);
  }

  const windowId = cleanString(target.windowId ?? request.windowId);
  if ((target.windowId ?? request.windowId) !== undefined && windowId === undefined) {
    return failure("INVALID_WINDOW_ID", "computeruse.checkboxConfirm windowId must be a safe string", "input", context);
  }

  return {
    expectedState,
    currentState,
    label,
    selectorHint,
    point,
    coordinateSpace,
    displayId,
    windowId,
    clickMode,
    clickCount: clickMode === "single-click" ? 1 : 2,
    wouldToggle: currentState === undefined || currentState !== expectedState,
  };
}

function ensureScopes(context: CheckboxConfirmContext): CheckboxConfirmResult | undefined {
  const requested = context.requestedScopes ?? [];
  const allowed = context.allowedScopes ?? [];
  if (requested.length === 0) return undefined;

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length === 0) return undefined;

  return failure(
    "SCOPE_DENIED",
    `computeruse.checkboxConfirm scope ${denied[0]} is outside runtime governance`,
    "scope",
    context,
  );
}

function ensureStaticGates(context: CheckboxConfirmContext): CheckboxConfirmResult | undefined {
  if (context.contract?.accepted === false || context.contract?.allowed === false) {
    return failure(
      "CONTRACT_REJECTED",
      context.contract.reason ?? "computeruse.checkboxConfirm was rejected by runtime contract surface",
      "contract",
      context,
    );
  }

  if (context.governance?.accepted === false || context.governance?.allowed === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      context.governance.reason ?? "computeruse.checkboxConfirm was rejected by runtime governance",
      "governance",
      context,
    );
  }

  return undefined;
}

function ensureRealExecutionGuard(context: CheckboxConfirmContext): CheckboxConfirmResult | undefined {
  if (context.dryRun !== false) return undefined;
  if (context.guard?.accepted === true || context.guard?.allowed === true) return undefined;

  return failure(
    "GOVERNANCE_REJECTED",
    context.guard?.reason ?? "computeruse.checkboxConfirm dryRun:false requires an affirmative runtime guard",
    "governance",
    context,
  );
}

function baseOutput(
  target: CheckboxConfirmTarget,
  purpose: string,
  acceptedScopes: readonly string[],
  dryRun: boolean,
  providerCalled: boolean,
): Omit<CheckboxConfirmOutput, "actionEnvelope"> {
  return {
    kind: "agentCore.basicTool.computeruse.checkboxConfirm",
    target,
    purpose,
    dispatch: dryRun ? "dry-run" : "runtime-computeruse",
    dryRun,
    providerCalled,
    executionBlocked: dryRun,
    unsafeSideEffects: true,
    permissionsRequired: checkboxConfirmDescriptor.permissionsRequired,
    requiresTapApproval: true,
    acceptedScopes,
    runtimeEntry: {
      port: "BaseToolExecutorPort.computeruse.pointerAction",
      operation: "computeruse.checkboxConfirm.pointerAction",
      runtimeOwnsPointerEvents: true,
      runtimeOwnsInputPolicy: true,
      baseToolOwnsTapStrategy: false,
    },
  };
}

function normalizeProviderResult(value: unknown, context: CheckboxConfirmContext): CheckboxConfirmProviderResult | CheckboxConfirmResult {
  if (!isRecord(value) || cleanString(value.actionId) === undefined) {
    return failure(
      "PROVIDER_FAILURE",
      "computeruse.checkboxConfirm runtime provider returned a malformed public-safe action envelope",
      "provider",
      context,
    );
  }

  const finalState = cleanState(value.finalState);
  if (value.finalState !== undefined && finalState === undefined) {
    return failure("PROVIDER_FAILURE", "computeruse.checkboxConfirm runtime provider returned an invalid final state", "provider", context);
  }

  return {
    actionId: cleanString(value.actionId) ?? "",
    finalState,
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
  target: CheckboxConfirmTarget;
  context: CheckboxConfirmContext;
  purpose: string;
  metadata?: Readonly<Record<string, unknown>>;
  provider?: CheckboxConfirmProvider;
} | CheckboxConfirmResult {
  if (request === undefined) request = {};
  if (!isRecord(request)) return failure("INVALID_REQUEST", "computeruse.checkboxConfirm request must be an object", "input", undefined);

  const context = normalizeContext(request.context);
  if ("ok" in context) return context;

  const target = normalizeTarget(request, context);
  if ("ok" in target) return target;

  const purpose = cleanString(request.purpose);
  if (purpose === undefined) {
    return failure("MISSING_PURPOSE", "computeruse.checkboxConfirm requires an explicit purpose", "input", context);
  }

  if (context.runtimeId === undefined) {
    return failure("MISSING_RUNTIME_ID", "computeruse.checkboxConfirm requires context.runtimeId for audit", "input", context);
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
    provider: typeof request.provider === "function" ? (request.provider as CheckboxConfirmProvider) : undefined,
  };
}

export async function executeCheckboxConfirm(request: unknown = {}): Promise<CheckboxConfirmResult> {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) return normalized;

  const { target, context, purpose, metadata, provider } = normalized;
  const acceptedScopes = context.requestedScopes ?? [];
  const dryRun = context.dryRun !== false;

  if (dryRun) {
    return {
      ok: true,
      toolId: checkboxConfirmDescriptor.toolId,
      output: {
        ...baseOutput(target, purpose, acceptedScopes, true, false),
        actionEnvelope: {
          resource: "pointer",
          action: "confirm",
          executed: false,
          metadataOnly: true,
        },
      },
      audit: [auditEvent("agentCore.basicTool.computeruse.checkboxConfirm.dryRun", context, metadata)],
      events: ["basicTool.computeruse.checkboxConfirm.dryRun"],
    };
  }

  if (provider === undefined) {
    return failure(
      "PROVIDER_UNAVAILABLE",
      "computeruse.checkboxConfirm requires runtime executor.computeruse.pointerAction for dryRun:false",
      "provider",
      context,
    );
  }

  let providerResult: CheckboxConfirmProviderResult;
  try {
    const result = await provider({
      operation: "computeruse.checkboxConfirm.pointerAction",
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
        ? "computeruse.checkboxConfirm runtime provider failed without exposing private details"
        : `computeruse.checkboxConfirm runtime provider failed: ${providerMessage}`,
      "provider",
      context,
    );
  }

  return {
    ok: true,
    toolId: checkboxConfirmDescriptor.toolId,
    output: {
      ...baseOutput(target, purpose, acceptedScopes, false, true),
      actionEnvelope: {
        resource: "pointer",
        action: "confirm",
        executed: true,
        metadataOnly: false,
        actionId: providerResult.actionId,
      },
      finalState: providerResult.finalState,
      providerMetadata: providerResult.metadata,
    },
    audit: [
      auditEvent("agentCore.basicTool.computeruse.checkboxConfirm.confirmed", context, {
        actionId: providerResult.actionId,
        finalState: providerResult.finalState,
        ...(providerResult.metadata ?? {}),
      }),
    ],
    events: ["basicTool.computeruse.checkboxConfirm.confirmed"],
  };
}

export function planCheckboxConfirm(request: unknown = {}): Promise<CheckboxConfirmResult> {
  return executeCheckboxConfirm(request);
}
