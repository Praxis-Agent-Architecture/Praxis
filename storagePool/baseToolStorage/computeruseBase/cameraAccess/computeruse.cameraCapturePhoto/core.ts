export type CameraCapturePhotoBoundary = "input" | "contract" | "governance" | "scope" | "resource" | "provider";

export type CameraCapturePhotoGate = {
  accepted?: boolean;
  allowed?: boolean;
  reason?: string;
};

export type CameraCapturePhotoContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: CameraCapturePhotoGate;
  contract?: CameraCapturePhotoGate;
  governance?: CameraCapturePhotoGate;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type CameraCapturePhotoTarget = {
  cameraId: string;
  purpose: string;
  outputFormat: "image/jpeg" | "image/png" | "image/webp";
  permissionLeaseId?: string;
};

export type CameraCapturePhotoProviderRequest = {
  operation: "computeruse.cameraCapturePhoto.capture";
  target: CameraCapturePhotoTarget;
  context: {
    runtimeId?: string;
    sessionId?: string;
    invocationId?: string;
    auditMetadata?: Readonly<Record<string, unknown>>;
  };
};

export type CameraCapturePhotoProviderResult = {
  artifactId: string;
  mimeType: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type CameraCapturePhotoProvider = (
  request: CameraCapturePhotoProviderRequest,
) => Promise<CameraCapturePhotoProviderResult> | CameraCapturePhotoProviderResult;

export type CameraCapturePhotoInput = {
  target?: unknown;
  context?: unknown;
  cameraId?: unknown;
  purpose?: unknown;
  outputFormat?: unknown;
  permissionLeaseId?: unknown;
  leaseId?: unknown;
  metadata?: unknown;
  provider?: CameraCapturePhotoProvider;
};

export type CameraCapturePhotoErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_CONTEXT"
  | "INVALID_TARGET"
  | "MISSING_RUNTIME_ID"
  | "MISSING_CAMERA_ID"
  | "MISSING_PURPOSE"
  | "INVALID_CAMERA_ID"
  | "INVALID_PURPOSE"
  | "INVALID_OUTPUT_FORMAT"
  | "INVALID_PERMISSION_LEASE"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_FAILURE";

export type CameraCapturePhotoError = {
  code: CameraCapturePhotoErrorCode;
  message: string;
  boundary: CameraCapturePhotoBoundary;
  publicSafe: true;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type CameraCapturePhotoAuditEvent = {
  type: string;
  toolId: "computeruse.cameraCapturePhoto";
  invocationId: string;
  dryRun: boolean;
  cameraId?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type CameraCapturePhotoOutput = {
  kind: "agentCore.basicTool.computeruse.cameraCapturePhoto";
  target: CameraCapturePhotoTarget;
  dispatch: "dry-run" | "runtime-computeruse";
  dryRun: boolean;
  providerCalled: boolean;
  executionBlocked: boolean;
  unsafeSideEffects: true;
  permissionsRequired: readonly ["camera:capture-photo"];
  requiresTapApproval: true;
  acceptedScopes: readonly string[];
  runtimeEntry: {
    port: "BaseToolExecutorPort.computeruse.captureCameraPhoto";
    operation: "computeruse.cameraCapturePhoto.capture";
    runtimeOwnsCameraAccess: true;
    runtimeOwnsArtifactStorage: true;
    baseToolOwnsTapStrategy: false;
  };
  artifactEnvelope: {
    resource: "camera-photo";
    captured: boolean;
    metadataOnly: boolean;
    artifactId?: string;
    mimeType?: string;
  };
  providerMetadata?: Readonly<Record<string, unknown>>;
};

export type CameraCapturePhotoResult =
  | {
      ok: true;
      toolId: "computeruse.cameraCapturePhoto";
      output: CameraCapturePhotoOutput;
      audit: readonly CameraCapturePhotoAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "computeruse.cameraCapturePhoto";
      error: CameraCapturePhotoError;
      audit: readonly CameraCapturePhotoAuditEvent[];
      events: readonly string[];
    };

export const cameraCapturePhotoDescriptor = {
  toolId: "computeruse.cameraCapturePhoto",
  capability: "capture-camera-photo",
  route: "agent_executionEngine.basic_toolLayer.baseTools.computeruseBase.cameraAccess",
  defaultDryRun: true,
  defaultOutputFormat: "image/jpeg",
  tapOwnsApproval: true,
  runtimeEntry: "BaseToolExecutorPort.computeruse.captureCameraPhoto",
  permissionsRequired: ["camera:capture-photo"],
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

function cleanGate(value: unknown): CameraCapturePhotoGate | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return undefined;
  const gate: CameraCapturePhotoGate = {};
  if (typeof value.accepted === "boolean") gate.accepted = value.accepted;
  if (typeof value.allowed === "boolean") gate.allowed = value.allowed;
  const reason = cleanString(value.reason);
  if (reason !== undefined) gate.reason = reason;
  return gate;
}

function cleanAuditMetadata(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return isRecord(value) ? value : undefined;
}

function cleanOutputFormat(value: unknown): CameraCapturePhotoTarget["outputFormat"] | undefined {
  if (value === undefined) return cameraCapturePhotoDescriptor.defaultOutputFormat;
  return value === "image/jpeg" || value === "image/png" || value === "image/webp" ? value : undefined;
}

function auditEvent(
  type: string,
  context: CameraCapturePhotoContext | undefined,
  cameraId: string | undefined,
  metadata?: Readonly<Record<string, unknown>>,
): CameraCapturePhotoAuditEvent {
  return {
    type,
    toolId: cameraCapturePhotoDescriptor.toolId,
    invocationId: context?.invocationId ?? "computeruse.cameraCapturePhoto:dry-run",
    dryRun: context?.dryRun !== false,
    cameraId,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: CameraCapturePhotoErrorCode,
  message: string,
  boundary: CameraCapturePhotoBoundary,
  context: CameraCapturePhotoContext | undefined,
  cameraId?: string,
): CameraCapturePhotoResult {
  return {
    ok: false,
    toolId: cameraCapturePhotoDescriptor.toolId,
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("agentCore.basicTool.computeruse.cameraCapturePhoto.rejected", context, cameraId, { code })],
    events: ["basicTool.computeruse.cameraCapturePhoto.rejected"],
  };
}

function normalizeContext(value: unknown): CameraCapturePhotoContext | CameraCapturePhotoResult {
  if (value === undefined) return {};
  if (!isRecord(value)) return failure("INVALID_CONTEXT", "computeruse.cameraCapturePhoto context must be an object", "input", undefined);

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
    return failure("INVALID_CONTEXT", "computeruse.cameraCapturePhoto context contains malformed guard, governance, or scope fields", "input", undefined);
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
  context: CameraCapturePhotoContext,
): CameraCapturePhotoTarget | CameraCapturePhotoResult {
  const targetValue = request.target;
  if (targetValue !== undefined && !isRecord(targetValue)) {
    return failure("INVALID_TARGET", "computeruse.cameraCapturePhoto target must be an object when provided", "input", context);
  }
  const target = isRecord(targetValue) ? targetValue : {};
  const cameraId = cleanString(target.cameraId ?? target.deviceId ?? request.cameraId, 128);
  const purpose = cleanString(target.purpose ?? request.purpose);
  const outputFormat = cleanOutputFormat(target.outputFormat ?? request.outputFormat);
  const permissionLeaseId = cleanString(target.permissionLeaseId ?? target.leaseId ?? request.permissionLeaseId ?? request.leaseId, 256);

  if (cameraId === undefined) {
    return failure(
      (target.cameraId ?? target.deviceId ?? request.cameraId) === undefined ? "MISSING_CAMERA_ID" : "INVALID_CAMERA_ID",
      "computeruse.cameraCapturePhoto requires a bounded camera id",
      "input",
      context,
    );
  }
  if (purpose === undefined) {
    return failure(
      (target.purpose ?? request.purpose) === undefined ? "MISSING_PURPOSE" : "INVALID_PURPOSE",
      "computeruse.cameraCapturePhoto requires an explicit purpose",
      "input",
      context,
      cameraId,
    );
  }
  if (outputFormat === undefined) {
    return failure("INVALID_OUTPUT_FORMAT", "computeruse.cameraCapturePhoto outputFormat must be image/jpeg, image/png, or image/webp", "input", context, cameraId);
  }
  if ((target.permissionLeaseId ?? target.leaseId ?? request.permissionLeaseId ?? request.leaseId) !== undefined && permissionLeaseId === undefined) {
    return failure("INVALID_PERMISSION_LEASE", "computeruse.cameraCapturePhoto permission lease id must be a safe string", "input", context, cameraId);
  }

  return {
    cameraId,
    purpose,
    outputFormat,
    permissionLeaseId,
  };
}

function ensureScopes(target: CameraCapturePhotoTarget, context: CameraCapturePhotoContext): CameraCapturePhotoResult | undefined {
  const requested = context.requestedScopes ?? [];
  const allowed = context.allowedScopes ?? [];
  if (requested.length === 0) return undefined;

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length === 0) return undefined;

  return failure("SCOPE_DENIED", `computeruse.cameraCapturePhoto scope ${denied[0]} is outside runtime governance`, "scope", context, target.cameraId);
}

function ensureStaticGates(target: CameraCapturePhotoTarget, context: CameraCapturePhotoContext): CameraCapturePhotoResult | undefined {
  if (context.contract?.accepted === false || context.contract?.allowed === false) {
    return failure(
      "CONTRACT_REJECTED",
      context.contract.reason ?? "computeruse.cameraCapturePhoto was rejected by runtime contract surface",
      "contract",
      context,
      target.cameraId,
    );
  }
  if (context.governance?.accepted === false || context.governance?.allowed === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      context.governance.reason ?? "computeruse.cameraCapturePhoto was rejected by runtime governance",
      "governance",
      context,
      target.cameraId,
    );
  }
  return undefined;
}

function ensureRealExecutionGuard(target: CameraCapturePhotoTarget, context: CameraCapturePhotoContext): CameraCapturePhotoResult | undefined {
  if (context.dryRun !== false) return undefined;
  if (context.guard?.accepted === true || context.guard?.allowed === true) return undefined;
  return failure(
    "GOVERNANCE_REJECTED",
    context.guard?.reason ?? "computeruse.cameraCapturePhoto dryRun:false requires an affirmative runtime guard",
    "governance",
    context,
    target.cameraId,
  );
}

function baseOutput(
  target: CameraCapturePhotoTarget,
  acceptedScopes: readonly string[],
  dryRun: boolean,
  providerCalled: boolean,
): Omit<CameraCapturePhotoOutput, "artifactEnvelope"> {
  return {
    kind: "agentCore.basicTool.computeruse.cameraCapturePhoto",
    target,
    dispatch: dryRun ? "dry-run" : "runtime-computeruse",
    dryRun,
    providerCalled,
    executionBlocked: dryRun,
    unsafeSideEffects: true,
    permissionsRequired: cameraCapturePhotoDescriptor.permissionsRequired,
    requiresTapApproval: true,
    acceptedScopes,
    runtimeEntry: {
      port: "BaseToolExecutorPort.computeruse.captureCameraPhoto",
      operation: "computeruse.cameraCapturePhoto.capture",
      runtimeOwnsCameraAccess: true,
      runtimeOwnsArtifactStorage: true,
      baseToolOwnsTapStrategy: false,
    },
  };
}

function normalizeProviderResult(
  value: unknown,
  context: CameraCapturePhotoContext,
  target: CameraCapturePhotoTarget,
): CameraCapturePhotoProviderResult | CameraCapturePhotoResult {
  if (!isRecord(value)) {
    return failure("PROVIDER_FAILURE", "computeruse.cameraCapturePhoto runtime provider returned a malformed public-safe artifact envelope", "provider", context, target.cameraId);
  }
  const artifactId = cleanString(value.artifactId);
  const mimeType = cleanString(value.mimeType, 128);
  if (artifactId === undefined || mimeType === undefined) {
    return failure("PROVIDER_FAILURE", "computeruse.cameraCapturePhoto runtime provider returned an invalid artifact id or mime type", "provider", context, target.cameraId);
  }

  return {
    artifactId,
    mimeType,
    metadata: cleanAuditMetadata(value.metadata),
  };
}

function normalizeRequest(request: unknown): {
  target: CameraCapturePhotoTarget;
  context: CameraCapturePhotoContext;
  metadata?: Readonly<Record<string, unknown>>;
  provider?: CameraCapturePhotoProvider;
} | CameraCapturePhotoResult {
  if (request === undefined) request = {};
  if (!isRecord(request)) {
    return failure("INVALID_REQUEST", "computeruse.cameraCapturePhoto request must be an object", "input", undefined);
  }

  const context = normalizeContext(request.context);
  if ("ok" in context) return context;

  const target = normalizeTarget(request, context);
  if ("ok" in target) return target;

  if (context.runtimeId === undefined) {
    return failure("MISSING_RUNTIME_ID", "computeruse.cameraCapturePhoto requires context.runtimeId for audit", "input", context, target.cameraId);
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
    provider: typeof request.provider === "function" ? (request.provider as CameraCapturePhotoProvider) : undefined,
  };
}

export async function executeCameraCapturePhoto(request: unknown = {}): Promise<CameraCapturePhotoResult> {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) return normalized;

  const { target, context, metadata, provider } = normalized;
  const acceptedScopes = context.requestedScopes ?? [];
  const dryRun = context.dryRun !== false;

  if (dryRun) {
    return {
      ok: true,
      toolId: cameraCapturePhotoDescriptor.toolId,
      output: {
        ...baseOutput(target, acceptedScopes, true, false),
        artifactEnvelope: {
          resource: "camera-photo",
          captured: false,
          metadataOnly: true,
        },
      },
      audit: [auditEvent("agentCore.basicTool.computeruse.cameraCapturePhoto.dryRun", context, target.cameraId, metadata)],
      events: ["basicTool.computeruse.cameraCapturePhoto.dryRun"],
    };
  }

  if (provider === undefined) {
    return failure(
      "PROVIDER_UNAVAILABLE",
      "computeruse.cameraCapturePhoto requires runtime executor.computeruse.captureCameraPhoto for dryRun:false",
      "provider",
      context,
      target.cameraId,
    );
  }

  let providerResult: CameraCapturePhotoProviderResult;
  try {
    const result = await provider({
      operation: "computeruse.cameraCapturePhoto.capture",
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
    return failure("PROVIDER_FAILURE", "computeruse.cameraCapturePhoto runtime provider failed without exposing private details", "provider", context, target.cameraId);
  }

  return {
    ok: true,
    toolId: cameraCapturePhotoDescriptor.toolId,
    output: {
      ...baseOutput(target, acceptedScopes, false, true),
      artifactEnvelope: {
        resource: "camera-photo",
        captured: true,
        metadataOnly: false,
        artifactId: providerResult.artifactId,
        mimeType: providerResult.mimeType,
      },
      providerMetadata: providerResult.metadata,
    },
    audit: [auditEvent("agentCore.basicTool.computeruse.cameraCapturePhoto.captured", context, target.cameraId, providerResult.metadata)],
    events: ["basicTool.computeruse.cameraCapturePhoto.captured"],
  };
}

export const planCameraCapturePhoto = executeCameraCapturePhoto;
