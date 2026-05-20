export type ScreenRecordingStorageBoundary = "input" | "contract" | "governance" | "scope" | "provider";

export type ScreenRecordingStorageGate = {
  accepted?: boolean;
  allowed?: boolean;
  reason?: string;
};

export type ScreenRecordingStorageContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: ScreenRecordingStorageGate;
  contract?: ScreenRecordingStorageGate;
  governance?: ScreenRecordingStorageGate;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type ScreenRecordingStorageRetentionPolicy = "ephemeral" | "session-only" | "session-scoped" | "persistent";

export type ScreenRecordingStorageTarget = {
  recordingRef: string;
  storageTarget: string;
  retentionPolicy: ScreenRecordingStorageRetentionPolicy;
};

export type ScreenRecordingStorageProviderRequest = {
  operation: "computeruse.screenRecordingStorage.finalize";
  target: ScreenRecordingStorageTarget;
  context: {
    runtimeId?: string;
    sessionId?: string;
    invocationId?: string;
    auditMetadata?: Readonly<Record<string, unknown>>;
  };
  purpose: string;
};

export type ScreenRecordingStorageProviderResult = {
  artifactId: string;
  mimeType: string;
  storageUri?: string;
  retentionPolicy?: ScreenRecordingStorageRetentionPolicy;
  metadata?: Readonly<Record<string, unknown>>;
};

export type ScreenRecordingStorageProvider = (
  request: ScreenRecordingStorageProviderRequest,
) => Promise<ScreenRecordingStorageProviderResult> | ScreenRecordingStorageProviderResult;

export type ScreenRecordingStorageRequest = {
  target?: unknown;
  context?: unknown;
  recordingRef?: unknown;
  storageTarget?: unknown;
  retentionPolicy?: unknown;
  purpose?: unknown;
  metadata?: unknown;
  provider?: ScreenRecordingStorageProvider;
};

export type ScreenRecordingStorageErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_TARGET"
  | "INVALID_CONTEXT"
  | "MISSING_RUNTIME_ID"
  | "MISSING_RECORDING_REF"
  | "INVALID_RECORDING_REF"
  | "MISSING_STORAGE_TARGET"
  | "INVALID_STORAGE_TARGET"
  | "INVALID_RETENTION_POLICY"
  | "MISSING_PURPOSE"
  | "SCOPE_DENIED"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_FAILURE";

