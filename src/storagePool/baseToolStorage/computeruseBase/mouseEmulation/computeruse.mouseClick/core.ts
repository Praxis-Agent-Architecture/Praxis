export type MouseClickBoundary = "input" | "contract" | "governance" | "scope" | "provider";

export type MouseClickGate = {
  accepted?: boolean;
  allowed?: boolean;
  reason?: string;
};

export type MouseClickContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: MouseClickGate;
  contract?: MouseClickGate;
  governance?: MouseClickGate;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type MouseClickButton = "left" | "right" | "middle" | "back" | "forward";
export type MouseClickCoordinateSpace = "screen" | "window" | "normalized";

export type MouseClickPoint = {
  x: number;
  y: number;
};

export type MouseClickTarget = {
  button: MouseClickButton;
  clickCount: number;
  at?: MouseClickPoint;
  coordinateSpace: MouseClickCoordinateSpace;
  displayId?: string;
  windowId?: string;
  usesCurrentCursor: boolean;
};

export type MouseClickProviderRequest = {
  operation: "computeruse.mouseClick.pointerAction";
  target: MouseClickTarget;
  context: {
    runtimeId?: string;
    sessionId?: string;
    invocationId?: string;
    auditMetadata?: Readonly<Record<string, unknown>>;
  };
  purpose: string;
};

export type MouseClickProviderResult = {
  actionId: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type MouseClickProvider = (
  request: MouseClickProviderRequest,
) => Promise<MouseClickProviderResult> | MouseClickProviderResult;

export type MouseClickRequest = {
  target?: unknown;
  context?: unknown;
  button?: unknown;
  clickCount?: unknown;
  at?: unknown;
  coordinateSpace?: unknown;
  displayId?: unknown;
  windowId?: unknown;
  purpose?: unknown;
  metadata?: unknown;
  provider?: MouseClickProvider;
};

export type MouseClickErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_TARGET"
  | "INVALID_CONTEXT"
  | "MISSING_RUNTIME_ID"
  | "MISSING_PURPOSE"
  | "INVALID_BUTTON"
  | "INVALID_CLICK_COUNT"
  | "INVALID_COORDINATE_SPACE"
  | "INVALID_POINT"
  | "INVALID_DISPLAY_ID"
  | "INVALID_WINDOW_ID"
  | "SCOPE_DENIED"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_FAILURE";

export type MouseClickError = {
  code: MouseClickErrorCode;
  message: string;
  boundary: MouseClickBoundary;
  publicSafe: true;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type MouseClickAuditEvent = {
  type: string;
  toolId: "computeruse.mouseClick";
  invocationId: string;
  dryRun: boolean;
  metadata: Readonly<Record<string, unknown>>;
};

export type MouseClickOutput = {
  kind: "agentCore.basicTool.computeruse.mouseClick";
  target: MouseClickTarget;
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
    operation: "computeruse.mouseClick.pointerAction";
    runtimeOwnsPointerEvents: true;
    runtimeOwnsInputPolicy: true;
    baseToolOwnsTapStrategy: false;
  };
  actionEnvelope: {
    resource: "pointer";
    action: "click";
    executed: boolean;
    metadataOnly: boolean;
    actionId?: string;
  };
  providerMetadata?: Readonly<Record<string, unknown>>;
};

export type MouseClickResult =
  | {
      ok: true;
      toolId: "computeruse.mouseClick";
      output: MouseClickOutput;
      audit: readonly MouseClickAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "computeruse.mouseClick";
      error: MouseClickError;
      audit: readonly MouseClickAuditEvent[];
      events: readonly string[];
    };

export const mouseClickDescriptor = {
  toolId: "computeruse.mouseClick",
  capability: "click-pointer",
  route: "agent_executionEngine.basic_toolLayer.baseTools.computeruseBase.mouseEmulation",
  defaultDryRun: true,
  defaultButton: "left",
  defaultClickCount: 1,
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

function cleanGate(value: unknown): MouseClickGate | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return undefined;
  const gate: MouseClickGate = {};
  if (typeof value.accepted === "boolean") gate.accepted = value.accepted;
  if (typeof value.allowed === "boolean") gate.allowed = value.allowed;
  const reason = cleanString(value.reason);
  if (reason !== undefined) gate.reason = reason;
  return gate;
}

function cleanAuditMetadata(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return isRecord(value) ? value : undefined;
}

function cleanButton(value: unknown): MouseClickButton | undefined {
  if (value === undefined) return mouseClickDescriptor.defaultButton;
  return value === "left" || value === "right" || value === "middle" || value === "back" || value === "forward"
    ? value
    : undefined;
}

function cleanCoordinateSpace(value: unknown): MouseClickCoordinateSpace | undefined {
  if (value === undefined) return mouseClickDescriptor.defaultCoordinateSpace;
  return value === "screen" || value === "window" || value === "normalized" ? value : undefined;
}

function cleanClickCount(value: unknown): number | undefined {
  if (value === undefined) return mouseClickDescriptor.defaultClickCount;
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 3 ? value : undefined;
}

function cleanPoint(value: unknown): MouseClickPoint | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return undefined;
  const x = value.x;
  const y = value.y;
  if (
    typeof x !== "number" ||
    typeof y !== "number" ||
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    x < 0 ||
    y < 0 ||
    x > mouseClickDescriptor.maxCoordinate ||
    y > mouseClickDescriptor.maxCoordinate
  ) {
    return undefined;
  }
  return { x: Math.round(x), y: Math.round(y) };
}

