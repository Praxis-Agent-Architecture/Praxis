export type CameraFaceRecognitionBoundary = "input" | "contract" | "governance" | "scope" | "provider";

export type CameraFaceRecognitionGate = {
  accepted?: boolean;
  allowed?: boolean;
  reason?: string;
};

export type CameraFaceRecognitionMode = "detect-faces" | "verify-consented-face" | "identify-consented-face";

export type CameraFaceRecognitionContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: CameraFaceRecognitionGate;
  contract?: CameraFaceRecognitionGate;
  governance?: CameraFaceRecognitionGate;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type CameraFaceRecognitionTarget = {
  frameRef: string;
  mode: CameraFaceRecognitionMode;
  maxFaces: number;
  deviceId?: string;
  subjectRef?: string;
  subjectConsent?: CameraFaceRecognitionGate;
};

export type CameraFaceRecognitionProviderRequest = {
  operation: "computeruse.cameraFaceRecognition.analyze";
  target: CameraFaceRecognitionTarget;
  context: {
    runtimeId?: string;
    sessionId?: string;
    invocationId?: string;
    auditMetadata?: Readonly<Record<string, unknown>>;
  };
};

export type CameraFaceRecognitionFace = {
  faceId?: string;
  boundingBox?: Readonly<{ x: number; y: number; width: number; height: number; coordinateSpace: "normalized" | "image" }>;
  confidence?: number;
  identityLabel?: string;
  matchedSubjectRef?: string;
  matchConfidence?: number;
};

export type CameraFaceRecognitionProviderResult = {
  faceCount: number;
  faces: readonly CameraFaceRecognitionFace[];
  identityResolved: boolean;
  metadata?: Readonly<Record<string, unknown>>;
};

export type CameraFaceRecognitionProvider = (
  request: CameraFaceRecognitionProviderRequest,
) => Promise<CameraFaceRecognitionProviderResult> | CameraFaceRecognitionProviderResult;

export type CameraFaceRecognitionInput = {
  target?: unknown;
  context?: unknown;
  frameRef?: unknown;
  cameraFrameRef?: unknown;
  deviceId?: unknown;
  mode?: unknown;
  maxFaces?: unknown;
  subjectRef?: unknown;
  subjectConsent?: unknown;
  metadata?: unknown;
  provider?: CameraFaceRecognitionProvider;
};

export type CameraFaceRecognitionErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_CONTEXT"
  | "INVALID_TARGET"
  | "MISSING_RUNTIME_ID"
  | "MISSING_FRAME_REF"
  | "INVALID_FRAME_REF"
  | "INVALID_CAMERA_DEVICE"
  | "INVALID_MODE"
  | "INVALID_FACE_LIMIT"
  | "INVALID_SUBJECT_REF"
  | "BIOMETRIC_CONSENT_REQUIRED"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_FAILURE";

