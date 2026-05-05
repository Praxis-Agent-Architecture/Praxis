export type MicrophonePermissionReleaseBoundary = "input" | "contract" | "governance" | "scope" | "provider";

export type MicrophonePermissionReleaseGate = {
  accepted?: boolean;
  allowed?: boolean;
  reason?: string;
};

export type MicrophonePermissionReleaseContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: MicrophonePermissionReleaseGate;
  contract?: MicrophonePermissionReleaseGate;
  governance?: MicrophonePermissionReleaseGate;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type MicrophonePermissionReleaseTarget = {
  permissionLeaseId: string;
  targetApplication: string;
  deviceId?: string;
  releaseReason?: string;
};

export type MicrophonePermissionReleaseProviderRequest = {
  operation: "computeruse.microphonePermissionRelease.release";
  target: MicrophonePermissionReleaseTarget;
  context: {
    runtimeId?: string;
    sessionId?: string;
    invocationId?: string;
    auditMetadata?: Readonly<Record<string, unknown>>;
  };
};

export type MicrophonePermissionReleaseProviderResult = {
  released: boolean;
  metadata?: Readonly<Record<string, unknown>>;
};

export type MicrophonePermissionReleaseProvider = (
  request: MicrophonePermissionReleaseProviderRequest,
) => Promise<MicrophonePermissionReleaseProviderResult> | MicrophonePermissionReleaseProviderResult;

export type MicrophonePermissionReleaseRequest = {
  target?: unknown;
  context?: unknown;
  permissionLeaseId?: unknown;
  targetApplication?: unknown;
  deviceId?: unknown;
  releaseReason?: unknown;
  metadata?: unknown;
  provider?: MicrophonePermissionReleaseProvider;
};

export type MicrophonePermissionReleaseErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_CONTEXT"
  | "INVALID_TARGET"
  | "MISSING_RUNTIME_ID"
  | "MISSING_PERMISSION_LEASE"
  | "INVALID_PERMISSION_LEASE"
  | "MISSING_TARGET_APPLICATION"
  | "INVALID_DEVICE_ID"
  | "INVALID_RELEASE_REASON"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_FAILURE";

