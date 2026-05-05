export type CameraContentStorageBoundary = "input" | "contract" | "governance" | "scope" | "provider";

export type CameraContentStorageGate = {
  accepted?: boolean;
  allowed?: boolean;
  reason?: string;
};

export type CameraContentStorageContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: CameraContentStorageGate;
  contract?: CameraContentStorageGate;
  governance?: CameraContentStorageGate;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type CameraContentStorageRetentionPolicy = "ephemeral" | "session-only" | "session-scoped" | "persistent";

export type CameraContentStorageKind = "camera-photo" | "camera-frame" | "camera-recording" | "generic";

export type CameraContentStorageTarget = {
  contentRef: string;
  contentKind: CameraContentStorageKind;
  storageTarget: string;
  retentionPolicy: CameraContentStorageRetentionPolicy;
};

export type CameraContentStorageProviderRequest = {
  operation: "computeruse.cameraContentStorage.store";
  target: CameraContentStorageTarget;
  context: {
    runtimeId?: string;
    sessionId?: string;
    invocationId?: string;
    auditMetadata?: Readonly<Record<string, unknown>>;
  };
  purpose: string;
};

export type CameraContentStorageProviderResult = {
  storedArtifactId: string;
  storageUri?: string;
  retentionPolicy?: CameraContentStorageRetentionPolicy;
  metadata?: Readonly<Record<string, unknown>>;
};

export type CameraContentStorageProvider = (
  request: CameraContentStorageProviderRequest,
) => Promise<CameraContentStorageProviderResult> | CameraContentStorageProviderResult;

export type CameraContentStorageRequest = {
  target?: unknown;
  context?: unknown;
  contentRef?: unknown;
  cameraContentRef?: unknown;
  artifactRef?: unknown;
  contentKind?: unknown;
  storageTarget?: unknown;
  retentionPolicy?: unknown;
  purpose?: unknown;
  metadata?: unknown;
  provider?: CameraContentStorageProvider;
};

export type CameraContentStorageErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_TARGET"
  | "INVALID_CONTEXT"
  | "MISSING_RUNTIME_ID"
  | "MISSING_CONTENT_REF"
  | "INVALID_CONTENT_REF"
  | "INVALID_CONTENT_KIND"
  | "MISSING_STORAGE_TARGET"
  | "INVALID_STORAGE_TARGET"
  | "INVALID_RETENTION_POLICY"
  | "MISSING_PURPOSE"
  | "SCOPE_DENIED"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_FAILURE";