export type CameraFaceRecognitionError = {
  code: CameraFaceRecognitionErrorCode;
  message: string;
  boundary: CameraFaceRecognitionBoundary;
  publicSafe: true;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type CameraFaceRecognitionAuditEvent = {
  type: string;
  toolId: "computeruse.cameraFaceRecognition";
  invocationId: string;
  dryRun: boolean;
  frameRef?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type CameraFaceRecognitionOutput = {
  kind: "agentCore.basicTool.computeruse.cameraFaceRecognition";
  target: CameraFaceRecognitionTarget;
  dispatch: "dry-run" | "runtime-computeruse";
  dryRun: boolean;
  providerCalled: boolean;
  executionBlocked: boolean;
  unsafeSideEffects: true;
  permissionsRequired: readonly ["camera:read", "vision:face-analysis"];
  requiresTapApproval: true;
  biometricConsentRequired: boolean;
  biometricDataStored: false;
  acceptedScopes: readonly string[];
  runtimeEntry: {
    port: "BaseToolExecutorPort.computeruse.analyzeCameraFrame";
    operation: "computeruse.cameraFaceRecognition.analyze";
    runtimeOwnsCameraMaterial: true;
    runtimeOwnsVisionProvider: true;
    runtimeOwnsBiometricPolicy: true;
    baseToolOwnsTapStrategy: false;
  };
  recognitionEnvelope: {
    resource: "camera-frame";
    analysisRequested: boolean;
    analyzed: boolean;
    metadataOnly: boolean;
    frameRef: string;
    mode: CameraFaceRecognitionMode;
    faceCount: number;
    identityResolved: boolean;
    faces: readonly CameraFaceRecognitionFace[];
  };
  providerMetadata?: Readonly<Record<string, unknown>>;
};

export type CameraFaceRecognitionResult =
  | {
      ok: true;
      toolId: "computeruse.cameraFaceRecognition";
      output: CameraFaceRecognitionOutput;
      audit: readonly CameraFaceRecognitionAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "computeruse.cameraFaceRecognition";
      error: CameraFaceRecognitionError;
      audit: readonly CameraFaceRecognitionAuditEvent[];
      events: readonly string[];
    };

export const cameraFaceRecognitionDescriptor = {
  toolId: "computeruse.cameraFaceRecognition",
  capability: "analyze-camera-frame-faces",
  route: "agent_executionEngine.basic_toolLayer.baseTools.computeruseBase.cameraAccess",
  defaultDryRun: true,
  defaultMode: "detect-faces",
  defaultMaxFaces: 16,
  maxFaceLimit: 64,
  tapOwnsApproval: true,
  runtimeEntry: "BaseToolExecutorPort.computeruse.analyzeCameraFrame",
  permissionsRequired: ["camera:read", "vision:face-analysis"],
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

function cleanGate(value: unknown): CameraFaceRecognitionGate | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return undefined;
  const gate: CameraFaceRecognitionGate = {};
  if (typeof value.accepted === "boolean") gate.accepted = value.accepted;
  if (typeof value.allowed === "boolean") gate.allowed = value.allowed;
  const reason = cleanString(value.reason);
  if (reason !== undefined) gate.reason = reason;
  return gate;
}

function cleanAuditMetadata(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return isRecord(value) ? value : undefined;
}

function cleanMode(value: unknown): CameraFaceRecognitionMode | undefined {
  if (value === undefined) return cameraFaceRecognitionDescriptor.defaultMode;
  return value === "detect-faces" || value === "verify-consented-face" || value === "identify-consented-face"
    ? value
    : undefined;
}

function cleanMaxFaces(value: unknown): number | undefined {
  if (value === undefined) return cameraFaceRecognitionDescriptor.defaultMaxFaces;
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= cameraFaceRecognitionDescriptor.maxFaceLimit
    ? value
    : undefined;
}

function isIdentityMode(mode: CameraFaceRecognitionMode): boolean {
  return mode === "verify-consented-face" || mode === "identify-consented-face";
}

function auditEvent(
  type: string,
  context: CameraFaceRecognitionContext | undefined,
  frameRef: string | undefined,
  metadata?: Readonly<Record<string, unknown>>,
): CameraFaceRecognitionAuditEvent {
  return {
    type,
    toolId: cameraFaceRecognitionDescriptor.toolId,
    invocationId: context?.invocationId ?? "computeruse.cameraFaceRecognition:dry-run",
    dryRun: context?.dryRun !== false,
    frameRef,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: CameraFaceRecognitionErrorCode,
  message: string,
  boundary: CameraFaceRecognitionBoundary,
  context: CameraFaceRecognitionContext | undefined,
  frameRef?: string,
): CameraFaceRecognitionResult {
  return {
    ok: false,
    toolId: cameraFaceRecognitionDescriptor.toolId,
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("agentCore.basicTool.computeruse.cameraFaceRecognition.rejected", context, frameRef, { code })],
    events: ["basicTool.computeruse.cameraFaceRecognition.rejected"],
  };
}

function normalizeContext(value: unknown): CameraFaceRecognitionContext | CameraFaceRecognitionResult {
  if (value === undefined) return {};
  if (!isRecord(value)) return failure("INVALID_CONTEXT", "computeruse.cameraFaceRecognition context must be an object", "input", undefined);

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
    return failure("INVALID_CONTEXT", "computeruse.cameraFaceRecognition context contains malformed guard, governance, or scope fields", "input", undefined);
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
  context: CameraFaceRecognitionContext,
): CameraFaceRecognitionTarget | CameraFaceRecognitionResult {
  const targetValue = request.target;
  if (targetValue !== undefined && !isRecord(targetValue)) {
    return failure("INVALID_TARGET", "computeruse.cameraFaceRecognition target must be an object when provided", "input", context);
  }

  const target = isRecord(targetValue) ? targetValue : {};
  const frameRefValue = target.frameRef ?? target.cameraFrameRef ?? request.frameRef ?? request.cameraFrameRef;
  const frameRef = cleanString(frameRefValue, 256);
  const deviceIdValue = target.deviceId ?? request.deviceId;
  const deviceId = cleanString(deviceIdValue, 256);
  const mode = cleanMode(target.mode ?? request.mode);
  const maxFaces = cleanMaxFaces(target.maxFaces ?? request.maxFaces);
  const subjectRefValue = target.subjectRef ?? request.subjectRef;
  const subjectRef = cleanString(subjectRefValue, 256);
  const subjectConsent = cleanGate(target.subjectConsent ?? request.subjectConsent);

  if (frameRefValue === undefined) {
    return failure("MISSING_FRAME_REF", "computeruse.cameraFaceRecognition requires target.frameRef", "input", context);
  }
  if (frameRef === undefined) {
    return failure("INVALID_FRAME_REF", "computeruse.cameraFaceRecognition frameRef must be a safe opaque reference", "input", context);
  }
  if (deviceIdValue !== undefined && deviceId === undefined) {
    return failure("INVALID_CAMERA_DEVICE", "computeruse.cameraFaceRecognition deviceId must be a safe opaque identifier", "input", context, frameRef);
  }
  if (mode === undefined) {
    return failure("INVALID_MODE", "computeruse.cameraFaceRecognition mode must be detect-faces, verify-consented-face, or identify-consented-face", "input", context, frameRef);
  }
  if (maxFaces === undefined) {
    return failure("INVALID_FACE_LIMIT", "computeruse.cameraFaceRecognition maxFaces must be between 1 and 64", "input", context, frameRef);
  }
  if (subjectRefValue !== undefined && subjectRef === undefined) {
    return failure("INVALID_SUBJECT_REF", "computeruse.cameraFaceRecognition subjectRef must be a safe opaque reference", "input", context, frameRef);
  }
  if (isIdentityMode(mode) && subjectConsent?.accepted !== true && subjectConsent?.allowed !== true) {
    return failure(
      "BIOMETRIC_CONSENT_REQUIRED",
      subjectConsent?.reason ?? "identity-level face recognition requires explicit subject consent",
      "governance",
      context,
      frameRef,
    );
  }

  return { frameRef, deviceId, mode, maxFaces, subjectRef, subjectConsent };
}

function ensureScopes(target: CameraFaceRecognitionTarget, context: CameraFaceRecognitionContext): CameraFaceRecognitionResult | undefined {
  const requested = context.requestedScopes ?? [];
  const allowed = context.allowedScopes ?? [];
  if (requested.length === 0) return undefined;

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length === 0) return undefined;

  return failure("SCOPE_DENIED", `computeruse.cameraFaceRecognition scope ${denied[0]} is outside runtime governance`, "scope", context, target.frameRef);
}

function ensureStaticGates(target: CameraFaceRecognitionTarget, context: CameraFaceRecognitionContext): CameraFaceRecognitionResult | undefined {
  if (context.contract?.accepted === false || context.contract?.allowed === false) {
    return failure(
      "CONTRACT_REJECTED",
      context.contract.reason ?? "computeruse.cameraFaceRecognition was rejected by runtime contract surface",
      "contract",
      context,
      target.frameRef,
    );
  }
  if (context.governance?.accepted === false || context.governance?.allowed === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      context.governance.reason ?? "computeruse.cameraFaceRecognition was rejected by runtime governance",
      "governance",
      context,
      target.frameRef,
    );
  }
  return undefined;
}