export type ScreenRecordingStorageError = {
  code: ScreenRecordingStorageErrorCode;
  message: string;
  boundary: ScreenRecordingStorageBoundary;
  publicSafe: true;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type ScreenRecordingStorageAuditEvent = {
  type: string;
  toolId: "computeruse.screenRecordingStorage";
  invocationId: string;
  dryRun: boolean;
  recordingRef?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type ScreenRecordingStorageOutput = {
  kind: "agentCore.basicTool.computeruse.screenRecordingStorage";
  target: ScreenRecordingStorageTarget;
  purpose: string;
  dispatch: "dry-run" | "runtime-computeruse";
  dryRun: boolean;
  providerCalled: boolean;
  executionBlocked: boolean;
  unsafeSideEffects: true;
  permissionsRequired: readonly ["screen:record", "recording:session", "artifact:write"];
  requiresTapApproval: true;
  acceptedScopes: readonly string[];
  runtimeEntry: {
    port: "BaseToolExecutorPort.computeruse.stopRecording";
    operation: "computeruse.screenRecordingStorage.finalize";
    runtimeOwnsRecordingSession: true;
    runtimeOwnsArtifactStorage: true;
    runtimeOwnsRetentionPolicy: true;
    baseToolOwnsTapStrategy: false;
  };
  storageEnvelope: {
    resource: "screen-recording";
    finalized: boolean;
    stored: boolean;
    metadataOnly: boolean;
    recordingRef: string;
    storageTarget: string;
    retentionPolicy: ScreenRecordingStorageRetentionPolicy;
    artifactId?: string;
    mimeType?: string;
    storageUri?: string;
  };
  providerMetadata?: Readonly<Record<string, unknown>>;
};

export type ScreenRecordingStorageResult =
  | {
      ok: true;
      toolId: "computeruse.screenRecordingStorage";
      output: ScreenRecordingStorageOutput;
      audit: readonly ScreenRecordingStorageAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "computeruse.screenRecordingStorage";
      error: ScreenRecordingStorageError;
      audit: readonly ScreenRecordingStorageAuditEvent[];
      events: readonly string[];
    };

export const screenRecordingStorageDescriptor = {
  toolId: "computeruse.screenRecordingStorage",
  capability: "finalize-and-store-screen-recording",
  route: "agent_executionEngine.basic_toolLayer.baseTools.computeruseBase.screenRecording",
  defaultDryRun: true,
  defaultRetentionPolicy: "session-scoped",
  allowedStorageSchemes: ["artifact://", "session://", "runtime://", "memory://"],
  tapOwnsApproval: true,
  runtimeEntry: "BaseToolExecutorPort.computeruse.stopRecording",
  permissionsRequired: ["screen:record", "recording:session", "artifact:write"],
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

function cleanGate(value: unknown): ScreenRecordingStorageGate | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return undefined;
  const gate: ScreenRecordingStorageGate = {};
  if (typeof value.accepted === "boolean") gate.accepted = value.accepted;
  if (typeof value.allowed === "boolean") gate.allowed = value.allowed;
  const reason = cleanString(value.reason);
  if (reason !== undefined) gate.reason = reason;
  return gate;
}

function cleanAuditMetadata(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return isRecord(value) ? value : undefined;
}

function cleanRetentionPolicy(value: unknown): ScreenRecordingStorageRetentionPolicy | undefined {
  if (value === undefined) return screenRecordingStorageDescriptor.defaultRetentionPolicy;
  return value === "ephemeral" || value === "session-only" || value === "session-scoped" || value === "persistent"
    ? value
    : undefined;
}

function hasAllowedStorageScheme(value: string): boolean {
  return screenRecordingStorageDescriptor.allowedStorageSchemes.some((scheme) => value.startsWith(scheme));
}

function auditEvent(
  type: string,
  context: ScreenRecordingStorageContext | undefined,
  recordingRef: string | undefined,
  metadata?: Readonly<Record<string, unknown>>,
): ScreenRecordingStorageAuditEvent {
  return {
    type,
    toolId: screenRecordingStorageDescriptor.toolId,
    invocationId: context?.invocationId ?? "computeruse.screenRecordingStorage:dry-run",
    dryRun: context?.dryRun !== false,
    recordingRef,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: ScreenRecordingStorageErrorCode,
  message: string,
  boundary: ScreenRecordingStorageBoundary,
  context: ScreenRecordingStorageContext | undefined,
  recordingRef?: string,
): ScreenRecordingStorageResult {
  return {
    ok: false,
    toolId: screenRecordingStorageDescriptor.toolId,
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("agentCore.basicTool.computeruse.screenRecordingStorage.rejected", context, recordingRef, { code })],
    events: ["basicTool.computeruse.screenRecordingStorage.rejected"],
  };
}

function normalizeContext(value: unknown): ScreenRecordingStorageContext | ScreenRecordingStorageResult {
  if (value === undefined) return {};
  if (!isRecord(value)) return failure("INVALID_CONTEXT", "computeruse.screenRecordingStorage context must be an object", "input", undefined);

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
      "computeruse.screenRecordingStorage context contains malformed guard, governance, or scope fields",
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
  context: ScreenRecordingStorageContext,
): ScreenRecordingStorageTarget | ScreenRecordingStorageResult {
  const targetValue = request.target;
  if (targetValue !== undefined && !isRecord(targetValue)) {
    return failure("INVALID_TARGET", "computeruse.screenRecordingStorage target must be an object when provided", "input", context);
  }
  const target = isRecord(targetValue) ? targetValue : {};
  const recordingRefValue = target.recordingRef ?? request.recordingRef;
  const storageTargetValue = target.storageTarget ?? request.storageTarget;
  const retentionPolicy = cleanRetentionPolicy(target.retentionPolicy ?? request.retentionPolicy);
  const recordingRef = cleanString(recordingRefValue);
  const storageTarget = cleanString(storageTargetValue);

  if (recordingRefValue === undefined) {
    return failure("MISSING_RECORDING_REF", "computeruse.screenRecordingStorage requires target.recordingRef", "input", context);
  }
  if (recordingRef === undefined) {
    return failure("INVALID_RECORDING_REF", "computeruse.screenRecordingStorage recordingRef must be a safe string", "input", context);
  }
  if (storageTargetValue === undefined) {
    return failure("MISSING_STORAGE_TARGET", "computeruse.screenRecordingStorage requires target.storageTarget", "input", context, recordingRef);
  }
  if (storageTarget === undefined || storageTarget.length > 1024 || !hasAllowedStorageScheme(storageTarget)) {
    return failure(
      "INVALID_STORAGE_TARGET",
      "computeruse.screenRecordingStorage storageTarget must use artifact://, session://, runtime://, or memory://",
      "input",
      context,
      recordingRef,
    );
  }
  if (retentionPolicy === undefined) {
    return failure(
      "INVALID_RETENTION_POLICY",
      "computeruse.screenRecordingStorage retentionPolicy must be ephemeral, session-only, session-scoped, or persistent",
      "input",
      context,
      recordingRef,
    );
  }

  return { recordingRef, storageTarget, retentionPolicy };
}

function ensureScopes(target: ScreenRecordingStorageTarget, context: ScreenRecordingStorageContext): ScreenRecordingStorageResult | undefined {
  const requested = context.requestedScopes ?? [];
  const allowed = context.allowedScopes ?? [];
  if (requested.length === 0) return undefined;

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length === 0) return undefined;

  return failure(
    "SCOPE_DENIED",
    `computeruse.screenRecordingStorage scope ${denied[0]} is outside runtime governance`,
    "scope",
    context,
    target.recordingRef,
  );
}

function ensureStaticGates(target: ScreenRecordingStorageTarget, context: ScreenRecordingStorageContext): ScreenRecordingStorageResult | undefined {
  if (context.contract?.accepted === false || context.contract?.allowed === false) {
    return failure(
      "CONTRACT_REJECTED",
      context.contract.reason ?? "computeruse.screenRecordingStorage was rejected by runtime contract surface",
      "contract",
      context,
      target.recordingRef,
    );
  }

  if (context.governance?.accepted === false || context.governance?.allowed === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      context.governance.reason ?? "computeruse.screenRecordingStorage was rejected by runtime governance",
      "governance",
      context,
      target.recordingRef,
    );
  }

  return undefined;
}