export type MicrophonePermissionReleaseError = {
  code: MicrophonePermissionReleaseErrorCode;
  message: string;
  boundary: MicrophonePermissionReleaseBoundary;
  publicSafe: true;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type MicrophonePermissionReleaseAuditEvent = {
  type: string;
  toolId: "computeruse.microphonePermissionRelease";
  invocationId: string;
  dryRun: boolean;
  permissionLeaseId?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type MicrophonePermissionReleaseOutput = {
  kind: "agentCore.basicTool.computeruse.microphonePermissionRelease";
  target: MicrophonePermissionReleaseTarget;
  dispatch: "dry-run" | "runtime-computeruse";
  dryRun: boolean;
  providerCalled: boolean;
  executionBlocked: boolean;
  unsafeSideEffects: true;
  permissionsRequired: readonly ["microphone:permission-release"];
  requiresTapApproval: true;
  acceptedScopes: readonly string[];
  runtimeEntry: {
    port: "BaseToolExecutorPort.computeruse.releasePermission";
    operation: "computeruse.microphonePermissionRelease.release";
    runtimeOwnsPermissionPrompt: true;
    runtimeOwnsDeviceLease: true;
    baseToolOwnsTapStrategy: false;
  };
  releaseEnvelope: {
    resource: "microphone";
    requested: boolean;
    released: boolean;
    metadataOnly: boolean;
    leaseId: string;
  };
  providerMetadata?: Readonly<Record<string, unknown>>;
};

export type MicrophonePermissionReleaseResult =
  | {
      ok: true;
      toolId: "computeruse.microphonePermissionRelease";
      output: MicrophonePermissionReleaseOutput;
      audit: readonly MicrophonePermissionReleaseAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "computeruse.microphonePermissionRelease";
      error: MicrophonePermissionReleaseError;
      audit: readonly MicrophonePermissionReleaseAuditEvent[];
      events: readonly string[];
    };

export const microphonePermissionReleaseDescriptor = {
  toolId: "computeruse.microphonePermissionRelease",
  capability: "microphone-permission-release",
  route: "agent_executionEngine.basic_toolLayer.baseTools.computeruseBase.microphoneAccess",
  defaultDryRun: true,
  tapOwnsApproval: true,
  runtimeEntry: "BaseToolExecutorPort.computeruse.releasePermission",
  permissionsRequired: ["microphone:permission-release"],
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

function cleanGate(value: unknown): MicrophonePermissionReleaseGate | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return undefined;
  const gate: MicrophonePermissionReleaseGate = {};
  if (typeof value.accepted === "boolean") gate.accepted = value.accepted;
  if (typeof value.allowed === "boolean") gate.allowed = value.allowed;
  const reason = cleanString(value.reason);
  if (reason !== undefined) gate.reason = reason;
  return gate;
}

function cleanAuditMetadata(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return isRecord(value) ? value : undefined;
}

function auditEvent(
  type: string,
  context: MicrophonePermissionReleaseContext | undefined,
  permissionLeaseId: string | undefined,
  metadata?: Readonly<Record<string, unknown>>,
): MicrophonePermissionReleaseAuditEvent {
  return {
    type,
    toolId: microphonePermissionReleaseDescriptor.toolId,
    invocationId: context?.invocationId ?? "computeruse.microphonePermissionRelease:dry-run",
    dryRun: context?.dryRun !== false,
    permissionLeaseId,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: MicrophonePermissionReleaseErrorCode,
  message: string,
  boundary: MicrophonePermissionReleaseBoundary,
  context: MicrophonePermissionReleaseContext | undefined,
  permissionLeaseId?: string,
): MicrophonePermissionReleaseResult {
  return {
    ok: false,
    toolId: microphonePermissionReleaseDescriptor.toolId,
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("agentCore.basicTool.computeruse.microphonePermissionRelease.rejected", context, permissionLeaseId, { code })],
    events: ["basicTool.computeruse.microphonePermissionRelease.rejected"],
  };
}

function normalizeContext(value: unknown): MicrophonePermissionReleaseContext | MicrophonePermissionReleaseResult {
  if (value === undefined) return {};
  if (!isRecord(value)) return failure("INVALID_CONTEXT", "computeruse.microphonePermissionRelease context must be an object", "input", undefined);

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
      "computeruse.microphonePermissionRelease context contains malformed guard, governance, or scope fields",
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
  context: MicrophonePermissionReleaseContext,
): MicrophonePermissionReleaseTarget | MicrophonePermissionReleaseResult {
  const targetValue = request.target;
  if (targetValue !== undefined && !isRecord(targetValue)) {
    return failure("INVALID_TARGET", "computeruse.microphonePermissionRelease target must be an object when provided", "input", context);
  }
  const target = isRecord(targetValue) ? targetValue : {};
  const permissionLeaseId = cleanString(target.permissionLeaseId ?? request.permissionLeaseId);
  const targetApplication = cleanString(target.targetApplication ?? request.targetApplication);
  const deviceId = cleanString(target.deviceId ?? request.deviceId);
  const releaseReason = cleanString(target.releaseReason ?? request.releaseReason);

  if (permissionLeaseId === undefined) {
    return failure("MISSING_PERMISSION_LEASE", "computeruse.microphonePermissionRelease requires target.permissionLeaseId", "input", context);
  }
  if (permissionLeaseId.length > 512) {
    return failure("INVALID_PERMISSION_LEASE", "computeruse.microphonePermissionRelease permissionLeaseId must be at most 512 characters", "input", context);
  }
  if (targetApplication === undefined) {
    return failure("MISSING_TARGET_APPLICATION", "computeruse.microphonePermissionRelease requires target.targetApplication", "input", context, permissionLeaseId);
  }
  if ((target.deviceId ?? request.deviceId) !== undefined && deviceId === undefined) {
    return failure("INVALID_DEVICE_ID", "computeruse.microphonePermissionRelease deviceId must be a safe string", "input", context, permissionLeaseId);
  }
  if ((target.releaseReason ?? request.releaseReason) !== undefined && releaseReason === undefined) {
    return failure("INVALID_RELEASE_REASON", "computeruse.microphonePermissionRelease releaseReason must be a safe string", "input", context, permissionLeaseId);
  }

  return {
    permissionLeaseId,
    targetApplication,
    deviceId,
    releaseReason,
  };
}

function ensureScopes(
  target: MicrophonePermissionReleaseTarget,
  context: MicrophonePermissionReleaseContext,
): MicrophonePermissionReleaseResult | undefined {
  const requested = context.requestedScopes ?? [];
  const allowed = context.allowedScopes ?? [];
  if (requested.length === 0) return undefined;

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length === 0) return undefined;

  return failure(
    "SCOPE_DENIED",
    `computeruse.microphonePermissionRelease scope ${denied[0]} is outside runtime governance`,
    "scope",
    context,
    target.permissionLeaseId,
  );
}

function ensureStaticGates(
  target: MicrophonePermissionReleaseTarget,
  context: MicrophonePermissionReleaseContext,
): MicrophonePermissionReleaseResult | undefined {
  if (context.contract?.accepted === false || context.contract?.allowed === false) {
    return failure(
      "CONTRACT_REJECTED",
      context.contract.reason ?? "computeruse.microphonePermissionRelease was rejected by runtime contract surface",
      "contract",
      context,
      target.permissionLeaseId,
    );
  }

  if (context.governance?.accepted === false || context.governance?.allowed === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      context.governance.reason ?? "computeruse.microphonePermissionRelease was rejected by runtime governance",
      "governance",
      context,
      target.permissionLeaseId,
    );
  }

  return undefined;
}