export type CameraContentStorageError = {
  code: CameraContentStorageErrorCode;
  message: string;
  boundary: CameraContentStorageBoundary;
  publicSafe: true;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type CameraContentStorageAuditEvent = {
  type: string;
  toolId: "computeruse.cameraContentStorage";
  invocationId: string;
  dryRun: boolean;
  contentRef?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type CameraContentStorageOutput = {
  kind: "agentCore.basicTool.computeruse.cameraContentStorage";
  target: CameraContentStorageTarget;
  purpose: string;
  dispatch: "dry-run" | "runtime-artifact";
  dryRun: boolean;
  providerCalled: boolean;
  executionBlocked: boolean;
  unsafeSideEffects: true;
  permissionsRequired: readonly ["camera:read", "artifact:read", "artifact:write"];
  requiresTapApproval: true;
  privacyReviewRequired: true;
  acceptedScopes: readonly string[];
  runtimeEntry: {
    port: "BaseToolExecutorPort.artifact.store";
    operation: "computeruse.cameraContentStorage.store";
    runtimeOwnsCameraMaterial: true;
    runtimeOwnsArtifactStorage: true;
    runtimeOwnsRetentionPolicy: true;
    baseToolOwnsTapStrategy: false;
  };
  storageEnvelope: {
    resource: "camera-content";
    stored: boolean;
    metadataOnly: boolean;
    contentRef: string;
    contentKind: CameraContentStorageKind;
    storageTarget: string;
    retentionPolicy: CameraContentStorageRetentionPolicy;
    storedArtifactId?: string;
    storageUri?: string;
  };
  providerMetadata?: Readonly<Record<string, unknown>>;
};

export type CameraContentStorageResult =
  | {
      ok: true;
      toolId: "computeruse.cameraContentStorage";
      output: CameraContentStorageOutput;
      audit: readonly CameraContentStorageAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "computeruse.cameraContentStorage";
      error: CameraContentStorageError;
      audit: readonly CameraContentStorageAuditEvent[];
      events: readonly string[];
    };

export const cameraContentStorageDescriptor = {
  toolId: "computeruse.cameraContentStorage",
  capability: "store-camera-content-artifact",
  route: "agent_executionEngine.basic_toolLayer.baseTools.computeruseBase.cameraAccess",
  defaultDryRun: true,
  defaultContentKind: "camera-photo",
  defaultRetentionPolicy: "session-scoped",
  allowedStorageSchemes: ["artifact://", "session://", "runtime://", "memory://"],
  tapOwnsApproval: true,
  runtimeEntry: "BaseToolExecutorPort.artifact.store",
  permissionsRequired: ["camera:read", "artifact:read", "artifact:write"],
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

function cleanGate(value: unknown): CameraContentStorageGate | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return undefined;
  const gate: CameraContentStorageGate = {};
  if (typeof value.accepted === "boolean") gate.accepted = value.accepted;
  if (typeof value.allowed === "boolean") gate.allowed = value.allowed;
  const reason = cleanString(value.reason);
  if (reason !== undefined) gate.reason = reason;
  return gate;
}

function cleanAuditMetadata(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return isRecord(value) ? value : undefined;
}

function cleanRetentionPolicy(value: unknown): CameraContentStorageRetentionPolicy | undefined {
  if (value === undefined) return cameraContentStorageDescriptor.defaultRetentionPolicy;
  return value === "ephemeral" || value === "session-only" || value === "session-scoped" || value === "persistent"
    ? value
    : undefined;
}

function cleanContentKind(value: unknown): CameraContentStorageKind | undefined {
  if (value === undefined) return cameraContentStorageDescriptor.defaultContentKind;
  return value === "camera-photo" || value === "camera-frame" || value === "camera-recording" || value === "generic"
    ? value
    : undefined;
}

function hasAllowedStorageScheme(value: string): boolean {
  return cameraContentStorageDescriptor.allowedStorageSchemes.some((scheme) => value.startsWith(scheme));
}

function auditEvent(
  type: string,
  context: CameraContentStorageContext | undefined,
  contentRef: string | undefined,
  metadata?: Readonly<Record<string, unknown>>,
): CameraContentStorageAuditEvent {
  return {
    type,
    toolId: cameraContentStorageDescriptor.toolId,
    invocationId: context?.invocationId ?? "computeruse.cameraContentStorage:dry-run",
    dryRun: context?.dryRun !== false,
    contentRef,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: CameraContentStorageErrorCode,
  message: string,
  boundary: CameraContentStorageBoundary,
  context: CameraContentStorageContext | undefined,
  contentRef?: string,
): CameraContentStorageResult {
  return {
    ok: false,
    toolId: cameraContentStorageDescriptor.toolId,
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("agentCore.basicTool.computeruse.cameraContentStorage.rejected", context, contentRef, { code })],
    events: ["basicTool.computeruse.cameraContentStorage.rejected"],
  };
}

function normalizeContext(value: unknown): CameraContentStorageContext | CameraContentStorageResult {
  if (value === undefined) return {};
  if (!isRecord(value)) return failure("INVALID_CONTEXT", "computeruse.cameraContentStorage context must be an object", "input", undefined);

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
    return failure("INVALID_CONTEXT", "computeruse.cameraContentStorage context contains malformed guard, governance, or scope fields", "input", undefined);
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
  context: CameraContentStorageContext,
): CameraContentStorageTarget | CameraContentStorageResult {
  const targetValue = request.target;
  if (targetValue !== undefined && !isRecord(targetValue)) {
    return failure("INVALID_TARGET", "computeruse.cameraContentStorage target must be an object when provided", "input", context);
  }

  const target = isRecord(targetValue) ? targetValue : {};
  const contentRefValue = target.contentRef ?? target.cameraContentRef ?? target.artifactRef ?? request.contentRef ?? request.cameraContentRef ?? request.artifactRef;
  const storageTargetValue = target.storageTarget ?? request.storageTarget;
  const contentRef = cleanString(contentRefValue);
  const contentKind = cleanContentKind(target.contentKind ?? request.contentKind);
  const storageTarget = cleanString(storageTargetValue);
  const retentionPolicy = cleanRetentionPolicy(target.retentionPolicy ?? request.retentionPolicy);

  if (contentRefValue === undefined) {
    return failure("MISSING_CONTENT_REF", "computeruse.cameraContentStorage requires target.contentRef", "input", context);
  }
  if (contentRef === undefined) {
    return failure("INVALID_CONTENT_REF", "computeruse.cameraContentStorage contentRef must be a safe string", "input", context);
  }
  if (contentKind === undefined) {
    return failure("INVALID_CONTENT_KIND", "computeruse.cameraContentStorage contentKind must be camera-photo, camera-frame, camera-recording, or generic", "input", context, contentRef);
  }
  if (storageTargetValue === undefined) {
    return failure("MISSING_STORAGE_TARGET", "computeruse.cameraContentStorage requires target.storageTarget", "input", context, contentRef);
  }
  if (storageTarget === undefined || !hasAllowedStorageScheme(storageTarget)) {
    return failure(
      "INVALID_STORAGE_TARGET",
      "computeruse.cameraContentStorage storageTarget must use artifact://, session://, runtime://, or memory://",
      "input",
      context,
      contentRef,
    );
  }
  if (retentionPolicy === undefined) {
    return failure("INVALID_RETENTION_POLICY", "computeruse.cameraContentStorage retentionPolicy is not supported", "input", context, contentRef);
  }

  return { contentRef, contentKind, storageTarget, retentionPolicy };
}

function ensureScopes(target: CameraContentStorageTarget, context: CameraContentStorageContext): CameraContentStorageResult | undefined {
  const requested = context.requestedScopes ?? [];
  const allowed = context.allowedScopes ?? [];
  if (requested.length === 0) return undefined;

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length === 0) return undefined;

  return failure(
    "SCOPE_DENIED",
    `computeruse.cameraContentStorage scope ${denied[0]} is outside runtime governance`,
    "scope",
    context,
    target.contentRef,
  );
}

function ensureStaticGates(target: CameraContentStorageTarget, context: CameraContentStorageContext): CameraContentStorageResult | undefined {
  if (context.contract?.accepted === false || context.contract?.allowed === false) {
    return failure(
      "CONTRACT_REJECTED",
      context.contract.reason ?? "computeruse.cameraContentStorage was rejected by runtime contract surface",
      "contract",
      context,
      target.contentRef,
    );
  }
  if (context.governance?.accepted === false || context.governance?.allowed === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      context.governance.reason ?? "computeruse.cameraContentStorage was rejected by runtime governance",
      "governance",
      context,
      target.contentRef,
    );
  }
  return undefined;
}