function ensureRealExecutionGuard(target: ScreenRecordingStorageTarget, context: ScreenRecordingStorageContext): ScreenRecordingStorageResult | undefined {
  if (context.dryRun !== false) return undefined;
  if (context.guard?.accepted === true || context.guard?.allowed === true) return undefined;

  return failure(
    "GOVERNANCE_REJECTED",
    context.guard?.reason ?? "computeruse.screenRecordingStorage dryRun:false requires an affirmative runtime guard",
    "governance",
    context,
    target.recordingRef,
  );
}

function baseOutput(
  target: ScreenRecordingStorageTarget,
  purpose: string,
  acceptedScopes: readonly string[],
  dryRun: boolean,
  providerCalled: boolean,
): Omit<ScreenRecordingStorageOutput, "storageEnvelope"> {
  return {
    kind: "agentCore.basicTool.computeruse.screenRecordingStorage",
    target,
    purpose,
    dispatch: dryRun ? "dry-run" : "runtime-computeruse",
    dryRun,
    providerCalled,
    executionBlocked: dryRun,
    unsafeSideEffects: true,
    permissionsRequired: ["screen:record", "recording:session", "artifact:write"],
    requiresTapApproval: true,
    acceptedScopes,
    runtimeEntry: {
      port: "BaseToolExecutorPort.computeruse.stopRecording",
      operation: "computeruse.screenRecordingStorage.finalize",
      runtimeOwnsRecordingSession: true,
      runtimeOwnsArtifactStorage: true,
      runtimeOwnsRetentionPolicy: true,
      baseToolOwnsTapStrategy: false,
    },
  };
}

