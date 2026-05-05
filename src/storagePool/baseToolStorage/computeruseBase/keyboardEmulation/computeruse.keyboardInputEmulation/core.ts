export type KeyboardInputEmulationBoundary = "input" | "contract" | "governance" | "scope" | "resource" | "provider";

export type KeyboardInputEmulationGate = {
  accepted?: boolean;
  allowed?: boolean;
  reason?: string;
};

export type KeyboardInputMode = "text" | "paste";

export type KeyboardInputEmulationContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: KeyboardInputEmulationGate;
  contract?: KeyboardInputEmulationGate;
  governance?: KeyboardInputEmulationGate;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type KeyboardInputEmulationTarget = {
  text: string;
  inputMode: KeyboardInputMode;
  targetHint?: string;
  maxTextLength: number;
};

export type KeyboardInputEmulationProviderRequest = {
  operation: "computeruse.keyboardInputEmulation.type";
  target: KeyboardInputEmulationTarget;
  context: {
    runtimeId?: string;
    sessionId?: string;
    invocationId?: string;
    auditMetadata?: Readonly<Record<string, unknown>>;
  };
  purpose: string;
};

export type KeyboardInputEmulationProviderResult = {
  actionId: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type KeyboardInputEmulationProvider = (
  request: KeyboardInputEmulationProviderRequest,
) => Promise<KeyboardInputEmulationProviderResult> | KeyboardInputEmulationProviderResult;

export type KeyboardInputEmulationRequest = {
  target?: unknown;
  context?: unknown;
  text?: unknown;
  inputMode?: unknown;
  targetHint?: unknown;
  maxTextLength?: unknown;
  purpose?: unknown;
  metadata?: unknown;
  provider?: KeyboardInputEmulationProvider;
};

export type KeyboardInputEmulationErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_TARGET"
  | "INVALID_CONTEXT"
  | "MISSING_RUNTIME_ID"
  | "MISSING_PURPOSE"
  | "MISSING_TEXT"
  | "INVALID_TEXT"
  | "INVALID_INPUT_MODE"
  | "INVALID_TARGET_HINT"
  | "INVALID_TEXT_LIMIT"
  | "TEXT_LIMIT_EXCEEDED"
  | "SCOPE_DENIED"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_FAILURE";

export type KeyboardInputEmulationError = {
  code: KeyboardInputEmulationErrorCode;
  message: string;
  boundary: KeyboardInputEmulationBoundary;
  publicSafe: true;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type KeyboardInputEmulationAuditEvent = {
  type: string;
  toolId: "computeruse.keyboardInputEmulation";
  invocationId: string;
  dryRun: boolean;
  targetHint?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type KeyboardInputEmulationOutput = {
  kind: "agentCore.basicTool.computeruse.keyboardInputEmulation";
  target: Omit<KeyboardInputEmulationTarget, "text"> & {
    textCharacters: number;
    textBytes: number;
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
    operation: "computeruse.keyboardInputEmulation.type";
    runtimeOwnsKeyboardEvents: true;
    runtimeOwnsFocusBoundary: true;
    baseToolOwnsTapStrategy: false;
  };
  actionEnvelope: {
    resource: "keyboard";
    action: "type";
    emitted: boolean;
    metadataOnly: boolean;
    actionId?: string;
    inputMode: KeyboardInputMode;
  };
  providerMetadata?: Readonly<Record<string, unknown>>;
};

export type KeyboardInputEmulationResult =
  | {
      ok: true;
      toolId: "computeruse.keyboardInputEmulation";
      output: KeyboardInputEmulationOutput;
      audit: readonly KeyboardInputEmulationAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "computeruse.keyboardInputEmulation";
      error: KeyboardInputEmulationError;
      audit: readonly KeyboardInputEmulationAuditEvent[];
      events: readonly string[];
    };

export const keyboardInputEmulationDescriptor = {
  toolId: "computeruse.keyboardInputEmulation",
  capability: "keyboard-input-emulation",
  route: "agent_executionEngine.basic_toolLayer.baseTools.computeruseBase.keyboardEmulation",
  defaultDryRun: true,
  defaultInputMode: "text",
  defaultMaxTextLength: 4096,
  maxTextLengthLimit: 16_384,
  tapOwnsApproval: true,
  runtimeEntry: "BaseToolExecutorPort.computeruse.keyboardAction",
  permissionsRequired: ["keyboard:write", "ui:focus"],
  unsafeSideEffects: true,
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 && !value.includes("\0") ? value : undefined;
}

function cleanTrimmedString(value: unknown): string | undefined {
  const text = cleanString(value);
  return text === undefined ? undefined : text.trim();
}

function cleanStringList(value: unknown): readonly string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return undefined;
  const cleaned: string[] = [];
  for (const item of value) {
    const text = cleanTrimmedString(item);
    if (text === undefined) return undefined;
    if (!cleaned.includes(text)) cleaned.push(text);
  }
  return cleaned;
}

function cleanGate(value: unknown): KeyboardInputEmulationGate | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return undefined;
  const gate: KeyboardInputEmulationGate = {};
  if (typeof value.accepted === "boolean") gate.accepted = value.accepted;
  if (typeof value.allowed === "boolean") gate.allowed = value.allowed;
  const reason = cleanTrimmedString(value.reason);
  if (reason !== undefined) gate.reason = reason;
  return gate;
}

function cleanAuditMetadata(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return isRecord(value) ? value : undefined;
}

function cleanInputMode(value: unknown): KeyboardInputMode | undefined {
  if (value === undefined) return keyboardInputEmulationDescriptor.defaultInputMode;
  return value === "text" || value === "paste" ? value : undefined;
}

function cleanMaxTextLength(value: unknown): number | undefined {
  if (value === undefined) return keyboardInputEmulationDescriptor.defaultMaxTextLength;
  if (typeof value !== "number") return undefined;
  if (!Number.isInteger(value) || value < 1 || value > keyboardInputEmulationDescriptor.maxTextLengthLimit) return undefined;
  return value;
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function auditEvent(
  type: string,
  context: KeyboardInputEmulationContext | undefined,
  targetHint: string | undefined,
  metadata?: Readonly<Record<string, unknown>>,
): KeyboardInputEmulationAuditEvent {
  return {
    type,
    toolId: keyboardInputEmulationDescriptor.toolId,
    invocationId: context?.invocationId ?? "computeruse.keyboardInputEmulation:dry-run",
    dryRun: context?.dryRun !== false,
    targetHint,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: KeyboardInputEmulationErrorCode,
  message: string,
  boundary: KeyboardInputEmulationBoundary,
  context: KeyboardInputEmulationContext | undefined,
  targetHint?: string,
): KeyboardInputEmulationResult {
  return {
    ok: false,
    toolId: keyboardInputEmulationDescriptor.toolId,
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("agentCore.basicTool.computeruse.keyboardInputEmulation.rejected", context, targetHint, { code })],
    events: ["basicTool.computeruse.keyboardInputEmulation.rejected"],
  };
}

function normalizeContext(value: unknown): KeyboardInputEmulationContext | KeyboardInputEmulationResult {
  if (value === undefined) return {};
  if (!isRecord(value)) return failure("INVALID_CONTEXT", "computeruse.keyboardInputEmulation context must be an object", "input", undefined);

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
      "computeruse.keyboardInputEmulation context contains malformed guard, governance, or scope fields",
      "input",
      undefined,
    );
  }

  return {
    runtimeId: cleanTrimmedString(value.runtimeId),
    sessionId: cleanTrimmedString(value.sessionId),
    invocationId: cleanTrimmedString(value.invocationId),
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
  context: KeyboardInputEmulationContext,
): KeyboardInputEmulationTarget | KeyboardInputEmulationResult {
  const targetValue = request.target;
  if (targetValue !== undefined && !isRecord(targetValue)) {
    return failure("INVALID_TARGET", "computeruse.keyboardInputEmulation target must be an object when provided", "input", context);
  }
  const target = isRecord(targetValue) ? targetValue : {};
  const text = cleanString(target.text ?? request.text);
  const inputMode = cleanInputMode(target.inputMode ?? request.inputMode);
  const targetHint = cleanTrimmedString(target.targetHint ?? request.targetHint);
  const maxTextLength = cleanMaxTextLength(target.maxTextLength ?? request.maxTextLength);

  if (text === undefined) {
    return failure("MISSING_TEXT", "computeruse.keyboardInputEmulation requires non-empty text", "input", context, targetHint);
  }
  if (text.length > keyboardInputEmulationDescriptor.maxTextLengthLimit) {
    return failure("INVALID_TEXT", "computeruse.keyboardInputEmulation text exceeds the hard text limit", "resource", context, targetHint);
  }
  if (inputMode === undefined) {
    return failure("INVALID_INPUT_MODE", "computeruse.keyboardInputEmulation inputMode must be text or paste", "input", context, targetHint);
  }
  if (targetHint !== undefined && targetHint.length > 256) {
    return failure("INVALID_TARGET_HINT", "computeruse.keyboardInputEmulation targetHint must be at most 256 characters", "input", context, targetHint);
  }
  if (maxTextLength === undefined) {
    return failure(
      "INVALID_TEXT_LIMIT",
      "computeruse.keyboardInputEmulation maxTextLength must be an integer within the configured resource limit",
      "input",
      context,
      targetHint,
    );
  }
  if (text.length > maxTextLength) {
    return failure(
      "TEXT_LIMIT_EXCEEDED",
      "computeruse.keyboardInputEmulation text exceeds the configured resource boundary",
      "resource",
      context,
      targetHint,
    );
  }

  return { text, inputMode, targetHint, maxTextLength };
}

function ensureScopes(target: KeyboardInputEmulationTarget, context: KeyboardInputEmulationContext): KeyboardInputEmulationResult | undefined {
  const requested = context.requestedScopes ?? [];
  const allowed = context.allowedScopes ?? [];
  if (requested.length === 0) return undefined;

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length === 0) return undefined;

  return failure(
    "SCOPE_DENIED",
    `computeruse.keyboardInputEmulation scope ${denied[0]} is outside runtime governance`,
    "scope",
    context,
    target.targetHint,
  );
}