function ensureRealExecutionGuard(target: CameraContentStorageTarget, context: CameraContentStorageContext): CameraContentStorageResult | undefined {
  if (context.dryRun !== false) return undefined;
  if (context.guard?.accepted === true || context.guard?.allowed === true) return undefined;
  return failure(
    "GOVERNANCE_REJECTED",
    context.guard?.reason ?? "computeruse.cameraContentStorage dryRun:false requires an affirmative runtime guard",
    "governance",
    context,
    target.contentRef,
  );
}

function baseOutput(
  target: CameraContentStorageTarget,
  purpose: string,
  acceptedScopes: readonly string[],
  dryRun: boolean,
  providerCalled: boolean,
): Omit<CameraContentStorageOutput, "storageEnvelope"> {
  return {
    kind: "agentCore.basicTool.computeruse.cameraContentStorage",
    target,
    purpose,
    dispatch: dryRun ? "dry-run" : "runtime-artifact",
    dryRun,
    providerCalled,
    executionBlocked: dryRun,
    unsafeSideEffects: true,
    permissionsRequired: cameraContentStorageDescriptor.permissionsRequired,
    requiresTapApproval: true,
    privacyReviewRequired: true,
    acceptedScopes,
    runtimeEntry: {
      port: "BaseToolExecutorPort.artifact.store",
      operation: "computeruse.cameraContentStorage.store",
      runtimeOwnsCameraMaterial: true,
      runtimeOwnsArtifactStorage: true,
      runtimeOwnsRetentionPolicy: true,
      baseToolOwnsTapStrategy: false,
    },
  };
}

