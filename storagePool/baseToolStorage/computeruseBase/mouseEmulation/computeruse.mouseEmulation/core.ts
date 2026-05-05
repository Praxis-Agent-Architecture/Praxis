export type MouseEmulationBoundary = "input" | "contract" | "governance" | "scope" | "provider";

export type MouseEmulationGate = {
  accepted?: boolean;
  allowed?: boolean;
  reason?: string;
};

export type MouseEmulationContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: MouseEmulationGate;
  contract?: MouseEmulationGate;
  governance?: MouseEmulationGate;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type MouseEmulationCoordinateSpace = "screen" | "window" | "normalized";
export type MouseEmulationButton = "left" | "right" | "middle" | "back" | "forward";

export type MouseEmulationPoint = {
  x: number;
  y: number;
};

export type MouseEmulationLocateStep = {
  kind: "locate";
  coordinateSpace: MouseEmulationCoordinateSpace;
  displayId?: string;
};

export type MouseEmulationMoveStep = {
  kind: "move";
  target: MouseEmulationPoint;
  coordinateSpace: MouseEmulationCoordinateSpace;
  displayId?: string;
  windowId?: string;
  durationMs?: number;
};

export type MouseEmulationClickStep = {
  kind: "click";
  button: MouseEmulationButton;
  clickCount: number;
  at?: MouseEmulationPoint;
  coordinateSpace: MouseEmulationCoordinateSpace;
  displayId?: string;
  windowId?: string;
  usesCurrentCursor: boolean;
};

export type MouseEmulationStep = MouseEmulationLocateStep | MouseEmulationMoveStep | MouseEmulationClickStep;

export type MouseEmulationProviderStepResult = {
  index: number;
  kind: MouseEmulationStep["kind"];
  actionId?: string;
  position?: {
    x: number;
    y: number;
    coordinateSpace: MouseEmulationCoordinateSpace;
    displayId?: string;
  };
  metadata?: Readonly<Record<string, unknown>>;
};

export type MouseEmulationProviderRequest = {
  operation: "computeruse.mouseEmulation.pointerSequence";
  steps: readonly MouseEmulationStep[];
  context: {
    runtimeId?: string;
    sessionId?: string;
    invocationId?: string;
    auditMetadata?: Readonly<Record<string, unknown>>;
  };
  purpose: string;
};

export type MouseEmulationProviderResult = {
  stepResults: readonly MouseEmulationProviderStepResult[];
  metadata?: Readonly<Record<string, unknown>>;
};

export type MouseEmulationProvider = (
  request: MouseEmulationProviderRequest,
) => Promise<MouseEmulationProviderResult> | MouseEmulationProviderResult;

export type MouseEmulationRequest = {
  steps?: unknown;
  context?: unknown;
  maxSteps?: unknown;
  purpose?: unknown;
  metadata?: unknown;
  provider?: MouseEmulationProvider;
};

export type MouseEmulationErrorCode =
  | "INVALID_REQUEST"
  | "MISSING_STEPS"
  | "STEP_LIMIT_EXCEEDED"
  | "INVALID_STEP"
  | "INVALID_TARGET"
  | "INVALID_CLICK_COUNT"
  | "INVALID_COORDINATE_SPACE"
  | "INVALID_CONTEXT"
  | "MISSING_RUNTIME_ID"
  | "MISSING_PURPOSE"
  | "SCOPE_DENIED"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_FAILURE";

