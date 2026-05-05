export type ScreenshotStorageBoundary = "input" | "contract" | "governance" | "scope" | "provider";

export type ScreenshotStorageGate = {
  accepted?: boolean;
  allowed?: boolean;
  reason?: string;
};

export type ScreenshotStorageContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: ScreenshotStorageGate;
  contract?: ScreenshotStorageGate;
  governance?: ScreenshotStorageGate;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type ScreenshotStorageRetentionPolicy = "ephemeral" | "session-only" | "session-scoped" | "persistent";

export type ScreenshotStorageTarget = {
  screenshotRef: string;
  storageTarget: string;
  retentionPolicy: ScreenshotStorageRetentionPolicy;
};

export type ScreenshotStorageProviderRequest = {
  operation: "computeruse.screenshotStorage.store";
  target: ScreenshotStorageTarget;
  context: {
    runtimeId?: string;
    sessionId?: string;
    invocationId?: string;
    auditMetadata?: Readonly<Record<string, unknown>>;
  };
  purpose: string;
};

export type ScreenshotStorageProviderResult = {
  storedArtifactId: string;
  storageUri?: string;
  retentionPolicy?: ScreenshotStorageRetentionPolicy;
  metadata?: Readonly<Record<string, unknown>>;
};

export type ScreenshotStorageProvider = (
  request: ScreenshotStorageProviderRequest,
) => Promise<ScreenshotStorageProviderResult> | ScreenshotStorageProviderResult;

export type ScreenshotStorageRequest = {
  target?: unknown;
  context?: unknown;
  screenshotRef?: unknown;
  storageTarget?: unknown;
  retentionPolicy?: unknown;
  purpose?: unknown;
  metadata?: unknown;
  provider?: ScreenshotStorageProvider;
};

export type ScreenshotStorageErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_TARGET"
  | "INVALID_CONTEXT"
  | "MISSING_RUNTIME_ID"
  | "MISSING_SCREENSHOT_REF"
  | "INVALID_SCREENSHOT_REF"
  | "MISSING_STORAGE_TARGET"
  | "INVALID_STORAGE_TARGET"
  | "INVALID_RETENTION_POLICY"
  | "MISSING_PURPOSE"
  | "SCOPE_DENIED"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_FAILURE";