function ensureRealExecutionGuard(target: CameraFaceRecognitionTarget, context: CameraFaceRecognitionContext): CameraFaceRecognitionResult | undefined {
  if (context.dryRun !== false) return undefined;
  if (context.guard?.accepted === true || context.guard?.allowed === true) return undefined;
  return failure(
    "GOVERNANCE_REJECTED",
    context.guard?.reason ?? "computeruse.cameraFaceRecognition dryRun:false requires an affirmative runtime guard",
    "governance",
    context,
    target.frameRef,
  );
}

function baseOutput(
  target: CameraFaceRecognitionTarget,
  acceptedScopes: readonly string[],
  dryRun: boolean,
  providerCalled: boolean,
): Omit<CameraFaceRecognitionOutput, "recognitionEnvelope"> {
  return {
    kind: "agentCore.basicTool.computeruse.cameraFaceRecognition",
    target,
    dispatch: dryRun ? "dry-run" : "runtime-computeruse",
    dryRun,
    providerCalled,
    executionBlocked: dryRun,
    unsafeSideEffects: true,
    permissionsRequired: cameraFaceRecognitionDescriptor.permissionsRequired,
    requiresTapApproval: true,
    biometricConsentRequired: isIdentityMode(target.mode),
    biometricDataStored: false,
    acceptedScopes,
    runtimeEntry: {
      port: "BaseToolExecutorPort.computeruse.analyzeCameraFrame",
      operation: "computeruse.cameraFaceRecognition.analyze",
      runtimeOwnsCameraMaterial: true,
      runtimeOwnsVisionProvider: true,
      runtimeOwnsBiometricPolicy: true,
      baseToolOwnsTapStrategy: false,
    },
  };
}

function cleanNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function cleanBoundingBox(value: unknown): CameraFaceRecognitionFace["boundingBox"] | undefined {
  if (!isRecord(value)) return undefined;
  const x = cleanNumber(value.x);
  const y = cleanNumber(value.y);
  const width = cleanNumber(value.width);
  const height = cleanNumber(value.height);
  const coordinateSpace = value.coordinateSpace === "image" ? "image" : value.coordinateSpace === "normalized" ? "normalized" : undefined;
  if (x === undefined || y === undefined || width === undefined || height === undefined || coordinateSpace === undefined) return undefined;
  return { x, y, width, height, coordinateSpace };
}

function cleanFaces(value: unknown, mode: CameraFaceRecognitionMode): readonly CameraFaceRecognitionFace[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const faces: CameraFaceRecognitionFace[] = [];
  for (const item of value) {
    if (!isRecord(item)) return undefined;
    const face: CameraFaceRecognitionFace = {};
    const faceId = cleanString(item.faceId, 256);
    const boundingBox = cleanBoundingBox(item.boundingBox);
    const confidence = cleanNumber(item.confidence);
    if (faceId !== undefined) face.faceId = faceId;
    if (boundingBox !== undefined) face.boundingBox = boundingBox;
    if (confidence !== undefined) face.confidence = confidence;
    if (isIdentityMode(mode)) {
      const identityLabel = cleanString(item.identityLabel, 256);
      const matchedSubjectRef = cleanString(item.matchedSubjectRef, 256);
      const matchConfidence = cleanNumber(item.matchConfidence);
      if (identityLabel !== undefined) face.identityLabel = identityLabel;
      if (matchedSubjectRef !== undefined) face.matchedSubjectRef = matchedSubjectRef;
      if (matchConfidence !== undefined) face.matchConfidence = matchConfidence;
    }
    faces.push(face);
  }
  return faces;
}

