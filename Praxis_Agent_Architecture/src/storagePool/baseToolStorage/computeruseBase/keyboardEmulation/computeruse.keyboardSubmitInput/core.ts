export type KeyboardSubmitInputBoundary = "input" | "contract" | "governance" | "scope" | "resource" | "provider";

export type KeyboardSubmitInputGate = {
  accepted?: boolean;
  allowed?: boolean;
  reason?: string;
};

export type KeyboardSubmitKey = "Enter" | "NumpadEnter";

export type KeyboardSubmitInputContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: KeyboardSubmitInputGate;
  contract?: KeyboardSubmitInputGate;
  governance?: KeyboardSubmitInputGate;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type KeyboardSubmitInputTarget = {
  submitKey: KeyboardSubmitKey;
  targetHint?: string;
  repeat: number;
};

export type KeyboardSubmitInputProviderRequest = {
  operation: "computeruse.keyboardSubmitInput.submit";
  target: KeyboardSubmitInputTarget;
  actionIndex: number;
  context: {
    runtimeId?: string;
    sessionId?: string;
    invocationId?: string;
    auditMetadata?: Readonly<Record<string, unknown>>;
  };
  purpose: string;
};

export type KeyboardSubmitInputProviderResult = {
  actionId: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type KeyboardSubmitInputProvider = (
  request: KeyboardSubmitInputProviderRequest,
) => Promise<KeyboardSubmitInputProviderResult> | KeyboardSubmitInputProviderResult;

export type KeyboardSubmitInputRequest = {
  target?: unknown;
  context?: unknown;
  submitKey?: unknown;
  targetHint?: unknown;
  repeat?: unknown;
  purpose?: unknown;
  metadata?: unknown;
  provider?: KeyboardSubmitInputProvider;
};

export type KeyboardSubmitInputErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_TARGET"
  | "INVALID_CONTEXT"
  | "MISSING_RUNTIME_ID"
  | "MISSING_PURPOSE"
  | "INVALID_SUBMIT_KEY"
  | "INVALID_TARGET_HINT"
  | "INVALID_REPEAT"
  | "SCOPE_DENIED"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_FAILURE";

export type KeyboardSubmitInputError = {
  code: KeyboardSubmitInputErrorCode;
  message: string;
  boundary: KeyboardSubmitInputBoundary;
  publicSafe: true;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type KeyboardSubmitInputAuditEvent = {
  type: string;
  toolId: "computeruse.keyboardSubmitInput";
  invocationId: string;
  dryRun: boolean;
  targetHint?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type KeyboardSubmitInputOutput = {
  kind: "agentCore.basicTool.computeruse.keyboardSubmitInput";
  target: KeyboardSubmitInputTarget;
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
    operation: "computeruse.keyboardSubmitInput.submit";
    runtimeOwnsKeyboardEvents: true;
    runtimeOwnsFocusBoundary: true;
    baseToolOwnsTapStrategy: false;
  };
  actionEnvelope: {
    resource: "keyboard";
    action: "submit";
    emitted: boolean;
    metadataOnly: boolean;
    submitKey: KeyboardSubmitKey;
    repeat: number;
    actionIds?: readonly string[];
  };
  providerMetadata?: Readonly<Record<string, unknown>>;
};

export type KeyboardSubmitInputResult =
  | {
      ok: true;
      toolId: "computeruse.keyboardSubmitInput";
      output: KeyboardSubmitInputOutput;
      audit: readonly KeyboardSubmitInputAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "computeruse.keyboardSubmitInput";
      error: KeyboardSubmitInputError;
      audit: readonly KeyboardSubmitInputAuditEvent[];
      events: readonly string[];
    };

export const keyboardSubmitInputDescriptor = {
  toolId: "computeruse.keyboardSubmitInput",
  capability: "keyboard-submit-input",
  route: "agent_executionEngine.basic_toolLayer.baseTools.computeruseBase.keyboardEmulation",
  defaultDryRun: true,
  defaultSubmitKey: "Enter",
  maxRepeat: 5,
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

function cleanGate(value: unknown): KeyboardSubmitInputGate | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return undefined;
  const gate: KeyboardSubmitInputGate = {};
  if (typeof value.accepted === "boolean") gate.accepted = value.accepted;
  if (typeof value.allowed === "boolean") gate.allowed = value.allowed;
  const reason = cleanString(value.reason);
  if (reason !== undefined) gate.reason = reason;
  return gate;
}

function cleanAuditMetadata(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return isRecord(value) ? value : undefined;
}

function cleanSubmitKey(value: unknown): KeyboardSubmitKey | undefined {
  if (value === undefined) return keyboardSubmitInputDescriptor.defaultSubmitKey;
  return value === "Enter" || value === "NumpadEnter" ? value : undefined;
}

function cleanRepeat(value: unknown): number | undefined {
  if (value === undefined) return 1;
  if (typeof value !== "number") return undefined;
  if (!Number.isInteger(value) || value < 1 || value > keyboardSubmitInputDescriptor.maxRepeat) return undefined;
  return value;
}

function auditEvent(
  type: string,
  context: KeyboardSubmitInputContext | undefined,
  targetHint: string | undefined,
  metadata?: Readonly<Record<string, unknown>>,
): KeyboardSubmitInputAuditEvent {
  return {
    type,
    toolId: keyboardSubmitInputDescriptor.toolId,
    invocationId: context?.invocationId ?? "computeruse.keyboardSubmitInput:dry-run",
    dryRun: context?.dryRun !== false,
    targetHint,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: KeyboardSubmitInputErrorCode,
  message: string,
  boundary: KeyboardSubmitInputBoundary,
  context: KeyboardSubmitInputContext | undefined,
  targetHint?: string,
): KeyboardSubmitInputResult {
  return {
    ok: false,
    toolId: keyboardSubmitInputDescriptor.toolId,
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("agentCore.basicTool.computeruse.keyboardSubmitInput.rejected", context, targetHint, { code })],
    events: ["basicTool.computeruse.keyboardSubmitInput.rejected"],
  };
}

function normalizeContext(value: unknown): KeyboardSubmitInputContext | KeyboardSubmitInputResult {
  if (value === undefined) return {};
  if (!isRecord(value)) return failure("INVALID_CONTEXT", "computeruse.keyboardSubmitInput context must be an object", "input", undefined);

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
      "computeruse.keyboardSubmitInput context contains malformed guard, governance, or scope fields",
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
  context: KeyboardSubmitInputContext,
): KeyboardSubmitInputTarget | KeyboardSubmitInputResult {
  const targetValue = request.target;
  if (targetValue !== undefined && !isRecord(targetValue)) {
    return failure("INVALID_TARGET", "computeruse.keyboardSubmitInput target must be an object when provided", "input", context);
  }
  const target = isRecord(targetValue) ? targetValue : {};
  const submitKey = cleanSubmitKey(target.submitKey ?? request.submitKey);
  const targetHint = cleanString(target.targetHint ?? request.targetHint);
  const repeat = cleanRepeat(target.repeat ?? request.repeat);

  if (submitKey === undefined) {
    return failure("INVALID_SUBMIT_KEY", "computeruse.keyboardSubmitInput submitKey must be Enter or NumpadEnter", "input", context, targetHint);
  }
  if (targetHint !== undefined && targetHint.length > 256) {
    return failure("INVALID_TARGET_HINT", "computeruse.keyboardSubmitInput targetHint must be at most 256 characters", "input", context, targetHint);
  }
  if (repeat === undefined) {
    return failure(
      "INVALID_REPEAT",
      `computeruse.keyboardSubmitInput repeat must be an integer from 1 to ${keyboardSubmitInputDescriptor.maxRepeat}`,
      "resource",
      context,
      targetHint,
    );
  }

  return { submitKey, targetHint, repeat };
}

function ensureScopes(target: KeyboardSubmitInputTarget, context: KeyboardSubmitInputContext): KeyboardSubmitInputResult | undefined {
  const requested = context.requestedScopes ?? [];
  const allowed = context.allowedScopes ?? [];
  if (requested.length === 0) return undefined;

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length === 0) return undefined;

  return failure(
    "SCOPE_DENIED",
    `computeruse.keyboardSubmitInput scope ${denied[0]} is outside runtime governance`,
    "scope",
    context,
    target.targetHint,
  );
}

function ensureStaticGates(target: KeyboardSubmitInputTarget, context: KeyboardSubmitInputContext): KeyboardSubmitInputResult | undefined {
  if (context.contract?.accepted === false || context.contract?.allowed === false) {
    return failure(
      "CONTRACT_REJECTED",
      context.contract.reason ?? "computeruse.keyboardSubmitInput was rejected by runtime contract surface",
      "contract",
      context,
      target.targetHint,
    );
  }

  if (context.governance?.accepted === false || context.governance?.allowed === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      context.governance.reason ?? "computeruse.keyboardSubmitInput was rejected by runtime governance",
      "governance",
      context,
      target.targetHint,
    );
  }

  return undefined;
}

