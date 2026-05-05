export type CameraPermissionReleaseBoundary = "input" | "contract" | "governance" | "scope" | "provider";

export type CameraPermissionReleaseGate = {
  accepted?: boolean;
  allowed?: boolean;
  reason?: string;
};

export type CameraPermissionReleaseContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: CameraPermissionReleaseGate;
  contract?: CameraPermissionReleaseGate;
  governance?: CameraPermissionReleaseGate;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type CameraPermissionReleaseTarget = {
  leaseId: string;
  deviceId?: string;
  reason?: string;
};

export type CameraPermissionReleaseProviderRequest = {
  operation: "computeruse.cameraPermissionRelease.release";
  target: CameraPermissionReleaseTarget;
  context: {
    runtimeId?: string;
    sessionId?: string;
    invocationId?: string;
    auditMetadata?: Readonly<Record<string, unknown>>;
  };
};

export type CameraPermissionReleaseProviderResult = {
  released: boolean;
  metadata?: Readonly<Record<string, unknown>>;
};

export type CameraPermissionReleaseProvider = (
  request: CameraPermissionReleaseProviderRequest,
) => Promise<CameraPermissionReleaseProviderResult> | CameraPermissionReleaseProviderResult;

export type CameraPermissionReleaseInput = {
  target?: unknown;
  context?: unknown;
  leaseId?: unknown;
  permissionToken?: unknown;
  deviceId?: unknown;
  reason?: unknown;
  metadata?: unknown;
  provider?: CameraPermissionReleaseProvider;
};

export type CameraPermissionReleaseErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_CONTEXT"
  | "INVALID_TARGET"
  | "MISSING_RUNTIME_ID"
  | "MISSING_LEASE_ID"
  | "INVALID_LEASE_ID"
  | "INVALID_DEVICE_ID"
  | "INVALID_REASON"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_FAILURE";