function ensureStaticGates(target: KeyboardInputEmulationTarget, context: KeyboardInputEmulationContext): KeyboardInputEmulationResult | undefined {
  if (context.contract?.accepted === false || context.contract?.allowed === false) {
    return failure(
      "CONTRACT_REJECTED",
      context.contract.reason ?? "computeruse.keyboardInputEmulation was rejected by runtime contract surface",
      "contract",
      context,
      target.targetHint,
    );
  }

  if (context.governance?.accepted === false || context.governance?.allowed === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      context.governance.reason ?? "computeruse.keyboardInputEmulation was rejected by runtime governance",
      "governance",
      context,
      target.targetHint,
    );
  }

  return undefined;
}

function ensureRealExecutionGuard(target: KeyboardInputEmulationTarget, context: KeyboardInputEmulationContext): KeyboardInputEmulationResult | undefined {
  if (context.dryRun !== false) return undefined;
  if (context.guard?.accepted === true || context.guard?.allowed === true) return undefined;

  return failure(
    "GOVERNANCE_REJECTED",
    context.guard?.reason ?? "computeruse.keyboardInputEmulation dryRun:false requires an affirmative runtime guard",
    "governance",
    context,
    target.targetHint,
  );
}

function outputTarget(target: KeyboardInputEmulationTarget): KeyboardInputEmulationOutput["target"] {
  return {
    inputMode: target.inputMode,
    targetHint: target.targetHint,
    maxTextLength: target.maxTextLength,
    textCharacters: target.text.length,
    textBytes: byteLength(target.text),
  };
}

