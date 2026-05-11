export type KeyboardEmulationBoundary = "input" | "contract" | "governance" | "scope" | "resource" | "provider";

export type KeyboardEmulationGate = {
  accepted?: boolean;
  allowed?: boolean;
  reason?: string;
};

export type KeyboardEmulationAction =
  | {
      kind: "key-press";
      key: string;
      repeat: number;
    }
  | {
      kind: "text";
      text: string;
    }
  | {
      kind: "shortcut";
      keys: readonly string[];
    };

export type KeyboardEmulationActionSummary =
  | {
      kind: "key-press";
      key: string;
      repeat: number;
    }
  | {
      kind: "text";
      textCharacters: number;
      textBytes: number;
    }
  | {
      kind: "shortcut";
      keys: readonly string[];
    };

export type KeyboardEmulationContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: KeyboardEmulationGate;
  contract?: KeyboardEmulationGate;
  governance?: KeyboardEmulationGate;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type KeyboardEmulationTarget = {
  actions: readonly KeyboardEmulationAction[];
  targetHint?: string;
};

export type KeyboardEmulationProviderRequest = {
  operation: "computeruse.keyboardEmulation.emit";
  action: KeyboardEmulationAction;
  actionIndex: number;
  targetHint?: string;
  context: {
    runtimeId?: string;
    sessionId?: string;
    invocationId?: string;
    auditMetadata?: Readonly<Record<string, unknown>>;
  };
  purpose: string;
};