function normalizeProviderResult(
  value: unknown,
  context: ScreenRecordingStorageContext,
  target: ScreenRecordingStorageTarget,
): ScreenRecordingStorageProviderResult | ScreenRecordingStorageResult {
  if (!isRecord(value) || cleanString(value.artifactId) === undefined || cleanString(value.mimeType) === undefined) {
    return failure(
      "PROVIDER_FAILURE",
      "computeruse.screenRecordingStorage runtime provider returned a malformed public-safe recording artifact envelope",
      "provider",
      context,
      target.recordingRef,
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
  target: ScreenRecordingStorageTarget;
  context: ScreenRecordingStorageContext;
  purpose: string;
  metadata?: Readonly<Record<string, unknown>>;
  provider?: ScreenRecordingStorageProvider;
} | ScreenRecordingStorageResult {
  if (request === undefined) request = {};
  if (!isRecord(request)) return failure("INVALID_REQUEST", "computeruse.screenRecordingStorage request must be an object", "input", undefined);

  const context = normalizeContext(request.context);
  if ("ok" in context) return context;

  const target = normalizeTarget(request, context);
  if ("ok" in target) return target;

  const purpose = cleanString(request.purpose);
  if (purpose === undefined) {
    return failure("MISSING_PURPOSE", "computeruse.screenRecordingStorage requires an explicit purpose", "input", context, target.recordingRef);
  }

  if (context.runtimeId === undefined) {
    return failure("MISSING_RUNTIME_ID", "computeruse.screenRecordingStorage requires context.runtimeId for audit", "input", context, target.recordingRef);
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
    provider: typeof request.provider === "function" ? (request.provider as ScreenRecordingStorageProvider) : undefined,
  };
}

export async function executeScreenRecordingStorage(request: unknown = {}): Promise<ScreenRecordingStorageResult> {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) return normalized;

  const { target, context, purpose, metadata, provider } = normalized;
  const acceptedScopes = context.requestedScopes ?? [];
  const dryRun = context.dryRun !== false;

  if (dryRun) {
    return {
      ok: true,
      toolId: screenRecordingStorageDescriptor.toolId,
      output: {
        ...baseOutput(target, purpose, acceptedScopes, true, false),
        storageEnvelope: {
          resource: "screen-recording",
          finalized: false,
          stored: false,
          metadataOnly: true,
          recordingRef: target.recordingRef,
          storageTarget: target.storageTarget,
          retentionPolicy: target.retentionPolicy,
        },
      },
      audit: [auditEvent("agentCore.basicTool.computeruse.screenRecordingStorage.dryRun", context, target.recordingRef, metadata)],
      events: ["basicTool.computeruse.screenRecordingStorage.dryRun"],
    };
  }

  if (provider === undefined) {
    return failure(
      "PROVIDER_UNAVAILABLE",
      "computeruse.screenRecordingStorage requires runtime executor.computeruse.stopRecording for dryRun:false",
      "provider",
      context,
      target.recordingRef,
    );
  }

  let providerResult: ScreenRecordingStorageProviderResult;
  try {
    const result = await provider({
      operation: "computeruse.screenRecordingStorage.finalize",
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
      "computeruse.screenRecordingStorage runtime provider failed without exposing private details",
      "provider",
      context,
      target.recordingRef,
    );
  }

  return {
    ok: true,
    toolId: screenRecordingStorageDescriptor.toolId,
    output: {
      ...baseOutput(target, purpose, acceptedScopes, false, true),
      storageEnvelope: {
        resource: "screen-recording",
        finalized: true,
        stored: true,
        metadataOnly: false,
        recordingRef: target.recordingRef,
        storageTarget: target.storageTarget,
        retentionPolicy: providerResult.retentionPolicy ?? target.retentionPolicy,
        artifactId: providerResult.artifactId,
        mimeType: providerResult.mimeType,
        storageUri: providerResult.storageUri,
      },
      providerMetadata: providerResult.metadata,
    },
    audit: [
      auditEvent("agentCore.basicTool.computeruse.screenRecordingStorage.stored", context, target.recordingRef, {
        artifactId: providerResult.artifactId,
        mimeType: providerResult.mimeType,
        storageUri: providerResult.storageUri,
        ...(providerResult.metadata ?? {}),
      }),
    ],
    events: ["basicTool.computeruse.screenRecordingStorage.stored"],
  };
}

export function planScreenRecordingStorage(request: unknown = {}): Promise<ScreenRecordingStorageResult> {
  return executeScreenRecordingStorage(request);
}
