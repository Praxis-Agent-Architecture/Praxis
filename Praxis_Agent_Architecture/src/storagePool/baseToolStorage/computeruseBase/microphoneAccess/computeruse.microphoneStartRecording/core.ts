export type MicrophoneStartRecordingBoundary =
  | "input"
  | "contract"
  | "governance"
  | "scope"
  | "resource"
  | "provider";

export type MicrophoneStartRecordingGate = {
  accepted?: boolean;
  allowed?: boolean;
  reason?: string;
};

export type MicrophoneStartRecordingContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: MicrophoneStartRecordingGate;
  contract?: MicrophoneStartRecordingGate;
  governance?: MicrophoneStartRecordingGate;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  allowedDeviceIds?: readonly string[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type MicrophoneStartRecordingOutputFormat = "audio/wav" | "audio/webm" | "audio/mpeg";

export type MicrophoneStartRecordingTarget = {
  deviceId: string;
  maxDurationMs: number;
  sampleRateHz: number;
  channelCount: number;
  outputFormat: MicrophoneStartRecordingOutputFormat;
  permissionLeaseId?: string;
  recordingLabel?: string;
  destinationHint?: string;
};

export type MicrophoneStartRecordingProviderRequest = {
  operation: "computeruse.microphoneStartRecording.start";
  target: MicrophoneStartRecordingTarget;
  context: {
    runtimeId?: string;
    sessionId?: string;
    invocationId?: string;
    auditMetadata?: Readonly<Record<string, unknown>>;
  };
  purpose: string;
};

export type MicrophoneStartRecordingProviderResult = {
  recordingId: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type MicrophoneStartRecordingProvider = (
  request: MicrophoneStartRecordingProviderRequest,
) => Promise<MicrophoneStartRecordingProviderResult> | MicrophoneStartRecordingProviderResult;

export type MicrophoneStartRecordingRequest = {
  target?: unknown;
  context?: unknown;
  deviceId?: unknown;
  permissionLeaseId?: unknown;
  recordingLabel?: unknown;
  destinationHint?: unknown;
  maxDurationMs?: unknown;
  sampleRateHz?: unknown;
  channelCount?: unknown;
  outputFormat?: unknown;
  purpose?: unknown;
  metadata?: unknown;
  provider?: MicrophoneStartRecordingProvider;
};

export type MicrophoneStartRecordingErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_CONTEXT"
  | "INVALID_TARGET"
  | "MISSING_RUNTIME_ID"
  | "MISSING_PURPOSE"
  | "INVALID_DEVICE_ID"
  | "DEVICE_SCOPE_REJECTED"
  | "INVALID_PERMISSION_LEASE"
  | "INVALID_RECORDING_LABEL"
  | "INVALID_DESTINATION_HINT"
  | "INVALID_MAX_DURATION"
  | "INVALID_AUDIO_FORMAT"
  | "INVALID_OUTPUT_FORMAT"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_FAILURE";

export type MicrophoneStartRecordingError = {
  code: MicrophoneStartRecordingErrorCode;
  message: string;
  boundary: MicrophoneStartRecordingBoundary;
  publicSafe: true;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type MicrophoneStartRecordingAuditEvent = {
  type: string;
  toolId: "computeruse.microphoneStartRecording";
  invocationId: string;
  dryRun: boolean;
  deviceId?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type MicrophoneStartRecordingOutput = {
  kind: "agentCore.basicTool.computeruse.microphoneStartRecording";
  target: MicrophoneStartRecordingTarget;
  purpose: string;
  dispatch: "dry-run" | "runtime-computeruse";
  dryRun: boolean;
  providerCalled: boolean;
  executionBlocked: boolean;
  unsafeSideEffects: true;
  permissionsRequired: readonly ("microphone:read" | "microphone:record" | "recording:session" | "artifact:write")[];
  requiresTapApproval: true;
  acceptedScopes: readonly string[];
  runtimeEntry: {
    port: "BaseToolExecutorPort.computeruse.startRecording";
    operation: "computeruse.microphoneStartRecording.start";
    runtimeOwnsMicrophoneAccess: true;
    runtimeOwnsRecordingSession: true;
    runtimeOwnsArtifactStorage: true;
    baseToolOwnsTapStrategy: false;
  };
  recordingEnvelope: {
    resource: "microphone";
    target: "microphone";
    started: boolean;
    metadataOnly: boolean;
    recordingId?: string;
  };
  providerMetadata?: Readonly<Record<string, unknown>>;
};

export type MicrophoneStartRecordingResult =
  | {
      ok: true;
      toolId: "computeruse.microphoneStartRecording";
      output: MicrophoneStartRecordingOutput;
      audit: readonly MicrophoneStartRecordingAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "computeruse.microphoneStartRecording";
      error: MicrophoneStartRecordingError;
      audit: readonly MicrophoneStartRecordingAuditEvent[];
      events: readonly string[];
    };

export const microphoneStartRecordingDescriptor = {
  toolId: "computeruse.microphoneStartRecording",
  capability: "start-microphone-recording",
  route: "agent_executionEngine.basic_toolLayer.baseTools.computeruseBase.microphoneAccess",
  defaultDryRun: true,
  defaultDeviceId: "default-microphone",
  defaultMaxDurationMs: 60_000,
  maxDurationMs: 3_600_000,
  defaultSampleRateHz: 48_000,
  defaultChannelCount: 1,
  defaultOutputFormat: "audio/webm",
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

function cleanGate(value: unknown): MicrophoneStartRecordingGate | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return undefined;
  const gate: MicrophoneStartRecordingGate = {};
  if (typeof value.accepted === "boolean") gate.accepted = value.accepted;
  if (typeof value.allowed === "boolean") gate.allowed = value.allowed;
  const reason = cleanString(value.reason);
  if (reason !== undefined) gate.reason = reason;
  return gate;
}

function cleanAuditMetadata(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return isRecord(value) ? value : undefined;
}

function cleanPositiveInteger(value: unknown, defaultValue: number, maxValue: number): number | undefined {
  if (value === undefined) return defaultValue;
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= maxValue ? value : undefined;
}

function cleanOutputFormat(value: unknown): MicrophoneStartRecordingOutputFormat | undefined {
  if (value === undefined) return microphoneStartRecordingDescriptor.defaultOutputFormat;
  return value === "audio/wav" || value === "audio/webm" || value === "audio/mpeg" ? value : undefined;
}

function hasAllowedDestinationScheme(value: string): boolean {
  return microphoneStartRecordingDescriptor.allowedDestinationSchemes.some((scheme) => value.startsWith(scheme));
}

function auditEvent(
  type: string,
  context: MicrophoneStartRecordingContext | undefined,
  deviceId: string | undefined,
  metadata?: Readonly<Record<string, unknown>>,
): MicrophoneStartRecordingAuditEvent {
  return {
    type,
    toolId: microphoneStartRecordingDescriptor.toolId,
    invocationId: context?.invocationId ?? "computeruse.microphoneStartRecording:dry-run",
    dryRun: context?.dryRun !== false,
    deviceId,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: MicrophoneStartRecordingErrorCode,
  message: string,
  boundary: MicrophoneStartRecordingBoundary,
  context: MicrophoneStartRecordingContext | undefined,
  deviceId?: string,
): MicrophoneStartRecordingResult {
  return {
    ok: false,
    toolId: microphoneStartRecordingDescriptor.toolId,
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("agentCore.basicTool.computeruse.microphoneStartRecording.rejected", context, deviceId, { code })],
    events: ["basicTool.computeruse.microphoneStartRecording.rejected"],
  };
}

function normalizeContext(value: unknown): MicrophoneStartRecordingContext | MicrophoneStartRecordingResult {
  if (value === undefined) return {};
  if (!isRecord(value)) return failure("INVALID_CONTEXT", "computeruse.microphoneStartRecording context must be an object", "input", undefined);

  const requestedScopes = cleanStringList(value.requestedScopes);
  const allowedScopes = cleanStringList(value.allowedScopes);
  const allowedDeviceIds = cleanStringList(value.allowedDeviceIds);
  const guard = cleanGate(value.guard);
  const contract = cleanGate(value.contract);
  const governance = cleanGate(value.governance);

  if (
    (value.requestedScopes !== undefined && requestedScopes === undefined) ||
    (value.allowedScopes !== undefined && allowedScopes === undefined) ||
    (value.allowedDeviceIds !== undefined && allowedDeviceIds === undefined) ||
    (value.guard !== undefined && guard === undefined) ||
    (value.contract !== undefined && contract === undefined) ||
    (value.governance !== undefined && governance === undefined) ||
    (value.dryRun !== undefined && typeof value.dryRun !== "boolean")
  ) {
    return failure(
      "INVALID_CONTEXT",
      "computeruse.microphoneStartRecording context contains malformed guard, governance, device scope, or scope fields",
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
    allowedDeviceIds,
    auditMetadata: cleanAuditMetadata(value.auditMetadata),
  };
}

function normalizeTarget(
  request: Record<string, unknown>,
  context: MicrophoneStartRecordingContext,
): MicrophoneStartRecordingTarget | MicrophoneStartRecordingResult {
  const targetValue = request.target;
  if (targetValue !== undefined && !isRecord(targetValue)) {
    return failure("INVALID_TARGET", "computeruse.microphoneStartRecording target must be an object when provided", "input", context);
  }
  const target = isRecord(targetValue) ? targetValue : {};
  const deviceIdValue = target.deviceId ?? request.deviceId;
  const deviceId = cleanString(deviceIdValue) ?? microphoneStartRecordingDescriptor.defaultDeviceId;
  const permissionLeaseIdValue = target.permissionLeaseId ?? request.permissionLeaseId;
  const permissionLeaseId = cleanString(permissionLeaseIdValue);
  const recordingLabelValue = target.recordingLabel ?? request.recordingLabel;
  const recordingLabel = cleanString(recordingLabelValue);
  const destinationHintValue = target.destinationHint ?? request.destinationHint;
  const destinationHint = cleanString(destinationHintValue);
  const maxDurationMs = cleanPositiveInteger(
    target.maxDurationMs ?? request.maxDurationMs,
    microphoneStartRecordingDescriptor.defaultMaxDurationMs,
    microphoneStartRecordingDescriptor.maxDurationMs,
  );
  const sampleRateHz = cleanPositiveInteger(target.sampleRateHz ?? request.sampleRateHz, microphoneStartRecordingDescriptor.defaultSampleRateHz, 192_000);
  const channelCount = cleanPositiveInteger(target.channelCount ?? request.channelCount, microphoneStartRecordingDescriptor.defaultChannelCount, 8);
  const outputFormat = cleanOutputFormat(target.outputFormat ?? request.outputFormat);

  if (deviceIdValue !== undefined && (cleanString(deviceIdValue) === undefined || deviceId.length > 128)) {
    return failure("INVALID_DEVICE_ID", "computeruse.microphoneStartRecording deviceId must be a safe string", "input", context);
  }
  if (permissionLeaseIdValue !== undefined && (permissionLeaseId === undefined || permissionLeaseId.length > 512)) {
    return failure("INVALID_PERMISSION_LEASE", "computeruse.microphoneStartRecording permissionLeaseId must be a bounded opaque id", "input", context, deviceId);
  }
  if (recordingLabelValue !== undefined && (recordingLabel === undefined || recordingLabel.length > 256)) {
    return failure("INVALID_RECORDING_LABEL", "computeruse.microphoneStartRecording recordingLabel must be a bounded safe string", "input", context, deviceId);
  }
  if (destinationHintValue !== undefined && (destinationHint === undefined || destinationHint.length > 1024 || !hasAllowedDestinationScheme(destinationHint))) {
    return failure(
      "INVALID_DESTINATION_HINT",
      "computeruse.microphoneStartRecording destinationHint must use artifact://, session://, runtime://, or memory://",
      "input",
      context,
      deviceId,
    );
  }
  if (maxDurationMs === undefined) {
    return failure(
      "INVALID_MAX_DURATION",
      "computeruse.microphoneStartRecording maxDurationMs must be an integer from 1 to 3600000",
      "resource",
      context,
      deviceId,
    );
  }
  if (sampleRateHz === undefined || sampleRateHz < 8_000) {
    return failure("INVALID_AUDIO_FORMAT", "computeruse.microphoneStartRecording sampleRateHz must be an integer from 8000 to 192000", "input", context, deviceId);
  }
  if (channelCount === undefined || channelCount < 1) {
    return failure("INVALID_AUDIO_FORMAT", "computeruse.microphoneStartRecording channelCount must be an integer from 1 to 8", "input", context, deviceId);
  }
  if (outputFormat === undefined) {
    return failure("INVALID_OUTPUT_FORMAT", "computeruse.microphoneStartRecording outputFormat must be audio/wav, audio/webm, or audio/mpeg", "input", context, deviceId);
  }

  return {
    deviceId,
    maxDurationMs,
    sampleRateHz,
    channelCount,
    outputFormat,
    permissionLeaseId,
    recordingLabel,
    destinationHint,
  };
}

function ensureScopes(
  target: MicrophoneStartRecordingTarget,
  context: MicrophoneStartRecordingContext,
): MicrophoneStartRecordingResult | undefined {
  const requested = context.requestedScopes ?? [];
  const allowed = context.allowedScopes ?? [];
  if (requested.length > 0) {
    const denied = requested.filter((scope) => !allowed.includes(scope));
    if (denied.length > 0) {
      return failure(
        "SCOPE_DENIED",
        `computeruse.microphoneStartRecording scope ${denied[0]} is outside runtime governance`,
        "scope",
        context,
        target.deviceId,
      );
    }
  }

  const allowedDeviceIds = context.allowedDeviceIds ?? [];
  if (allowedDeviceIds.length > 0 && !allowedDeviceIds.includes(target.deviceId)) {
    return failure("DEVICE_SCOPE_REJECTED", `microphone device ${target.deviceId} is outside the allowed device scope`, "scope", context, target.deviceId);
  }

  return undefined;
}

function ensureStaticGates(
  target: MicrophoneStartRecordingTarget,
  context: MicrophoneStartRecordingContext,
): MicrophoneStartRecordingResult | undefined {
  if (context.contract?.accepted === false || context.contract?.allowed === false) {
    return failure(
      "CONTRACT_REJECTED",
      context.contract.reason ?? "computeruse.microphoneStartRecording was rejected by runtime contract surface",
      "contract",
      context,
      target.deviceId,
    );
  }

  if (context.governance?.accepted === false || context.governance?.allowed === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      context.governance.reason ?? "computeruse.microphoneStartRecording was rejected by runtime governance",
      "governance",
      context,
      target.deviceId,
    );
  }

  return undefined;
}

function ensureRealExecutionGuard(
  target: MicrophoneStartRecordingTarget,
  context: MicrophoneStartRecordingContext,
): MicrophoneStartRecordingResult | undefined {
  if (context.dryRun !== false) return undefined;
  if (context.guard?.accepted === true || context.guard?.allowed === true) return undefined;

  return failure(
    "GOVERNANCE_REJECTED",
    context.guard?.reason ?? "computeruse.microphoneStartRecording dryRun:false requires an affirmative runtime guard",
    "governance",
    context,
    target.deviceId,
  );
}

function permissionsForTarget(
  target: MicrophoneStartRecordingTarget,
): MicrophoneStartRecordingOutput["permissionsRequired"] {
  return [
    "microphone:read",
    "microphone:record",
    "recording:session",
    ...(target.destinationHint !== undefined ? (["artifact:write"] as const) : []),
  ];
}

function baseOutput(
  target: MicrophoneStartRecordingTarget,
  purpose: string,
  acceptedScopes: readonly string[],
  dryRun: boolean,
  providerCalled: boolean,
): Omit<MicrophoneStartRecordingOutput, "recordingEnvelope"> {
  return {
    kind: "agentCore.basicTool.computeruse.microphoneStartRecording",
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
      operation: "computeruse.microphoneStartRecording.start",
      runtimeOwnsMicrophoneAccess: true,
      runtimeOwnsRecordingSession: true,
      runtimeOwnsArtifactStorage: true,
      baseToolOwnsTapStrategy: false,
    },
  };
}

function normalizeProviderResult(
  value: unknown,
  context: MicrophoneStartRecordingContext,
  target: MicrophoneStartRecordingTarget,
): MicrophoneStartRecordingProviderResult | MicrophoneStartRecordingResult {
  if (!isRecord(value) || cleanString(value.recordingId) === undefined) {
    return failure(
      "PROVIDER_FAILURE",
      "computeruse.microphoneStartRecording runtime provider returned a malformed public-safe recording envelope",
      "provider",
      context,
      target.deviceId,
    );
  }

  return {
    recordingId: cleanString(value.recordingId) ?? "",
    metadata: cleanAuditMetadata(value.metadata),
  };
}

function normalizeRequest(request: unknown): {
  target: MicrophoneStartRecordingTarget;
  context: MicrophoneStartRecordingContext;
  purpose: string;
  metadata?: Readonly<Record<string, unknown>>;
  provider?: MicrophoneStartRecordingProvider;
} | MicrophoneStartRecordingResult {
  if (request === undefined) request = {};
  if (!isRecord(request)) return failure("INVALID_REQUEST", "computeruse.microphoneStartRecording request must be an object", "input", undefined);

  const context = normalizeContext(request.context);
  if ("ok" in context) return context;

  const target = normalizeTarget(request, context);
  if ("ok" in target) return target;

  const purpose = cleanString(request.purpose);
  if (purpose === undefined) {
    return failure("MISSING_PURPOSE", "computeruse.microphoneStartRecording requires an explicit purpose", "input", context, target.deviceId);
  }

  if (context.runtimeId === undefined) {
    return failure("MISSING_RUNTIME_ID", "computeruse.microphoneStartRecording requires context.runtimeId for audit", "input", context, target.deviceId);
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
    provider: typeof request.provider === "function" ? (request.provider as MicrophoneStartRecordingProvider) : undefined,
  };
}

export async function executeMicrophoneStartRecording(request: unknown = {}): Promise<MicrophoneStartRecordingResult> {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) return normalized;

  const { target, context, purpose, metadata, provider } = normalized;
  const acceptedScopes = context.requestedScopes ?? [];
  const dryRun = context.dryRun !== false;

  if (dryRun) {
    return {
      ok: true,
      toolId: microphoneStartRecordingDescriptor.toolId,
      output: {
        ...baseOutput(target, purpose, acceptedScopes, true, false),
        recordingEnvelope: {
          resource: "microphone",
          target: "microphone",
          started: false,
          metadataOnly: true,
        },
      },
      audit: [auditEvent("agentCore.basicTool.computeruse.microphoneStartRecording.dryRun", context, target.deviceId, metadata)],
      events: ["basicTool.computeruse.microphoneStartRecording.dryRun"],
    };
  }

  if (provider === undefined) {
    return failure(
      "PROVIDER_UNAVAILABLE",
      "computeruse.microphoneStartRecording requires runtime executor.computeruse.startRecording for dryRun:false",
      "provider",
      context,
      target.deviceId,
    );
  }

  let providerResult: MicrophoneStartRecordingProviderResult;
  try {
    const result = await provider({
      operation: "computeruse.microphoneStartRecording.start",
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
      "computeruse.microphoneStartRecording runtime provider failed without exposing private details",
      "provider",
      context,
      target.deviceId,
    );
  }

  return {
    ok: true,
    toolId: microphoneStartRecordingDescriptor.toolId,
    output: {
      ...baseOutput(target, purpose, acceptedScopes, false, true),
      recordingEnvelope: {
        resource: "microphone",
        target: "microphone",
        started: true,
        metadataOnly: false,
        recordingId: providerResult.recordingId,
      },
      providerMetadata: providerResult.metadata,
    },
    audit: [
      auditEvent("agentCore.basicTool.computeruse.microphoneStartRecording.started", context, target.deviceId, {
        recordingId: providerResult.recordingId,
        ...(providerResult.metadata ?? {}),
      }),
    ],
    events: ["basicTool.computeruse.microphoneStartRecording.started"],
  };
}

export function planMicrophoneStartRecording(request: unknown = {}): Promise<MicrophoneStartRecordingResult> {
  return executeMicrophoneStartRecording(request);
}