export type KeyboardEmulationProviderResult = {
  actionId: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type KeyboardEmulationProvider = (
  request: KeyboardEmulationProviderRequest,
) => Promise<KeyboardEmulationProviderResult> | KeyboardEmulationProviderResult;

export type KeyboardEmulationRequest = {
  target?: unknown;
  context?: unknown;
  actions?: unknown;
  targetHint?: unknown;
  purpose?: unknown;
  metadata?: unknown;
  provider?: KeyboardEmulationProvider;
};

export type KeyboardEmulationErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_TARGET"
  | "INVALID_CONTEXT"
  | "MISSING_RUNTIME_ID"
  | "MISSING_PURPOSE"
  | "MISSING_ACTIONS"
  | "INVALID_ACTIONS"
  | "INVALID_ACTION"
  | "TOO_MANY_ACTIONS"
  | "INVALID_TARGET_HINT"
  | "SCOPE_DENIED"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_FAILURE";

export type KeyboardEmulationError = {
  code: KeyboardEmulationErrorCode;
  message: string;
  boundary: KeyboardEmulationBoundary;
  publicSafe: true;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type KeyboardEmulationAuditEvent = {
  type: string;
  toolId: "computeruse.keyboardEmulation";
  invocationId: string;
  dryRun: boolean;
  targetHint?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type KeyboardEmulationOutput = {
  kind: "agentCore.basicTool.computeruse.keyboardEmulation";
  target: {
    actions: readonly KeyboardEmulationActionSummary[];
    targetHint?: string;
  };
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
    operation: "computeruse.keyboardEmulation.emit";
    runtimeOwnsKeyboardEvents: true;
    runtimeOwnsFocusBoundary: true;
    baseToolOwnsTapStrategy: false;
  };
  actionEnvelope: {
    resource: "keyboard";
    action: "sequence";
    emitted: boolean;
    metadataOnly: boolean;
    actionCount: number;
    actionIds?: readonly string[];
  };
  providerMetadata?: Readonly<Record<string, unknown>>;
};

export type KeyboardEmulationResult =
  | {
      ok: true;
      toolId: "computeruse.keyboardEmulation";
      output: KeyboardEmulationOutput;
      audit: readonly KeyboardEmulationAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "computeruse.keyboardEmulation";
      error: KeyboardEmulationError;
      audit: readonly KeyboardEmulationAuditEvent[];
      events: readonly string[];
    };

export const keyboardEmulationDescriptor = {
  toolId: "computeruse.keyboardEmulation",
  capability: "keyboard-emulation-sequence",
  route: "agent_executionEngine.basic_toolLayer.baseTools.computeruseBase.keyboardEmulation",
  defaultDryRun: true,
  maxActions: 64,
  maxTextLength: 4096,
  maxKeyRepeat: 100,
  maxShortcutKeys: 5,
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

function cleanText(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 && !value.includes("\0") ? value : undefined;
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

function cleanGate(value: unknown): KeyboardEmulationGate | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return undefined;
  const gate: KeyboardEmulationGate = {};
  if (typeof value.accepted === "boolean") gate.accepted = value.accepted;
  if (typeof value.allowed === "boolean") gate.allowed = value.allowed;
  const reason = cleanString(value.reason);
  if (reason !== undefined) gate.reason = reason;
  return gate;
}

function cleanAuditMetadata(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return isRecord(value) ? value : undefined;
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function summarizeAction(action: KeyboardEmulationAction): KeyboardEmulationActionSummary {
  if (action.kind === "text") {
    return { kind: "text", textCharacters: action.text.length, textBytes: byteLength(action.text) };
  }
  if (action.kind === "shortcut") {
    return { kind: "shortcut", keys: action.keys };
  }
  return { kind: "key-press", key: action.key, repeat: action.repeat };
}

function keyboardDispatchCount(actions: readonly KeyboardEmulationAction[]): number {
  return actions.reduce((count, action) => count + (action.kind === "key-press" ? action.repeat : 1), 0);
}

function auditEvent(
  type: string,
  context: KeyboardEmulationContext | undefined,
  targetHint: string | undefined,
  metadata?: Readonly<Record<string, unknown>>,
): KeyboardEmulationAuditEvent {
  return {
    type,
    toolId: keyboardEmulationDescriptor.toolId,
    invocationId: context?.invocationId ?? "computeruse.keyboardEmulation:dry-run",
    dryRun: context?.dryRun !== false,
    targetHint,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: KeyboardEmulationErrorCode,
  message: string,
  boundary: KeyboardEmulationBoundary,
  context: KeyboardEmulationContext | undefined,
  targetHint?: string,
): KeyboardEmulationResult {
  return {
    ok: false,
    toolId: keyboardEmulationDescriptor.toolId,
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("agentCore.basicTool.computeruse.keyboardEmulation.rejected", context, targetHint, { code })],
    events: ["basicTool.computeruse.keyboardEmulation.rejected"],
  };
}

function normalizeContext(value: unknown): KeyboardEmulationContext | KeyboardEmulationResult {
  if (value === undefined) return {};
  if (!isRecord(value)) return failure("INVALID_CONTEXT", "computeruse.keyboardEmulation context must be an object", "input", undefined);

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
      "computeruse.keyboardEmulation context contains malformed guard, governance, or scope fields",
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

function normalizeAction(value: unknown, context: KeyboardEmulationContext, targetHint: string | undefined): KeyboardEmulationAction | KeyboardEmulationResult {
  if (!isRecord(value)) {
    return failure("INVALID_ACTION", "computeruse.keyboardEmulation action must be an object", "input", context, targetHint);
  }

  if (value.kind === "key-press") {
    const key = cleanString(value.key);
    const repeat = value.repeat === undefined ? 1 : value.repeat;
    if (
      key === undefined ||
      typeof repeat !== "number" ||
      !Number.isInteger(repeat) ||
      repeat < 1 ||
      repeat > keyboardEmulationDescriptor.maxKeyRepeat
    ) {
      return failure(
        "INVALID_ACTION",
        `computeruse.keyboardEmulation key-press requires a safe key and repeat 1..${keyboardEmulationDescriptor.maxKeyRepeat}`,
        "input",
        context,
        targetHint,
      );
    }
    return { kind: "key-press", key, repeat };
  }

  if (value.kind === "text") {
    const text = cleanText(value.text);
    if (text === undefined || text.length > keyboardEmulationDescriptor.maxTextLength) {
      return failure(
        "INVALID_ACTION",
        `computeruse.keyboardEmulation text action must be non-empty and at most ${keyboardEmulationDescriptor.maxTextLength} characters`,
        "input",
        context,
        targetHint,
      );
    }
    return { kind: "text", text };
  }

  if (value.kind === "shortcut") {
    const keys = cleanStringList(value.keys);
    if (keys === undefined || keys.length < 2 || keys.length > keyboardEmulationDescriptor.maxShortcutKeys) {
      return failure(
        "INVALID_ACTION",
        `computeruse.keyboardEmulation shortcut requires 2..${keyboardEmulationDescriptor.maxShortcutKeys} safe keys`,
        "input",
        context,
        targetHint,
      );
    }
    return { kind: "shortcut", keys };
  }

  return failure("INVALID_ACTION", "computeruse.keyboardEmulation action kind is not supported", "input", context, targetHint);
}

function normalizeActions(value: unknown, context: KeyboardEmulationContext, targetHint: string | undefined): readonly KeyboardEmulationAction[] | KeyboardEmulationResult {
  if (value === undefined) {
    return failure("MISSING_ACTIONS", "computeruse.keyboardEmulation requires at least one keyboard action", "input", context, targetHint);
  }
  if (!Array.isArray(value)) {
    return failure("INVALID_ACTIONS", "computeruse.keyboardEmulation actions must be an array", "input", context, targetHint);
  }
  if (value.length === 0) {
    return failure("MISSING_ACTIONS", "computeruse.keyboardEmulation requires at least one keyboard action", "input", context, targetHint);
  }
  if (value.length > keyboardEmulationDescriptor.maxActions) {
    return failure("TOO_MANY_ACTIONS", "computeruse.keyboardEmulation action count is outside the resource limit", "resource", context, targetHint);
  }

  const actions: KeyboardEmulationAction[] = [];
  for (const action of value) {
    const normalized = normalizeAction(action, context, targetHint);
    if ("ok" in normalized) return normalized;
    actions.push(normalized);
  }
  return actions;
}

function normalizeTarget(
  request: Record<string, unknown>,
  context: KeyboardEmulationContext,
): KeyboardEmulationTarget | KeyboardEmulationResult {
  const targetValue = request.target;
  if (targetValue !== undefined && !isRecord(targetValue)) {
    return failure("INVALID_TARGET", "computeruse.keyboardEmulation target must be an object when provided", "input", context);
  }
  const target = isRecord(targetValue) ? targetValue : {};
  const targetHint = cleanString(target.targetHint ?? request.targetHint);
  if ((target.targetHint ?? request.targetHint) !== undefined && targetHint === undefined) {
    return failure("INVALID_TARGET_HINT", "computeruse.keyboardEmulation targetHint must be a safe non-empty string", "input", context);
  }

  const actions = normalizeActions(target.actions ?? request.actions, context, targetHint);
  if ("ok" in actions) return actions;
  return { actions, targetHint };
}

function ensureScopes(target: KeyboardEmulationTarget, context: KeyboardEmulationContext): KeyboardEmulationResult | undefined {
  const requested = context.requestedScopes ?? [];
  const allowed = context.allowedScopes ?? [];
  if (requested.length === 0) return undefined;

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length === 0) return undefined;

  return failure(
    "SCOPE_DENIED",
    `computeruse.keyboardEmulation scope ${denied[0]} is outside runtime governance`,
    "scope",
    context,
    target.targetHint,
  );
}

function ensureStaticGates(target: KeyboardEmulationTarget, context: KeyboardEmulationContext): KeyboardEmulationResult | undefined {
  if (context.contract?.accepted === false || context.contract?.allowed === false) {
    return failure(
      "CONTRACT_REJECTED",
      context.contract.reason ?? "computeruse.keyboardEmulation was rejected by runtime contract surface",
      "contract",
      context,
      target.targetHint,
    );
  }

  if (context.governance?.accepted === false || context.governance?.allowed === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      context.governance.reason ?? "computeruse.keyboardEmulation was rejected by runtime governance",
      "governance",
      context,
      target.targetHint,
    );
  }

  return undefined;
}

function ensureRealExecutionGuard(target: KeyboardEmulationTarget, context: KeyboardEmulationContext): KeyboardEmulationResult | undefined {
  if (context.dryRun !== false) return undefined;
  if (context.guard?.accepted === true || context.guard?.allowed === true) return undefined;

  return failure(
    "GOVERNANCE_REJECTED",
    context.guard?.reason ?? "computeruse.keyboardEmulation dryRun:false requires an affirmative runtime guard",
    "governance",
    context,
    target.targetHint,
  );
}

function baseOutput(
  target: KeyboardEmulationTarget,
  purpose: string,
  acceptedScopes: readonly string[],
  dryRun: boolean,
  providerCalled: boolean,
): Omit<KeyboardEmulationOutput, "actionEnvelope"> {
  return {
    kind: "agentCore.basicTool.computeruse.keyboardEmulation",
    target: {
      actions: target.actions.map(summarizeAction),
      targetHint: target.targetHint,
    },
    purpose,
    dispatch: dryRun ? "dry-run" : "runtime-computeruse",
    dryRun,
    providerCalled,
    executionBlocked: dryRun,
    unsafeSideEffects: true,
    permissionsRequired: keyboardEmulationDescriptor.permissionsRequired,
    requiresTapApproval: true,
    acceptedScopes,
    runtimeEntry: {
      port: "BaseToolExecutorPort.computeruse.keyboardAction",
      operation: "computeruse.keyboardEmulation.emit",
      runtimeOwnsKeyboardEvents: true,
      runtimeOwnsFocusBoundary: true,
      baseToolOwnsTapStrategy: false,
    },
  };
}

function normalizeProviderResult(
  value: unknown,
  context: KeyboardEmulationContext,
  target: KeyboardEmulationTarget,
): KeyboardEmulationProviderResult | KeyboardEmulationResult {
  if (!isRecord(value) || cleanString(value.actionId) === undefined) {
    return failure(
      "PROVIDER_FAILURE",
      "computeruse.keyboardEmulation runtime provider returned a malformed public-safe keyboard action envelope",
      "provider",
      context,
      target.targetHint,
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
  target: KeyboardEmulationTarget;
  context: KeyboardEmulationContext;
  purpose: string;
  metadata?: Readonly<Record<string, unknown>>;
  provider?: KeyboardEmulationProvider;
} | KeyboardEmulationResult {
  if (request === undefined) request = {};
  if (!isRecord(request)) return failure("INVALID_REQUEST", "computeruse.keyboardEmulation request must be an object", "input", undefined);

  const context = normalizeContext(request.context);
  if ("ok" in context) return context;

  const target = normalizeTarget(request, context);
  if ("ok" in target) return target;

  const purpose = cleanString(request.purpose);
  if (purpose === undefined) {
    return failure("MISSING_PURPOSE", "computeruse.keyboardEmulation requires an explicit purpose", "input", context, target.targetHint);
  }

  if (context.runtimeId === undefined) {
    return failure("MISSING_RUNTIME_ID", "computeruse.keyboardEmulation requires context.runtimeId for audit", "input", context, target.targetHint);
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
    provider: typeof request.provider === "function" ? (request.provider as KeyboardEmulationProvider) : undefined,
  };
}

export async function executeKeyboardEmulation(request: unknown = {}): Promise<KeyboardEmulationResult> {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) return normalized;

  const { target, context, purpose, metadata, provider } = normalized;
  const acceptedScopes = context.requestedScopes ?? [];
  const dryRun = context.dryRun !== false;
  const dispatchCount = keyboardDispatchCount(target.actions);

  if (dryRun) {
    return {
      ok: true,
      toolId: keyboardEmulationDescriptor.toolId,
      output: {
        ...baseOutput(target, purpose, acceptedScopes, true, false),
        actionEnvelope: {
          resource: "keyboard",
          action: "sequence",
          emitted: false,
          metadataOnly: true,
          actionCount: dispatchCount,
        },
      },
      audit: [auditEvent("agentCore.basicTool.computeruse.keyboardEmulation.dryRun", context, target.targetHint, metadata)],
      events: ["basicTool.computeruse.keyboardEmulation.dryRun"],
    };
  }

  if (provider === undefined) {
    return failure(
      "PROVIDER_UNAVAILABLE",
      "computeruse.keyboardEmulation requires runtime executor.computeruse.keyboardAction for dryRun:false",
      "provider",
      context,
      target.targetHint,
    );
  }

  const actionIds: string[] = [];
  const metadataRecords: Record<string, unknown>[] = [];
  try {
    let actionIndex = 0;
    for (const action of target.actions) {
      let remainingRepeats = action.kind === "key-press" ? action.repeat : 1;
      while (remainingRepeats > 0) {
        const runtimeAction: KeyboardEmulationAction =
          action.kind === "key-press"
            ? {
                kind: "key-press",
                key: action.key,
                repeat: 1,
              }
            : action;
        const result = await provider({
          operation: "computeruse.keyboardEmulation.emit",
          action: runtimeAction,
          actionIndex,
          targetHint: target.targetHint,
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
        actionIds.push(normalizedResult.actionId);
        metadataRecords.push(normalizedResult.metadata ?? {});
        actionIndex += 1;
        remainingRepeats -= 1;
      }
    }
  } catch (error) {
    const providerMessage = publicSafeProviderFailureMessage(error);
    const failed = failure(
      "PROVIDER_FAILURE",
      providerMessage === undefined
        ? "computeruse.keyboardEmulation runtime provider failed without exposing private details"
        : `computeruse.keyboardEmulation runtime provider failed: ${providerMessage}`,
      "provider",
      context,
      target.targetHint,
    );
    if (!failed.ok && providerMessage !== undefined) {
      return {
        ...failed,
        audit: [
          auditEvent("agentCore.basicTool.computeruse.keyboardEmulation.providerFailed", context, target.targetHint, {
            code: "PROVIDER_FAILURE",
            providerMessage,
          }),
        ],
      };
    }
    return failed;
  }

  return {
    ok: true,
    toolId: keyboardEmulationDescriptor.toolId,
    output: {
      ...baseOutput(target, purpose, acceptedScopes, false, true),
      actionEnvelope: {
        resource: "keyboard",
        action: "sequence",
        emitted: true,
        metadataOnly: false,
        actionCount: dispatchCount,
        actionIds,
      },
      providerMetadata: {
        actionCount: actionIds.length,
        actionMetadata: metadataRecords,
      },
    },
    audit: [
      auditEvent("agentCore.basicTool.computeruse.keyboardEmulation.emitted", context, target.targetHint, {
        actionIds,
        actionCount: dispatchCount,
      }),
    ],
    events: ["basicTool.computeruse.keyboardEmulation.emitted"],
  };
}

export function planKeyboardEmulation(request: unknown = {}): Promise<KeyboardEmulationResult> {
  return executeKeyboardEmulation(request);
}
