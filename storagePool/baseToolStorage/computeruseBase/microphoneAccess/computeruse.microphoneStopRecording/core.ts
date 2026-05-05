export type MicrophoneStopRecordingBoundary = "input" | "contract" | "governance" | "scope" | "provider";

export type MicrophoneStopRecordingGate = {
  accepted?: boolean;
  allowed?: boolean;
  reason?: string;
};

export type MicrophoneStopRecordingContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: MicrophoneStopRecordingGate;
  contract?: MicrophoneStopRecordingGate;
  governance?: MicrophoneStopRecordingGate;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type MicrophoneStopRecordingTarget = {
  recordingId: string;
  deviceId?: string;
  persistHint?: string;
  releaseDevice: boolean;
};

export type MicrophoneStopRecordingProviderRequest = {
  operation: "computeruse.microphoneStopRecording.stop";
  target: MicrophoneStopRecordingTarget;
  context: {
    runtimeId?: string;
    sessionId?: string;
    invocationId?: string;
    auditMetadata?: Readonly<Record<string, unknown>>;
  };
  purpose: string;
};

export type MicrophoneStopRecordingProviderResult = {
  artifactId: string;
  mimeType: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type MicrophoneStopRecordingProvider = (
  request: MicrophoneStopRecordingProviderRequest,
) => Promise<MicrophoneStopRecordingProviderResult> | MicrophoneStopRecordingProviderResult;

export type MicrophoneStopRecordingRequest = {
  target?: unknown;
  context?: unknown;
  recordingId?: unknown;
  deviceId?: unknown;
  persistHint?: unknown;
  releaseDevice?: unknown;
  purpose?: unknown;
  metadata?: unknown;
  provider?: MicrophoneStopRecordingProvider;
};

export type MicrophoneStopRecordingErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_CONTEXT"
  | "INVALID_TARGET"
  | "MISSING_RUNTIME_ID"
  | "MISSING_PURPOSE"
  | "MISSING_RECORDING_ID"
  | "INVALID_RECORDING_ID"
  | "INVALID_DEVICE_ID"
  | "INVALID_PERSIST_HINT"
  | "INVALID_RELEASE_DEVICE"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_FAILURE";

export type MicrophoneStopRecordingError = {
  code: MicrophoneStopRecordingErrorCode;
  message: string;
  boundary: MicrophoneStopRecordingBoundary;
  publicSafe: true;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type MicrophoneStopRecordingAuditEvent = {
  type: string;
  toolId: "computeruse.microphoneStopRecording";
  invocationId: string;
  dryRun: boolean;
  recordingId?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type MicrophoneStopRecordingOutput = {
  kind: "agentCore.basicTool.computeruse.microphoneStopRecording";
  target: MicrophoneStopRecordingTarget;
  purpose: string;
  dispatch: "dry-run" | "runtime-computeruse";
  dryRun: boolean;
  providerCalled: boolean;
  executionBlocked: boolean;
  unsafeSideEffects: true;
  permissionsRequired: readonly ("microphone:record" | "recording:session" | "artifact:write" | "microphone:permission-release")[];
  requiresTapApproval: true;
  acceptedScopes: readonly string[];
  runtimeEntry: {
    port: "BaseToolExecutorPort.computeruse.stopRecording";
    operation: "computeruse.microphoneStopRecording.stop";
    runtimeOwnsRecordingSession: true;
    runtimeOwnsArtifactStorage: true;
    runtimeOwnsDeviceCleanup: true;
    baseToolOwnsTapStrategy: false;
  };
  recordingEnvelope: {
    resource: "microphone";
    stopped: boolean;
    artifactCreated: boolean;
    metadataOnly: boolean;
    recordingId: string;
    artifactId?: string;
    mimeType?: string;
  };
  providerMetadata?: Readonly<Record<string, unknown>>;
};

export type MicrophoneStopRecordingResult =
  | {
      ok: true;
      toolId: "computeruse.microphoneStopRecording";
      output: MicrophoneStopRecordingOutput;
      audit: readonly MicrophoneStopRecordingAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "computeruse.microphoneStopRecording";
      error: MicrophoneStopRecordingError;
      audit: readonly MicrophoneStopRecordingAuditEvent[];
      events: readonly string[];
    };

export const microphoneStopRecordingDescriptor = {
  toolId: "computeruse.microphoneStopRecording",
  capability: "stop-microphone-recording",
  route: "agent_executionEngine.basic_toolLayer.baseTools.computeruseBase.microphoneAccess",
  defaultDryRun: true,
  defaultReleaseDevice: true,
  allowedPersistHintSchemes: ["artifact://", "session://", "runtime://", "memory://"],
  tapOwnsApproval: true,
  runtimeEntry: "BaseToolExecutorPort.computeruse.stopRecording",
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

function cleanGate(value: unknown): MicrophoneStopRecordingGate | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return undefined;
  const gate: MicrophoneStopRecordingGate = {};
  if (typeof value.accepted === "boolean") gate.accepted = value.accepted;
  if (typeof value.allowed === "boolean") gate.allowed = value.allowed;
  const reason = cleanString(value.reason);
  if (reason !== undefined) gate.reason = reason;
  return gate;
}

function cleanAuditMetadata(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return isRecord(value) ? value : undefined;
}

function hasAllowedPersistHintScheme(value: string): boolean {
  return microphoneStopRecordingDescriptor.allowedPersistHintSchemes.some((scheme) => value.startsWith(scheme));
}

function auditEvent(
  type: string,
  context: MicrophoneStopRecordingContext | undefined,
  recordingId: string | undefined,
  metadata?: Readonly<Record<string, unknown>>,
): MicrophoneStopRecordingAuditEvent {
  return {
    type,
    toolId: microphoneStopRecordingDescriptor.toolId,
    invocationId: context?.invocationId ?? "computeruse.microphoneStopRecording:dry-run",
    dryRun: context?.dryRun !== false,
    recordingId,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: MicrophoneStopRecordingErrorCode,
  message: string,
  boundary: MicrophoneStopRecordingBoundary,
  context: MicrophoneStopRecordingContext | undefined,
  recordingId?: string,
): MicrophoneStopRecordingResult {
  return {
    ok: false,
    toolId: microphoneStopRecordingDescriptor.toolId,
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("agentCore.basicTool.computeruse.microphoneStopRecording.rejected", context, recordingId, { code })],
    events: ["basicTool.computeruse.microphoneStopRecording.rejected"],
  };
}

function normalizeContext(value: unknown): MicrophoneStopRecordingContext | MicrophoneStopRecordingResult {
  if (value === undefined) return {};
  if (!isRecord(value)) return failure("INVALID_CONTEXT", "computeruse.microphoneStopRecording context must be an object", "input", undefined);

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
      "computeruse.microphoneStopRecording context contains malformed guard, governance, or scope fields",
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
  context: MicrophoneStopRecordingContext,
): MicrophoneStopRecordingTarget | MicrophoneStopRecordingResult {
  const targetValue = request.target;
  if (targetValue !== undefined && !isRecord(targetValue)) {
    return failure("INVALID_TARGET", "computeruse.microphoneStopRecording target must be an object when provided", "input", context);
  }
  const target = isRecord(targetValue) ? targetValue : {};
  const recordingIdValue = target.recordingId ?? request.recordingId;
  const deviceIdValue = target.deviceId ?? request.deviceId;
  const persistHintValue = target.persistHint ?? request.persistHint;
  const releaseDeviceValue = target.releaseDevice ?? request.releaseDevice;
  const recordingId = cleanString(recordingIdValue);
  const deviceId = cleanString(deviceIdValue);
  const persistHint = cleanString(persistHintValue);

  if (recordingIdValue === undefined) {
    return failure("MISSING_RECORDING_ID", "computeruse.microphoneStopRecording requires target.recordingId", "input", context);
  }
  if (recordingId === undefined || recordingId.length > 512) {
    return failure("INVALID_RECORDING_ID", "computeruse.microphoneStopRecording recordingId must be a bounded safe string", "input", context);
  }
  if (deviceIdValue !== undefined && (deviceId === undefined || deviceId.length > 128)) {
    return failure("INVALID_DEVICE_ID", "computeruse.microphoneStopRecording deviceId must be a bounded safe string", "input", context, recordingId);
  }
  if (persistHintValue !== undefined && (persistHint === undefined || persistHint.length > 1024 || !hasAllowedPersistHintScheme(persistHint))) {
    return failure(
      "INVALID_PERSIST_HINT",
      "computeruse.microphoneStopRecording persistHint must use artifact://, session://, runtime://, or memory://",
      "input",
      context,
      recordingId,
    );
  }
  if (releaseDeviceValue !== undefined && typeof releaseDeviceValue !== "boolean") {
    return failure("INVALID_RELEASE_DEVICE", "computeruse.microphoneStopRecording releaseDevice must be boolean", "input", context, recordingId);
  }

  return {
    recordingId,
    deviceId,
    persistHint,
    releaseDevice: typeof releaseDeviceValue === "boolean" ? releaseDeviceValue : microphoneStopRecordingDescriptor.defaultReleaseDevice,
  };
}

function ensureScopes(target: MicrophoneStopRecordingTarget, context: MicrophoneStopRecordingContext): MicrophoneStopRecordingResult | undefined {
  const requested = context.requestedScopes ?? [];
  const allowed = context.allowedScopes ?? [];
  if (requested.length === 0) return undefined;

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length === 0) return undefined;

  return failure(
    "SCOPE_DENIED",
    `computeruse.microphoneStopRecording scope ${denied[0]} is outside runtime governance`,
    "scope",
    context,
    target.recordingId,
  );
}

function ensureStaticGates(target: MicrophoneStopRecordingTarget, context: MicrophoneStopRecordingContext): MicrophoneStopRecordingResult | undefined {
  if (context.contract?.accepted === false || context.contract?.allowed === false) {
    return failure(
      "CONTRACT_REJECTED",
      context.contract.reason ?? "computeruse.microphoneStopRecording was rejected by runtime contract surface",
      "contract",
      context,
      target.recordingId,
    );
  }

  if (context.governance?.accepted === false || context.governance?.allowed === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      context.governance.reason ?? "computeruse.microphoneStopRecording was rejected by runtime governance",
      "governance",
      context,
      target.recordingId,
    );
  }

  return undefined;
}

function ensureRealExecutionGuard(target: MicrophoneStopRecordingTarget, context: MicrophoneStopRecordingContext): MicrophoneStopRecordingResult | undefined {
  if (context.dryRun !== false) return undefined;
  if (context.guard?.accepted === true || context.guard?.allowed === true) return undefined;

  return failure(
    "GOVERNANCE_REJECTED",
    context.guard?.reason ?? "computeruse.microphoneStopRecording dryRun:false requires an affirmative runtime guard",
    "governance",
    context,
    target.recordingId,
  );
}

function permissionsForTarget(
  target: MicrophoneStopRecordingTarget,
): MicrophoneStopRecordingOutput["permissionsRequired"] {
  return [
    "microphone:record",
    "recording:session",
    "artifact:write",
    ...(target.releaseDevice ? (["microphone:permission-release"] as const) : []),
  ];
}

function baseOutput(
  target: MicrophoneStopRecordingTarget,
  purpose: string,
  acceptedScopes: readonly string[],
  dryRun: boolean,
  providerCalled: boolean,
): Omit<MicrophoneStopRecordingOutput, "recordingEnvelope"> {
  return {
    kind: "agentCore.basicTool.computeruse.microphoneStopRecording",
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
      port: "BaseToolExecutorPort.computeruse.stopRecording",
      operation: "computeruse.microphoneStopRecording.stop",
      runtimeOwnsRecordingSession: true,
      runtimeOwnsArtifactStorage: true,
      runtimeOwnsDeviceCleanup: true,
      baseToolOwnsTapStrategy: false,
    },
  };
}