function ensureRealExecutionGuard(target: KeyboardSubmitInputTarget, context: KeyboardSubmitInputContext): KeyboardSubmitInputResult | undefined {
  if (context.dryRun !== false) return undefined;
  if (context.guard?.accepted === true || context.guard?.allowed === true) return undefined;

  return failure(
    "GOVERNANCE_REJECTED",
    context.guard?.reason ?? "computeruse.keyboardSubmitInput dryRun:false requires an affirmative runtime guard",
    "governance",
    context,
    target.targetHint,
  );
}

function baseOutput(
  target: KeyboardSubmitInputTarget,
  purpose: string,
  acceptedScopes: readonly string[],
  dryRun: boolean,
  providerCalled: boolean,
): Omit<KeyboardSubmitInputOutput, "actionEnvelope"> {
  return {
    kind: "agentCore.basicTool.computeruse.keyboardSubmitInput",
    target,
    purpose,
    dispatch: dryRun ? "dry-run" : "runtime-computeruse",
    dryRun,
    providerCalled,
    executionBlocked: dryRun,
    unsafeSideEffects: true,
    permissionsRequired: keyboardSubmitInputDescriptor.permissionsRequired,
    requiresTapApproval: true,
    acceptedScopes,
    runtimeEntry: {
      port: "BaseToolExecutorPort.computeruse.keyboardAction",
      operation: "computeruse.keyboardSubmitInput.submit",
      runtimeOwnsKeyboardEvents: true,
      runtimeOwnsFocusBoundary: true,
      baseToolOwnsTapStrategy: false,
    },
  };
}

