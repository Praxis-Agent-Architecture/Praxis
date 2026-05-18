export type InputCheckboxConfirmBoundary = "input" | "contract" | "governance" | "scope" | "provider";

export type InputCheckboxConfirmGate = {
  accepted?: boolean;
  allowed?: boolean;
  reason?: string;
};

export type InputCheckboxConfirmState = "checked" | "unchecked";
export type InputCheckboxConfirmKey = "space" | "enter";

export type InputCheckboxConfirmContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: InputCheckboxConfirmGate;
  contract?: InputCheckboxConfirmGate;
  governance?: InputCheckboxConfirmGate;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type InputCheckboxConfirmTarget = {
  label?: string;
  selectorHint?: string;
  expectedState: InputCheckboxConfirmState;
  currentState?: InputCheckboxConfirmState;
  confirmationKey: InputCheckboxConfirmKey;
  keySequence: readonly ["Space"] | readonly ["Enter"];
  wouldToggle: boolean;
};

export type InputCheckboxConfirmProviderRequest = {
  operation: "computeruse.inputCheckboxConfirm.confirm";
  target: InputCheckboxConfirmTarget;
  context: {
    runtimeId?: string;
    sessionId?: string;
    invocationId?: string;
    auditMetadata?: Readonly<Record<string, unknown>>;
  };
  purpose: string;
};

