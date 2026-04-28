export type FullscreenScreenRecordingBoundary = "input" | "contract" | "governance" | "scope" | "resource" | "provider";

export type FullscreenScreenRecordingGate = {
  accepted?: boolean;
  allowed?: boolean;
  reason?: string;
};

export type FullscreenScreenRecordingContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: FullscreenScreenRecordingGate;
  contract?: FullscreenScreenRecordingGate;
  governance?: FullscreenScreenRecordingGate;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type FullscreenScreenRecordingOutputFormat = "video/webm" | "video/mp4" | "video/quicktime";

export type FullscreenScreenRecordingTarget = {
  displayId: string;
  maxDurationMs: number;
  includeCursor: boolean;
  includeAudio: boolean;
  outputFormat: FullscreenScreenRecordingOutputFormat;
  destinationHint?: string;
};

export type FullscreenScreenRecordingProviderRequest = {
  operation: "computeruse.fullscreenScreenRecording.start";
  target: FullscreenScreenRecordingTarget;
  context: {
    runtimeId?: string;
    sessionId?: string;
    invocationId?: string;
    auditMetadata?: Readonly<Record<string, unknown>>;
  };
  purpose: string;
};

export type FullscreenScreenRecordingProviderResult = {
  recordingId: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type FullscreenScreenRecordingProvider = (
  request: FullscreenScreenRecordingProviderRequest,
) => Promise<FullscreenScreenRecordingProviderResult> | FullscreenScreenRecordingProviderResult;

export type FullscreenScreenRecordingRequest = {
  target?: unknown;
  context?: unknown;
  displayId?: unknown;
  maxDurationMs?: unknown;
  includeCursor?: unknown;
  includeAudio?: unknown;
  outputFormat?: unknown;
  destinationHint?: unknown;
  purpose?: unknown;
  metadata?: unknown;
  provider?: FullscreenScreenRecordingProvider;
};

export type FullscreenScreenRecordingErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_TARGET"
  | "INVALID_CONTEXT"
  | "MISSING_RUNTIME_ID"
  | "MISSING_PURPOSE"
  | "INVALID_DISPLAY_ID"
  | "INVALID_MAX_DURATION"
  | "INVALID_INCLUDE_CURSOR"
  | "INVALID_INCLUDE_AUDIO"
  | "INVALID_OUTPUT_FORMAT"
  | "INVALID_DESTINATION_HINT"
  | "SCOPE_DENIED"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_FAILURE";

export type FullscreenScreenRecordingError = {
  code: FullscreenScreenRecordingErrorCode;
  message: string;
  boundary: FullscreenScreenRecordingBoundary;
  publicSafe: true;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type FullscreenScreenRecordingAuditEvent = {
  type: string;
  toolId: "computeruse.fullscreenScreenRecording";
  invocationId: string;
  dryRun: boolean;
  displayId?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type FullscreenScreenRecordingOutput = {
  kind: "agentCore.basicTool.computeruse.fullscreenScreenRecording";
  target: FullscreenScreenRecordingTarget;
  purpose: string;
  dispatch: "dry-run" | "runtime-computeruse";
  dryRun: boolean;
  providerCalled: boolean;
  executionBlocked: boolean;
  unsafeSideEffects: true;
  permissionsRequired: readonly ("screen:record" | "display:capture" | "recording:session" | "microphone:record")[];
  requiresTapApproval: true;
  acceptedScopes: readonly string[];
  runtimeEntry: {
    port: "BaseToolExecutorPort.computeruse.startRecording";
    operation: "computeruse.fullscreenScreenRecording.start";
    runtimeOwnsScreenAccess: true;
    runtimeOwnsRecordingSession: true;
    runtimeOwnsArtifactStorage: true;
    baseToolOwnsTapStrategy: false;
  };
  recordingEnvelope: {
    resource: "screen";
    target: "fullscreen";
    started: boolean;
    metadataOnly: boolean;
    recordingId?: string;
  };
  providerMetadata?: Readonly<Record<string, unknown>>;
};

export type FullscreenScreenRecordingResult =
  | {
      ok: true;
      toolId: "computeruse.fullscreenScreenRecording";
      output: FullscreenScreenRecordingOutput;
      audit: readonly FullscreenScreenRecordingAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "computeruse.fullscreenScreenRecording";
      error: FullscreenScreenRecordingError;
      audit: readonly FullscreenScreenRecordingAuditEvent[];
      events: readonly string[];
    };

export const fullscreenScreenRecordingDescriptor = {
  toolId: "computeruse.fullscreenScreenRecording",
  capability: "start-fullscreen-screen-recording",
  route: "agent_executionEngine.basic_toolLayer.baseTools.computeruseBase.screenRecording",
  defaultDryRun: true,
  defaultDisplayId: "primary-display",
  defaultOutputFormat: "video/webm",
  defaultMaxDurationMs: 30_000,
  maxDurationMs: 3_600_000,
  allowedDestinationSchemes: ["artifact://", "session://", "runtime://", "memory://"],
  tapOwnsApproval: true,
  runtimeEntry: "BaseToolExecutorPort.computeruse.startRecording",
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

function cleanGate(value: unknown): FullscreenScreenRecordingGate | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return undefined;
  const gate: FullscreenScreenRecordingGate = {};
  if (typeof value.accepted === "boolean") gate.accepted = value.accepted;
  if (typeof value.allowed === "boolean") gate.allowed = value.allowed;
  const reason = cleanString(value.reason);
  if (reason !== undefined) gate.reason = reason;
  return gate;
}

function cleanAuditMetadata(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return isRecord(value) ? value : undefined;
}

function cleanBoolean(value: unknown, defaultValue: boolean): boolean | undefined {
  if (value === undefined) return defaultValue;
  return typeof value === "boolean" ? value : undefined;
}

function cleanPositiveInteger(value: unknown, defaultValue: number, maxValue: number): number | undefined {
  if (value === undefined) return defaultValue;
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= maxValue ? value : undefined;
}

function cleanOutputFormat(value: unknown): FullscreenScreenRecordingOutputFormat | undefined {
  if (value === undefined) return fullscreenScreenRecordingDescriptor.defaultOutputFormat;
  return value === "video/webm" || value === "video/mp4" || value === "video/quicktime" ? value : undefined;
}

function hasAllowedDestinationScheme(value: string): boolean {
  return fullscreenScreenRecordingDescriptor.allowedDestinationSchemes.some((scheme) => value.startsWith(scheme));
}

function auditEvent(
  type: string,
  context: FullscreenScreenRecordingContext | undefined,
  displayId: string | undefined,
  metadata?: Readonly<Record<string, unknown>>,
): FullscreenScreenRecordingAuditEvent {
  return {
    type,
    toolId: fullscreenScreenRecordingDescriptor.toolId,
    invocationId: context?.invocationId ?? "computeruse.fullscreenScreenRecording:dry-run",
    dryRun: context?.dryRun !== false,
    displayId,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: FullscreenScreenRecordingErrorCode,
  message: string,
  boundary: FullscreenScreenRecordingBoundary,
  context: FullscreenScreenRecordingContext | undefined,
  displayId?: string,
): FullscreenScreenRecordingResult {
  return {
    ok: false,
    toolId: fullscreenScreenRecordingDescriptor.toolId,
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("agentCore.basicTool.computeruse.fullscreenScreenRecording.rejected", context, displayId, { code })],
    events: ["basicTool.computeruse.fullscreenScreenRecording.rejected"],
  };
}

function normalizeContext(value: unknown): FullscreenScreenRecordingContext | FullscreenScreenRecordingResult {
  if (value === undefined) return {};
  if (!isRecord(value)) return failure("INVALID_CONTEXT", "computeruse.fullscreenScreenRecording context must be an object", "input", undefined);

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
      "computeruse.fullscreenScreenRecording context contains malformed guard, governance, or scope fields",
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
  context: FullscreenScreenRecordingContext,
): FullscreenScreenRecordingTarget | FullscreenScreenRecordingResult {
  const targetValue = request.target;
  if (targetValue !== undefined && !isRecord(targetValue)) {
    return failure("INVALID_TARGET", "computeruse.fullscreenScreenRecording target must be an object when provided", "input", context);
  }
  const target = isRecord(targetValue) ? targetValue : {};
  const displayId = cleanString(target.displayId ?? request.displayId) ?? fullscreenScreenRecordingDescriptor.defaultDisplayId;
  const maxDurationMs = cleanPositiveInteger(
    target.maxDurationMs ?? request.maxDurationMs,
    fullscreenScreenRecordingDescriptor.defaultMaxDurationMs,
    fullscreenScreenRecordingDescriptor.maxDurationMs,
  );
  const includeCursor = cleanBoolean(target.includeCursor ?? request.includeCursor, true);
  const includeAudio = cleanBoolean(target.includeAudio ?? request.includeAudio, false);
  const outputFormat = cleanOutputFormat(target.outputFormat ?? request.outputFormat);
  const destinationHintValue = target.destinationHint ?? request.destinationHint;
  const destinationHint = cleanString(destinationHintValue);

  if (displayId.length === 0) {
    return failure("INVALID_DISPLAY_ID", "computeruse.fullscreenScreenRecording displayId must be a safe string", "input", context);
  }
  if (maxDurationMs === undefined) {
    return failure(
      "INVALID_MAX_DURATION",
      "computeruse.fullscreenScreenRecording maxDurationMs must be an integer from 1 to 3600000",
      "resource",
      context,
      displayId,
    );
  }
  if (includeCursor === undefined) {
    return failure("INVALID_INCLUDE_CURSOR", "computeruse.fullscreenScreenRecording includeCursor must be boolean", "input", context, displayId);
  }
  if (includeAudio === undefined) {
    return failure("INVALID_INCLUDE_AUDIO", "computeruse.fullscreenScreenRecording includeAudio must be boolean", "input", context, displayId);
  }
  if (outputFormat === undefined) {
    return failure("INVALID_OUTPUT_FORMAT", "computeruse.fullscreenScreenRecording outputFormat must be video/webm, video/mp4, or video/quicktime", "input", context, displayId);
  }
  if (destinationHintValue !== undefined && (destinationHint === undefined || destinationHint.length > 1024 || !hasAllowedDestinationScheme(destinationHint))) {
    return failure(
      "INVALID_DESTINATION_HINT",
      "computeruse.fullscreenScreenRecording destinationHint must use artifact://, session://, runtime://, or memory://",
      "input",
      context,
      displayId,
    );
  }

  return { displayId, maxDurationMs, includeCursor, includeAudio, outputFormat, destinationHint };
}

function ensureScopes(
  target: FullscreenScreenRecordingTarget,
  context: FullscreenScreenRecordingContext,
): FullscreenScreenRecordingResult | undefined {
  const requested = context.requestedScopes ?? [];
  const allowed = context.allowedScopes ?? [];
  if (requested.length === 0) return undefined;

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length === 0) return undefined;

  return failure(
    "SCOPE_DENIED",
    `computeruse.fullscreenScreenRecording scope ${denied[0]} is outside runtime governance`,
    "scope",
    context,
    target.displayId,
  );
}

function ensureStaticGates(
  target: FullscreenScreenRecordingTarget,
  context: FullscreenScreenRecordingContext,
): FullscreenScreenRecordingResult | undefined {
  if (context.contract?.accepted === false || context.contract?.allowed === false) {
    return failure(
      "CONTRACT_REJECTED",
      context.contract.reason ?? "computeruse.fullscreenScreenRecording was rejected by runtime contract surface",
      "contract",
      context,
      target.displayId,
    );
  }

  if (context.governance?.accepted === false || context.governance?.allowed === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      context.governance.reason ?? "computeruse.fullscreenScreenRecording was rejected by runtime governance",
      "governance",
      context,
      target.displayId,
    );
  }

  return undefined;
}

function ensureRealExecutionGuard(
  target: FullscreenScreenRecordingTarget,
  context: FullscreenScreenRecordingContext,
): FullscreenScreenRecordingResult | undefined {
  if (context.dryRun !== false) return undefined;
  if (context.guard?.accepted === true || context.guard?.allowed === true) return undefined;

  return failure(
    "GOVERNANCE_REJECTED",
    context.guard?.reason ?? "computeruse.fullscreenScreenRecording dryRun:false requires an affirmative runtime guard",
    "governance",
    context,
    target.displayId,
  );
}

function permissionsForTarget(
  target: FullscreenScreenRecordingTarget,
): FullscreenScreenRecordingOutput["permissionsRequired"] {
  return [
    "screen:record",
    "display:capture",
    "recording:session",
    ...(target.includeAudio ? (["microphone:record"] as const) : []),
  ];
}

function baseOutput(
  target: FullscreenScreenRecordingTarget,
  purpose: string,
  acceptedScopes: readonly string[],
  dryRun: boolean,
  providerCalled: boolean,
): Omit<FullscreenScreenRecordingOutput, "recordingEnvelope"> {
  return {
    kind: "agentCore.basicTool.computeruse.fullscreenScreenRecording",
    target,
    purpose,
    dispatch: dryRun ? "dry-run" : "runtime-computeruse",
    dryRun,
    providerCalled,
    executionBlocked: dryRun,
    unsafeSideEffects: true,
    permissionsRequired: permissionsForTarget(target),
    requiresTapApproval: true,
    acceptedScopes,
    runtimeEntry: {
      port: "BaseToolExecutorPort.computeruse.startRecording",
      operation: "computeruse.fullscreenScreenRecording.start",
      runtimeOwnsScreenAccess: true,
      runtimeOwnsRecordingSession: true,
      runtimeOwnsArtifactStorage: true,
      baseToolOwnsTapStrategy: false,
    },
  };
}

function normalizeProviderResult(
  value: unknown,
  context: FullscreenScreenRecordingContext,
  target: FullscreenScreenRecordingTarget,
): FullscreenScreenRecordingProviderResult | FullscreenScreenRecordingResult {
  if (!isRecord(value) || cleanString(value.recordingId) === undefined) {
    return failure(
      "PROVIDER_FAILURE",
      "computeruse.fullscreenScreenRecording runtime provider returned a malformed public-safe recording envelope",
      "provider",
      context,
      target.displayId,
    );
  }

  return {
    recordingId: cleanString(value.recordingId) ?? "",
    metadata: cleanAuditMetadata(value.metadata),
  };
}

function normalizeRequest(request: unknown): {
  target: FullscreenScreenRecordingTarget;
  context: FullscreenScreenRecordingContext;
  purpose: string;
  metadata?: Readonly<Record<string, unknown>>;
  provider?: FullscreenScreenRecordingProvider;
} | FullscreenScreenRecordingResult {
  if (request === undefined) request = {};
  if (!isRecord(request)) return failure("INVALID_REQUEST", "computeruse.fullscreenScreenRecording request must be an object", "input", undefined);

  const context = normalizeContext(request.context);
  if ("ok" in context) return context;

  const target = normalizeTarget(request, context);
  if ("ok" in target) return target;

  const purpose = cleanString(request.purpose);
  if (purpose === undefined) {
    return failure("MISSING_PURPOSE", "computeruse.fullscreenScreenRecording requires an explicit purpose", "input", context, target.displayId);
  }

  if (context.runtimeId === undefined) {
    return failure("MISSING_RUNTIME_ID", "computeruse.fullscreenScreenRecording requires context.runtimeId for audit", "input", context, target.displayId);
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
    provider: typeof request.provider === "function" ? (request.provider as FullscreenScreenRecordingProvider) : undefined,
  };
}

export async function executeFullscreenScreenRecording(request: unknown = {}): Promise<FullscreenScreenRecordingResult> {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) return normalized;

  const { target, context, purpose, metadata, provider } = normalized;
  const acceptedScopes = context.requestedScopes ?? [];
  const dryRun = context.dryRun !== false;

  if (dryRun) {
    return {
      ok: true,
      toolId: fullscreenScreenRecordingDescriptor.toolId,
      output: {
        ...baseOutput(target, purpose, acceptedScopes, true, false),
        recordingEnvelope: {
          resource: "screen",
          target: "fullscreen",
          started: false,
          metadataOnly: true,
        },
      },
      audit: [auditEvent("agentCore.basicTool.computeruse.fullscreenScreenRecording.dryRun", context, target.displayId, metadata)],
      events: ["basicTool.computeruse.fullscreenScreenRecording.dryRun"],
    };
  }

  if (provider === undefined) {
    return failure(
      "PROVIDER_UNAVAILABLE",
      "computeruse.fullscreenScreenRecording requires runtime executor.computeruse.startRecording for dryRun:false",
      "provider",
      context,
      target.displayId,
    );
  }

  let providerResult: FullscreenScreenRecordingProviderResult;
  try {
    const result = await provider({
      operation: "computeruse.fullscreenScreenRecording.start",
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
      "computeruse.fullscreenScreenRecording runtime provider failed without exposing private details",
      "provider",
      context,
      target.displayId,
    );
  }

  return {
    ok: true,
    toolId: fullscreenScreenRecordingDescriptor.toolId,
    output: {
      ...baseOutput(target, purpose, acceptedScopes, false, true),
      recordingEnvelope: {
        resource: "screen",
        target: "fullscreen",
        started: true,
        metadataOnly: false,
        recordingId: providerResult.recordingId,
      },
      providerMetadata: providerResult.metadata,
    },
    audit: [
      auditEvent("agentCore.basicTool.computeruse.fullscreenScreenRecording.started", context, target.displayId, {
        recordingId: providerResult.recordingId,
        ...(providerResult.metadata ?? {}),
      }),
    ],
    events: ["basicTool.computeruse.fullscreenScreenRecording.started"],
  };
}

export function planFullscreenScreenRecording(request: unknown = {}): Promise<FullscreenScreenRecordingResult> {
  return executeFullscreenScreenRecording(request);
}
