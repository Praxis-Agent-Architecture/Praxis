export type WindowScreenRecordingBoundary = "input" | "contract" | "governance" | "scope" | "resource" | "provider";

export type WindowScreenRecordingGate = {
  accepted?: boolean;
  allowed?: boolean;
  reason?: string;
};

export type WindowScreenRecordingContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: WindowScreenRecordingGate;
  contract?: WindowScreenRecordingGate;
  governance?: WindowScreenRecordingGate;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type WindowScreenRecordingOutputFormat = "video/webm" | "video/mp4" | "video/quicktime";

export type WindowScreenRecordingTarget = {
  windowId?: string;
  titleHint?: string;
  maxDurationMs: number;
  frameRate: number;
  includeCursor: boolean;
  outputFormat: WindowScreenRecordingOutputFormat;
  destinationHint?: string;
};

export type WindowScreenRecordingProviderRequest = {
  operation: "computeruse.windowScreenRecording.start";
  target: WindowScreenRecordingTarget;
  context: {
    runtimeId?: string;
    sessionId?: string;
    invocationId?: string;
    auditMetadata?: Readonly<Record<string, unknown>>;
  };
  purpose: string;
};

export type WindowScreenRecordingProviderResult = {
  recordingId: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type WindowScreenRecordingProvider = (
  request: WindowScreenRecordingProviderRequest,
) => Promise<WindowScreenRecordingProviderResult> | WindowScreenRecordingProviderResult;

export type WindowScreenRecordingRequest = {
  target?: unknown;
  context?: unknown;
  windowId?: unknown;
  titleHint?: unknown;
  maxDurationMs?: unknown;
  frameRate?: unknown;
  includeCursor?: unknown;
  outputFormat?: unknown;
  destinationHint?: unknown;
  purpose?: unknown;
  metadata?: unknown;
  provider?: WindowScreenRecordingProvider;
};

export type WindowScreenRecordingErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_TARGET"
  | "INVALID_CONTEXT"
  | "MISSING_RUNTIME_ID"
  | "MISSING_PURPOSE"
  | "MISSING_WINDOW_TARGET"
  | "INVALID_WINDOW_TARGET"
  | "INVALID_MAX_DURATION"
  | "INVALID_FRAME_RATE"
  | "INVALID_INCLUDE_CURSOR"
  | "INVALID_OUTPUT_FORMAT"
  | "INVALID_DESTINATION_HINT"
  | "SCOPE_DENIED"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_FAILURE";

export type WindowScreenRecordingError = {
  code: WindowScreenRecordingErrorCode;
  message: string;
  boundary: WindowScreenRecordingBoundary;
  publicSafe: true;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type WindowScreenRecordingAuditEvent = {
  type: string;
  toolId: "computeruse.windowScreenRecording";
  invocationId: string;
  dryRun: boolean;
  windowId?: string;
  titleHint?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type WindowScreenRecordingOutput = {
  kind: "agentCore.basicTool.computeruse.windowScreenRecording";
  target: WindowScreenRecordingTarget;
  purpose: string;
  dispatch: "dry-run" | "runtime-computeruse";
  dryRun: boolean;
  providerCalled: boolean;
  executionBlocked: boolean;
  unsafeSideEffects: true;
  permissionsRequired: readonly ("screen:record" | "display:capture" | "window:inspect" | "recording:session")[];
  requiresTapApproval: true;
  acceptedScopes: readonly string[];
  runtimeEntry: {
    port: "BaseToolExecutorPort.computeruse.startRecording";
    operation: "computeruse.windowScreenRecording.start";
    runtimeOwnsScreenAccess: true;
    runtimeOwnsWindowSelection: true;
    runtimeOwnsRecordingSession: true;
    runtimeOwnsArtifactStorage: true;
    baseToolOwnsTapStrategy: false;
  };
  recordingEnvelope: {
    resource: "screen";
    target: "window";
    started: boolean;
    metadataOnly: boolean;
    recordingId?: string;
  };
  providerMetadata?: Readonly<Record<string, unknown>>;
};

export type WindowScreenRecordingResult =
  | {
      ok: true;
      toolId: "computeruse.windowScreenRecording";
      output: WindowScreenRecordingOutput;
      audit: readonly WindowScreenRecordingAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "computeruse.windowScreenRecording";
      error: WindowScreenRecordingError;
      audit: readonly WindowScreenRecordingAuditEvent[];
      events: readonly string[];
    };

export const windowScreenRecordingDescriptor = {
  toolId: "computeruse.windowScreenRecording",
  capability: "start-window-screen-recording",
  route: "agent_executionEngine.basic_toolLayer.baseTools.computeruseBase.screenRecording",
  defaultDryRun: true,
  defaultMaxDurationMs: 60_000,
  maxDurationMs: 3_600_000,
  defaultFrameRate: 15,
  maxFrameRate: 60,
  defaultOutputFormat: "video/webm",
  allowedDestinationSchemes: ["artifact://", "session://", "runtime://", "memory://"],
  tapOwnsApproval: true,
  runtimeEntry: "BaseToolExecutorPort.computeruse.startRecording",
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

function cleanGate(value: unknown): WindowScreenRecordingGate | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return undefined;
  const gate: WindowScreenRecordingGate = {};
  if (typeof value.accepted === "boolean") gate.accepted = value.accepted;
  if (typeof value.allowed === "boolean") gate.allowed = value.allowed;
  const reason = cleanString(value.reason);
  if (reason !== undefined) gate.reason = reason;
  return gate;
}

function cleanAuditMetadata(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return isRecord(value) ? value : undefined;
}

function cleanBoolean(value: unknown, defaultValue: boolean): boolean | undefined {
  if (value === undefined) return defaultValue;
  return typeof value === "boolean" ? value : undefined;
}

function cleanPositiveInteger(value: unknown, defaultValue: number, maxValue: number): number | undefined {
  if (value === undefined) return defaultValue;
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= maxValue ? value : undefined;
}

function cleanOutputFormat(value: unknown): WindowScreenRecordingOutputFormat | undefined {
  if (value === undefined) return windowScreenRecordingDescriptor.defaultOutputFormat;
  return value === "video/webm" || value === "video/mp4" || value === "video/quicktime" ? value : undefined;
}

function hasAllowedDestinationScheme(value: string): boolean {
  return windowScreenRecordingDescriptor.allowedDestinationSchemes.some((scheme) => value.startsWith(scheme));
}

function auditEvent(
  type: string,
  context: WindowScreenRecordingContext | undefined,
  target: Pick<WindowScreenRecordingTarget, "windowId" | "titleHint"> | undefined,
  metadata?: Readonly<Record<string, unknown>>,
): WindowScreenRecordingAuditEvent {
  return {
    type,
    toolId: windowScreenRecordingDescriptor.toolId,
    invocationId: context?.invocationId ?? "computeruse.windowScreenRecording:dry-run",
    dryRun: context?.dryRun !== false,
    windowId: target?.windowId,
    titleHint: target?.titleHint,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: WindowScreenRecordingErrorCode,
  message: string,
  boundary: WindowScreenRecordingBoundary,
  context: WindowScreenRecordingContext | undefined,
  target?: Pick<WindowScreenRecordingTarget, "windowId" | "titleHint">,
): WindowScreenRecordingResult {
  return {
    ok: false,
    toolId: windowScreenRecordingDescriptor.toolId,
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("agentCore.basicTool.computeruse.windowScreenRecording.rejected", context, target, { code })],
    events: ["basicTool.computeruse.windowScreenRecording.rejected"],
  };
}

function normalizeContext(value: unknown): WindowScreenRecordingContext | WindowScreenRecordingResult {
  if (value === undefined) return {};
  if (!isRecord(value)) return failure("INVALID_CONTEXT", "computeruse.windowScreenRecording context must be an object", "input", undefined);

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
      "computeruse.windowScreenRecording context contains malformed guard, governance, or scope fields",
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
  context: WindowScreenRecordingContext,
): WindowScreenRecordingTarget | WindowScreenRecordingResult {
  const targetValue = request.target;
  if (targetValue !== undefined && !isRecord(targetValue)) {
    return failure("INVALID_TARGET", "computeruse.windowScreenRecording target must be an object when provided", "input", context);
  }
  const target = isRecord(targetValue) ? targetValue : {};
  const windowId = cleanString(target.windowId ?? request.windowId);
  const titleHint = cleanString(target.titleHint ?? request.titleHint);
  const maxDurationMs = cleanPositiveInteger(
    target.maxDurationMs ?? request.maxDurationMs,
    windowScreenRecordingDescriptor.defaultMaxDurationMs,
    windowScreenRecordingDescriptor.maxDurationMs,
  );
  const frameRate = cleanPositiveInteger(
    target.frameRate ?? request.frameRate,
    windowScreenRecordingDescriptor.defaultFrameRate,
    windowScreenRecordingDescriptor.maxFrameRate,
  );
  const includeCursor = cleanBoolean(target.includeCursor ?? request.includeCursor, true);
  const outputFormat = cleanOutputFormat(target.outputFormat ?? request.outputFormat);
  const destinationHintValue = target.destinationHint ?? request.destinationHint;
  const destinationHint = cleanString(destinationHintValue);

  if (windowId === undefined && titleHint === undefined) {
    return failure("MISSING_WINDOW_TARGET", "computeruse.windowScreenRecording requires target.windowId or target.titleHint", "input", context);
  }
  if ((target.windowId ?? request.windowId) !== undefined && windowId === undefined) {
    return failure("INVALID_WINDOW_TARGET", "computeruse.windowScreenRecording windowId must be a safe string", "input", context);
  }
  if ((target.titleHint ?? request.titleHint) !== undefined && titleHint === undefined) {
    return failure("INVALID_WINDOW_TARGET", "computeruse.windowScreenRecording titleHint must be a safe string", "input", context);
  }
  if (maxDurationMs === undefined) {
    return failure(
      "INVALID_MAX_DURATION",
      "computeruse.windowScreenRecording maxDurationMs must be an integer from 1 to 3600000",
      "resource",
      context,
      { windowId, titleHint },
    );
  }
  if (frameRate === undefined) {
    return failure(
      "INVALID_FRAME_RATE",
      "computeruse.windowScreenRecording frameRate must be an integer from 1 to 60",
      "resource",
      context,
      { windowId, titleHint },
    );
  }
  if (includeCursor === undefined) {
    return failure("INVALID_INCLUDE_CURSOR", "computeruse.windowScreenRecording includeCursor must be boolean", "input", context, { windowId, titleHint });
  }
  if (outputFormat === undefined) {
    return failure("INVALID_OUTPUT_FORMAT", "computeruse.windowScreenRecording outputFormat must be video/webm, video/mp4, or video/quicktime", "input", context, { windowId, titleHint });
  }
  if (destinationHintValue !== undefined && (destinationHint === undefined || destinationHint.length > 1024 || !hasAllowedDestinationScheme(destinationHint))) {
    return failure(
      "INVALID_DESTINATION_HINT",
      "computeruse.windowScreenRecording destinationHint must use artifact://, session://, runtime://, or memory://",
      "input",
      context,
      { windowId, titleHint },
    );
  }

  return { windowId, titleHint, maxDurationMs, frameRate, includeCursor, outputFormat, destinationHint };
}

function ensureScopes(target: WindowScreenRecordingTarget, context: WindowScreenRecordingContext): WindowScreenRecordingResult | undefined {
  const requested = context.requestedScopes ?? [];
  const allowed = context.allowedScopes ?? [];
  if (requested.length === 0) return undefined;

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length === 0) return undefined;

  return failure(
    "SCOPE_DENIED",
    `computeruse.windowScreenRecording scope ${denied[0]} is outside runtime governance`,
    "scope",
    context,
    target,
  );
}

function ensureStaticGates(target: WindowScreenRecordingTarget, context: WindowScreenRecordingContext): WindowScreenRecordingResult | undefined {
  if (context.contract?.accepted === false || context.contract?.allowed === false) {
    return failure(
      "CONTRACT_REJECTED",
      context.contract.reason ?? "computeruse.windowScreenRecording was rejected by runtime contract surface",
      "contract",
      context,
      target,
    );
  }

  if (context.governance?.accepted === false || context.governance?.allowed === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      context.governance.reason ?? "computeruse.windowScreenRecording was rejected by runtime governance",
      "governance",
      context,
      target,
    );
  }

  return undefined;
}

function ensureRealExecutionGuard(target: WindowScreenRecordingTarget, context: WindowScreenRecordingContext): WindowScreenRecordingResult | undefined {
  if (context.dryRun !== false) return undefined;
  if (context.guard?.accepted === true || context.guard?.allowed === true) return undefined;

  return failure(
    "GOVERNANCE_REJECTED",
    context.guard?.reason ?? "computeruse.windowScreenRecording dryRun:false requires an affirmative runtime guard",
    "governance",
    context,
    target,
  );
}

function baseOutput(
  target: WindowScreenRecordingTarget,
  purpose: string,
  acceptedScopes: readonly string[],
  dryRun: boolean,
  providerCalled: boolean,
): Omit<WindowScreenRecordingOutput, "recordingEnvelope"> {
  return {
    kind: "agentCore.basicTool.computeruse.windowScreenRecording",
    target,
    purpose,
    dispatch: dryRun ? "dry-run" : "runtime-computeruse",
    dryRun,
    providerCalled,
    executionBlocked: dryRun,
    unsafeSideEffects: true,
    permissionsRequired: ["screen:record", "display:capture", "window:inspect", "recording:session"],
    requiresTapApproval: true,
    acceptedScopes,
    runtimeEntry: {
      port: "BaseToolExecutorPort.computeruse.startRecording",
      operation: "computeruse.windowScreenRecording.start",
      runtimeOwnsScreenAccess: true,
      runtimeOwnsWindowSelection: true,
      runtimeOwnsRecordingSession: true,
      runtimeOwnsArtifactStorage: true,
      baseToolOwnsTapStrategy: false,
    },
  };
}

function normalizeProviderResult(
  value: unknown,
  context: WindowScreenRecordingContext,
  target: WindowScreenRecordingTarget,
): WindowScreenRecordingProviderResult | WindowScreenRecordingResult {
  if (!isRecord(value) || cleanString(value.recordingId) === undefined) {
    return failure(
      "PROVIDER_FAILURE",
      "computeruse.windowScreenRecording runtime provider returned a malformed public-safe recording envelope",
      "provider",
      context,
      target,
    );
  }

  return {
    recordingId: cleanString(value.recordingId) ?? "",
    metadata: cleanAuditMetadata(value.metadata),
  };
}

function normalizeRequest(request: unknown): {
  target: WindowScreenRecordingTarget;
  context: WindowScreenRecordingContext;
  purpose: string;
  metadata?: Readonly<Record<string, unknown>>;
  provider?: WindowScreenRecordingProvider;
} | WindowScreenRecordingResult {
  if (request === undefined) request = {};
  if (!isRecord(request)) return failure("INVALID_REQUEST", "computeruse.windowScreenRecording request must be an object", "input", undefined);

  const context = normalizeContext(request.context);
  if ("ok" in context) return context;

  const target = normalizeTarget(request, context);
  if ("ok" in target) return target;

  const purpose = cleanString(request.purpose);
  if (purpose === undefined) {
    return failure("MISSING_PURPOSE", "computeruse.windowScreenRecording requires an explicit purpose", "input", context, target);
  }

  if (context.runtimeId === undefined) {
    return failure("MISSING_RUNTIME_ID", "computeruse.windowScreenRecording requires context.runtimeId for audit", "input", context, target);
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
    provider: typeof request.provider === "function" ? (request.provider as WindowScreenRecordingProvider) : undefined,
  };
}

export async function executeWindowScreenRecording(request: unknown = {}): Promise<WindowScreenRecordingResult> {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) return normalized;

  const { target, context, purpose, metadata, provider } = normalized;
  const acceptedScopes = context.requestedScopes ?? [];
  const dryRun = context.dryRun !== false;

  if (dryRun) {
    return {
      ok: true,
      toolId: windowScreenRecordingDescriptor.toolId,
      output: {
        ...baseOutput(target, purpose, acceptedScopes, true, false),
        recordingEnvelope: {
          resource: "screen",
          target: "window",
          started: false,
          metadataOnly: true,
        },
      },
      audit: [auditEvent("agentCore.basicTool.computeruse.windowScreenRecording.dryRun", context, target, metadata)],
      events: ["basicTool.computeruse.windowScreenRecording.dryRun"],
    };
  }

  if (provider === undefined) {
    return failure(
      "PROVIDER_UNAVAILABLE",
      "computeruse.windowScreenRecording requires runtime executor.computeruse.startRecording for dryRun:false",
      "provider",
      context,
      target,
    );
  }

  let providerResult: WindowScreenRecordingProviderResult;
  try {
    const result = await provider({
      operation: "computeruse.windowScreenRecording.start",
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
      "computeruse.windowScreenRecording runtime provider failed without exposing private details",
      "provider",
      context,
      target,
    );
  }

  return {
    ok: true,
    toolId: windowScreenRecordingDescriptor.toolId,
    output: {
      ...baseOutput(target, purpose, acceptedScopes, false, true),
      recordingEnvelope: {
        resource: "screen",
        target: "window",
        started: true,
        metadataOnly: false,
        recordingId: providerResult.recordingId,
      },
      providerMetadata: providerResult.metadata,
    },
    audit: [
      auditEvent("agentCore.basicTool.computeruse.windowScreenRecording.started", context, target, {
        recordingId: providerResult.recordingId,
        ...(providerResult.metadata ?? {}),
      }),
    ],
    events: ["basicTool.computeruse.windowScreenRecording.started"],
  };
}

export function planWindowScreenRecording(request: unknown = {}): Promise<WindowScreenRecordingResult> {
  return executeWindowScreenRecording(request);
}
