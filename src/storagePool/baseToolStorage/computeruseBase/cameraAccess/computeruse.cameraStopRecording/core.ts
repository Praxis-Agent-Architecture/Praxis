export type CameraStopRecordingBoundary = "input" | "contract" | "governance" | "scope" | "provider";

export type CameraStopRecordingGate = {
  accepted?: boolean;
  allowed?: boolean;
  reason?: string;
};

export type CameraStopRecordingContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: CameraStopRecordingGate;
  contract?: CameraStopRecordingGate;
  governance?: CameraStopRecordingGate;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type CameraStopRecordingRetentionPolicy = "ephemeral" | "session-only" | "session-scoped" | "persistent";

export type CameraStopRecordingTarget = {
  recordingId: string;
  purpose: string;
  storageTarget?: string;
  retentionPolicy?: CameraStopRecordingRetentionPolicy;
  destinationHint?: string;
};

export type CameraStopRecordingProviderRequest = {
  operation: "computeruse.cameraStopRecording.stop";
  target: CameraStopRecordingTarget;
  context: {
    runtimeId?: string;
    sessionId?: string;
    invocationId?: string;
    auditMetadata?: Readonly<Record<string, unknown>>;
  };
};

export type CameraStopRecordingProviderResult = {
  artifactId: string;
  mimeType: string;
  storageUri?: string;
  retentionPolicy?: CameraStopRecordingRetentionPolicy;
  metadata?: Readonly<Record<string, unknown>>;
};

export type CameraStopRecordingProvider = (
  request: CameraStopRecordingProviderRequest,
) => Promise<CameraStopRecordingProviderResult> | CameraStopRecordingProviderResult;

export type CameraStopRecordingInput = {
  target?: unknown;
  context?: unknown;
  recordingId?: unknown;
  recordingRef?: unknown;
  purpose?: unknown;
  storageTarget?: unknown;
  retentionPolicy?: unknown;
  destinationHint?: unknown;
  persistHint?: unknown;
  metadata?: unknown;
  provider?: CameraStopRecordingProvider;
};

export type CameraStopRecordingErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_CONTEXT"
  | "INVALID_TARGET"
  | "MISSING_RUNTIME_ID"
  | "MISSING_RECORDING_ID"
  | "INVALID_RECORDING_ID"
  | "MISSING_PURPOSE"
  | "INVALID_PURPOSE"
  | "INVALID_STORAGE_TARGET"
  | "INVALID_RETENTION_POLICY"
  | "INVALID_DESTINATION_HINT"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_FAILURE";