function normalizeProviderResult(
  value: unknown,
  context: CameraFaceRecognitionContext,
  target: CameraFaceRecognitionTarget,
): CameraFaceRecognitionProviderResult | CameraFaceRecognitionResult {
  if (!isRecord(value)) {
    return failure("PROVIDER_FAILURE", "computeruse.cameraFaceRecognition runtime provider returned a malformed public-safe face envelope", "provider", context, target.frameRef);
  }
  const faces = cleanFaces(value.faces, target.mode);
  if (faces === undefined) {
    return failure("PROVIDER_FAILURE", "computeruse.cameraFaceRecognition runtime provider returned malformed face entries", "provider", context, target.frameRef);
  }
  const faceCount = typeof value.faceCount === "number" && Number.isInteger(value.faceCount) && value.faceCount >= 0 ? value.faceCount : faces.length;
  const identityResolved = isIdentityMode(target.mode) && value.identityResolved === true;
  return {
    faceCount,
    faces,
    identityResolved,
    metadata: cleanAuditMetadata(value.metadata),
  };
}

function normalizeRequest(request: unknown): {
  target: CameraFaceRecognitionTarget;
  context: CameraFaceRecognitionContext;
  metadata?: Readonly<Record<string, unknown>>;
  provider?: CameraFaceRecognitionProvider;
} | CameraFaceRecognitionResult {
  if (request === undefined) request = {};
  if (!isRecord(request)) return failure("INVALID_REQUEST", "computeruse.cameraFaceRecognition request must be an object", "input", undefined);

  const context = normalizeContext(request.context);
  if ("ok" in context) return context;

  const target = normalizeTarget(request, context);
  if ("ok" in target) return target;

  if (context.runtimeId === undefined) {
    return failure("MISSING_RUNTIME_ID", "computeruse.cameraFaceRecognition requires context.runtimeId for audit", "input", context, target.frameRef);
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
    provider: typeof request.provider === "function" ? (request.provider as CameraFaceRecognitionProvider) : undefined,
  };
}

export async function executeCameraFaceRecognition(request: unknown = {}): Promise<CameraFaceRecognitionResult> {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) return normalized;

  const { target, context, metadata, provider } = normalized;
  const acceptedScopes = context.requestedScopes ?? [];
  const dryRun = context.dryRun !== false;

  if (dryRun) {
    return {
      ok: true,
      toolId: cameraFaceRecognitionDescriptor.toolId,
      output: {
        ...baseOutput(target, acceptedScopes, true, false),
        recognitionEnvelope: {
          resource: "camera-frame",
          analysisRequested: false,
          analyzed: false,
          metadataOnly: true,
          frameRef: target.frameRef,
          mode: target.mode,
          faceCount: 0,
          identityResolved: false,
          faces: [],
        },
      },
      audit: [auditEvent("agentCore.basicTool.computeruse.cameraFaceRecognition.dryRun", context, target.frameRef, metadata)],
      events: ["basicTool.computeruse.cameraFaceRecognition.dryRun"],
    };
  }

  if (provider === undefined) {
    return failure(
      "PROVIDER_UNAVAILABLE",
      "computeruse.cameraFaceRecognition requires runtime executor.computeruse.analyzeCameraFrame for dryRun:false",
      "provider",
      context,
      target.frameRef,
    );
  }

  let providerResult: CameraFaceRecognitionProviderResult;
  try {
    const result = await provider({
      operation: "computeruse.cameraFaceRecognition.analyze",
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
      "computeruse.cameraFaceRecognition runtime provider failed without exposing private details",
      "provider",
      context,
      target.frameRef,
    );
  }

  return {
    ok: true,
    toolId: cameraFaceRecognitionDescriptor.toolId,
    output: {
      ...baseOutput(target, acceptedScopes, false, true),
      recognitionEnvelope: {
        resource: "camera-frame",
        analysisRequested: true,
        analyzed: true,
        metadataOnly: false,
        frameRef: target.frameRef,
        mode: target.mode,
        faceCount: providerResult.faceCount,
        identityResolved: providerResult.identityResolved,
        faces: providerResult.faces,
      },
      providerMetadata: providerResult.metadata,
    },
    audit: [auditEvent("agentCore.basicTool.computeruse.cameraFaceRecognition.analyzed", context, target.frameRef, providerResult.metadata)],
    events: ["basicTool.computeruse.cameraFaceRecognition.analyzed"],
  };
}

export const planCameraFaceRecognition = executeCameraFaceRecognition;