function normalizeProviderResult(
  value: unknown,
  context: CameraContentStorageContext,
  target: CameraContentStorageTarget,
): CameraContentStorageProviderResult | CameraContentStorageResult {
  if (!isRecord(value) || cleanString(value.storedArtifactId) === undefined) {
    return failure(
      "PROVIDER_FAILURE",
      "computeruse.cameraContentStorage runtime provider returned a malformed public-safe storage envelope",
      "provider",
      context,
      target.contentRef,
    );
  }

  return {
    storedArtifactId: cleanString(value.storedArtifactId) ?? "",
    storageUri: cleanString(value.storageUri),
    retentionPolicy: cleanRetentionPolicy(value.retentionPolicy) ?? target.retentionPolicy,
    metadata: cleanAuditMetadata(value.metadata),
  };
}

function normalizeRequest(request: unknown): {
  target: CameraContentStorageTarget;
  context: CameraContentStorageContext;
  purpose: string;
  metadata?: Readonly<Record<string, unknown>>;
  provider?: CameraContentStorageProvider;
} | CameraContentStorageResult {
  if (request === undefined) request = {};
  if (!isRecord(request)) return failure("INVALID_REQUEST", "computeruse.cameraContentStorage request must be an object", "input", undefined);

  const context = normalizeContext(request.context);
  if ("ok" in context) return context;

  const target = normalizeTarget(request, context);
  if ("ok" in target) return target;

  const purpose = cleanString(request.purpose);
  if (purpose === undefined) {
    return failure("MISSING_PURPOSE", "computeruse.cameraContentStorage requires an explicit purpose", "input", context, target.contentRef);
  }

  if (context.runtimeId === undefined) {
    return failure("MISSING_RUNTIME_ID", "computeruse.cameraContentStorage requires context.runtimeId for audit", "input", context, target.contentRef);
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
    provider: typeof request.provider === "function" ? (request.provider as CameraContentStorageProvider) : undefined,
  };
}

export async function executeCameraContentStorage(request: unknown = {}): Promise<CameraContentStorageResult> {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) return normalized;

  const { target, context, purpose, metadata, provider } = normalized;
  const acceptedScopes = context.requestedScopes ?? [];
  const dryRun = context.dryRun !== false;

  if (dryRun) {
    return {
      ok: true,
      toolId: cameraContentStorageDescriptor.toolId,
      output: {
        ...baseOutput(target, purpose, acceptedScopes, true, false),
        storageEnvelope: {
          resource: "camera-content",
          stored: false,
          metadataOnly: true,
          contentRef: target.contentRef,
          contentKind: target.contentKind,
          storageTarget: target.storageTarget,
          retentionPolicy: target.retentionPolicy,
        },
      },
      audit: [auditEvent("agentCore.basicTool.computeruse.cameraContentStorage.dryRun", context, target.contentRef, metadata)],
      events: ["basicTool.computeruse.cameraContentStorage.dryRun"],
    };
  }

  if (provider === undefined) {
    return failure(
      "PROVIDER_UNAVAILABLE",
      "computeruse.cameraContentStorage requires runtime executor.artifact.store for dryRun:false",
      "provider",
      context,
      target.contentRef,
    );
  }

  let providerResult: CameraContentStorageProviderResult;
  try {
    const result = await provider({
      operation: "computeruse.cameraContentStorage.store",
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
      "computeruse.cameraContentStorage runtime provider failed without exposing private details",
      "provider",
      context,
      target.contentRef,
    );
  }

  return {
    ok: true,
    toolId: cameraContentStorageDescriptor.toolId,
    output: {
      ...baseOutput(target, purpose, acceptedScopes, false, true),
      storageEnvelope: {
        resource: "camera-content",
        stored: true,
        metadataOnly: false,
        contentRef: target.contentRef,
        contentKind: target.contentKind,
        storageTarget: target.storageTarget,
        retentionPolicy: providerResult.retentionPolicy ?? target.retentionPolicy,
        storedArtifactId: providerResult.storedArtifactId,
        storageUri: providerResult.storageUri,
      },
      providerMetadata: providerResult.metadata,
    },
    audit: [
      auditEvent("agentCore.basicTool.computeruse.cameraContentStorage.stored", context, target.contentRef, {
        storedArtifactId: providerResult.storedArtifactId,
        ...providerResult.metadata,
      }),
    ],
    events: ["basicTool.computeruse.cameraContentStorage.stored"],
  };
}

export const planCameraContentStorage = executeCameraContentStorage;