function normalizeProviderResult(
  value: unknown,
  context: MicrophoneStopRecordingContext,
  target: MicrophoneStopRecordingTarget,
): MicrophoneStopRecordingProviderResult | MicrophoneStopRecordingResult {
  if (!isRecord(value) || cleanString(value.artifactId) === undefined || cleanString(value.mimeType) === undefined) {
    return failure(
      "PROVIDER_FAILURE",
      "computeruse.microphoneStopRecording runtime provider returned a malformed public-safe audio artifact envelope",
      "provider",
      context,
      target.recordingId,
    );
  }

  return {
    artifactId: cleanString(value.artifactId) ?? "",
    mimeType: cleanString(value.mimeType) ?? "",
    metadata: cleanAuditMetadata(value.metadata),
  };
}

function normalizeRequest(request: unknown): {
  target: MicrophoneStopRecordingTarget;
  context: MicrophoneStopRecordingContext;
  purpose: string;
  metadata?: Readonly<Record<string, unknown>>;
  provider?: MicrophoneStopRecordingProvider;
} | MicrophoneStopRecordingResult {
  if (request === undefined) request = {};
  if (!isRecord(request)) return failure("INVALID_REQUEST", "computeruse.microphoneStopRecording request must be an object", "input", undefined);

  const context = normalizeContext(request.context);
  if ("ok" in context) return context;

  const target = normalizeTarget(request, context);
  if ("ok" in target) return target;

  const purpose = cleanString(request.purpose);
  if (purpose === undefined) {
    return failure("MISSING_PURPOSE", "computeruse.microphoneStopRecording requires an explicit purpose", "input", context, target.recordingId);
  }

  if (context.runtimeId === undefined) {
    return failure("MISSING_RUNTIME_ID", "computeruse.microphoneStopRecording requires context.runtimeId for audit", "input", context, target.recordingId);
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
    provider: typeof request.provider === "function" ? (request.provider as MicrophoneStopRecordingProvider) : undefined,
  };
}

