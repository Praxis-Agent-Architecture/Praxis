export type MicrophonePermissionRequestBoundary = "input" | "contract" | "governance" | "scope" | "resource" | "provider";

export type MicrophonePermissionRequestGate = {
  accepted?: boolean;
  allowed?: boolean;
  reason?: string;
};

export type MicrophonePermissionRequestMode = "session" | "single-capture" | "recording";

export type MicrophonePermissionRequestContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: MicrophonePermissionRequestGate;
  contract?: MicrophonePermissionRequestGate;
  governance?: MicrophonePermissionRequestGate;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type MicrophonePermissionRequestTarget = {
  targetApplication: string;
  purpose: string;
  deviceId?: string;
  mode: MicrophonePermissionRequestMode;
  requestedDurationMs: number;
};

export type MicrophonePermissionProviderRequest = {
  operation: "computeruse.microphonePermissionRequest.request";
  target: MicrophonePermissionRequestTarget;
  context: {
    runtimeId?: string;
    sessionId?: string;
    invocationId?: string;
    auditMetadata?: Readonly<Record<string, unknown>>;
  };
};

export type MicrophonePermissionProviderResult = {
  granted: boolean;
  leaseId?: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type MicrophonePermissionProvider = (
  request: MicrophonePermissionProviderRequest,
) => Promise<MicrophonePermissionProviderResult> | MicrophonePermissionProviderResult;

export type MicrophonePermissionRequestInput = {
  target?: unknown;
  context?: unknown;
  targetApplication?: unknown;
  purpose?: unknown;
  deviceId?: unknown;
  mode?: unknown;
  requestedDurationMs?: unknown;
  maxDurationMs?: unknown;
  metadata?: unknown;
  provider?: MicrophonePermissionProvider;
};

export type MicrophonePermissionRequestErrorCode =
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

export type MicrophonePermissionRequestError = {
  code: MicrophonePermissionRequestErrorCode;
  message: string;
  boundary: MicrophonePermissionRequestBoundary;
  publicSafe: true;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type MicrophonePermissionRequestAuditEvent = {
  type: string;
  toolId: "computeruse.microphonePermissionRequest";
  invocationId: string;
  dryRun: boolean;
  deviceId?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type MicrophonePermissionRequestOutput = {
  kind: "agentCore.basicTool.computeruse.microphonePermissionRequest";
  target: MicrophonePermissionRequestTarget;
  dispatch: "dry-run" | "runtime-computeruse";
  dryRun: boolean;
  providerCalled: boolean;
  executionBlocked: boolean;
  unsafeSideEffects: true;
  permissionsRequired: readonly ["microphone:permission-request"];
  requiresTapApproval: true;
  acceptedScopes: readonly string[];
  runtimeEntry: {
    port: "BaseToolExecutorPort.computeruse.requestPermission";
    operation: "computeruse.microphonePermissionRequest.request";
    runtimeOwnsPermissionPrompt: true;
    runtimeOwnsDeviceLease: true;
    baseToolOwnsTapStrategy: false;
  };
  permissionEnvelope: {
    resource: "microphone";
    requested: boolean;
    granted: boolean;
    metadataOnly: boolean;
    leaseId?: string;
  };
  providerMetadata?: Readonly<Record<string, unknown>>;
};

export type MicrophonePermissionRequestResult =
  | {
      ok: true;
      toolId: "computeruse.microphonePermissionRequest";
      output: MicrophonePermissionRequestOutput;
      audit: readonly MicrophonePermissionRequestAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "computeruse.microphonePermissionRequest";
      error: MicrophonePermissionRequestError;
      audit: readonly MicrophonePermissionRequestAuditEvent[];
      events: readonly string[];
    };

export const microphonePermissionRequestDescriptor = {
  toolId: "computeruse.microphonePermissionRequest",
  capability: "microphone-permission-request",
  route: "agent_executionEngine.basic_toolLayer.baseTools.computeruseBase.microphoneAccess",
  defaultDryRun: true,
  defaultMode: "session",
  defaultRequestedDurationMs: 60_000,
  defaultMaxDurationMs: 10 * 60_000,
  tapOwnsApproval: true,
  runtimeEntry: "BaseToolExecutorPort.computeruse.requestPermission",
  permissionsRequired: ["microphone:permission-request"],
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

function cleanGate(value: unknown): MicrophonePermissionRequestGate | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return undefined;
  const gate: MicrophonePermissionRequestGate = {};
  if (typeof value.accepted === "boolean") gate.accepted = value.accepted;
  if (typeof value.allowed === "boolean") gate.allowed = value.allowed;
  const reason = cleanString(value.reason);
  if (reason !== undefined) gate.reason = reason;
  return gate;
}

function cleanAuditMetadata(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return isRecord(value) ? value : undefined;
}

function cleanMode(value: unknown): MicrophonePermissionRequestMode | undefined {
  if (value === undefined) return microphonePermissionRequestDescriptor.defaultMode;
  return value === "session" || value === "single-capture" || value === "recording" ? value : undefined;
}

function cleanDuration(value: unknown, fallback: number): number | undefined {
  if (value === undefined) return fallback;
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

function auditEvent(
  type: string,
  context: MicrophonePermissionRequestContext | undefined,
  deviceId: string | undefined,
  metadata?: Readonly<Record<string, unknown>>,
): MicrophonePermissionRequestAuditEvent {
  return {
    type,
    toolId: microphonePermissionRequestDescriptor.toolId,
    invocationId: context?.invocationId ?? "computeruse.microphonePermissionRequest:dry-run",
    dryRun: context?.dryRun !== false,
    deviceId,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: MicrophonePermissionRequestErrorCode,
  message: string,
  boundary: MicrophonePermissionRequestBoundary,
  context: MicrophonePermissionRequestContext | undefined,
  deviceId?: string,
): MicrophonePermissionRequestResult {
  return {
    ok: false,
    toolId: microphonePermissionRequestDescriptor.toolId,
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("agentCore.basicTool.computeruse.microphonePermissionRequest.rejected", context, deviceId, { code })],
    events: ["basicTool.computeruse.microphonePermissionRequest.rejected"],
  };
}

function normalizeContext(value: unknown): MicrophonePermissionRequestContext | MicrophonePermissionRequestResult {
  if (value === undefined) return {};
  if (!isRecord(value)) return failure("INVALID_CONTEXT", "computeruse.microphonePermissionRequest context must be an object", "input", undefined);

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
      "computeruse.microphonePermissionRequest context contains malformed guard, governance, or scope fields",
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
  context: MicrophonePermissionRequestContext,
): MicrophonePermissionRequestTarget | MicrophonePermissionRequestResult {
  const targetValue = request.target;
  if (targetValue !== undefined && !isRecord(targetValue)) {
    return failure("INVALID_TARGET", "computeruse.microphonePermissionRequest target must be an object when provided", "input", context);
  }
  const target = isRecord(targetValue) ? targetValue : {};
  const targetApplication = cleanString(target.targetApplication ?? request.targetApplication);
  const purpose = cleanString(target.purpose ?? request.purpose);
  const deviceId = cleanString(target.deviceId ?? request.deviceId);
  const mode = cleanMode(target.mode ?? request.mode);
  const requestedDurationMs = cleanDuration(target.requestedDurationMs ?? request.requestedDurationMs, microphonePermissionRequestDescriptor.defaultRequestedDurationMs);
  const maxDurationMs = cleanDuration(target.maxDurationMs ?? request.maxDurationMs, microphonePermissionRequestDescriptor.defaultMaxDurationMs);

  if (targetApplication === undefined) {
    return failure("MISSING_TARGET_APPLICATION", "computeruse.microphonePermissionRequest requires target.targetApplication", "input", context);
  }
  if (purpose === undefined) {
    return failure("MISSING_PURPOSE", "computeruse.microphonePermissionRequest requires target.purpose", "input", context, deviceId);
  }
  if ((target.deviceId ?? request.deviceId) !== undefined && deviceId === undefined) {
    return failure("INVALID_DEVICE_ID", "computeruse.microphonePermissionRequest deviceId must be a safe string", "input", context);
  }
  if (mode === undefined) {
    return failure("INVALID_MODE", "computeruse.microphonePermissionRequest mode must be session, single-capture, or recording", "input", context, deviceId);
  }
  if (requestedDurationMs === undefined || maxDurationMs === undefined) {
    return failure("INVALID_DURATION", "computeruse.microphonePermissionRequest durations must be positive integers", "input", context, deviceId);
  }
  if (requestedDurationMs > maxDurationMs) {
    return failure(
      "DURATION_LIMIT_EXCEEDED",
      "computeruse.microphonePermissionRequest duration exceeds the configured resource boundary",
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
  target: MicrophonePermissionRequestTarget,
  context: MicrophonePermissionRequestContext,
): MicrophonePermissionRequestResult | undefined {
  const requested = context.requestedScopes ?? [];
  const allowed = context.allowedScopes ?? [];
  if (requested.length === 0) return undefined;

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length === 0) return undefined;

  return failure(
    "SCOPE_DENIED",
    `computeruse.microphonePermissionRequest scope ${denied[0]} is outside runtime governance`,
    "scope",
    context,
    target.deviceId,
  );
}

function ensureStaticGates(
  target: MicrophonePermissionRequestTarget,
  context: MicrophonePermissionRequestContext,
): MicrophonePermissionRequestResult | undefined {
  if (context.contract?.accepted === false || context.contract?.allowed === false) {
    return failure(
      "CONTRACT_REJECTED",
      context.contract.reason ?? "computeruse.microphonePermissionRequest was rejected by runtime contract surface",
      "contract",
      context,
      target.deviceId,
    );
  }

  if (context.governance?.accepted === false || context.governance?.allowed === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      context.governance.reason ?? "computeruse.microphonePermissionRequest was rejected by runtime governance",
      "governance",
      context,
      target.deviceId,
    );
  }

  return undefined;
}

function ensureRealExecutionGuard(
  target: MicrophonePermissionRequestTarget,
  context: MicrophonePermissionRequestContext,
): MicrophonePermissionRequestResult | undefined {
  if (context.dryRun !== false) return undefined;
  if (context.guard?.accepted === true || context.guard?.allowed === true) return undefined;

  return failure(
    "GOVERNANCE_REJECTED",
    context.guard?.reason ?? "computeruse.microphonePermissionRequest dryRun:false requires an affirmative runtime guard",
    "governance",
    context,
    target.deviceId,
  );
}

function baseOutput(
  target: MicrophonePermissionRequestTarget,
  acceptedScopes: readonly string[],
  dryRun: boolean,
  providerCalled: boolean,
): Omit<MicrophonePermissionRequestOutput, "permissionEnvelope"> {
  return {
    kind: "agentCore.basicTool.computeruse.microphonePermissionRequest",
    target,
    dispatch: dryRun ? "dry-run" : "runtime-computeruse",
    dryRun,
    providerCalled,
    executionBlocked: dryRun,
    unsafeSideEffects: true,
    permissionsRequired: microphonePermissionRequestDescriptor.permissionsRequired,
    requiresTapApproval: true,
    acceptedScopes,
    runtimeEntry: {
      port: "BaseToolExecutorPort.computeruse.requestPermission",
      operation: "computeruse.microphonePermissionRequest.request",
      runtimeOwnsPermissionPrompt: true,
      runtimeOwnsDeviceLease: true,
      baseToolOwnsTapStrategy: false,
    },
  };
}

function normalizeProviderResult(
  value: unknown,
  context: MicrophonePermissionRequestContext,
  target: MicrophonePermissionRequestTarget,
): MicrophonePermissionProviderResult | MicrophonePermissionRequestResult {
  if (!isRecord(value) || typeof value.granted !== "boolean") {
    return failure(
      "PROVIDER_FAILURE",
      "computeruse.microphonePermissionRequest runtime provider returned a malformed public-safe permission envelope",
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
  target: MicrophonePermissionRequestTarget;
  context: MicrophonePermissionRequestContext;
  metadata?: Readonly<Record<string, unknown>>;
  provider?: MicrophonePermissionProvider;
} | MicrophonePermissionRequestResult {
  if (request === undefined) request = {};
  if (!isRecord(request)) {
    return failure("INVALID_REQUEST", "computeruse.microphonePermissionRequest request must be an object", "input", undefined);
  }

  const context = normalizeContext(request.context);
  if ("ok" in context) return context;

  const target = normalizeTarget(request, context);
  if ("ok" in target) return target;

  if (context.runtimeId === undefined) {
    return failure("MISSING_RUNTIME_ID", "computeruse.microphonePermissionRequest requires context.runtimeId for audit", "input", context, target.deviceId);
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
    provider: typeof request.provider === "function" ? (request.provider as MicrophonePermissionProvider) : undefined,
  };
}

export async function executeMicrophonePermissionRequest(request: unknown = {}): Promise<MicrophonePermissionRequestResult> {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) return normalized;

  const { target, context, metadata, provider } = normalized;
  const acceptedScopes = context.requestedScopes ?? [];
  const dryRun = context.dryRun !== false;

  if (dryRun) {
    return {
      ok: true,
      toolId: microphonePermissionRequestDescriptor.toolId,
      output: {
        ...baseOutput(target, acceptedScopes, true, false),
        permissionEnvelope: {
          resource: "microphone",
          requested: false,
          granted: false,
          metadataOnly: true,
        },
      },
      audit: [auditEvent("agentCore.basicTool.computeruse.microphonePermissionRequest.dryRun", context, target.deviceId, metadata)],
      events: ["basicTool.computeruse.microphonePermissionRequest.dryRun"],
    };
  }

  if (provider === undefined) {
    return failure(
      "PROVIDER_UNAVAILABLE",
      "computeruse.microphonePermissionRequest requires runtime executor.computeruse.requestPermission for dryRun:false",
      "provider",
      context,
      target.deviceId,
    );
  }

  let providerResult: MicrophonePermissionProviderResult;
  try {
    const result = await provider({
      operation: "computeruse.microphonePermissionRequest.request",
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
      "computeruse.microphonePermissionRequest runtime provider failed without exposing private details",
      "provider",
      context,
      target.deviceId,
    );
  }

  return {
    ok: true,
    toolId: microphonePermissionRequestDescriptor.toolId,
    output: {
      ...baseOutput(target, acceptedScopes, false, true),
      permissionEnvelope: {
        resource: "microphone",
        requested: true,
        granted: providerResult.granted,
        metadataOnly: false,
        leaseId: providerResult.leaseId,
      },
      providerMetadata: providerResult.metadata,
    },
    audit: [
      auditEvent("agentCore.basicTool.computeruse.microphonePermissionRequest.requested", context, target.deviceId, {
        granted: providerResult.granted,
        leaseId: providerResult.leaseId,
        ...(providerResult.metadata ?? {}),
      }),
    ],
    events: ["basicTool.computeruse.microphonePermissionRequest.requested"],
  };
}

export function planMicrophonePermissionRequest(request: unknown = {}): Promise<MicrophonePermissionRequestResult> {
  return executeMicrophonePermissionRequest(request);
}