function auditEvent(type: string, context: MouseClickContext | undefined, metadata?: Readonly<Record<string, unknown>>): MouseClickAuditEvent {
  return {
    type,
    toolId: mouseClickDescriptor.toolId,
    invocationId: context?.invocationId ?? "computeruse.mouseClick:dry-run",
    dryRun: context?.dryRun !== false,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: MouseClickErrorCode,
  message: string,
  boundary: MouseClickBoundary,
  context: MouseClickContext | undefined,
): MouseClickResult {
  return {
    ok: false,
    toolId: mouseClickDescriptor.toolId,
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("agentCore.basicTool.computeruse.mouseClick.rejected", context, { code })],
    events: ["basicTool.computeruse.mouseClick.rejected"],
  };
}

function normalizeContext(value: unknown): MouseClickContext | MouseClickResult {
  if (value === undefined) return {};
  if (!isRecord(value)) return failure("INVALID_CONTEXT", "computeruse.mouseClick context must be an object", "input", undefined);

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
      "computeruse.mouseClick context contains malformed guard, governance, or scope fields",
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

function normalizeTarget(request: Record<string, unknown>, context: MouseClickContext): MouseClickTarget | MouseClickResult {
  const targetValue = request.target;
  if (targetValue !== undefined && !isRecord(targetValue)) {
    return failure("INVALID_TARGET", "computeruse.mouseClick target must be an object when provided", "input", context);
  }
  const target = isRecord(targetValue) ? targetValue : {};

  const button = cleanButton(target.button ?? request.button);
  if (button === undefined) return failure("INVALID_BUTTON", "computeruse.mouseClick button is not supported", "input", context);

  const clickCount = cleanClickCount(target.clickCount ?? request.clickCount);
  if (clickCount === undefined) {
    return failure("INVALID_CLICK_COUNT", "computeruse.mouseClick clickCount must be an integer from 1 to 3", "input", context);
  }

  const atValue = target.at ?? request.at;
  const at = cleanPoint(atValue);
  if (atValue !== undefined && at === undefined) {
    return failure("INVALID_POINT", "computeruse.mouseClick at must use finite non-negative coordinates", "input", context);
  }

  const coordinateSpace = cleanCoordinateSpace(target.coordinateSpace ?? request.coordinateSpace);
  if (coordinateSpace === undefined) {
    return failure("INVALID_COORDINATE_SPACE", "computeruse.mouseClick coordinateSpace must be screen, window, or normalized", "input", context);
  }

  const displayId = cleanString(target.displayId ?? request.displayId);
  if ((target.displayId ?? request.displayId) !== undefined && displayId === undefined) {
    return failure("INVALID_DISPLAY_ID", "computeruse.mouseClick displayId must be a safe string", "input", context);
  }

  const windowId = cleanString(target.windowId ?? request.windowId);
  if ((target.windowId ?? request.windowId) !== undefined && windowId === undefined) {
    return failure("INVALID_WINDOW_ID", "computeruse.mouseClick windowId must be a safe string", "input", context);
  }

  return {
    button,
    clickCount,
    at,
    coordinateSpace,
    displayId,
    windowId,
    usesCurrentCursor: at === undefined,
  };
}

function ensureScopes(target: MouseClickTarget, context: MouseClickContext): MouseClickResult | undefined {
  const requested = context.requestedScopes ?? [];
  const allowed = context.allowedScopes ?? [];
  if (requested.length === 0) return undefined;

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length === 0) return undefined;

  return failure(
    "SCOPE_DENIED",
    `computeruse.mouseClick scope ${denied[0]} is outside runtime governance`,
    "scope",
    context,
  );
}

function ensureStaticGates(target: MouseClickTarget, context: MouseClickContext): MouseClickResult | undefined {
  if (context.contract?.accepted === false || context.contract?.allowed === false) {
    return failure(
      "CONTRACT_REJECTED",
      context.contract.reason ?? "computeruse.mouseClick was rejected by runtime contract surface",
      "contract",
      context,
    );
  }

  if (context.governance?.accepted === false || context.governance?.allowed === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      context.governance.reason ?? "computeruse.mouseClick was rejected by runtime governance",
      "governance",
      context,
    );
  }

  void target;
  return undefined;
}

function ensureRealExecutionGuard(context: MouseClickContext): MouseClickResult | undefined {
  if (context.dryRun !== false) return undefined;
  if (context.guard?.accepted === true || context.guard?.allowed === true) return undefined;

  return failure(
    "GOVERNANCE_REJECTED",
    context.guard?.reason ?? "computeruse.mouseClick dryRun:false requires an affirmative runtime guard",
    "governance",
    context,
  );
}

