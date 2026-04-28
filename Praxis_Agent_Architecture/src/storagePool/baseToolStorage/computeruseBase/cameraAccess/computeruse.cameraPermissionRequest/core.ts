export type CameraPermissionRequestBoundary = "input" | "contract" | "governance" | "scope" | "resource" | "provider";

export type CameraPermissionRequestGate = {
  accepted?: boolean;
  allowed?: boolean;
  reason?: string;
};

export type CameraPermissionRequestMode = "session" | "single-capture" | "recording";

export type CameraPermissionRequestContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: CameraPermissionRequestGate;
  contract?: CameraPermissionRequestGate;
  governance?: CameraPermissionRequestGate;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type CameraPermissionRequestTarget = {
  targetApplication: string;
  purpose: string;
  deviceId?: string;
  mode: CameraPermissionRequestMode;
  requestedDurationMs: number;
};

export type CameraPermissionProviderRequest = {
  operation: "computeruse.cameraPermissionRequest.request";
  target: CameraPermissionRequestTarget;
  context: {
    runtimeId?: string;
    sessionId?: string;
    invocationId?: string;
    auditMetadata?: Readonly<Record<string, unknown>>;
  };
};

export type CameraPermissionProviderResult = {
  granted: boolean;
  leaseId?: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type CameraPermissionProvider = (
  request: CameraPermissionProviderRequest,
) => Promise<CameraPermissionProviderResult> | CameraPermissionProviderResult;

export type CameraPermissionRequestInput = {
  target?: unknown;
  context?: unknown;
  targetApplication?: unknown;
  purpose?: unknown;
  deviceId?: unknown;
  mode?: unknown;
  requestedDurationMs?: unknown;
  maxDurationMs?: unknown;
  metadata?: unknown;
  provider?: CameraPermissionProvider;
};

export type CameraPermissionRequestErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_CONTEXT"
  | "INVALID_TARGET"
  | "MISSING_RUNTIME_ID"
  | "MISSING_TARGET_APPLICATION"
  | "MISSING_PURPOSE"
  | "INVALID_DEVICE_ID"
  | "INVALID_MODE"
  | "INVALID_DURATION"
  | "DURATION_LIMIT_EXCEEDED"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_FAILURE";

export type CameraPermissionRequestError = {
  code: CameraPermissionRequestErrorCode;
  message: string;
  boundary: CameraPermissionRequestBoundary;
  publicSafe: true;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type CameraPermissionRequestAuditEvent = {
  type: string;
  toolId: "computeruse.cameraPermissionRequest";
  invocationId: string;
  dryRun: boolean;
  deviceId?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type CameraPermissionRequestOutput = {
  kind: "agentCore.basicTool.computeruse.cameraPermissionRequest";
  target: CameraPermissionRequestTarget;
  dispatch: "dry-run" | "runtime-computeruse";
  dryRun: boolean;
  providerCalled: boolean;
  executionBlocked: boolean;
  unsafeSideEffects: true;
  permissionsRequired: readonly ["camera:permission-request"];
  requiresTapApproval: true;
  acceptedScopes: readonly string[];
  runtimeEntry: {
    port: "BaseToolExecutorPort.computeruse.requestPermission";
    operation: "computeruse.cameraPermissionRequest.request";
    runtimeOwnsPermissionPrompt: true;
    runtimeOwnsDeviceLease: true;
    baseToolOwnsTapStrategy: false;
  };
  permissionEnvelope: {
    resource: "camera";
    requested: boolean;
    granted: boolean;
    metadataOnly: boolean;
    leaseId?: string;
  };
  providerMetadata?: Readonly<Record<string, unknown>>;
};

export type CameraPermissionRequestResult =
  | {
      ok: true;
      toolId: "computeruse.cameraPermissionRequest";
      output: CameraPermissionRequestOutput;
      audit: readonly CameraPermissionRequestAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "computeruse.cameraPermissionRequest";
      error: CameraPermissionRequestError;
      audit: readonly CameraPermissionRequestAuditEvent[];
      events: readonly string[];
    };

export const cameraPermissionRequestDescriptor = {
  toolId: "computeruse.cameraPermissionRequest",
  capability: "camera-permission-request",
  route: "agent_executionEngine.basic_toolLayer.baseTools.computeruseBase.cameraAccess",
  defaultDryRun: true,
  defaultMode: "session",
  defaultRequestedDurationMs: 60_000,
  defaultMaxDurationMs: 10 * 60_000,
  tapOwnsApproval: true,
  runtimeEntry: "BaseToolExecutorPort.computeruse.requestPermission",
  permissionsRequired: ["camera:permission-request"],
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

function cleanGate(value: unknown): CameraPermissionRequestGate | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return undefined;
  const gate: CameraPermissionRequestGate = {};
  if (typeof value.accepted === "boolean") gate.accepted = value.accepted;
  if (typeof value.allowed === "boolean") gate.allowed = value.allowed;
  const reason = cleanString(value.reason);
  if (reason !== undefined) gate.reason = reason;
  return gate;
}

function cleanAuditMetadata(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return isRecord(value) ? value : undefined;
}

function cleanMode(value: unknown): CameraPermissionRequestMode | undefined {
  if (value === undefined) return cameraPermissionRequestDescriptor.defaultMode;
  return value === "session" || value === "single-capture" || value === "recording" ? value : undefined;
}

function cleanDuration(value: unknown, fallback: number): number | undefined {
  if (value === undefined) return fallback;
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

function auditEvent(
  type: string,
  context: CameraPermissionRequestContext | undefined,
  deviceId: string | undefined,
  metadata?: Readonly<Record<string, unknown>>,
): CameraPermissionRequestAuditEvent {
  return {
    type,
    toolId: cameraPermissionRequestDescriptor.toolId,
    invocationId: context?.invocationId ?? "computeruse.cameraPermissionRequest:dry-run",
    dryRun: context?.dryRun !== false,
    deviceId,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: CameraPermissionRequestErrorCode,
  message: string,
  boundary: CameraPermissionRequestBoundary,
  context: CameraPermissionRequestContext | undefined,
  deviceId?: string,
): CameraPermissionRequestResult {
  return {
    ok: false,
    toolId: cameraPermissionRequestDescriptor.toolId,
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("agentCore.basicTool.computeruse.cameraPermissionRequest.rejected", context, deviceId, { code })],
    events: ["basicTool.computeruse.cameraPermissionRequest.rejected"],
  };
}

function normalizeContext(value: unknown): CameraPermissionRequestContext | CameraPermissionRequestResult {
  if (value === undefined) return {};
  if (!isRecord(value)) return failure("INVALID_CONTEXT", "computeruse.cameraPermissionRequest context must be an object", "input", undefined);

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
      "computeruse.cameraPermissionRequest context contains malformed guard, governance, or scope fields",
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
  context: CameraPermissionRequestContext,
): CameraPermissionRequestTarget | CameraPermissionRequestResult {
  const targetValue = request.target;
  if (targetValue !== undefined && !isRecord(targetValue)) {
    return failure("INVALID_TARGET", "computeruse.cameraPermissionRequest target must be an object when provided", "input", context);
  }
  const target = isRecord(targetValue) ? targetValue : {};
  const targetApplication = cleanString(target.targetApplication ?? request.targetApplication);
  const purpose = cleanString(target.purpose ?? request.purpose);
  const deviceId = cleanString(target.deviceId ?? request.deviceId);
  const mode = cleanMode(target.mode ?? request.mode);
  const requestedDurationMs = cleanDuration(target.requestedDurationMs ?? request.requestedDurationMs, cameraPermissionRequestDescriptor.defaultRequestedDurationMs);
  const maxDurationMs = cleanDuration(target.maxDurationMs ?? request.maxDurationMs, cameraPermissionRequestDescriptor.defaultMaxDurationMs);

  if (targetApplication === undefined) {
    return failure("MISSING_TARGET_APPLICATION", "computeruse.cameraPermissionRequest requires target.targetApplication", "input", context);
  }
  if (purpose === undefined) {
    return failure("MISSING_PURPOSE", "computeruse.cameraPermissionRequest requires target.purpose", "input", context, deviceId);
  }
  if ((target.deviceId ?? request.deviceId) !== undefined && deviceId === undefined) {
    return failure("INVALID_DEVICE_ID", "computeruse.cameraPermissionRequest deviceId must be a safe string", "input", context);
  }
  if (mode === undefined) {
    return failure("INVALID_MODE", "computeruse.cameraPermissionRequest mode must be session, single-capture, or recording", "input", context, deviceId);
  }
  if (requestedDurationMs === undefined || maxDurationMs === undefined) {
    return failure("INVALID_DURATION", "computeruse.cameraPermissionRequest durations must be positive integers", "input", context, deviceId);
  }
  if (requestedDurationMs > maxDurationMs) {
    return failure(
      "DURATION_LIMIT_EXCEEDED",
      "computeruse.cameraPermissionRequest duration exceeds the configured resource boundary",
      "resource",
      context,
      deviceId,
    );
  }

  return {
    targetApplication,
    purpose,
    deviceId,
    mode,
    requestedDurationMs,
  };
}

function ensureScopes(
  target: CameraPermissionRequestTarget,
  context: CameraPermissionRequestContext,
): CameraPermissionRequestResult | undefined {
  const requested = context.requestedScopes ?? [];
  const allowed = context.allowedScopes ?? [];
  if (requested.length === 0) return undefined;

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length === 0) return undefined;

  return failure(
    "SCOPE_DENIED",
    `computeruse.cameraPermissionRequest scope ${denied[0]} is outside runtime governance`,
    "scope",
    context,
    target.deviceId,
  );
}

function ensureStaticGates(
  target: CameraPermissionRequestTarget,
  context: CameraPermissionRequestContext,
): CameraPermissionRequestResult | undefined {
  if (context.contract?.accepted === false || context.contract?.allowed === false) {
    return failure(
      "CONTRACT_REJECTED",
      context.contract.reason ?? "computeruse.cameraPermissionRequest was rejected by runtime contract surface",
      "contract",
      context,
      target.deviceId,
    );
  }

  if (context.governance?.accepted === false || context.governance?.allowed === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      context.governance.reason ?? "computeruse.cameraPermissionRequest was rejected by runtime governance",
      "governance",
      context,
      target.deviceId,
    );
  }

  return undefined;
}

function ensureRealExecutionGuard(
  target: CameraPermissionRequestTarget,
  context: CameraPermissionRequestContext,
): CameraPermissionRequestResult | undefined {
  if (context.dryRun !== false) return undefined;
  if (context.guard?.accepted === true || context.guard?.allowed === true) return undefined;

  return failure(
    "GOVERNANCE_REJECTED",
    context.guard?.reason ?? "computeruse.cameraPermissionRequest dryRun:false requires an affirmative runtime guard",
    "governance",
    context,
    target.deviceId,
  );
}

function baseOutput(
  target: CameraPermissionRequestTarget,
  acceptedScopes: readonly string[],
  dryRun: boolean,
  providerCalled: boolean,
): Omit<CameraPermissionRequestOutput, "permissionEnvelope"> {
  return {
    kind: "agentCore.basicTool.computeruse.cameraPermissionRequest",
    target,
    dispatch: dryRun ? "dry-run" : "runtime-computeruse",
    dryRun,
    providerCalled,
    executionBlocked: dryRun,
    unsafeSideEffects: true,
    permissionsRequired: cameraPermissionRequestDescriptor.permissionsRequired,
    requiresTapApproval: true,
    acceptedScopes,
    runtimeEntry: {
      port: "BaseToolExecutorPort.computeruse.requestPermission",
      operation: "computeruse.cameraPermissionRequest.request",
      runtimeOwnsPermissionPrompt: true,
      runtimeOwnsDeviceLease: true,
      baseToolOwnsTapStrategy: false,
    },
  };
}

function normalizeProviderResult(
  value: unknown,
  context: CameraPermissionRequestContext,
  target: CameraPermissionRequestTarget,
): CameraPermissionProviderResult | CameraPermissionRequestResult {
  if (!isRecord(value) || typeof value.granted !== "boolean") {
    return failure(
      "PROVIDER_FAILURE",
      "computeruse.cameraPermissionRequest runtime provider returned a malformed public-safe permission envelope",
      "provider",
      context,
      target.deviceId,
    );
  }

  return {
    granted: value.granted,
    leaseId: cleanString(value.leaseId),
    metadata: cleanAuditMetadata(value.metadata),
  };
}

function normalizeRequest(request: unknown): {
  target: CameraPermissionRequestTarget;
  context: CameraPermissionRequestContext;
  metadata?: Readonly<Record<string, unknown>>;
  provider?: CameraPermissionProvider;
} | CameraPermissionRequestResult {
  if (request === undefined) request = {};
  if (!isRecord(request)) {
    return failure("INVALID_REQUEST", "computeruse.cameraPermissionRequest request must be an object", "input", undefined);
  }

  const context = normalizeContext(request.context);
  if ("ok" in context) return context;

  const target = normalizeTarget(request, context);
  if ("ok" in target) return target;

  if (context.runtimeId === undefined) {
    return failure("MISSING_RUNTIME_ID", "computeruse.cameraPermissionRequest requires context.runtimeId for audit", "input", context, target.deviceId);
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
    provider: typeof request.provider === "function" ? (request.provider as CameraPermissionProvider) : undefined,
  };
}

export async function executeCameraPermissionRequest(request: unknown = {}): Promise<CameraPermissionRequestResult> {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) return normalized;

  const { target, context, metadata, provider } = normalized;
  const acceptedScopes = context.requestedScopes ?? [];
  const dryRun = context.dryRun !== false;

  if (dryRun) {
    return {
      ok: true,
      toolId: cameraPermissionRequestDescriptor.toolId,
      output: {
        ...baseOutput(target, acceptedScopes, true, false),
        permissionEnvelope: {
          resource: "camera",
          requested: false,
          granted: false,
          metadataOnly: true,
        },
      },
      audit: [auditEvent("agentCore.basicTool.computeruse.cameraPermissionRequest.dryRun", context, target.deviceId, metadata)],
      events: ["basicTool.computeruse.cameraPermissionRequest.dryRun"],
    };
  }

  if (provider === undefined) {
    return failure(
      "PROVIDER_UNAVAILABLE",
      "computeruse.cameraPermissionRequest requires runtime executor.computeruse.requestPermission for dryRun:false",
      "provider",
      context,
      target.deviceId,
    );
  }

  let providerResult: CameraPermissionProviderResult;
  try {
    const result = await provider({
      operation: "computeruse.cameraPermissionRequest.request",
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
      "computeruse.cameraPermissionRequest runtime provider failed without exposing private details",
      "provider",
      context,
      target.deviceId,
    );
  }

  return {
    ok: true,
    toolId: cameraPermissionRequestDescriptor.toolId,
    output: {
      ...baseOutput(target, acceptedScopes, false, true),
      permissionEnvelope: {
        resource: "camera",
        requested: true,
        granted: providerResult.granted,
        metadataOnly: false,
        leaseId: providerResult.leaseId,
      },
      providerMetadata: providerResult.metadata,
    },
    audit: [
      auditEvent("agentCore.basicTool.computeruse.cameraPermissionRequest.requested", context, target.deviceId, {
        granted: providerResult.granted,
        leaseId: providerResult.leaseId,
        ...(providerResult.metadata ?? {}),
      }),
    ],
    events: ["basicTool.computeruse.cameraPermissionRequest.requested"],
  };
}

export function planCameraPermissionRequest(request: unknown = {}): Promise<CameraPermissionRequestResult> {
  return executeCameraPermissionRequest(request);
}