export type CameraPermissionReleaseError = {
  code: CameraPermissionReleaseErrorCode;
  message: string;
  boundary: CameraPermissionReleaseBoundary;
  publicSafe: true;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type CameraPermissionReleaseAuditEvent = {
  type: string;
  toolId: "computeruse.cameraPermissionRelease";
  invocationId: string;
  dryRun: boolean;
  leaseId?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type CameraPermissionReleaseOutput = {
  kind: "agentCore.basicTool.computeruse.cameraPermissionRelease";
  target: CameraPermissionReleaseTarget;
  dispatch: "dry-run" | "runtime-computeruse";
  dryRun: boolean;
  providerCalled: boolean;
  executionBlocked: boolean;
  unsafeSideEffects: true;
  permissionsRequired: readonly ["camera:permission-release"];
  requiresTapApproval: true;
  acceptedScopes: readonly string[];
  runtimeEntry: {
    port: "BaseToolExecutorPort.computeruse.releasePermission";
    operation: "computeruse.cameraPermissionRelease.release";
    runtimeOwnsPermissionLease: true;
    runtimeOwnsDevicePolicy: true;
    baseToolOwnsTapStrategy: false;
  };
  permissionEnvelope: {
    resource: "camera";
    releaseRequested: boolean;
    released: boolean;
    metadataOnly: boolean;
    leaseId: string;
  };
  providerMetadata?: Readonly<Record<string, unknown>>;
};

export type CameraPermissionReleaseResult =
  | {
      ok: true;
      toolId: "computeruse.cameraPermissionRelease";
      output: CameraPermissionReleaseOutput;
      audit: readonly CameraPermissionReleaseAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "computeruse.cameraPermissionRelease";
      error: CameraPermissionReleaseError;
      audit: readonly CameraPermissionReleaseAuditEvent[];
      events: readonly string[];
    };

export const cameraPermissionReleaseDescriptor = {
  toolId: "computeruse.cameraPermissionRelease",
  capability: "camera-permission-release",
  route: "agent_executionEngine.basic_toolLayer.baseTools.computeruseBase.cameraAccess",
  defaultDryRun: true,
  tapOwnsApproval: true,
  runtimeEntry: "BaseToolExecutorPort.computeruse.releasePermission",
  permissionsRequired: ["camera:permission-release"],
  unsafeSideEffects: true,
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 && !value.includes("\0") ? value.trim() : undefined;
}

function cleanBoundedString(value: unknown, maxLength: number): string | undefined {
  const cleaned = cleanString(value);
  return cleaned !== undefined && cleaned.length <= maxLength ? cleaned : undefined;
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

function cleanGate(value: unknown): CameraPermissionReleaseGate | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return undefined;
  const gate: CameraPermissionReleaseGate = {};
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
  context: CameraPermissionReleaseContext | undefined,
  leaseId: string | undefined,
  metadata?: Readonly<Record<string, unknown>>,
): CameraPermissionReleaseAuditEvent {
  return {
    type,
    toolId: cameraPermissionReleaseDescriptor.toolId,
    invocationId: context?.invocationId ?? "computeruse.cameraPermissionRelease:dry-run",
    dryRun: context?.dryRun !== false,
    leaseId,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: CameraPermissionReleaseErrorCode,
  message: string,
  boundary: CameraPermissionReleaseBoundary,
  context: CameraPermissionReleaseContext | undefined,
  leaseId?: string,
): CameraPermissionReleaseResult {
  return {
    ok: false,
    toolId: cameraPermissionReleaseDescriptor.toolId,
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("agentCore.basicTool.computeruse.cameraPermissionRelease.rejected", context, leaseId, { code })],
    events: ["basicTool.computeruse.cameraPermissionRelease.rejected"],
  };
}

function normalizeContext(value: unknown): CameraPermissionReleaseContext | CameraPermissionReleaseResult {
  if (value === undefined) return {};
  if (!isRecord(value)) return failure("INVALID_CONTEXT", "computeruse.cameraPermissionRelease context must be an object", "input", undefined);

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
      "computeruse.cameraPermissionRelease context contains malformed guard, governance, or scope fields",
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
  context: CameraPermissionReleaseContext,
): CameraPermissionReleaseTarget | CameraPermissionReleaseResult {
  const targetValue = request.target;
  if (targetValue !== undefined && !isRecord(targetValue)) {
    return failure("INVALID_TARGET", "computeruse.cameraPermissionRelease target must be an object when provided", "input", context);
  }
  const target = isRecord(targetValue) ? targetValue : {};
  const leaseId = cleanBoundedString(target.leaseId ?? target.permissionToken ?? request.leaseId ?? request.permissionToken, 256);
  const deviceId = cleanBoundedString(target.deviceId ?? request.deviceId, 128);
  const reasonValue = target.reason ?? request.reason;
  const reason = reasonValue === undefined ? undefined : cleanBoundedString(reasonValue, 512);

  if (leaseId === undefined) {
    const rawLease = target.leaseId ?? target.permissionToken ?? request.leaseId ?? request.permissionToken;
    return failure(
      rawLease === undefined ? "MISSING_LEASE_ID" : "INVALID_LEASE_ID",
      rawLease === undefined
        ? "computeruse.cameraPermissionRelease requires target.leaseId or target.permissionToken"
        : "computeruse.cameraPermissionRelease leaseId must be a safe bounded string",
      "input",
      context,
    );
  }
  if ((target.deviceId ?? request.deviceId) !== undefined && deviceId === undefined) {
    return failure("INVALID_DEVICE_ID", "computeruse.cameraPermissionRelease deviceId must be a safe bounded string", "input", context, leaseId);
  }
  if (reasonValue !== undefined && reason === undefined) {
    return failure("INVALID_REASON", "computeruse.cameraPermissionRelease reason must be a safe bounded string", "input", context, leaseId);
  }

  return { leaseId, deviceId, reason };
}

function ensureScopes(target: CameraPermissionReleaseTarget, context: CameraPermissionReleaseContext): CameraPermissionReleaseResult | undefined {
  const requested = context.requestedScopes ?? [];
  const allowed = context.allowedScopes ?? [];
  if (requested.length === 0) return undefined;

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length === 0) return undefined;

  return failure(
    "SCOPE_DENIED",
    `computeruse.cameraPermissionRelease scope ${denied[0]} is outside runtime governance`,
    "scope",
    context,
    target.leaseId,
  );
}

function ensureStaticGates(target: CameraPermissionReleaseTarget, context: CameraPermissionReleaseContext): CameraPermissionReleaseResult | undefined {
  if (context.contract?.accepted === false || context.contract?.allowed === false) {
    return failure(
      "CONTRACT_REJECTED",
      context.contract.reason ?? "computeruse.cameraPermissionRelease was rejected by runtime contract surface",
      "contract",
      context,
      target.leaseId,
    );
  }

  if (context.governance?.accepted === false || context.governance?.allowed === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      context.governance.reason ?? "computeruse.cameraPermissionRelease was rejected by runtime governance",
      "governance",
      context,
      target.leaseId,
    );
  }

  return undefined;
}

function ensureRealExecutionGuard(target: CameraPermissionReleaseTarget, context: CameraPermissionReleaseContext): CameraPermissionReleaseResult | undefined {
  if (context.dryRun !== false) return undefined;
  if (context.guard?.accepted === true || context.guard?.allowed === true) return undefined;

  return failure(
    "GOVERNANCE_REJECTED",
    context.guard?.reason ?? "computeruse.cameraPermissionRelease dryRun:false requires an affirmative runtime guard",
    "governance",
    context,
    target.leaseId,
  );
}