function ensureRealExecutionGuard(
  target: MicrophonePermissionReleaseTarget,
  context: MicrophonePermissionReleaseContext,
): MicrophonePermissionReleaseResult | undefined {
  if (context.dryRun !== false) return undefined;
  if (context.guard?.accepted === true || context.guard?.allowed === true) return undefined;

  return failure(
    "GOVERNANCE_REJECTED",
    context.guard?.reason ?? "computeruse.microphonePermissionRelease dryRun:false requires an affirmative runtime guard",
    "governance",
    context,
    target.permissionLeaseId,
  );
}

function baseOutput(
  target: MicrophonePermissionReleaseTarget,
  acceptedScopes: readonly string[],
  dryRun: boolean,
  providerCalled: boolean,
): Omit<MicrophonePermissionReleaseOutput, "releaseEnvelope"> {
  return {
    kind: "agentCore.basicTool.computeruse.microphonePermissionRelease",
    target,
    dispatch: dryRun ? "dry-run" : "runtime-computeruse",
    dryRun,
    providerCalled,
    executionBlocked: dryRun,
    unsafeSideEffects: true,
    permissionsRequired: microphonePermissionReleaseDescriptor.permissionsRequired,
    requiresTapApproval: true,
    acceptedScopes,
    runtimeEntry: {
      port: "BaseToolExecutorPort.computeruse.releasePermission",
      operation: "computeruse.microphonePermissionRelease.release",
      runtimeOwnsPermissionPrompt: true,
      runtimeOwnsDeviceLease: true,
      baseToolOwnsTapStrategy: false,
    },
  };
}