export type MouseEmulationError = {
  code: MouseEmulationErrorCode;
  message: string;
  boundary: MouseEmulationBoundary;
  publicSafe: true;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type MouseEmulationAuditEvent = {
  type: string;
  toolId: "computeruse.mouseEmulation";
  invocationId: string;
  dryRun: boolean;
  metadata: Readonly<Record<string, unknown>>;
};

export type MouseEmulationStepEnvelope = {
  index: number;
  kind: MouseEmulationStep["kind"];
  executed: boolean;
  metadataOnly: boolean;
  actionId?: string;
  position?: MouseEmulationProviderStepResult["position"];
};

export type MouseEmulationOutput = {
  kind: "agentCore.basicTool.computeruse.mouseEmulation";
  operation: "simulate-mouse-operations";
  purpose: string;
  steps: readonly MouseEmulationStep[];
  dispatch: "dry-run" | "runtime-computeruse";
  dryRun: boolean;
  providerCalled: boolean;
  executionBlocked: boolean;
  unsafeSideEffects: true;
  permissionsRequired: readonly ["pointer:read", "pointer:write", "ui:action"];
  requiresTapApproval: true;
  acceptedScopes: readonly string[];
  runtimeEntry: {
    ports: readonly [
      "BaseToolExecutorPort.computeruse.locateCursor",
      "BaseToolExecutorPort.computeruse.pointerAction",
    ];
    operation: "computeruse.mouseEmulation.pointerSequence";
    runtimeOwnsPointerEvents: true;
    runtimeOwnsCursorObservation: true;
    runtimeOwnsInputPolicy: true;
    baseToolOwnsTapStrategy: false;
  };
  sequenceEnvelope: {
    maxSteps: number;
    executed: boolean;
    metadataOnly: boolean;
    stepResults: readonly MouseEmulationStepEnvelope[];
  };
  providerMetadata?: Readonly<Record<string, unknown>>;
};

export type MouseEmulationResult =
  | {
      ok: true;
      toolId: "computeruse.mouseEmulation";
      output: MouseEmulationOutput;
      audit: readonly MouseEmulationAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "computeruse.mouseEmulation";
      error: MouseEmulationError;
      audit: readonly MouseEmulationAuditEvent[];
      events: readonly string[];
    };

export const mouseEmulationDescriptor = {
  toolId: "computeruse.mouseEmulation",
  capability: "simulate-mouse-operations",
  route: "agent_executionEngine.basic_toolLayer.baseTools.computeruseBase.mouseEmulation",
  defaultDryRun: true,
  defaultCoordinateSpace: "screen",
  defaultButton: "left",
  defaultClickCount: 1,
  maxCoordinate: 100_000,
  defaultMaxSteps: 16,
  tapOwnsApproval: true,
  runtimeEntry: [
    "BaseToolExecutorPort.computeruse.locateCursor",
    "BaseToolExecutorPort.computeruse.pointerAction",
  ],
  permissionsRequired: ["pointer:read", "pointer:write", "ui:action"],
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

function cleanGate(value: unknown): MouseEmulationGate | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return undefined;
  const gate: MouseEmulationGate = {};
  if (typeof value.accepted === "boolean") gate.accepted = value.accepted;
  if (typeof value.allowed === "boolean") gate.allowed = value.allowed;
  const reason = cleanString(value.reason);
  if (reason !== undefined) gate.reason = reason;
  return gate;
}

function cleanAuditMetadata(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return isRecord(value) ? value : undefined;
}

function cleanCoordinateSpace(value: unknown): MouseEmulationCoordinateSpace | undefined {
  if (value === undefined) return mouseEmulationDescriptor.defaultCoordinateSpace;
  return value === "screen" || value === "window" || value === "normalized" ? value : undefined;
}

function cleanProviderCoordinateSpace(value: unknown): MouseEmulationCoordinateSpace | undefined {
  return value === "screen" || value === "window" || value === "normalized" ? value : undefined;
}

function cleanPoint(value: unknown): MouseEmulationPoint | undefined {
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
    x > mouseEmulationDescriptor.maxCoordinate ||
    y > mouseEmulationDescriptor.maxCoordinate
  ) {
    return undefined;
  }
  return { x: Math.round(x), y: Math.round(y) };
}

function cleanButton(value: unknown): MouseEmulationButton | undefined {
  if (value === undefined) return mouseEmulationDescriptor.defaultButton;
  return value === "left" || value === "right" || value === "middle" || value === "back" || value === "forward"
    ? value
    : undefined;
}

function cleanClickCount(value: unknown): number | undefined {
  if (value === undefined) return mouseEmulationDescriptor.defaultClickCount;
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 3 ? value : undefined;
}