function baseOutput(
  target: MouseClickTarget,
  purpose: string,
  acceptedScopes: readonly string[],
  dryRun: boolean,
  providerCalled: boolean,
): Omit<MouseClickOutput, "actionEnvelope"> {
  return {
    kind: "agentCore.basicTool.computeruse.mouseClick",
    target,
    purpose,
    dispatch: dryRun ? "dry-run" : "runtime-computeruse",
    dryRun,
    providerCalled,
    executionBlocked: dryRun,
    unsafeSideEffects: true,
    permissionsRequired: mouseClickDescriptor.permissionsRequired,
    requiresTapApproval: true,
    acceptedScopes,
    runtimeEntry: {
      port: "BaseToolExecutorPort.computeruse.pointerAction",
      operation: "computeruse.mouseClick.pointerAction",
      runtimeOwnsPointerEvents: true,
      runtimeOwnsInputPolicy: true,
      baseToolOwnsTapStrategy: false,
    },
  };
}

function normalizeProviderResult(value: unknown, context: MouseClickContext): MouseClickProviderResult | MouseClickResult {
  if (!isRecord(value) || cleanString(value.actionId) === undefined) {
    return failure(
      "PROVIDER_FAILURE",
      "computeruse.mouseClick runtime provider returned a malformed public-safe action envelope",
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
  target: MouseClickTarget;
  context: MouseClickContext;
  purpose: string;
  metadata?: Readonly<Record<string, unknown>>;
  provider?: MouseClickProvider;
} | MouseClickResult {
  if (request === undefined) request = {};
  if (!isRecord(request)) return failure("INVALID_REQUEST", "computeruse.mouseClick request must be an object", "input", undefined);

  const context = normalizeContext(request.context);
  if ("ok" in context) return context;

  const target = normalizeTarget(request, context);
  if ("ok" in target) return target;

  const purpose = cleanString(request.purpose);
  if (purpose === undefined) {
    return failure("MISSING_PURPOSE", "computeruse.mouseClick requires an explicit purpose", "input", context);
  }

  if (context.runtimeId === undefined) {
    return failure("MISSING_RUNTIME_ID", "computeruse.mouseClick requires context.runtimeId for audit", "input", context);
  }

  const scopes = ensureScopes(target, context);
  if (scopes !== undefined) return scopes;

  const staticGates = ensureStaticGates(target, context);
  if (staticGates !== undefined) return staticGates;

  const realGuard = ensureRealExecutionGuard(context);
  if (realGuard !== undefined) return realGuard;

  return {
    target,
    context,
    purpose,
    metadata: cleanAuditMetadata(request.metadata),
    provider: typeof request.provider === "function" ? (request.provider as MouseClickProvider) : undefined,
  };
}

export async function executeMouseClick(request: unknown = {}): Promise<MouseClickResult> {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) return normalized;

  const { target, context, purpose, metadata, provider } = normalized;
  const acceptedScopes = context.requestedScopes ?? [];
  const dryRun = context.dryRun !== false;

  if (dryRun) {
    return {
      ok: true,
      toolId: mouseClickDescriptor.toolId,
      output: {
        ...baseOutput(target, purpose, acceptedScopes, true, false),
        actionEnvelope: {
          resource: "pointer",
          action: "click",
          executed: false,
          metadataOnly: true,
        },
      },
      audit: [auditEvent("agentCore.basicTool.computeruse.mouseClick.dryRun", context, metadata)],
      events: ["basicTool.computeruse.mouseClick.dryRun"],
    };
  }

  if (provider === undefined) {
    return failure(
      "PROVIDER_UNAVAILABLE",
      "computeruse.mouseClick requires runtime executor.computeruse.pointerAction for dryRun:false",
      "provider",
      context,
    );
  }

  let providerResult: MouseClickProviderResult;
  try {
    const result = await provider({
      operation: "computeruse.mouseClick.pointerAction",
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
        ? "computeruse.mouseClick runtime provider failed without exposing private details"
        : `computeruse.mouseClick runtime provider failed: ${providerMessage}`,
      "provider",
      context,
    );
  }

  return {
    ok: true,
    toolId: mouseClickDescriptor.toolId,
    output: {
      ...baseOutput(target, purpose, acceptedScopes, false, true),
      actionEnvelope: {
        resource: "pointer",
        action: "click",
        executed: true,
        metadataOnly: false,
        actionId: providerResult.actionId,
      },
      providerMetadata: providerResult.metadata,
    },
    audit: [
      auditEvent("agentCore.basicTool.computeruse.mouseClick.clicked", context, {
        actionId: providerResult.actionId,
        ...(providerResult.metadata ?? {}),
      }),
    ],
    events: ["basicTool.computeruse.mouseClick.clicked"],
  };
}

export function planMouseClick(request: unknown = {}): Promise<MouseClickResult> {
  return executeMouseClick(request);
}