function baseOutput(
  target: KeyboardInputEmulationTarget,
  purpose: string,
  acceptedScopes: readonly string[],
  dryRun: boolean,
  providerCalled: boolean,
): Omit<KeyboardInputEmulationOutput, "actionEnvelope"> {
  return {
    kind: "agentCore.basicTool.computeruse.keyboardInputEmulation",
    target: outputTarget(target),
    purpose,
    dispatch: dryRun ? "dry-run" : "runtime-computeruse",
    dryRun,
    providerCalled,
    executionBlocked: dryRun,
    unsafeSideEffects: true,
    permissionsRequired: keyboardInputEmulationDescriptor.permissionsRequired,
    requiresTapApproval: true,
    acceptedScopes,
    runtimeEntry: {
      port: "BaseToolExecutorPort.computeruse.keyboardAction",
      operation: "computeruse.keyboardInputEmulation.type",
      runtimeOwnsKeyboardEvents: true,
      runtimeOwnsFocusBoundary: true,
      baseToolOwnsTapStrategy: false,
    },
  };
}

function normalizeProviderResult(
  value: unknown,
  context: KeyboardInputEmulationContext,
  target: KeyboardInputEmulationTarget,
): KeyboardInputEmulationProviderResult | KeyboardInputEmulationResult {
  if (!isRecord(value) || cleanTrimmedString(value.actionId) === undefined) {
    return failure(
      "PROVIDER_FAILURE",
      "computeruse.keyboardInputEmulation runtime provider returned a malformed public-safe keyboard action envelope",
      "provider",
      context,
      target.targetHint,
    );
  }

  return {
    actionId: cleanTrimmedString(value.actionId) ?? "",
    metadata: cleanAuditMetadata(value.metadata),
  };
}