function cleanDuration(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function auditEvent(
  type: string,
  context: MouseEmulationContext | undefined,
  metadata?: Readonly<Record<string, unknown>>,
): MouseEmulationAuditEvent {
  return {
    type,
    toolId: mouseEmulationDescriptor.toolId,
    invocationId: context?.invocationId ?? "computeruse.mouseEmulation:dry-run",
    dryRun: context?.dryRun !== false,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: MouseEmulationErrorCode,
  message: string,
  boundary: MouseEmulationBoundary,
  context: MouseEmulationContext | undefined,
): MouseEmulationResult {
  return {
    ok: false,
    toolId: mouseEmulationDescriptor.toolId,
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("agentCore.basicTool.computeruse.mouseEmulation.rejected", context, { code })],
    events: ["basicTool.computeruse.mouseEmulation.rejected"],
  };
}

function normalizeContext(value: unknown): MouseEmulationContext | MouseEmulationResult {
  if (value === undefined) return {};
  if (!isRecord(value)) {
    return failure("INVALID_CONTEXT", "computeruse.mouseEmulation context must be an object", "input", undefined);
  }

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
      "computeruse.mouseEmulation context contains malformed guard, governance, or scope fields",
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

function normalizeLocateStep(step: Record<string, unknown>, context: MouseEmulationContext): MouseEmulationLocateStep | MouseEmulationResult {
  const coordinateSpace = cleanCoordinateSpace(step.coordinateSpace);
  if (coordinateSpace === undefined) {
    return failure(
      "INVALID_COORDINATE_SPACE",
      "computeruse.mouseEmulation locate coordinateSpace must be screen, window, or normalized",
      "input",
      context,
    );
  }
  const displayId = cleanString(step.displayId);
  if (step.displayId !== undefined && displayId === undefined) {
    return failure("INVALID_TARGET", "computeruse.mouseEmulation locate displayId must be a safe string", "input", context);
  }
  return { kind: "locate", coordinateSpace, displayId };
}

function normalizeMoveStep(step: Record<string, unknown>, context: MouseEmulationContext): MouseEmulationMoveStep | MouseEmulationResult {
  const target = cleanPoint(step.target);
  if (target === undefined) {
    return failure("INVALID_TARGET", "computeruse.mouseEmulation move step requires finite non-negative target coordinates", "input", context);
  }
  const coordinateSpace = cleanCoordinateSpace(step.coordinateSpace);
  if (coordinateSpace === undefined) {
    return failure(
      "INVALID_COORDINATE_SPACE",
      "computeruse.mouseEmulation move coordinateSpace must be screen, window, or normalized",
      "input",
      context,
    );
  }
  const displayId = cleanString(step.displayId);
  const windowId = cleanString(step.windowId);
  const durationMs = cleanDuration(step.durationMs);
  if (
    (step.displayId !== undefined && displayId === undefined) ||
    (step.windowId !== undefined && windowId === undefined) ||
    (step.durationMs !== undefined && durationMs === undefined)
  ) {
    return failure("INVALID_STEP", "computeruse.mouseEmulation move step has invalid target metadata", "input", context);
  }
  return { kind: "move", target, coordinateSpace, displayId, windowId, durationMs };
}

function normalizeClickStep(step: Record<string, unknown>, context: MouseEmulationContext): MouseEmulationClickStep | MouseEmulationResult {
  const button = cleanButton(step.button);
  if (button === undefined) {
    return failure("INVALID_STEP", "computeruse.mouseEmulation click button is not supported", "input", context);
  }
  const clickCount = cleanClickCount(step.clickCount);
  if (clickCount === undefined) {
    return failure("INVALID_CLICK_COUNT", "computeruse.mouseEmulation clickCount must be an integer from 1 to 3", "input", context);
  }
  const atValue = step.at;
  const at = atValue === undefined ? undefined : cleanPoint(atValue);
  if (atValue !== undefined && at === undefined) {
    return failure("INVALID_TARGET", "computeruse.mouseEmulation click at must use finite non-negative coordinates", "input", context);
  }
  const coordinateSpace = cleanCoordinateSpace(step.coordinateSpace);
  if (coordinateSpace === undefined) {
    return failure(
      "INVALID_COORDINATE_SPACE",
      "computeruse.mouseEmulation click coordinateSpace must be screen, window, or normalized",
      "input",
      context,
    );
  }
  const displayId = cleanString(step.displayId);
  const windowId = cleanString(step.windowId);
  if ((step.displayId !== undefined && displayId === undefined) || (step.windowId !== undefined && windowId === undefined)) {
    return failure("INVALID_STEP", "computeruse.mouseEmulation click step has invalid target metadata", "input", context);
  }
  return { kind: "click", button, clickCount, at, coordinateSpace, displayId, windowId, usesCurrentCursor: at === undefined };
}

function normalizeSteps(value: unknown, maxSteps: number, context: MouseEmulationContext): readonly MouseEmulationStep[] | MouseEmulationResult {
  if (!Array.isArray(value) || value.length === 0) {
    return failure("MISSING_STEPS", "computeruse.mouseEmulation requires at least one mouse step", "input", context);
  }
  if (value.length > maxSteps) {
    return failure(
      "STEP_LIMIT_EXCEEDED",
      "computeruse.mouseEmulation steps must stay within the declared runtime step limit",
      "scope",
      context,
    );
  }

  const steps: MouseEmulationStep[] = [];
  for (const rawStep of value) {
    if (!isRecord(rawStep)) {
      return failure("INVALID_STEP", "computeruse.mouseEmulation steps must be objects", "input", context);
    }
    const kind = cleanString(rawStep.kind);
    const step =
      kind === "locate"
        ? normalizeLocateStep(rawStep, context)
        : kind === "move"
          ? normalizeMoveStep(rawStep, context)
          : kind === "click"
            ? normalizeClickStep(rawStep, context)
            : failure("INVALID_STEP", "computeruse.mouseEmulation step kind must be locate, move, or click", "input", context);
    if ("ok" in step) return step;
    steps.push(step);
  }
  return steps;
}

function ensureScopes(context: MouseEmulationContext): MouseEmulationResult | undefined {
  const requested = context.requestedScopes ?? [];
  const allowed = context.allowedScopes ?? [];
  if (requested.length === 0) return undefined;

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length === 0) return undefined;

  return failure(
    "SCOPE_DENIED",
    `computeruse.mouseEmulation scope ${denied[0]} is outside runtime governance`,
    "scope",
    context,
  );
}

function ensureStaticGates(context: MouseEmulationContext): MouseEmulationResult | undefined {
  if (context.contract?.accepted === false || context.contract?.allowed === false) {
    return failure(
      "CONTRACT_REJECTED",
      context.contract.reason ?? "computeruse.mouseEmulation was rejected by runtime contract surface",
      "contract",
      context,
    );
  }
  if (context.governance?.accepted === false || context.governance?.allowed === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      context.governance.reason ?? "computeruse.mouseEmulation was rejected by runtime governance",
      "governance",
      context,
    );
  }
  return undefined;
}