function baseOutput(
  target: CameraPermissionReleaseTarget,
  acceptedScopes: readonly string[],
  dryRun: boolean,
  providerCalled: boolean,
): Omit<CameraPermissionReleaseOutput, "permissionEnvelope"> {
  return {
    kind: "agentCore.basicTool.computeruse.cameraPermissionRelease",
    target,
    dispatch: dryRun ? "dry-run" : "runtime-computeruse",
    dryRun,
    providerCalled,
    executionBlocked: dryRun,
    unsafeSideEffects: true,
    permissionsRequired: cameraPermissionReleaseDescriptor.permissionsRequired,
    requiresTapApproval: true,
    acceptedScopes,
    runtimeEntry: {
      port: "BaseToolExecutorPort.computeruse.releasePermission",
      operation: "computeruse.cameraPermissionRelease.release",
      runtimeOwnsPermissionLease: true,
      runtimeOwnsDevicePolicy: true,
      baseToolOwnsTapStrategy: false,
    },
  };
}

function normalizeProviderResult(
  value: unknown,
  context: CameraPermissionReleaseContext,
  target: CameraPermissionReleaseTarget,
): CameraPermissionReleaseProviderResult | CameraPermissionReleaseResult {
  if (!isRecord(value) || typeof value.released !== "boolean") {
    return failure(
      "PROVIDER_FAILURE",
      "computeruse.cameraPermissionRelease runtime provider returned a malformed public-safe release envelope",
      "provider",
      context,
      target.leaseId,
    );
  }

  return {
    released: value.released,
    metadata: cleanAuditMetadata(value.metadata),
  };
}

function normalizeRequest(request: unknown): {
  target: CameraPermissionReleaseTarget;
  context: CameraPermissionReleaseContext;
  metadata?: Readonly<Record<string, unknown>>;
  provider?: CameraPermissionReleaseProvider;
} | CameraPermissionReleaseResult {
  if (request === undefined) request = {};
  if (!isRecord(request)) {
    return failure("INVALID_REQUEST", "computeruse.cameraPermissionRelease request must be an object", "input", undefined);
  }

  const context = normalizeContext(request.context);
  if ("ok" in context) return context;

  const target = normalizeTarget(request, context);
  if ("ok" in target) return target;

  if (context.runtimeId === undefined) {
    return failure("MISSING_RUNTIME_ID", "computeruse.cameraPermissionRelease requires context.runtimeId for audit", "input", context, target.leaseId);
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
    provider: typeof request.provider === "function" ? (request.provider as CameraPermissionReleaseProvider) : undefined,
  };
}

export async function executeCameraPermissionRelease(request: unknown = {}): Promise<CameraPermissionReleaseResult> {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) return normalized;

  const { target, context, metadata, provider } = normalized;
  const acceptedScopes = context.requestedScopes ?? [];
  const dryRun = context.dryRun !== false;

  if (dryRun) {
    return {
      ok: true,
      toolId: cameraPermissionReleaseDescriptor.toolId,
      output: {
        ...baseOutput(target, acceptedScopes, true, false),
        permissionEnvelope: {
          resource: "camera",
          releaseRequested: false,
          released: false,
          metadataOnly: true,
          leaseId: target.leaseId,
        },
      },
      audit: [auditEvent("agentCore.basicTool.computeruse.cameraPermissionRelease.dryRun", context, target.leaseId, metadata)],
      events: ["basicTool.computeruse.cameraPermissionRelease.dryRun"],
    };
  }

  if (provider === undefined) {
    return failure(
      "PROVIDER_UNAVAILABLE",
      "computeruse.cameraPermissionRelease requires runtime executor.computeruse.releasePermission for dryRun:false",
      "provider",
      context,
      target.leaseId,
    );
  }

  let providerResult: CameraPermissionReleaseProviderResult;
  try {
    const result = await provider({
      operation: "computeruse.cameraPermissionRelease.release",
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
      "computeruse.cameraPermissionRelease runtime provider failed without exposing private details",
      "provider",
      context,
      target.leaseId,
    );
  }

  return {
    ok: true,
    toolId: cameraPermissionReleaseDescriptor.toolId,
    output: {
      ...baseOutput(target, acceptedScopes, false, true),
      permissionEnvelope: {
        resource: "camera",
        releaseRequested: true,
        released: providerResult.released,
        metadataOnly: false,
        leaseId: target.leaseId,
      },
      providerMetadata: providerResult.metadata,
    },
    audit: [
      auditEvent("agentCore.basicTool.computeruse.cameraPermissionRelease.released", context, target.leaseId, {
        released: providerResult.released,
        ...(providerResult.metadata ?? {}),
      }),
    ],
    events: ["basicTool.computeruse.cameraPermissionRelease.released"],
  };
}

export function planCameraPermissionRelease(request: unknown = {}): Promise<CameraPermissionReleaseResult> {
  return executeCameraPermissionRelease(request);
}
