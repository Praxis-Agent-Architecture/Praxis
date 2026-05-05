export type CameraStartRecordingBoundary = "input" | "contract" | "governance" | "scope" | "resource" | "provider";

export type CameraStartRecordingGate = {
  accepted?: boolean;
  allowed?: boolean;
  reason?: string;
};

export type CameraStartRecordingContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: CameraStartRecordingGate;
  contract?: CameraStartRecordingGate;
  governance?: CameraStartRecordingGate;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type CameraStartRecordingTarget = {
  cameraId: string;
  purpose: string;
  outputFormat: "video/webm" | "video/mp4" | "video/quicktime";
  includeAudio: boolean;
  maxDurationMs: number;
  recordingLabel?: string;
  destinationHint?: string;
  permissionLeaseId?: string;
};

export type CameraStartRecordingProviderRequest = {
  operation: "computeruse.cameraStartRecording.start";
  target: CameraStartRecordingTarget;
  context: {
    runtimeId?: string;
    sessionId?: string;
    invocationId?: string;
    auditMetadata?: Readonly<Record<string, unknown>>;
  };
};

export type CameraStartRecordingProviderResult = {
  recordingId: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type CameraStartRecordingProvider = (
  request: CameraStartRecordingProviderRequest,
) => Promise<CameraStartRecordingProviderResult> | CameraStartRecordingProviderResult;

export type CameraStartRecordingInput = {
  target?: unknown;
  context?: unknown;
  cameraId?: unknown;
  deviceId?: unknown;
  purpose?: unknown;
  outputFormat?: unknown;
  includeAudio?: unknown;
  maxDurationMs?: unknown;
  recordingLabel?: unknown;
  destinationHint?: unknown;
  permissionLeaseId?: unknown;
  leaseId?: unknown;
  metadata?: unknown;
  provider?: CameraStartRecordingProvider;
};

export type CameraStartRecordingErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_CONTEXT"
  | "INVALID_TARGET"
  | "MISSING_RUNTIME_ID"
  | "MISSING_CAMERA_ID"
  | "MISSING_PURPOSE"
  | "INVALID_CAMERA_ID"
  | "INVALID_PURPOSE"
  | "INVALID_OUTPUT_FORMAT"
  | "INVALID_MAX_DURATION"
  | "INVALID_INCLUDE_AUDIO"
  | "INVALID_RECORDING_LABEL"
  | "INVALID_DESTINATION_HINT"
  | "INVALID_PERMISSION_LEASE"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_FAILURE";

export type CameraStartRecordingError = {
  code: CameraStartRecordingErrorCode;
  message: string;
  boundary: CameraStartRecordingBoundary;
  publicSafe: true;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type CameraStartRecordingAuditEvent = {
  type: string;
  toolId: "computeruse.cameraStartRecording";
  invocationId: string;
  dryRun: boolean;
  cameraId?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type CameraStartRecordingOutput = {
  kind: "agentCore.basicTool.computeruse.cameraStartRecording";
  target: CameraStartRecordingTarget;
  dispatch: "dry-run" | "runtime-computeruse";
  dryRun: boolean;
  providerCalled: boolean;
  executionBlocked: boolean;
  unsafeSideEffects: true;
  permissionsRequired: readonly ["camera:start-recording"];
  requiresTapApproval: true;
  acceptedScopes: readonly string[];
  runtimeEntry: {
    port: "BaseToolExecutorPort.computeruse.startRecording";
    operation: "computeruse.cameraStartRecording.start";
    runtimeOwnsCameraAccess: true;
    runtimeOwnsRecordingSession: true;
    baseToolOwnsTapStrategy: false;
  };
  recordingEnvelope: {
    resource: "camera";
    startRequested: boolean;
    started: boolean;
    metadataOnly: boolean;
    recordingId?: string;
  };
  providerMetadata?: Readonly<Record<string, unknown>>;
};

export type CameraStartRecordingResult =
  | {
      ok: true;
      toolId: "computeruse.cameraStartRecording";
      output: CameraStartRecordingOutput;
      audit: readonly CameraStartRecordingAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "computeruse.cameraStartRecording";
      error: CameraStartRecordingError;
      audit: readonly CameraStartRecordingAuditEvent[];
      events: readonly string[];
    };

export const cameraStartRecordingDescriptor = {
  toolId: "computeruse.cameraStartRecording",
  capability: "start-camera-recording",
  route: "agent_executionEngine.basic_toolLayer.baseTools.computeruseBase.cameraAccess",
  defaultDryRun: true,
  defaultOutputFormat: "video/webm",
  defaultMaxDurationMs: 60_000,
  maxDurationLimitMs: 3_600_000,
  tapOwnsApproval: true,
  runtimeEntry: "BaseToolExecutorPort.computeruse.startRecording",
  permissionsRequired: ["camera:start-recording"],
  unsafeSideEffects: true,
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanString(value: unknown, maxLength = 512): string | undefined {
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

function cleanGate(value: unknown): CameraStartRecordingGate | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return undefined;
  const gate: CameraStartRecordingGate = {};
  if (typeof value.accepted === "boolean") gate.accepted = value.accepted;
  if (typeof value.allowed === "boolean") gate.allowed = value.allowed;
  const reason = cleanString(value.reason);
  if (reason !== undefined) gate.reason = reason;
  return gate;
}

function cleanAuditMetadata(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return isRecord(value) ? value : undefined;
}

function cleanOutputFormat(value: unknown): CameraStartRecordingTarget["outputFormat"] | undefined {
  if (value === undefined) return cameraStartRecordingDescriptor.defaultOutputFormat;
  return value === "video/webm" || value === "video/mp4" || value === "video/quicktime" ? value : undefined;
}

function cleanDuration(value: unknown): number | undefined {
  if (value === undefined) return cameraStartRecordingDescriptor.defaultMaxDurationMs;
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value > 0 &&
    value <= cameraStartRecordingDescriptor.maxDurationLimitMs
    ? value
    : undefined;
}

function auditEvent(
  type: string,
  context: CameraStartRecordingContext | undefined,
  cameraId: string | undefined,
  metadata?: Readonly<Record<string, unknown>>,
): CameraStartRecordingAuditEvent {
  return {
    type,
    toolId: cameraStartRecordingDescriptor.toolId,
    invocationId: context?.invocationId ?? "computeruse.cameraStartRecording:dry-run",
    dryRun: context?.dryRun !== false,
    cameraId,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: CameraStartRecordingErrorCode,
  message: string,
  boundary: CameraStartRecordingBoundary,
  context: CameraStartRecordingContext | undefined,
  cameraId?: string,
): CameraStartRecordingResult {
  return {
    ok: false,
    toolId: cameraStartRecordingDescriptor.toolId,
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("agentCore.basicTool.computeruse.cameraStartRecording.rejected", context, cameraId, { code })],
    events: ["basicTool.computeruse.cameraStartRecording.rejected"],
  };
}

function normalizeContext(value: unknown): CameraStartRecordingContext | CameraStartRecordingResult {
  if (value === undefined) return {};
  if (!isRecord(value)) return failure("INVALID_CONTEXT", "computeruse.cameraStartRecording context must be an object", "input", undefined);

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
    return failure("INVALID_CONTEXT", "computeruse.cameraStartRecording context contains malformed guard, governance, or scope fields", "input", undefined);
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
  context: CameraStartRecordingContext,
): CameraStartRecordingTarget | CameraStartRecordingResult {
  const targetValue = request.target;
  if (targetValue !== undefined && !isRecord(targetValue)) {
    return failure("INVALID_TARGET", "computeruse.cameraStartRecording target must be an object when provided", "input", context);
  }
  const target = isRecord(targetValue) ? targetValue : {};
  const cameraId = cleanString(target.cameraId ?? target.deviceId ?? request.cameraId ?? request.deviceId, 128);
  const purpose = cleanString(target.purpose ?? request.purpose);
  const outputFormat = cleanOutputFormat(target.outputFormat ?? request.outputFormat);
  const includeAudioRaw = target.includeAudio ?? request.includeAudio;
  const includeAudio = includeAudioRaw === undefined ? false : includeAudioRaw;
  const maxDurationMs = cleanDuration(target.maxDurationMs ?? request.maxDurationMs);
  const recordingLabel = cleanString(target.recordingLabel ?? request.recordingLabel);
  const destinationHint = cleanString(target.destinationHint ?? request.destinationHint);
  const permissionLeaseId = cleanString(target.permissionLeaseId ?? target.leaseId ?? request.permissionLeaseId ?? request.leaseId, 256);

  if (cameraId === undefined) {
    return failure(
      (target.cameraId ?? target.deviceId ?? request.cameraId ?? request.deviceId) === undefined ? "MISSING_CAMERA_ID" : "INVALID_CAMERA_ID",
      "computeruse.cameraStartRecording requires a bounded camera id",
      "input",
      context,
    );
  }
  if (purpose === undefined) {
    return failure(
      (target.purpose ?? request.purpose) === undefined ? "MISSING_PURPOSE" : "INVALID_PURPOSE",
      "computeruse.cameraStartRecording requires an explicit purpose",
      "input",
      context,
      cameraId,
    );
  }
  if (outputFormat === undefined) {
    return failure("INVALID_OUTPUT_FORMAT", "computeruse.cameraStartRecording outputFormat must be video/webm, video/mp4, or video/quicktime", "input", context, cameraId);
  }
  if (typeof includeAudio !== "boolean") {
    return failure("INVALID_INCLUDE_AUDIO", "computeruse.cameraStartRecording includeAudio must be boolean when provided", "input", context, cameraId);
  }
  if (maxDurationMs === undefined) {
    return failure("INVALID_MAX_DURATION", "computeruse.cameraStartRecording maxDurationMs must be between 1 and 3600000", "resource", context, cameraId);
  }
  if ((target.recordingLabel ?? request.recordingLabel) !== undefined && recordingLabel === undefined) {
    return failure("INVALID_RECORDING_LABEL", "computeruse.cameraStartRecording recordingLabel must be a safe string", "input", context, cameraId);
  }
  if ((target.destinationHint ?? request.destinationHint) !== undefined && destinationHint === undefined) {
    return failure("INVALID_DESTINATION_HINT", "computeruse.cameraStartRecording destinationHint must be a safe string", "input", context, cameraId);
  }
  if ((target.permissionLeaseId ?? target.leaseId ?? request.permissionLeaseId ?? request.leaseId) !== undefined && permissionLeaseId === undefined) {
    return failure("INVALID_PERMISSION_LEASE", "computeruse.cameraStartRecording permission lease id must be a safe string", "input", context, cameraId);
  }

  return {
    cameraId,
    purpose,
    outputFormat,
    includeAudio,
    maxDurationMs,
    recordingLabel,
    destinationHint,
    permissionLeaseId,
  };
}

function ensureScopes(target: CameraStartRecordingTarget, context: CameraStartRecordingContext): CameraStartRecordingResult | undefined {
  const requested = context.requestedScopes ?? [];
  const allowed = context.allowedScopes ?? [];
  if (requested.length === 0) return undefined;

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length === 0) return undefined;

  return failure("SCOPE_DENIED", `computeruse.cameraStartRecording scope ${denied[0]} is outside runtime governance`, "scope", context, target.cameraId);
}

function ensureStaticGates(target: CameraStartRecordingTarget, context: CameraStartRecordingContext): CameraStartRecordingResult | undefined {
  if (context.contract?.accepted === false || context.contract?.allowed === false) {
    return failure(
      "CONTRACT_REJECTED",
      context.contract.reason ?? "computeruse.cameraStartRecording was rejected by runtime contract surface",
      "contract",
      context,
      target.cameraId,
    );
  }
  if (context.governance?.accepted === false || context.governance?.allowed === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      context.governance.reason ?? "computeruse.cameraStartRecording was rejected by runtime governance",
      "governance",
      context,
      target.cameraId,
    );
  }
  return undefined;
}

function ensureRealExecutionGuard(target: CameraStartRecordingTarget, context: CameraStartRecordingContext): CameraStartRecordingResult | undefined {
  if (context.dryRun !== false) return undefined;
  if (context.guard?.accepted === true || context.guard?.allowed === true) return undefined;
  return failure(
    "GOVERNANCE_REJECTED",
    context.guard?.reason ?? "computeruse.cameraStartRecording dryRun:false requires an affirmative runtime guard",
    "governance",
    context,
    target.cameraId,
  );
}

function baseOutput(
  target: CameraStartRecordingTarget,
  acceptedScopes: readonly string[],
  dryRun: boolean,
  providerCalled: boolean,
): Omit<CameraStartRecordingOutput, "recordingEnvelope"> {
  return {
    kind: "agentCore.basicTool.computeruse.cameraStartRecording",
    target,
    dispatch: dryRun ? "dry-run" : "runtime-computeruse",
    dryRun,
    providerCalled,
    executionBlocked: dryRun,
    unsafeSideEffects: true,
    permissionsRequired: cameraStartRecordingDescriptor.permissionsRequired,
    requiresTapApproval: true,
    acceptedScopes,
    runtimeEntry: {
      port: "BaseToolExecutorPort.computeruse.startRecording",
      operation: "computeruse.cameraStartRecording.start",
      runtimeOwnsCameraAccess: true,
      runtimeOwnsRecordingSession: true,
      baseToolOwnsTapStrategy: false,
    },
  };
}

function normalizeProviderResult(
  value: unknown,
  context: CameraStartRecordingContext,
  target: CameraStartRecordingTarget,
): CameraStartRecordingProviderResult | CameraStartRecordingResult {
  if (!isRecord(value)) {
    return failure("PROVIDER_FAILURE", "computeruse.cameraStartRecording runtime provider returned a malformed public-safe recording envelope", "provider", context, target.cameraId);
  }
  const recordingId = cleanString(value.recordingId, 256);
  if (recordingId === undefined) {
    return failure("PROVIDER_FAILURE", "computeruse.cameraStartRecording runtime provider returned an invalid recording id", "provider", context, target.cameraId);
  }
  return {
    recordingId,
    metadata: cleanAuditMetadata(value.metadata),
  };
}

function normalizeRequest(request: unknown): {
  target: CameraStartRecordingTarget;
  context: CameraStartRecordingContext;
  metadata?: Readonly<Record<string, unknown>>;
  provider?: CameraStartRecordingProvider;
} | CameraStartRecordingResult {
  if (request === undefined) request = {};
  if (!isRecord(request)) {
    return failure("INVALID_REQUEST", "computeruse.cameraStartRecording request must be an object", "input", undefined);
  }

  const context = normalizeContext(request.context);
  if ("ok" in context) return context;

  const target = normalizeTarget(request, context);
  if ("ok" in target) return target;

  if (context.runtimeId === undefined) {
    return failure("MISSING_RUNTIME_ID", "computeruse.cameraStartRecording requires context.runtimeId for audit", "input", context, target.cameraId);
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
    provider: typeof request.provider === "function" ? (request.provider as CameraStartRecordingProvider) : undefined,
  };
}

export async function executeCameraStartRecording(request: unknown = {}): Promise<CameraStartRecordingResult> {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) return normalized;

  const { target, context, metadata, provider } = normalized;
  const acceptedScopes = context.requestedScopes ?? [];
  const dryRun = context.dryRun !== false;

  if (dryRun) {
    return {
      ok: true,
      toolId: cameraStartRecordingDescriptor.toolId,
      output: {
        ...baseOutput(target, acceptedScopes, true, false),
        recordingEnvelope: {
          resource: "camera",
          startRequested: false,
          started: false,
          metadataOnly: true,
        },
      },
      audit: [auditEvent("agentCore.basicTool.computeruse.cameraStartRecording.dryRun", context, target.cameraId, metadata)],
      events: ["basicTool.computeruse.cameraStartRecording.dryRun"],
    };
  }

  if (provider === undefined) {
    return failure(
      "PROVIDER_UNAVAILABLE",
      "computeruse.cameraStartRecording requires runtime executor.computeruse.startRecording for dryRun:false",
      "provider",
      context,
      target.cameraId,
    );
  }

  let providerResult: CameraStartRecordingProviderResult;
  try {
    const result = await provider({
      operation: "computeruse.cameraStartRecording.start",
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
    return failure("PROVIDER_FAILURE", "computeruse.cameraStartRecording runtime provider failed without exposing private details", "provider", context, target.cameraId);
  }

  return {
    ok: true,
    toolId: cameraStartRecordingDescriptor.toolId,
    output: {
      ...baseOutput(target, acceptedScopes, false, true),
      recordingEnvelope: {
        resource: "camera",
        startRequested: true,
        started: true,
        metadataOnly: false,
        recordingId: providerResult.recordingId,
      },
      providerMetadata: providerResult.metadata,
    },
    audit: [auditEvent("agentCore.basicTool.computeruse.cameraStartRecording.started", context, target.cameraId, providerResult.metadata)],
    events: ["basicTool.computeruse.cameraStartRecording.started"],
  };
}

export const planCameraStartRecording = executeCameraStartRecording;