function ensureRealExecutionGuard(context: MouseEmulationContext): MouseEmulationResult | undefined {
  if (context.dryRun !== false) return undefined;
  if (context.guard?.accepted === true || context.guard?.allowed === true) return undefined;
  return failure(
    "GOVERNANCE_REJECTED",
    context.guard?.reason ?? "computeruse.mouseEmulation dryRun:false requires an affirmative runtime guard",
    "governance",
    context,
  );
}

function normalizeProviderResult(
  value: unknown,
  steps: readonly MouseEmulationStep[],
  context: MouseEmulationContext,
): MouseEmulationProviderResult | MouseEmulationResult {
  if (!isRecord(value) || !Array.isArray(value.stepResults) || value.stepResults.length !== steps.length) {
    return failure(
      "PROVIDER_FAILURE",
      "computeruse.mouseEmulation runtime provider returned a malformed public-safe sequence envelope",
      "provider",
      context,
    );
  }

  const stepResults: MouseEmulationProviderStepResult[] = [];
  for (let index = 0; index < value.stepResults.length; index += 1) {
    const raw = value.stepResults[index];
    const expected = steps[index];
    if (!isRecord(raw) || raw.index !== index || raw.kind !== expected?.kind) {
      return failure(
        "PROVIDER_FAILURE",
        "computeruse.mouseEmulation runtime provider returned a malformed step result",
        "provider",
        context,
      );
    }

    const actionId = cleanString(raw.actionId);
    const position = isRecord(raw.position)
      ? {
          x: typeof raw.position.x === "number" && Number.isFinite(raw.position.x) ? raw.position.x : Number.NaN,
          y: typeof raw.position.y === "number" && Number.isFinite(raw.position.y) ? raw.position.y : Number.NaN,
          coordinateSpace: cleanProviderCoordinateSpace(raw.position.coordinateSpace),
          displayId: cleanString(raw.position.displayId),
        }
      : undefined;
    if (expected.kind === "locate") {
      if (
        position === undefined ||
        !Number.isFinite(position.x) ||
        !Number.isFinite(position.y) ||
        position.coordinateSpace === undefined
      ) {
        return failure("PROVIDER_FAILURE", "computeruse.mouseEmulation locate result is malformed", "provider", context);
      }
      stepResults.push({ index, kind: expected.kind, position: position as MouseEmulationProviderStepResult["position"], metadata: cleanAuditMetadata(raw.metadata) });
      continue;
    }

    if (actionId === undefined) {
      return failure("PROVIDER_FAILURE", "computeruse.mouseEmulation pointer action result is missing actionId", "provider", context);
    }
    stepResults.push({ index, kind: expected.kind, actionId, metadata: cleanAuditMetadata(raw.metadata) });
  }

  return { stepResults, metadata: cleanAuditMetadata(value.metadata) };
}