export type ScreenshotStorageError = {
  code: ScreenshotStorageErrorCode;
  message: string;
  boundary: ScreenshotStorageBoundary;
  publicSafe: true;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type ScreenshotStorageAuditEvent = {
  type: string;
  toolId: "computeruse.screenshotStorage";
  invocationId: string;
  dryRun: boolean;
  screenshotRef?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type ScreenshotStorageOutput = {
  kind: "agentCore.basicTool.computeruse.screenshotStorage";
  target: ScreenshotStorageTarget;
  purpose: string;
  dispatch: "dry-run" | "runtime-computeruse";
  dryRun: boolean;
  providerCalled: boolean;
  executionBlocked: boolean;
  unsafeSideEffects: true;
  permissionsRequired: readonly ["screen:read", "artifact:read", "artifact:write"];
  requiresTapApproval: true;
  acceptedScopes: readonly string[];
  runtimeEntry: {
    port: "BaseToolExecutorPort.artifact.store";
    operation: "computeruse.screenshotStorage.store";
    runtimeOwnsArtifactStorage: true;
    runtimeOwnsRetentionPolicy: true;
    baseToolOwnsTapStrategy: false;
  };
  storageEnvelope: {
    resource: "screen-artifact";
    stored: boolean;
    metadataOnly: boolean;
    screenshotRef: string;
    storageTarget: string;
    retentionPolicy: ScreenshotStorageRetentionPolicy;
    storedArtifactId?: string;
    storageUri?: string;
  };
  providerMetadata?: Readonly<Record<string, unknown>>;
};

export type ScreenshotStorageResult =
  | {
      ok: true;
      toolId: "computeruse.screenshotStorage";
      output: ScreenshotStorageOutput;
      audit: readonly ScreenshotStorageAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "computeruse.screenshotStorage";
      error: ScreenshotStorageError;
      audit: readonly ScreenshotStorageAuditEvent[];
      events: readonly string[];
    };

export const screenshotStorageDescriptor = {
  toolId: "computeruse.screenshotStorage",
  capability: "store-screenshot-artifact",
  route: "agent_executionEngine.basic_toolLayer.baseTools.computeruseBase.screenshot",
  defaultDryRun: true,
  defaultRetentionPolicy: "session-scoped",
  allowedStorageSchemes: ["artifact://", "session://", "runtime://", "memory://"],
  tapOwnsApproval: true,
  runtimeEntry: "BaseToolExecutorPort.artifact.store",
  permissionsRequired: ["screen:read", "artifact:read", "artifact:write"],
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

function cleanGate(value: unknown): ScreenshotStorageGate | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return undefined;
  const gate: ScreenshotStorageGate = {};
  if (typeof value.accepted === "boolean") gate.accepted = value.accepted;
  if (typeof value.allowed === "boolean") gate.allowed = value.allowed;
  const reason = cleanString(value.reason);
  if (reason !== undefined) gate.reason = reason;
  return gate;
}

function cleanAuditMetadata(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return isRecord(value) ? value : undefined;
}

function cleanRetentionPolicy(value: unknown): ScreenshotStorageRetentionPolicy | undefined {
  if (value === undefined) return screenshotStorageDescriptor.defaultRetentionPolicy;
  return value === "ephemeral" || value === "session-only" || value === "session-scoped" || value === "persistent"
    ? value
    : undefined;
}

function hasAllowedStorageScheme(value: string): boolean {
  return screenshotStorageDescriptor.allowedStorageSchemes.some((scheme) => value.startsWith(scheme));
}

function auditEvent(
  type: string,
  context: ScreenshotStorageContext | undefined,
  screenshotRef: string | undefined,
  metadata?: Readonly<Record<string, unknown>>,
): ScreenshotStorageAuditEvent {
  return {
    type,
    toolId: screenshotStorageDescriptor.toolId,
    invocationId: context?.invocationId ?? "computeruse.screenshotStorage:dry-run",
    dryRun: context?.dryRun !== false,
    screenshotRef,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: ScreenshotStorageErrorCode,
  message: string,
  boundary: ScreenshotStorageBoundary,
  context: ScreenshotStorageContext | undefined,
  screenshotRef?: string,
): ScreenshotStorageResult {
  return {
    ok: false,
    toolId: screenshotStorageDescriptor.toolId,
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("agentCore.basicTool.computeruse.screenshotStorage.rejected", context, screenshotRef, { code })],
    events: ["basicTool.computeruse.screenshotStorage.rejected"],
  };
}

function normalizeContext(value: unknown): ScreenshotStorageContext | ScreenshotStorageResult {
  if (value === undefined) return {};
  if (!isRecord(value)) return failure("INVALID_CONTEXT", "computeruse.screenshotStorage context must be an object", "input", undefined);

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
      "computeruse.screenshotStorage context contains malformed guard, governance, or scope fields",
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

function normalizeTarget(request: Record<string, unknown>, context: ScreenshotStorageContext): ScreenshotStorageTarget | ScreenshotStorageResult {
  const targetValue = request.target;
  if (targetValue !== undefined && !isRecord(targetValue)) {
    return failure("INVALID_TARGET", "computeruse.screenshotStorage target must be an object when provided", "input", context);
  }
  const target = isRecord(targetValue) ? targetValue : {};
  const screenshotRef = cleanString(target.screenshotRef ?? request.screenshotRef);
  const storageTarget = cleanString(target.storageTarget ?? request.storageTarget);
  const retentionPolicy = cleanRetentionPolicy(target.retentionPolicy ?? request.retentionPolicy);

  if (screenshotRef === undefined) {
    return failure("MISSING_SCREENSHOT_REF", "computeruse.screenshotStorage requires target.screenshotRef", "input", context);
  }
  if (screenshotRef.length > 1024) {
    return failure("INVALID_SCREENSHOT_REF", "computeruse.screenshotStorage screenshotRef must be at most 1024 characters", "input", context, screenshotRef);
  }
  if (storageTarget === undefined) {
    return failure("MISSING_STORAGE_TARGET", "computeruse.screenshotStorage requires target.storageTarget", "input", context, screenshotRef);
  }
  if (storageTarget.length > 1024 || !hasAllowedStorageScheme(storageTarget)) {
    return failure(
      "INVALID_STORAGE_TARGET",
      "computeruse.screenshotStorage storageTarget must use artifact://, session://, runtime://, or memory://",
      "input",
      context,
      screenshotRef,
    );
  }
  if (retentionPolicy === undefined) {
    return failure("INVALID_RETENTION_POLICY", "computeruse.screenshotStorage retentionPolicy is not supported", "input", context, screenshotRef);
  }

  return { screenshotRef, storageTarget, retentionPolicy };
}

function ensureScopes(target: ScreenshotStorageTarget, context: ScreenshotStorageContext): ScreenshotStorageResult | undefined {
  const requested = context.requestedScopes ?? [];
  const allowed = context.allowedScopes ?? [];
  if (requested.length === 0) return undefined;

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length === 0) return undefined;

  return failure(
    "SCOPE_DENIED",
    `computeruse.screenshotStorage scope ${denied[0]} is outside runtime governance`,
    "scope",
    context,
    target.screenshotRef,
  );
}

function ensureStaticGates(target: ScreenshotStorageTarget, context: ScreenshotStorageContext): ScreenshotStorageResult | undefined {
  if (context.contract?.accepted === false || context.contract?.allowed === false) {
    return failure(
      "CONTRACT_REJECTED",
      context.contract.reason ?? "computeruse.screenshotStorage was rejected by runtime contract surface",
      "contract",
      context,
      target.screenshotRef,
    );
  }

  if (context.governance?.accepted === false || context.governance?.allowed === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      context.governance.reason ?? "computeruse.screenshotStorage was rejected by runtime governance",
      "governance",
      context,
      target.screenshotRef,
    );
  }

  return undefined;
}

function ensureRealExecutionGuard(target: ScreenshotStorageTarget, context: ScreenshotStorageContext): ScreenshotStorageResult | undefined {
  if (context.dryRun !== false) return undefined;
  if (context.guard?.accepted === true || context.guard?.allowed === true) return undefined;

  return failure(
    "GOVERNANCE_REJECTED",
    context.guard?.reason ?? "computeruse.screenshotStorage dryRun:false requires an affirmative runtime guard",
    "governance",
    context,
    target.screenshotRef,
  );
}

function baseOutput(
  target: ScreenshotStorageTarget,
  purpose: string,
  acceptedScopes: readonly string[],
  dryRun: boolean,
  providerCalled: boolean,
): Omit<ScreenshotStorageOutput, "storageEnvelope"> {
  return {
    kind: "agentCore.basicTool.computeruse.screenshotStorage",
    target,
    purpose,
    dispatch: dryRun ? "dry-run" : "runtime-computeruse",
    dryRun,
    providerCalled,
    executionBlocked: dryRun,
    unsafeSideEffects: true,
    permissionsRequired: screenshotStorageDescriptor.permissionsRequired,
    requiresTapApproval: true,
    acceptedScopes,
    runtimeEntry: {
      port: "BaseToolExecutorPort.artifact.store",
      operation: "computeruse.screenshotStorage.store",
      runtimeOwnsArtifactStorage: true,
      runtimeOwnsRetentionPolicy: true,
      baseToolOwnsTapStrategy: false,
    },
  };
}

function normalizeProviderResult(
  value: unknown,
  context: ScreenshotStorageContext,
  target: ScreenshotStorageTarget,
): ScreenshotStorageProviderResult | ScreenshotStorageResult {
  if (!isRecord(value) || cleanString(value.storedArtifactId) === undefined) {
    return failure(
      "PROVIDER_FAILURE",
      "computeruse.screenshotStorage runtime provider returned a malformed public-safe storage envelope",
      "provider",
      context,
      target.screenshotRef,
    );
  }

  const retentionPolicy = cleanRetentionPolicy(value.retentionPolicy) ?? target.retentionPolicy;
  const storageUri = cleanString(value.storageUri);

  return {
    storedArtifactId: cleanString(value.storedArtifactId) ?? "",
    storageUri,
    retentionPolicy,
    metadata: cleanAuditMetadata(value.metadata),
  };
}

function normalizeRequest(request: unknown): {
  target: ScreenshotStorageTarget;
  context: ScreenshotStorageContext;
  purpose: string;
  metadata?: Readonly<Record<string, unknown>>;
  provider?: ScreenshotStorageProvider;
} | ScreenshotStorageResult {
  if (request === undefined) request = {};
  if (!isRecord(request)) return failure("INVALID_REQUEST", "computeruse.screenshotStorage request must be an object", "input", undefined);

  const context = normalizeContext(request.context);
  if ("ok" in context) return context;

  const target = normalizeTarget(request, context);
  if ("ok" in target) return target;

  const purpose = cleanString(request.purpose);
  if (purpose === undefined) {
    return failure("MISSING_PURPOSE", "computeruse.screenshotStorage requires an explicit purpose", "input", context, target.screenshotRef);
  }

  if (context.runtimeId === undefined) {
    return failure("MISSING_RUNTIME_ID", "computeruse.screenshotStorage requires context.runtimeId for audit", "input", context, target.screenshotRef);
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
    provider: typeof request.provider === "function" ? (request.provider as ScreenshotStorageProvider) : undefined,
  };
}

export async function executeScreenshotStorage(request: unknown = {}): Promise<ScreenshotStorageResult> {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) return normalized;

  const { target, context, purpose, metadata, provider } = normalized;
  const acceptedScopes = context.requestedScopes ?? [];
  const dryRun = context.dryRun !== false;

  if (dryRun) {
    return {
      ok: true,
      toolId: screenshotStorageDescriptor.toolId,
      output: {
        ...baseOutput(target, purpose, acceptedScopes, true, false),
        storageEnvelope: {
          resource: "screen-artifact",
          stored: false,
          metadataOnly: true,
          screenshotRef: target.screenshotRef,
          storageTarget: target.storageTarget,
          retentionPolicy: target.retentionPolicy,
        },
      },
      audit: [auditEvent("agentCore.basicTool.computeruse.screenshotStorage.dryRun", context, target.screenshotRef, metadata)],
      events: ["basicTool.computeruse.screenshotStorage.dryRun"],
    };
  }

  if (provider === undefined) {
    return failure(
      "PROVIDER_UNAVAILABLE",
      "computeruse.screenshotStorage requires runtime executor.artifact.store for dryRun:false",
      "provider",
      context,
      target.screenshotRef,
    );
  }

  let providerResult: ScreenshotStorageProviderResult;
  try {
    const result = await provider({
      operation: "computeruse.screenshotStorage.store",
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
      "computeruse.screenshotStorage runtime provider failed without exposing private details",
      "provider",
      context,
      target.screenshotRef,
    );
  }

  return {
    ok: true,
    toolId: screenshotStorageDescriptor.toolId,
    output: {
      ...baseOutput(target, purpose, acceptedScopes, false, true),
      storageEnvelope: {
        resource: "screen-artifact",
        stored: true,
        metadataOnly: false,
        screenshotRef: target.screenshotRef,
        storageTarget: target.storageTarget,
        retentionPolicy: providerResult.retentionPolicy ?? target.retentionPolicy,
        storedArtifactId: providerResult.storedArtifactId,
        storageUri: providerResult.storageUri,
      },
      providerMetadata: providerResult.metadata,
    },
    audit: [
      auditEvent("agentCore.basicTool.computeruse.screenshotStorage.stored", context, target.screenshotRef, {
        storedArtifactId: providerResult.storedArtifactId,
        storageUri: providerResult.storageUri,
        retentionPolicy: providerResult.retentionPolicy ?? target.retentionPolicy,
        ...(providerResult.metadata ?? {}),
      }),
    ],
    events: ["basicTool.computeruse.screenshotStorage.stored"],
  };
}

export function planScreenshotStorage(request: unknown = {}): Promise<ScreenshotStorageResult> {
  return executeScreenshotStorage(request);
}