function normalizeRequest(request: unknown): {
  target: KeyboardInputEmulationTarget;
  context: KeyboardInputEmulationContext;
  purpose: string;
  metadata?: Readonly<Record<string, unknown>>;
  provider?: KeyboardInputEmulationProvider;
} | KeyboardInputEmulationResult {
  if (request === undefined) request = {};
  if (!isRecord(request)) return failure("INVALID_REQUEST", "computeruse.keyboardInputEmulation request must be an object", "input", undefined);

  const context = normalizeContext(request.context);
  if ("ok" in context) return context;

  const target = normalizeTarget(request, context);
  if ("ok" in target) return target;

  const purpose = cleanTrimmedString(request.purpose);
  if (purpose === undefined) {
    return failure("MISSING_PURPOSE", "computeruse.keyboardInputEmulation requires an explicit purpose", "input", context, target.targetHint);
  }

  if (context.runtimeId === undefined) {
    return failure("MISSING_RUNTIME_ID", "computeruse.keyboardInputEmulation requires context.runtimeId for audit", "input", context, target.targetHint);
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
    provider: typeof request.provider === "function" ? (request.provider as KeyboardInputEmulationProvider) : undefined,
  };
}

export async function executeKeyboardInputEmulation(request: unknown = {}): Promise<KeyboardInputEmulationResult> {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) return normalized;

  const { target, context, purpose, metadata, provider } = normalized;
  const acceptedScopes = context.requestedScopes ?? [];
  const dryRun = context.dryRun !== false;

  if (dryRun) {
    return {
      ok: true,
      toolId: keyboardInputEmulationDescriptor.toolId,
      output: {
        ...baseOutput(target, purpose, acceptedScopes, true, false),
        actionEnvelope: {
          resource: "keyboard",
          action: "type",
          emitted: false,
          metadataOnly: true,
          inputMode: target.inputMode,
        },
      },
      audit: [auditEvent("agentCore.basicTool.computeruse.keyboardInputEmulation.dryRun", context, target.targetHint, metadata)],
      events: ["basicTool.computeruse.keyboardInputEmulation.dryRun"],
    };
  }

  if (provider === undefined) {
    return failure(
      "PROVIDER_UNAVAILABLE",
      "computeruse.keyboardInputEmulation requires runtime executor.computeruse.keyboardAction for dryRun:false",
      "provider",
      context,
      target.targetHint,
    );
  }

  let providerResult: KeyboardInputEmulationProviderResult;
  try {
    const result = await provider({
      operation: "computeruse.keyboardInputEmulation.type",
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
    providerResult = normalizedResult;
  } catch {
    return failure(
      "PROVIDER_FAILURE",
      "computeruse.keyboardInputEmulation runtime provider failed without exposing private details",
      "provider",
      context,
      target.targetHint,
    );
  }

  return {
    ok: true,
    toolId: keyboardInputEmulationDescriptor.toolId,
    output: {
      ...baseOutput(target, purpose, acceptedScopes, false, true),
      actionEnvelope: {
        resource: "keyboard",
        action: "type",
        emitted: true,
        metadataOnly: false,
        actionId: providerResult.actionId,
        inputMode: target.inputMode,
      },
      providerMetadata: providerResult.metadata,
    },
    audit: [
      auditEvent("agentCore.basicTool.computeruse.keyboardInputEmulation.typed", context, target.targetHint, {
        actionId: providerResult.actionId,
        inputMode: target.inputMode,
        ...(providerResult.metadata ?? {}),
      }),
    ],
    events: ["basicTool.computeruse.keyboardInputEmulation.typed"],
  };
}

export function planKeyboardInputEmulation(request: unknown = {}): Promise<KeyboardInputEmulationResult> {
  return executeKeyboardInputEmulation(request);
}