export type InputCheckboxConfirmProviderResult = {
  actionId: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type InputCheckboxConfirmProvider = (
  request: InputCheckboxConfirmProviderRequest,
) => Promise<InputCheckboxConfirmProviderResult> | InputCheckboxConfirmProviderResult;

export type InputCheckboxConfirmRequest = {
  target?: unknown;
  context?: unknown;
  label?: unknown;
  selectorHint?: unknown;
  expectedState?: unknown;
  currentState?: unknown;
  confirmationKey?: unknown;
  purpose?: unknown;
  metadata?: unknown;
  provider?: InputCheckboxConfirmProvider;
};

export type InputCheckboxConfirmErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_CONTEXT"
  | "MISSING_RUNTIME_ID"
  | "MISSING_PURPOSE"
  | "MISSING_TARGET"
  | "INVALID_TARGET"
  | "INVALID_STATE"
  | "INVALID_CONFIRMATION_KEY"
  | "SCOPE_DENIED"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_FAILURE";

export type InputCheckboxConfirmError = {
  code: InputCheckboxConfirmErrorCode;
  message: string;
  boundary: InputCheckboxConfirmBoundary;
  publicSafe: true;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type InputCheckboxConfirmAuditEvent = {
  type: string;
  toolId: "computeruse.inputCheckboxConfirm";
  invocationId: string;
  dryRun: boolean;
  targetHint?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type InputCheckboxConfirmOutput = {
  kind: "agentCore.basicTool.computeruse.inputCheckboxConfirm";
  target: InputCheckboxConfirmTarget;
  purpose: string;
  dispatch: "dry-run" | "runtime-computeruse";
  dryRun: boolean;
  providerCalled: boolean;
  executionBlocked: boolean;
  unsafeSideEffects: true;
  permissionsRequired: readonly ["keyboard:write", "ui:focus"];
  requiresTapApproval: true;
  acceptedScopes: readonly string[];
  runtimeEntry: {
    port: "BaseToolExecutorPort.computeruse.keyboardAction";
    operation: "computeruse.inputCheckboxConfirm.confirm";
    runtimeOwnsKeyboardEvents: true;
    runtimeOwnsFocusBoundary: true;
    baseToolOwnsTapStrategy: false;
  };
  actionEnvelope: {
    resource: "keyboard";
    action: "confirm";
    emitted: boolean;
    metadataOnly: boolean;
    confirmationKey: InputCheckboxConfirmKey;
    keySequence: readonly ["Space"] | readonly ["Enter"];
    expectedState: InputCheckboxConfirmState;
    currentState?: InputCheckboxConfirmState;
    wouldToggle: boolean;
    actionId?: string;
  };
  providerMetadata?: Readonly<Record<string, unknown>>;
};

export type InputCheckboxConfirmResult =
  | {
      ok: true;
      toolId: "computeruse.inputCheckboxConfirm";
      output: InputCheckboxConfirmOutput;
      audit: readonly InputCheckboxConfirmAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "computeruse.inputCheckboxConfirm";
      error: InputCheckboxConfirmError;
      audit: readonly InputCheckboxConfirmAuditEvent[];
      events: readonly string[];
    };

export const inputCheckboxConfirmDescriptor = {
  toolId: "computeruse.inputCheckboxConfirm",
  capability: "confirm-input-checkbox",
  route: "agent_executionEngine.basic_toolLayer.baseTools.computeruseBase.keyboardEmulation",
  defaultDryRun: true,
  defaultExpectedState: "checked",
  defaultConfirmationKey: "space",
  tapOwnsApproval: true,
  runtimeEntry: "BaseToolExecutorPort.computeruse.keyboardAction",
  permissionsRequired: ["keyboard:write", "ui:focus"],
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

function cleanGate(value: unknown): InputCheckboxConfirmGate | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return undefined;
  const gate: InputCheckboxConfirmGate = {};
  if (typeof value.accepted === "boolean") gate.accepted = value.accepted;
  if (typeof value.allowed === "boolean") gate.allowed = value.allowed;
  const reason = cleanString(value.reason);
  if (reason !== undefined) gate.reason = reason;
  return gate;
}

function cleanState(value: unknown): InputCheckboxConfirmState | undefined {
  if (value === undefined) return undefined;
  return value === "checked" || value === "unchecked" ? value : undefined;
}

function cleanConfirmationKey(value: unknown): InputCheckboxConfirmKey | undefined {
  if (value === undefined) return inputCheckboxConfirmDescriptor.defaultConfirmationKey;
  return value === "space" || value === "enter" ? value : undefined;
}

function keySequenceFor(key: InputCheckboxConfirmKey): readonly ["Space"] | readonly ["Enter"] {
  return key === "space" ? ["Space"] : ["Enter"];
}

function cleanAuditMetadata(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return isRecord(value) ? value : undefined;
}

function targetHint(target: InputCheckboxConfirmTarget | undefined): string | undefined {
  return target?.label ?? target?.selectorHint;
}

function auditEvent(
  type: string,
  context: InputCheckboxConfirmContext | undefined,
  target: InputCheckboxConfirmTarget | undefined,
  metadata?: Readonly<Record<string, unknown>>,
): InputCheckboxConfirmAuditEvent {
  return {
    type,
    toolId: inputCheckboxConfirmDescriptor.toolId,
    invocationId: context?.invocationId ?? "computeruse.inputCheckboxConfirm:dry-run",
    dryRun: context?.dryRun !== false,
    targetHint: targetHint(target),
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: InputCheckboxConfirmErrorCode,
  message: string,
  boundary: InputCheckboxConfirmBoundary,
  context: InputCheckboxConfirmContext | undefined,
  target?: InputCheckboxConfirmTarget,
): InputCheckboxConfirmResult {
  return {
    ok: false,
    toolId: inputCheckboxConfirmDescriptor.toolId,
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("agentCore.basicTool.computeruse.inputCheckboxConfirm.rejected", context, target, { code })],
    events: ["basicTool.computeruse.inputCheckboxConfirm.rejected"],
  };
}

function normalizeContext(value: unknown): InputCheckboxConfirmContext | InputCheckboxConfirmResult {
  if (value === undefined) return {};
  if (!isRecord(value)) return failure("INVALID_CONTEXT", "computeruse.inputCheckboxConfirm context must be an object", "input", undefined);

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
      "computeruse.inputCheckboxConfirm context contains malformed guard, governance, or scope fields",
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

function normalizeTarget(
  request: Record<string, unknown>,
  context: InputCheckboxConfirmContext,
): InputCheckboxConfirmTarget | InputCheckboxConfirmResult {
  const targetValue = request.target;
  if (targetValue === undefined && request.label === undefined && request.selectorHint === undefined) {
    return failure("MISSING_TARGET", "computeruse.inputCheckboxConfirm requires a checkbox target", "input", context);
  }
  if (targetValue !== undefined && !isRecord(targetValue)) {
    return failure("INVALID_TARGET", "computeruse.inputCheckboxConfirm target must be an object when provided", "input", context);
  }

  const target = isRecord(targetValue) ? targetValue : {};
  const label = cleanString(target.label ?? request.label);
  const selectorHint = cleanString(target.selectorHint ?? request.selectorHint);
  if (label === undefined && selectorHint === undefined) {
    return failure("INVALID_TARGET", "computeruse.inputCheckboxConfirm target requires label or selectorHint", "input", context);
  }

  const expectedState = cleanState(target.expectedState ?? request.expectedState ?? inputCheckboxConfirmDescriptor.defaultExpectedState);
  const currentState = cleanState(target.currentState ?? request.currentState);
  if (expectedState === undefined || ((target.currentState ?? request.currentState) !== undefined && currentState === undefined)) {
    return failure("INVALID_STATE", "computeruse.inputCheckboxConfirm state must be checked or unchecked", "input", context);
  }

  const confirmationKey = cleanConfirmationKey(target.confirmationKey ?? request.confirmationKey);
  if (confirmationKey === undefined) {
    return failure("INVALID_CONFIRMATION_KEY", "computeruse.inputCheckboxConfirm confirmationKey must be space or enter", "input", context);
  }

  return {
    label,
    selectorHint,
    expectedState,
    currentState,
    confirmationKey,
    keySequence: keySequenceFor(confirmationKey),
    wouldToggle: currentState === undefined || currentState !== expectedState,
  };
}

function ensureScopes(target: InputCheckboxConfirmTarget, context: InputCheckboxConfirmContext): InputCheckboxConfirmResult | undefined {
  const requested = context.requestedScopes ?? [];
  const allowed = context.allowedScopes ?? [];
  if (requested.length === 0) return undefined;

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length === 0) return undefined;

  return failure(
    "SCOPE_DENIED",
    `computeruse.inputCheckboxConfirm scope ${denied[0]} is outside runtime governance`,
    "scope",
    context,
    target,
  );
}

function ensureStaticGates(target: InputCheckboxConfirmTarget, context: InputCheckboxConfirmContext): InputCheckboxConfirmResult | undefined {
  if (context.contract?.accepted === false || context.contract?.allowed === false) {
    return failure(
      "CONTRACT_REJECTED",
      context.contract.reason ?? "computeruse.inputCheckboxConfirm was rejected by runtime contract surface",
      "contract",
      context,
      target,
    );
  }

  if (context.governance?.accepted === false || context.governance?.allowed === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      context.governance.reason ?? "computeruse.inputCheckboxConfirm was rejected by runtime governance",
      "governance",
      context,
      target,
    );
  }

  return undefined;
}

function ensureRealExecutionGuard(target: InputCheckboxConfirmTarget, context: InputCheckboxConfirmContext): InputCheckboxConfirmResult | undefined {
  if (context.dryRun !== false) return undefined;
  if (context.guard?.accepted === true || context.guard?.allowed === true) return undefined;

  return failure(
    "GOVERNANCE_REJECTED",
    context.guard?.reason ?? "computeruse.inputCheckboxConfirm dryRun:false requires an affirmative runtime guard",
    "governance",
    context,
    target,
  );
}

function baseOutput(
  target: InputCheckboxConfirmTarget,
  purpose: string,
  acceptedScopes: readonly string[],
  dryRun: boolean,
  providerCalled: boolean,
): Omit<InputCheckboxConfirmOutput, "actionEnvelope"> {
  return {
    kind: "agentCore.basicTool.computeruse.inputCheckboxConfirm",
    target,
    purpose,
    dispatch: dryRun ? "dry-run" : "runtime-computeruse",
    dryRun,
    providerCalled,
    executionBlocked: dryRun,
    unsafeSideEffects: true,
    permissionsRequired: inputCheckboxConfirmDescriptor.permissionsRequired,
    requiresTapApproval: true,
    acceptedScopes,
    runtimeEntry: {
      port: "BaseToolExecutorPort.computeruse.keyboardAction",
      operation: "computeruse.inputCheckboxConfirm.confirm",
      runtimeOwnsKeyboardEvents: true,
      runtimeOwnsFocusBoundary: true,
      baseToolOwnsTapStrategy: false,
    },
  };
}

function normalizeProviderResult(
  value: unknown,
  context: InputCheckboxConfirmContext,
  target: InputCheckboxConfirmTarget,
): InputCheckboxConfirmProviderResult | InputCheckboxConfirmResult {
  if (!isRecord(value) || cleanString(value.actionId) === undefined) {
    return failure(
      "PROVIDER_FAILURE",
      "computeruse.inputCheckboxConfirm runtime provider returned a malformed public-safe keyboard action envelope",
      "provider",
      context,
      target,
    );
  }
  return {
    actionId: cleanString(value.actionId) ?? "",
    metadata: cleanAuditMetadata(value.metadata),
  };
}

function normalizeRequest(request: unknown): {
  target: InputCheckboxConfirmTarget;
  context: InputCheckboxConfirmContext;
  purpose: string;
  metadata?: Readonly<Record<string, unknown>>;
  provider?: InputCheckboxConfirmProvider;
} | InputCheckboxConfirmResult {
  if (request === undefined) request = {};
  if (!isRecord(request)) return failure("INVALID_REQUEST", "computeruse.inputCheckboxConfirm request must be an object", "input", undefined);

  const context = normalizeContext(request.context);
  if ("ok" in context) return context;

  const target = normalizeTarget(request, context);
  if ("ok" in target) return target;

  const purpose = cleanString(request.purpose);
  if (purpose === undefined) {
    return failure("MISSING_PURPOSE", "computeruse.inputCheckboxConfirm requires an explicit purpose", "input", context, target);
  }

  if (context.runtimeId === undefined) {
    return failure("MISSING_RUNTIME_ID", "computeruse.inputCheckboxConfirm requires context.runtimeId for audit", "input", context, target);
  }

  const scopes = ensureScopes(target, context);
  if (scopes !== undefined) return scopes;

  const staticGates = ensureStaticGates(target, context);
  if (staticGates !== undefined) return staticGates;

  const realGuard = ensureRealExecutionGuard(target, context);
  if (realGuard !== undefined) return realGuard;

  return {
    target,
    context,
    purpose,
    metadata: cleanAuditMetadata(request.metadata),
    provider: typeof request.provider === "function" ? (request.provider as InputCheckboxConfirmProvider) : undefined,
  };
}

function actionEnvelope(
  target: InputCheckboxConfirmTarget,
  emitted: boolean,
  metadataOnly: boolean,
  actionId?: string,
): InputCheckboxConfirmOutput["actionEnvelope"] {
  return {
    resource: "keyboard",
    action: "confirm",
    emitted,
    metadataOnly,
    confirmationKey: target.confirmationKey,
    keySequence: target.keySequence,
    expectedState: target.expectedState,
    currentState: target.currentState,
    wouldToggle: target.wouldToggle,
    actionId,
  };
}

export async function executeInputCheckboxConfirm(request: unknown = {}): Promise<InputCheckboxConfirmResult> {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) return normalized;

  const { target, context, purpose, metadata, provider } = normalized;
  const acceptedScopes = context.requestedScopes ?? [];
  const dryRun = context.dryRun !== false;

  if (dryRun || !target.wouldToggle) {
    return {
      ok: true,
      toolId: inputCheckboxConfirmDescriptor.toolId,
      output: {
        ...baseOutput(target, purpose, acceptedScopes, dryRun, false),
        actionEnvelope: actionEnvelope(target, false, true),
      },
      audit: [
        auditEvent(
          dryRun
            ? "agentCore.basicTool.computeruse.inputCheckboxConfirm.dryRun"
            : "agentCore.basicTool.computeruse.inputCheckboxConfirm.alreadyConfirmed",
          context,
          target,
          metadata,
        ),
      ],
      events: [
        dryRun
          ? "basicTool.computeruse.inputCheckboxConfirm.dryRun"
          : "basicTool.computeruse.inputCheckboxConfirm.alreadyConfirmed",
      ],
    };
  }

  if (provider === undefined) {
    return failure(
      "PROVIDER_UNAVAILABLE",
      "computeruse.inputCheckboxConfirm requires runtime executor.computeruse.keyboardAction for dryRun:false",
      "provider",
      context,
      target,
    );
  }

  try {
    const result = await provider({
      operation: "computeruse.inputCheckboxConfirm.confirm",
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
    const normalizedResult = normalizeProviderResult(result, context, target);
    if ("ok" in normalizedResult) return normalizedResult;

    return {
      ok: true,
      toolId: inputCheckboxConfirmDescriptor.toolId,
      output: {
        ...baseOutput(target, purpose, acceptedScopes, false, true),
        actionEnvelope: actionEnvelope(target, true, false, normalizedResult.actionId),
        providerMetadata: normalizedResult.metadata,
      },
      audit: [
        auditEvent("agentCore.basicTool.computeruse.inputCheckboxConfirm.confirmed", context, target, {
          actionId: normalizedResult.actionId,
          wouldToggle: target.wouldToggle,
        }),
      ],
      events: ["basicTool.computeruse.inputCheckboxConfirm.confirmed"],
    };
  } catch {
    return failure(
      "PROVIDER_FAILURE",
      "computeruse.inputCheckboxConfirm runtime provider failed without exposing private details",
      "provider",
      context,
      target,
    );
  }
}

export function planInputCheckboxConfirm(request: unknown = {}): Promise<InputCheckboxConfirmResult> {
  return executeInputCheckboxConfirm(request);
}