export async function executeMicrophoneStopRecording(request: unknown = {}): Promise<MicrophoneStopRecordingResult> {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) return normalized;

  const { target, context, purpose, metadata, provider } = normalized;
  const acceptedScopes = context.requestedScopes ?? [];
  const dryRun = context.dryRun !== false;

  if (dryRun) {
    return {
      ok: true,
      toolId: microphoneStopRecordingDescriptor.toolId,
      output: {
        ...baseOutput(target, purpose, acceptedScopes, true, false),
        recordingEnvelope: {
          resource: "microphone",
          stopped: false,
          artifactCreated: false,
          metadataOnly: true,
          recordingId: target.recordingId,
        },
      },
      audit: [auditEvent("agentCore.basicTool.computeruse.microphoneStopRecording.dryRun", context, target.recordingId, metadata)],
      events: ["basicTool.computeruse.microphoneStopRecording.dryRun"],
    };
  }

  if (provider === undefined) {
    return failure(
      "PROVIDER_UNAVAILABLE",
      "computeruse.microphoneStopRecording requires runtime executor.computeruse.stopRecording for dryRun:false",
      "provider",
      context,
      target.recordingId,
    );
  }

  let providerResult: MicrophoneStopRecordingProviderResult;
  try {
    const result = await provider({
      operation: "computeruse.microphoneStopRecording.stop",
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
      "computeruse.microphoneStopRecording runtime provider failed without exposing private details",
      "provider",
      context,
      target.recordingId,
    );
  }

  return {
    ok: true,
    toolId: microphoneStopRecordingDescriptor.toolId,
    output: {
      ...baseOutput(target, purpose, acceptedScopes, false, true),
      recordingEnvelope: {
        resource: "microphone",
        stopped: true,
        artifactCreated: true,
        metadataOnly: false,
        recordingId: target.recordingId,
        artifactId: providerResult.artifactId,
        mimeType: providerResult.mimeType,
      },
      providerMetadata: providerResult.metadata,
    },
    audit: [
      auditEvent("agentCore.basicTool.computeruse.microphoneStopRecording.stopped", context, target.recordingId, {
        artifactId: providerResult.artifactId,
        mimeType: providerResult.mimeType,
        ...(providerResult.metadata ?? {}),
      }),
    ],
    events: ["basicTool.computeruse.microphoneStopRecording.stopped"],
  };
}

export function planMicrophoneStopRecording(request: unknown = {}): Promise<MicrophoneStopRecordingResult> {
  return executeMicrophoneStopRecording(request);
}