function normalizeProviderResult(
  value: unknown,
  context: MicrophonePermissionReleaseContext,
  target: MicrophonePermissionReleaseTarget,
): MicrophonePermissionReleaseProviderResult | MicrophonePermissionReleaseResult {
  if (!isRecord(value) || typeof value.released !== "boolean") {
    return failure(
      "PROVIDER_FAILURE",
      "computeruse.microphonePermissionRelease runtime provider returned a malformed public-safe release envelope",
      "provider",
      context,
      target.permissionLeaseId,
    );
  }

  return {
    released: value.released,
    metadata: cleanAuditMetadata(value.metadata),
  };
}

function normalizeRequest(request: unknown): {
  target: MicrophonePermissionReleaseTarget;
  context: MicrophonePermissionReleaseContext;
  metadata?: Readonly<Record<string, unknown>>;
  provider?: MicrophonePermissionReleaseProvider;
} | MicrophonePermissionReleaseResult {
  if (request === undefined) request = {};
  if (!isRecord(request)) {
    return failure("INVALID_REQUEST", "computeruse.microphonePermissionRelease request must be an object", "input", undefined);
  }

  const context = normalizeContext(request.context);
  if ("ok" in context) return context;

  const target = normalizeTarget(request, context);
  if ("ok" in target) return target;

  if (context.runtimeId === undefined) {
    return failure("MISSING_RUNTIME_ID", "computeruse.microphonePermissionRelease requires context.runtimeId for audit", "input", context, target.permissionLeaseId);
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
    provider: typeof request.provider === "function" ? (request.provider as MicrophonePermissionReleaseProvider) : undefined,
  };
}

export async function executeMicrophonePermissionRelease(request: unknown = {}): Promise<MicrophonePermissionReleaseResult> {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) return normalized;

  const { target, context, metadata, provider } = normalized;
  const acceptedScopes = context.requestedScopes ?? [];
  const dryRun = context.dryRun !== false;

  if (dryRun) {
    return {
      ok: true,
      toolId: microphonePermissionReleaseDescriptor.toolId,
      output: {
        ...baseOutput(target, acceptedScopes, true, false),
        releaseEnvelope: {
          resource: "microphone",
          requested: false,
          released: false,
          metadataOnly: true,
          leaseId: target.permissionLeaseId,
        },
      },
      audit: [auditEvent("agentCore.basicTool.computeruse.microphonePermissionRelease.dryRun", context, target.permissionLeaseId, metadata)],
      events: ["basicTool.computeruse.microphonePermissionRelease.dryRun"],
    };
  }

  if (provider === undefined) {
    return failure(
      "PROVIDER_UNAVAILABLE",
      "computeruse.microphonePermissionRelease requires runtime executor.computeruse.releasePermission for dryRun:false",
      "provider",
      context,
      target.permissionLeaseId,
    );
  }

  let providerResult: MicrophonePermissionReleaseProviderResult;
  try {
    const result = await provider({
      operation: "computeruse.microphonePermissionRelease.release",
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
      "computeruse.microphonePermissionRelease runtime provider failed without exposing private details",
      "provider",
      context,
      target.permissionLeaseId,
    );
  }

  return {
    ok: true,
    toolId: microphonePermissionReleaseDescriptor.toolId,
    output: {
      ...baseOutput(target, acceptedScopes, false, true),
      releaseEnvelope: {
        resource: "microphone",
        requested: true,
        released: providerResult.released,
        metadataOnly: false,
        leaseId: target.permissionLeaseId,
      },
      providerMetadata: providerResult.metadata,
    },
    audit: [
      auditEvent("agentCore.basicTool.computeruse.microphonePermissionRelease.released", context, target.permissionLeaseId, {
        released: providerResult.released,
        ...(providerResult.metadata ?? {}),
      }),
    ],
    events: ["basicTool.computeruse.microphonePermissionRelease.released"],
  };
}

export function planMicrophonePermissionRelease(request: unknown = {}): Promise<MicrophonePermissionReleaseResult> {
  return executeMicrophonePermissionRelease(request);
}