function normalizeProviderResult(
  value: unknown,
  context: KeyboardSubmitInputContext,
  target: KeyboardSubmitInputTarget,
): KeyboardSubmitInputProviderResult | KeyboardSubmitInputResult {
  if (!isRecord(value) || cleanString(value.actionId) === undefined) {
    return failure(
      "PROVIDER_FAILURE",
      "computeruse.keyboardSubmitInput runtime provider returned a malformed public-safe keyboard action envelope",
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

function normalizeRequest(request: unknown): {
  target: KeyboardSubmitInputTarget;
  context: KeyboardSubmitInputContext;
  purpose: string;
  metadata?: Readonly<Record<string, unknown>>;
  provider?: KeyboardSubmitInputProvider;
} | KeyboardSubmitInputResult {
  if (request === undefined) request = {};
  if (!isRecord(request)) return failure("INVALID_REQUEST", "computeruse.keyboardSubmitInput request must be an object", "input", undefined);

  const context = normalizeContext(request.context);
  if ("ok" in context) return context;

  const target = normalizeTarget(request, context);
  if ("ok" in target) return target;

  const purpose = cleanString(request.purpose);
  if (purpose === undefined) {
    return failure("MISSING_PURPOSE", "computeruse.keyboardSubmitInput requires an explicit purpose", "input", context, target.targetHint);
  }

  if (context.runtimeId === undefined) {
    return failure("MISSING_RUNTIME_ID", "computeruse.keyboardSubmitInput requires context.runtimeId for audit", "input", context, target.targetHint);
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
    provider: typeof request.provider === "function" ? (request.provider as KeyboardSubmitInputProvider) : undefined,
  };
}

export async function executeKeyboardSubmitInput(request: unknown = {}): Promise<KeyboardSubmitInputResult> {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) return normalized;

  const { target, context, purpose, metadata, provider } = normalized;
  const acceptedScopes = context.requestedScopes ?? [];
  const dryRun = context.dryRun !== false;

  if (dryRun) {
    return {
      ok: true,
      toolId: keyboardSubmitInputDescriptor.toolId,
      output: {
        ...baseOutput(target, purpose, acceptedScopes, true, false),
        actionEnvelope: {
          resource: "keyboard",
          action: "submit",
          emitted: false,
          metadataOnly: true,
          submitKey: target.submitKey,
          repeat: target.repeat,
        },
      },
      audit: [auditEvent("agentCore.basicTool.computeruse.keyboardSubmitInput.dryRun", context, target.targetHint, metadata)],
      events: ["basicTool.computeruse.keyboardSubmitInput.dryRun"],
    };
  }

  if (provider === undefined) {
    return failure(
      "PROVIDER_UNAVAILABLE",
      "computeruse.keyboardSubmitInput requires runtime executor.computeruse.keyboardAction for dryRun:false",
      "provider",
      context,
      target.targetHint,
    );
  }

  const actionIds: string[] = [];
  const metadataRecords: Record<string, unknown>[] = [];
  try {
    for (let actionIndex = 0; actionIndex < target.repeat; actionIndex += 1) {
      const result = await provider({
        operation: "computeruse.keyboardSubmitInput.submit",
        target,
        actionIndex,
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
    }
  } catch {
    return failure(
      "PROVIDER_FAILURE",
      "computeruse.keyboardSubmitInput runtime provider failed without exposing private details",
      "provider",
      context,
      target.targetHint,
    );
  }

  return {
    ok: true,
    toolId: keyboardSubmitInputDescriptor.toolId,
    output: {
      ...baseOutput(target, purpose, acceptedScopes, false, true),
      actionEnvelope: {
        resource: "keyboard",
        action: "submit",
        emitted: true,
        metadataOnly: false,
        submitKey: target.submitKey,
        repeat: target.repeat,
        actionIds,
      },
      providerMetadata: {
        actionCount: actionIds.length,
        actionMetadata: metadataRecords,
      },
    },
    audit: [
      auditEvent("agentCore.basicTool.computeruse.keyboardSubmitInput.submitted", context, target.targetHint, {
        actionIds,
        repeat: target.repeat,
      }),
    ],
    events: ["basicTool.computeruse.keyboardSubmitInput.submitted"],
  };
}

export function planKeyboardSubmitInput(request: unknown = {}): Promise<KeyboardSubmitInputResult> {
  return executeKeyboardSubmitInput(request);
}