function normalizeRequest(request: unknown): {
  steps: readonly MouseEmulationStep[];
  context: MouseEmulationContext;
  purpose: string;
  maxSteps: number;
  metadata?: Readonly<Record<string, unknown>>;
  provider?: MouseEmulationProvider;
} | MouseEmulationResult {
  if (request === undefined) request = {};
  if (!isRecord(request)) {
    return failure("INVALID_REQUEST", "computeruse.mouseEmulation request must be an object", "input", undefined);
  }

  const context = normalizeContext(request.context);
  if ("ok" in context) return context;

  const maxSteps =
    request.maxSteps === undefined
      ? mouseEmulationDescriptor.defaultMaxSteps
      : typeof request.maxSteps === "number" && Number.isInteger(request.maxSteps) && request.maxSteps >= 1
        ? request.maxSteps
        : undefined;
  if (maxSteps === undefined) {
    return failure("STEP_LIMIT_EXCEEDED", "computeruse.mouseEmulation maxSteps must be a positive integer", "scope", context);
  }

  const steps = normalizeSteps(request.steps, maxSteps, context);
  if ("ok" in steps) return steps;

  const purpose = cleanString(request.purpose);
  if (purpose === undefined) {
    return failure("MISSING_PURPOSE", "computeruse.mouseEmulation requires an explicit purpose", "input", context);
  }

  if (context.runtimeId === undefined) {
    return failure("MISSING_RUNTIME_ID", "computeruse.mouseEmulation requires context.runtimeId for audit", "input", context);
  }

  const scopes = ensureScopes(context);
  if (scopes !== undefined) return scopes;
  const staticGates = ensureStaticGates(context);
  if (staticGates !== undefined) return staticGates;
  const realGuard = ensureRealExecutionGuard(context);
  if (realGuard !== undefined) return realGuard;

  return {
    steps,
    context,
    purpose,
    maxSteps,
    metadata: cleanAuditMetadata(request.metadata),
    provider: typeof request.provider === "function" ? (request.provider as MouseEmulationProvider) : undefined,
  };
}