export type CameraStopRecordingError = {
  code: CameraStopRecordingErrorCode;
  message: string;
  boundary: CameraStopRecordingBoundary;
  publicSafe: true;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type CameraStopRecordingAuditEvent = {
  type: string;
  toolId: "computeruse.cameraStopRecording";
  invocationId: string;
  dryRun: boolean;
  recordingId?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type CameraStopRecordingOutput = {
  kind: "agentCore.basicTool.computeruse.cameraStopRecording";
  target: CameraStopRecordingTarget;
  dispatch: "dry-run" | "runtime-computeruse";
  dryRun: boolean;
  providerCalled: boolean;
  executionBlocked: boolean;
  unsafeSideEffects: true;
  permissionsRequired: readonly ["camera:stop-recording", "recording:session", "artifact:write"];
  requiresTapApproval: true;
  acceptedScopes: readonly string[];
  runtimeEntry: {
    port: "BaseToolExecutorPort.computeruse.stopRecording";
    operation: "computeruse.cameraStopRecording.stop";
    runtimeOwnsCameraAccess: true;
    runtimeOwnsRecordingSession: true;
    runtimeOwnsArtifactStorage: true;
    baseToolOwnsTapStrategy: false;
  };
  artifactEnvelope: {
    resource: "camera-recording";
    stopRequested: boolean;
    stopped: boolean;
    metadataOnly: boolean;
    recordingId: string;
    artifactId?: string;
    mimeType?: string;
    storageUri?: string;
    retentionPolicy?: CameraStopRecordingRetentionPolicy;
  };
  providerMetadata?: Readonly<Record<string, unknown>>;
};

export type CameraStopRecordingResult =
  | {
      ok: true;
      toolId: "computeruse.cameraStopRecording";
      output: CameraStopRecordingOutput;
      audit: readonly CameraStopRecordingAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "computeruse.cameraStopRecording";
      error: CameraStopRecordingError;
      audit: readonly CameraStopRecordingAuditEvent[];
      events: readonly string[];
    };

export const cameraStopRecordingDescriptor = {
  toolId: "computeruse.cameraStopRecording",
  capability: "stop-camera-recording",
  route: "agent_executionEngine.basic_toolLayer.baseTools.computeruseBase.cameraAccess",
  defaultDryRun: true,
  defaultRetentionPolicy: "session-scoped",
  allowedStorageSchemes: ["artifact://", "session://", "runtime://", "memory://"],
  tapOwnsApproval: true,
  runtimeEntry: "BaseToolExecutorPort.computeruse.stopRecording",
  permissionsRequired: ["camera:stop-recording", "recording:session", "artifact:write"],
  unsafeSideEffects: true,
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanString(value: unknown, maxLength = 1024): string | undefined {
  return typeof value === "string" && value.trim().length > 0 && !value.includes("\0") && value.trim().length <= maxLength
    ? value.trim()
    : undefined;
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

function cleanGate(value: unknown): CameraStopRecordingGate | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return undefined;
  const gate: CameraStopRecordingGate = {};
  if (typeof value.accepted === "boolean") gate.accepted = value.accepted;
  if (typeof value.allowed === "boolean") gate.allowed = value.allowed;
  const reason = cleanString(value.reason);
  if (reason !== undefined) gate.reason = reason;
  return gate;
}

function cleanAuditMetadata(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return isRecord(value) ? value : undefined;
}

function cleanRetentionPolicy(value: unknown): CameraStopRecordingRetentionPolicy | undefined {
  if (value === undefined) return cameraStopRecordingDescriptor.defaultRetentionPolicy;
  return value === "ephemeral" || value === "session-only" || value === "session-scoped" || value === "persistent"
    ? value
    : undefined;
}

function hasAllowedStorageScheme(value: string): boolean {
  return cameraStopRecordingDescriptor.allowedStorageSchemes.some((scheme) => value.startsWith(scheme));
}

function auditEvent(
  type: string,
  context: CameraStopRecordingContext | undefined,
  recordingId: string | undefined,
  metadata?: Readonly<Record<string, unknown>>,
): CameraStopRecordingAuditEvent {
  return {
    type,
    toolId: cameraStopRecordingDescriptor.toolId,
    invocationId: context?.invocationId ?? "computeruse.cameraStopRecording:dry-run",
    dryRun: context?.dryRun !== false,
    recordingId,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: CameraStopRecordingErrorCode,
  message: string,
  boundary: CameraStopRecordingBoundary,
  context: CameraStopRecordingContext | undefined,
  recordingId?: string,
): CameraStopRecordingResult {
  return {
    ok: false,
    toolId: cameraStopRecordingDescriptor.toolId,
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("agentCore.basicTool.computeruse.cameraStopRecording.rejected", context, recordingId, { code })],
    events: ["basicTool.computeruse.cameraStopRecording.rejected"],
  };
}

function normalizeContext(value: unknown): CameraStopRecordingContext | CameraStopRecordingResult {
  if (value === undefined) return {};
  if (!isRecord(value)) return failure("INVALID_CONTEXT", "computeruse.cameraStopRecording context must be an object", "input", undefined);

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
    return failure("INVALID_CONTEXT", "computeruse.cameraStopRecording context contains malformed guard, governance, or scope fields", "input", undefined);
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
  context: CameraStopRecordingContext,
): CameraStopRecordingTarget | CameraStopRecordingResult {
  const targetValue = request.target;
  if (targetValue !== undefined && !isRecord(targetValue)) {
    return failure("INVALID_TARGET", "computeruse.cameraStopRecording target must be an object when provided", "input", context);
  }

  const target = isRecord(targetValue) ? targetValue : {};
  const recordingValue = target.recordingId ?? target.recordingRef ?? request.recordingId ?? request.recordingRef;
  const purposeValue = target.purpose ?? request.purpose;
  const storageTargetValue = target.storageTarget ?? request.storageTarget;
  const retentionPolicyValue = target.retentionPolicy ?? request.retentionPolicy;
  const destinationValue = target.destinationHint ?? target.persistHint ?? request.destinationHint ?? request.persistHint;

  const recordingId = cleanString(recordingValue, 256);
  const purpose = cleanString(purposeValue);
  const storageTarget = cleanString(storageTargetValue);
  const retentionPolicy = cleanRetentionPolicy(retentionPolicyValue);
  const destinationHint = cleanString(destinationValue);

  if (recordingValue === undefined) {
    return failure("MISSING_RECORDING_ID", "computeruse.cameraStopRecording requires target.recordingId", "input", context);
  }
  if (recordingId === undefined) {
    return failure("INVALID_RECORDING_ID", "computeruse.cameraStopRecording recordingId must be a safe string", "input", context);
  }
  if (purposeValue === undefined) {
    return failure("MISSING_PURPOSE", "computeruse.cameraStopRecording requires an explicit purpose", "input", context, recordingId);
  }
  if (purpose === undefined) {
    return failure("INVALID_PURPOSE", "computeruse.cameraStopRecording purpose must be a safe string", "input", context, recordingId);
  }
  if (storageTargetValue !== undefined && (storageTarget === undefined || !hasAllowedStorageScheme(storageTarget))) {
    return failure(
      "INVALID_STORAGE_TARGET",
      "computeruse.cameraStopRecording storageTarget must use artifact://, session://, runtime://, or memory://",
      "input",
      context,
      recordingId,
    );
  }
  if (retentionPolicy === undefined) {
    return failure(
      "INVALID_RETENTION_POLICY",
      "computeruse.cameraStopRecording retentionPolicy must be ephemeral, session-only, session-scoped, or persistent",
      "input",
      context,
      recordingId,
    );
  }
  if (destinationValue !== undefined && destinationHint === undefined) {
    return failure("INVALID_DESTINATION_HINT", "computeruse.cameraStopRecording destinationHint must be a safe string", "input", context, recordingId);
  }

  return { recordingId, purpose, storageTarget, retentionPolicy, destinationHint };
}

function ensureScopes(target: CameraStopRecordingTarget, context: CameraStopRecordingContext): CameraStopRecordingResult | undefined {
  const requested = context.requestedScopes ?? [];
  const allowed = context.allowedScopes ?? [];
  if (requested.length === 0) return undefined;

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length === 0) return undefined;

  return failure("SCOPE_DENIED", `computeruse.cameraStopRecording scope ${denied[0]} is outside runtime governance`, "scope", context, target.recordingId);
}

function ensureStaticGates(target: CameraStopRecordingTarget, context: CameraStopRecordingContext): CameraStopRecordingResult | undefined {
  if (context.contract?.accepted === false || context.contract?.allowed === false) {
    return failure(
      "CONTRACT_REJECTED",
      context.contract.reason ?? "computeruse.cameraStopRecording was rejected by runtime contract surface",
      "contract",
      context,
      target.recordingId,
    );
  }
  if (context.governance?.accepted === false || context.governance?.allowed === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      context.governance.reason ?? "computeruse.cameraStopRecording was rejected by runtime governance",
      "governance",
      context,
      target.recordingId,
    );
  }
  return undefined;
}

function ensureRealExecutionGuard(target: CameraStopRecordingTarget, context: CameraStopRecordingContext): CameraStopRecordingResult | undefined {
  if (context.dryRun !== false) return undefined;
  if (context.guard?.accepted === true || context.guard?.allowed === true) return undefined;
  return failure(
    "GOVERNANCE_REJECTED",
    context.guard?.reason ?? "computeruse.cameraStopRecording dryRun:false requires an affirmative runtime guard",
    "governance",
    context,
    target.recordingId,
  );
}

function baseOutput(
  target: CameraStopRecordingTarget,
  acceptedScopes: readonly string[],
  dryRun: boolean,
  providerCalled: boolean,
): Omit<CameraStopRecordingOutput, "artifactEnvelope"> {
  return {
    kind: "agentCore.basicTool.computeruse.cameraStopRecording",
    target,
    dispatch: dryRun ? "dry-run" : "runtime-computeruse",
    dryRun,
    providerCalled,
    executionBlocked: dryRun,
    unsafeSideEffects: true,
    permissionsRequired: ["camera:stop-recording", "recording:session", "artifact:write"],
    requiresTapApproval: true,
    acceptedScopes,
    runtimeEntry: {
      port: "BaseToolExecutorPort.computeruse.stopRecording",
      operation: "computeruse.cameraStopRecording.stop",
      runtimeOwnsCameraAccess: true,
      runtimeOwnsRecordingSession: true,
      runtimeOwnsArtifactStorage: true,
      baseToolOwnsTapStrategy: false,
    },
  };
}

function normalizeProviderResult(
  value: unknown,
  context: CameraStopRecordingContext,
  target: CameraStopRecordingTarget,
): CameraStopRecordingProviderResult | CameraStopRecordingResult {
  if (!isRecord(value) || cleanString(value.artifactId) === undefined || cleanString(value.mimeType) === undefined) {
    return failure(
      "PROVIDER_FAILURE",
      "computeruse.cameraStopRecording runtime provider returned a malformed public-safe recording artifact envelope",
      "provider",
      context,
      target.recordingId,
    );
  }

  return {
    artifactId: cleanString(value.artifactId) ?? "",
    mimeType: cleanString(value.mimeType) ?? "",
    storageUri: cleanString(value.storageUri),
    retentionPolicy: cleanRetentionPolicy(value.retentionPolicy),
    metadata: cleanAuditMetadata(value.metadata),
  };
}

function normalizeRequest(request: unknown): {
  target: CameraStopRecordingTarget;
  context: CameraStopRecordingContext;
  metadata?: Readonly<Record<string, unknown>>;
  provider?: CameraStopRecordingProvider;
} | CameraStopRecordingResult {
  if (request === undefined) request = {};
  if (!isRecord(request)) {
    return failure("INVALID_REQUEST", "computeruse.cameraStopRecording request must be an object", "input", undefined);
  }

  const context = normalizeContext(request.context);
  if ("ok" in context) return context;

  const target = normalizeTarget(request, context);
  if ("ok" in target) return target;

  if (context.runtimeId === undefined) {
    return failure("MISSING_RUNTIME_ID", "computeruse.cameraStopRecording requires context.runtimeId for audit", "input", context, target.recordingId);
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
    metadata: cleanAuditMetadata(request.metadata),
    provider: typeof request.provider === "function" ? (request.provider as CameraStopRecordingProvider) : undefined,
  };
}

export async function executeCameraStopRecording(request: unknown = {}): Promise<CameraStopRecordingResult> {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) return normalized;

  const { target, context, metadata, provider } = normalized;
  const acceptedScopes = context.requestedScopes ?? [];
  const dryRun = context.dryRun !== false;

  if (dryRun) {
    return {
      ok: true,
      toolId: cameraStopRecordingDescriptor.toolId,
      output: {
        ...baseOutput(target, acceptedScopes, true, false),
        artifactEnvelope: {
          resource: "camera-recording",
          stopRequested: false,
          stopped: false,
          metadataOnly: true,
          recordingId: target.recordingId,
          retentionPolicy: target.retentionPolicy,
        },
      },
      audit: [auditEvent("agentCore.basicTool.computeruse.cameraStopRecording.dryRun", context, target.recordingId, metadata)],
      events: ["basicTool.computeruse.cameraStopRecording.dryRun"],
    };
  }

  if (provider === undefined) {
    return failure(
      "PROVIDER_UNAVAILABLE",
      "computeruse.cameraStopRecording requires runtime executor.computeruse.stopRecording for dryRun:false",
      "provider",
      context,
      target.recordingId,
    );
  }

  let providerResult: CameraStopRecordingProviderResult;
  try {
    const result = await provider({
      operation: "computeruse.cameraStopRecording.stop",
      target,
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
      "computeruse.cameraStopRecording runtime provider failed without exposing private details",
      "provider",
      context,
      target.recordingId,
    );
  }

  return {
    ok: true,
    toolId: cameraStopRecordingDescriptor.toolId,
    output: {
      ...baseOutput(target, acceptedScopes, false, true),
      artifactEnvelope: {
        resource: "camera-recording",
        stopRequested: true,
        stopped: true,
        metadataOnly: false,
        recordingId: target.recordingId,
        artifactId: providerResult.artifactId,
        mimeType: providerResult.mimeType,
        storageUri: providerResult.storageUri,
        retentionPolicy: providerResult.retentionPolicy ?? target.retentionPolicy,
      },
      providerMetadata: providerResult.metadata,
    },
    audit: [auditEvent("agentCore.basicTool.computeruse.cameraStopRecording.stopped", context, target.recordingId, providerResult.metadata)],
    events: ["basicTool.computeruse.cameraStopRecording.stopped"],
  };
}

export const planCameraStopRecording = executeCameraStopRecording;