function baseOutput(
  steps: readonly MouseEmulationStep[],
  purpose: string,
  maxSteps: number,
  acceptedScopes: readonly string[],
  dryRun: boolean,
  providerCalled: boolean,
): Omit<MouseEmulationOutput, "sequenceEnvelope"> {
  return {
    kind: "agentCore.basicTool.computeruse.mouseEmulation",
    operation: "simulate-mouse-operations",
    purpose,
    steps,
    dispatch: dryRun ? "dry-run" : "runtime-computeruse",
    dryRun,
    providerCalled,
    executionBlocked: dryRun,
    unsafeSideEffects: true,
    permissionsRequired: mouseEmulationDescriptor.permissionsRequired,
    requiresTapApproval: true,
    acceptedScopes,
    runtimeEntry: {
      ports: [
        "BaseToolExecutorPort.computeruse.locateCursor",
        "BaseToolExecutorPort.computeruse.pointerAction",
      ],
      operation: "computeruse.mouseEmulation.pointerSequence",
      runtimeOwnsPointerEvents: true,
      runtimeOwnsCursorObservation: true,
      runtimeOwnsInputPolicy: true,
      baseToolOwnsTapStrategy: false,
    },
  };
}

export async function executeMouseEmulation(request: unknown = {}): Promise<MouseEmulationResult> {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) return normalized;

  const { steps, context, purpose, maxSteps, metadata, provider } = normalized;
  const acceptedScopes = context.requestedScopes ?? [];
  const dryRun = context.dryRun !== false;

  if (dryRun) {
    return {
      ok: true,
      toolId: mouseEmulationDescriptor.toolId,
      output: {
        ...baseOutput(steps, purpose, maxSteps, acceptedScopes, true, false),
        sequenceEnvelope: {
          maxSteps,
          executed: false,
          metadataOnly: true,
          stepResults: steps.map((step, index) => ({
            index,
            kind: step.kind,
            executed: false,
            metadataOnly: true,
          })),
        },
      },
      audit: [auditEvent("agentCore.basicTool.computeruse.mouseEmulation.dryRun", context, metadata)],
      events: ["basicTool.computeruse.mouseEmulation.dryRun"],
    };
  }

  if (provider === undefined) {
    return failure(
      "PROVIDER_UNAVAILABLE",
      "computeruse.mouseEmulation requires runtime executor.computeruse locateCursor and pointerAction support for dryRun:false",
      "provider",
      context,
    );
  }

  let providerResult: MouseEmulationProviderResult;
  try {
    const result = await provider({
      operation: "computeruse.mouseEmulation.pointerSequence",
      steps,
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
    const normalizedResult = normalizeProviderResult(result, steps, context);
    if ("ok" in normalizedResult) return normalizedResult;
    providerResult = normalizedResult;
  } catch {
    return failure(
      "PROVIDER_FAILURE",
      "computeruse.mouseEmulation runtime provider failed without exposing private details",
      "provider",
      context,
    );
  }

  return {
    ok: true,
    toolId: mouseEmulationDescriptor.toolId,
    output: {
      ...baseOutput(steps, purpose, maxSteps, acceptedScopes, false, true),
      sequenceEnvelope: {
        maxSteps,
        executed: true,
        metadataOnly: false,
        stepResults: providerResult.stepResults.map((stepResult) => ({
          index: stepResult.index,
          kind: stepResult.kind,
          executed: true,
          metadataOnly: false,
          actionId: stepResult.actionId,
          position: stepResult.position,
        })),
      },
      providerMetadata: providerResult.metadata,
    },
    audit: [
      auditEvent("agentCore.basicTool.computeruse.mouseEmulation.executed", context, {
        stepCount: providerResult.stepResults.length,
        ...(providerResult.metadata ?? {}),
      }),
    ],
    events: ["basicTool.computeruse.mouseEmulation.executed"],
  };
}

export function planMouseEmulation(request: unknown = {}): Promise<MouseEmulationResult> {
  return executeMouseEmulation(request);
}
