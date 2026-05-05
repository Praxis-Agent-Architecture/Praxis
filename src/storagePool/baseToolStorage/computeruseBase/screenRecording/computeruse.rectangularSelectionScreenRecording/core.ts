export type RectangularSelectionScreenRecordingBoundary =
  | "input"
  | "contract"
  | "governance"
  | "scope"
  | "resource"
  | "provider";

export type RectangularSelectionScreenRecordingGate = {
  accepted?: boolean;
  allowed?: boolean;
  reason?: string;
};

export type RectangularSelectionScreenRecordingContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: RectangularSelectionScreenRecordingGate;
  contract?: RectangularSelectionScreenRecordingGate;
  governance?: RectangularSelectionScreenRecordingGate;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type RectangularSelectionScreenRecordingCoordinateSpace = "screen" | "window" | "normalized";

export type RectangularSelectionScreenRecordingRect = {
  x: number;
  y: number;
  width: number;
  height: number;
  coordinateSpace: RectangularSelectionScreenRecordingCoordinateSpace;
};

export type RectangularSelectionScreenRecordingOutputFormat = "video/webm" | "video/mp4" | "video/quicktime";

export type RectangularSelectionScreenRecordingTarget = {
  displayId: string;
  rect: RectangularSelectionScreenRecordingRect;
  maxDurationMs: number;
  frameRate: number;
  includeCursor: boolean;
  includeAudio: boolean;
  outputFormat: RectangularSelectionScreenRecordingOutputFormat;
  destinationHint?: string;
};

export type RectangularSelectionScreenRecordingProviderRequest = {
  operation: "computeruse.rectangularSelectionScreenRecording.start";
  target: RectangularSelectionScreenRecordingTarget;
  context: {
    runtimeId?: string;
    sessionId?: string;
    invocationId?: string;
    auditMetadata?: Readonly<Record<string, unknown>>;
  };
  purpose: string;
};

export type RectangularSelectionScreenRecordingProviderResult = {
  recordingId: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type RectangularSelectionScreenRecordingProvider = (
  request: RectangularSelectionScreenRecordingProviderRequest,
) => Promise<RectangularSelectionScreenRecordingProviderResult> | RectangularSelectionScreenRecordingProviderResult;

export type RectangularSelectionScreenRecordingRequest = {
  target?: unknown;
  context?: unknown;
  displayId?: unknown;
  rect?: unknown;
  region?: unknown;
  coordinateSpace?: unknown;
  maxDurationMs?: unknown;
  frameRate?: unknown;
  includeCursor?: unknown;
  includeAudio?: unknown;
  outputFormat?: unknown;
  destinationHint?: unknown;
  purpose?: unknown;
  metadata?: unknown;
  provider?: RectangularSelectionScreenRecordingProvider;
};

export type RectangularSelectionScreenRecordingErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_TARGET"
  | "INVALID_CONTEXT"
  | "MISSING_RUNTIME_ID"
  | "MISSING_PURPOSE"
  | "MISSING_RECT"
  | "INVALID_DISPLAY_ID"
  | "INVALID_RECT"
  | "RECT_TOO_LARGE"
  | "INVALID_COORDINATE_SPACE"
  | "INVALID_MAX_DURATION"
  | "INVALID_FRAME_RATE"
  | "INVALID_INCLUDE_CURSOR"
  | "INVALID_INCLUDE_AUDIO"
  | "INVALID_OUTPUT_FORMAT"
  | "INVALID_DESTINATION_HINT"
  | "SCOPE_DENIED"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_FAILURE";

export type RectangularSelectionScreenRecordingError = {
  code: RectangularSelectionScreenRecordingErrorCode;
  message: string;
  boundary: RectangularSelectionScreenRecordingBoundary;
  publicSafe: true;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type RectangularSelectionScreenRecordingAuditEvent = {
  type: string;
  toolId: "computeruse.rectangularSelectionScreenRecording";
  invocationId: string;
  dryRun: boolean;
  displayId?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type RectangularSelectionScreenRecordingOutput = {
  kind: "agentCore.basicTool.computeruse.rectangularSelectionScreenRecording";
  target: RectangularSelectionScreenRecordingTarget;
  purpose: string;
  dispatch: "dry-run" | "runtime-computeruse";
  dryRun: boolean;
  providerCalled: boolean;
  executionBlocked: boolean;
  unsafeSideEffects: true;
  permissionsRequired: readonly (
    | "screen:record"
    | "display:capture"
    | "ui:selection"
    | "recording:session"
    | "microphone:record"
  )[];
  requiresTapApproval: true;
  acceptedScopes: readonly string[];
  runtimeEntry: {
    port: "BaseToolExecutorPort.computeruse.startRecording";
    operation: "computeruse.rectangularSelectionScreenRecording.start";
    runtimeOwnsScreenAccess: true;
    runtimeOwnsRegionSelection: true;
    runtimeOwnsRecordingSession: true;
    runtimeOwnsArtifactStorage: true;
    baseToolOwnsTapStrategy: false;
  };
  recordingEnvelope: {
    resource: "screen";
    target: "region";
    started: boolean;
    metadataOnly: boolean;
    recordingId?: string;
  };
  providerMetadata?: Readonly<Record<string, unknown>>;
};

export type RectangularSelectionScreenRecordingResult =
  | {
      ok: true;
      toolId: "computeruse.rectangularSelectionScreenRecording";
      output: RectangularSelectionScreenRecordingOutput;
      audit: readonly RectangularSelectionScreenRecordingAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "computeruse.rectangularSelectionScreenRecording";
      error: RectangularSelectionScreenRecordingError;
      audit: readonly RectangularSelectionScreenRecordingAuditEvent[];
      events: readonly string[];
    };

export const rectangularSelectionScreenRecordingDescriptor = {
  toolId: "computeruse.rectangularSelectionScreenRecording",
  capability: "start-rectangular-selection-screen-recording",
  route: "agent_executionEngine.basic_toolLayer.baseTools.computeruseBase.screenRecording",
  defaultDryRun: true,
  defaultDisplayId: "primary-display",
  defaultCoordinateSpace: "screen",
  defaultMaxDurationMs: 60_000,
  maxDurationMs: 3_600_000,
  defaultFrameRate: 15,
  maxFrameRate: 60,
  maxAreaPx: 100_000_000,
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

function cleanGate(value: unknown): RectangularSelectionScreenRecordingGate | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return undefined;
  const gate: RectangularSelectionScreenRecordingGate = {};
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

function cleanFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function cleanCoordinateSpace(value: unknown): RectangularSelectionScreenRecordingCoordinateSpace | undefined {
  if (value === undefined) return rectangularSelectionScreenRecordingDescriptor.defaultCoordinateSpace;
  return value === "screen" || value === "window" || value === "normalized" ? value : undefined;
}

function cleanOutputFormat(value: unknown): RectangularSelectionScreenRecordingOutputFormat | undefined {
  if (value === undefined) return rectangularSelectionScreenRecordingDescriptor.defaultOutputFormat;
  return value === "video/webm" || value === "video/mp4" || value === "video/quicktime" ? value : undefined;
}

function hasAllowedDestinationScheme(value: string): boolean {
  return rectangularSelectionScreenRecordingDescriptor.allowedDestinationSchemes.some((scheme) => value.startsWith(scheme));
}

function auditEvent(
  type: string,
  context: RectangularSelectionScreenRecordingContext | undefined,
  displayId: string | undefined,
  metadata?: Readonly<Record<string, unknown>>,
): RectangularSelectionScreenRecordingAuditEvent {
  return {
    type,
    toolId: rectangularSelectionScreenRecordingDescriptor.toolId,
    invocationId: context?.invocationId ?? "computeruse.rectangularSelectionScreenRecording:dry-run",
    dryRun: context?.dryRun !== false,
    displayId,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: RectangularSelectionScreenRecordingErrorCode,
  message: string,
  boundary: RectangularSelectionScreenRecordingBoundary,
  context: RectangularSelectionScreenRecordingContext | undefined,
  displayId?: string,
): RectangularSelectionScreenRecordingResult {
  return {
    ok: false,
    toolId: rectangularSelectionScreenRecordingDescriptor.toolId,
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("agentCore.basicTool.computeruse.rectangularSelectionScreenRecording.rejected", context, displayId, { code })],
    events: ["basicTool.computeruse.rectangularSelectionScreenRecording.rejected"],
  };
}

function normalizeContext(value: unknown): RectangularSelectionScreenRecordingContext | RectangularSelectionScreenRecordingResult {
  if (value === undefined) return {};
  if (!isRecord(value)) {
    return failure("INVALID_CONTEXT", "computeruse.rectangularSelectionScreenRecording context must be an object", "input", undefined);
  }

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
      "computeruse.rectangularSelectionScreenRecording context contains malformed guard, governance, or scope fields",
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

function normalizeRect(
  value: unknown,
  coordinateSpace: RectangularSelectionScreenRecordingCoordinateSpace | undefined,
  context: RectangularSelectionScreenRecordingContext,
  displayId: string,
): RectangularSelectionScreenRecordingRect | RectangularSelectionScreenRecordingResult {
  if (value === undefined) {
    return failure("MISSING_RECT", "computeruse.rectangularSelectionScreenRecording requires target.rect or target.region", "input", context, displayId);
  }
  if (!isRecord(value)) {
    return failure(
      "INVALID_RECT",
      "computeruse.rectangularSelectionScreenRecording rect must be an object with x, y, width, and height",
      "input",
      context,
      displayId,
    );
  }

  const x = cleanFiniteNumber(value.x);
  const y = cleanFiniteNumber(value.y);
  const width = cleanFiniteNumber(value.width);
  const height = cleanFiniteNumber(value.height);
  const rectCoordinateSpace = cleanCoordinateSpace(value.coordinateSpace ?? coordinateSpace);
  if (x === undefined || y === undefined || width === undefined || height === undefined) {
    return failure("INVALID_RECT", "computeruse.rectangularSelectionScreenRecording rect coordinates must be finite numbers", "input", context, displayId);
  }
  if (rectCoordinateSpace === undefined) {
    return failure(
      "INVALID_COORDINATE_SPACE",
      "computeruse.rectangularSelectionScreenRecording coordinateSpace must be screen, window, or normalized",
      "input",
      context,
      displayId,
    );
  }

  const rect: RectangularSelectionScreenRecordingRect = {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
    coordinateSpace: rectCoordinateSpace,
  };

  if (rect.x < 0 || rect.y < 0 || rect.width <= 0 || rect.height <= 0) {
    return failure("INVALID_RECT", "computeruse.rectangularSelectionScreenRecording rect must use positive coordinates", "input", context, displayId);
  }
  if (rect.width * rect.height > rectangularSelectionScreenRecordingDescriptor.maxAreaPx) {
    return failure("RECT_TOO_LARGE", "computeruse.rectangularSelectionScreenRecording rect exceeds the resource limit", "resource", context, displayId);
  }

  return rect;
}

function normalizeTarget(
  request: Record<string, unknown>,
  context: RectangularSelectionScreenRecordingContext,
): RectangularSelectionScreenRecordingTarget | RectangularSelectionScreenRecordingResult {
  const targetValue = request.target;
  if (targetValue !== undefined && !isRecord(targetValue)) {
    return failure("INVALID_TARGET", "computeruse.rectangularSelectionScreenRecording target must be an object when provided", "input", context);
  }

  const target = isRecord(targetValue) ? targetValue : {};
  const displayIdValue = target.displayId ?? request.displayId;
  const displayId = cleanString(displayIdValue) ?? rectangularSelectionScreenRecordingDescriptor.defaultDisplayId;
  if (displayIdValue !== undefined && cleanString(displayIdValue) === undefined) {
    return failure("INVALID_DISPLAY_ID", "computeruse.rectangularSelectionScreenRecording displayId must be a safe string", "input", context);
  }

  const coordinateSpace = cleanCoordinateSpace(target.coordinateSpace ?? request.coordinateSpace);
  if (coordinateSpace === undefined) {
    return failure(
      "INVALID_COORDINATE_SPACE",
      "computeruse.rectangularSelectionScreenRecording coordinateSpace must be screen, window, or normalized",
      "input",
      context,
      displayId,
    );
  }

  const rect = normalizeRect(target.rect ?? target.region ?? request.rect ?? request.region, coordinateSpace, context, displayId);
  if ("ok" in rect) return rect;

  const maxDurationMs = cleanPositiveInteger(
    target.maxDurationMs ?? request.maxDurationMs,
    rectangularSelectionScreenRecordingDescriptor.defaultMaxDurationMs,
    rectangularSelectionScreenRecordingDescriptor.maxDurationMs,
  );
  const frameRate = cleanPositiveInteger(
    target.frameRate ?? request.frameRate,
    rectangularSelectionScreenRecordingDescriptor.defaultFrameRate,
    rectangularSelectionScreenRecordingDescriptor.maxFrameRate,
  );
  const includeCursor = cleanBoolean(target.includeCursor ?? request.includeCursor, true);
  const includeAudio = cleanBoolean(target.includeAudio ?? request.includeAudio, false);
  const outputFormat = cleanOutputFormat(target.outputFormat ?? request.outputFormat);
  const destinationHintValue = target.destinationHint ?? request.destinationHint;
  const destinationHint = cleanString(destinationHintValue);

  if (maxDurationMs === undefined) {
    return failure(
      "INVALID_MAX_DURATION",
      "computeruse.rectangularSelectionScreenRecording maxDurationMs must be an integer from 1 to 3600000",
      "resource",
      context,
      displayId,
    );
  }
  if (frameRate === undefined) {
    return failure(
      "INVALID_FRAME_RATE",
      "computeruse.rectangularSelectionScreenRecording frameRate must be an integer from 1 to 60",
      "resource",
      context,
      displayId,
    );
  }
  if (includeCursor === undefined) {
    return failure("INVALID_INCLUDE_CURSOR", "computeruse.rectangularSelectionScreenRecording includeCursor must be boolean", "input", context, displayId);
  }
  if (includeAudio === undefined) {
    return failure("INVALID_INCLUDE_AUDIO", "computeruse.rectangularSelectionScreenRecording includeAudio must be boolean", "input", context, displayId);
  }
  if (outputFormat === undefined) {
    return failure(
      "INVALID_OUTPUT_FORMAT",
      "computeruse.rectangularSelectionScreenRecording outputFormat must be video/webm, video/mp4, or video/quicktime",
      "input",
      context,
      displayId,
    );
  }
  if (
    destinationHintValue !== undefined &&
    (destinationHint === undefined || destinationHint.length > 1024 || !hasAllowedDestinationScheme(destinationHint))
  ) {
    return failure(
      "INVALID_DESTINATION_HINT",
      "computeruse.rectangularSelectionScreenRecording destinationHint must use artifact://, session://, runtime://, or memory://",
      "input",
      context,
      displayId,
    );
  }

  return { displayId, rect, maxDurationMs, frameRate, includeCursor, includeAudio, outputFormat, destinationHint };
}

function ensureScopes(
  target: RectangularSelectionScreenRecordingTarget,
  context: RectangularSelectionScreenRecordingContext,
): RectangularSelectionScreenRecordingResult | undefined {
  const requested = context.requestedScopes ?? [];
  const allowed = context.allowedScopes ?? [];
  if (requested.length === 0) return undefined;

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length === 0) return undefined;

  return failure(
    "SCOPE_DENIED",
    `computeruse.rectangularSelectionScreenRecording scope ${denied[0]} is outside runtime governance`,
    "scope",
    context,
    target.displayId,
  );
}

function ensureStaticGates(
  target: RectangularSelectionScreenRecordingTarget,
  context: RectangularSelectionScreenRecordingContext,
): RectangularSelectionScreenRecordingResult | undefined {
  if (context.contract?.accepted === false || context.contract?.allowed === false) {
    return failure(
      "CONTRACT_REJECTED",
      context.contract.reason ?? "computeruse.rectangularSelectionScreenRecording was rejected by runtime contract surface",
      "contract",
      context,
      target.displayId,
    );
  }

  if (context.governance?.accepted === false || context.governance?.allowed === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      context.governance.reason ?? "computeruse.rectangularSelectionScreenRecording was rejected by runtime governance",
      "governance",
      context,
      target.displayId,
    );
  }

  return undefined;
}

function ensureRealExecutionGuard(
  target: RectangularSelectionScreenRecordingTarget,
  context: RectangularSelectionScreenRecordingContext,
): RectangularSelectionScreenRecordingResult | undefined {
  if (context.dryRun !== false) return undefined;
  if (context.guard?.accepted === true || context.guard?.allowed === true) return undefined;

  return failure(
    "GOVERNANCE_REJECTED",
    context.guard?.reason ?? "computeruse.rectangularSelectionScreenRecording dryRun:false requires an affirmative runtime guard",
    "governance",
    context,
    target.displayId,
  );
}

function permissionsRequired(target: RectangularSelectionScreenRecordingTarget): RectangularSelectionScreenRecordingOutput["permissionsRequired"] {
  return target.includeAudio
    ? ["screen:record", "display:capture", "ui:selection", "recording:session", "microphone:record"]
    : ["screen:record", "display:capture", "ui:selection", "recording:session"];
}

function baseOutput(
  target: RectangularSelectionScreenRecordingTarget,
  purpose: string,
  acceptedScopes: readonly string[],
  dryRun: boolean,
  providerCalled: boolean,
): Omit<RectangularSelectionScreenRecordingOutput, "recordingEnvelope"> {
  return {
    kind: "agentCore.basicTool.computeruse.rectangularSelectionScreenRecording",
    target,
    purpose,
    dispatch: dryRun ? "dry-run" : "runtime-computeruse",
    dryRun,
    providerCalled,
    executionBlocked: dryRun,
    unsafeSideEffects: true,
    permissionsRequired: permissionsRequired(target),
    requiresTapApproval: true,
    acceptedScopes,
    runtimeEntry: {
      port: "BaseToolExecutorPort.computeruse.startRecording",
      operation: "computeruse.rectangularSelectionScreenRecording.start",
      runtimeOwnsScreenAccess: true,
      runtimeOwnsRegionSelection: true,
      runtimeOwnsRecordingSession: true,
      runtimeOwnsArtifactStorage: true,
      baseToolOwnsTapStrategy: false,
    },
  };
}

function normalizeProviderResult(
  value: unknown,
  context: RectangularSelectionScreenRecordingContext,
  target: RectangularSelectionScreenRecordingTarget,
): RectangularSelectionScreenRecordingProviderResult | RectangularSelectionScreenRecordingResult {
  if (!isRecord(value) || cleanString(value.recordingId) === undefined) {
    return failure(
      "PROVIDER_FAILURE",
      "computeruse.rectangularSelectionScreenRecording runtime provider returned a malformed public-safe recording envelope",
      "provider",
      context,
      target.displayId,
    );
  }

  return {
    recordingId: cleanString(value.recordingId) ?? "",
    metadata: cleanAuditMetadata(value.metadata),
  };
}

function normalizeRequest(request: unknown): {
  target: RectangularSelectionScreenRecordingTarget;
  context: RectangularSelectionScreenRecordingContext;
  purpose: string;
  metadata?: Readonly<Record<string, unknown>>;
  provider?: RectangularSelectionScreenRecordingProvider;
} | RectangularSelectionScreenRecordingResult {
  if (request === undefined) request = {};
  if (!isRecord(request)) return failure("INVALID_REQUEST", "computeruse.rectangularSelectionScreenRecording request must be an object", "input", undefined);

  const context = normalizeContext(request.context);
  if ("ok" in context) return context;

  const target = normalizeTarget(request, context);
  if ("ok" in target) return target;

  const purpose = cleanString(request.purpose);
  if (purpose === undefined) {
    return failure("MISSING_PURPOSE", "computeruse.rectangularSelectionScreenRecording requires an explicit purpose", "input", context, target.displayId);
  }

  if (context.runtimeId === undefined) {
    return failure("MISSING_RUNTIME_ID", "computeruse.rectangularSelectionScreenRecording requires context.runtimeId for audit", "input", context, target.displayId);
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
    provider: typeof request.provider === "function" ? (request.provider as RectangularSelectionScreenRecordingProvider) : undefined,
  };
}

export async function executeRectangularSelectionScreenRecording(request: unknown = {}): Promise<RectangularSelectionScreenRecordingResult> {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) return normalized;

  const { target, context, purpose, metadata, provider } = normalized;
  const acceptedScopes = context.requestedScopes ?? [];
  const dryRun = context.dryRun !== false;

  if (dryRun) {
    return {
      ok: true,
      toolId: rectangularSelectionScreenRecordingDescriptor.toolId,
      output: {
        ...baseOutput(target, purpose, acceptedScopes, true, false),
        recordingEnvelope: {
          resource: "screen",
          target: "region",
          started: false,
          metadataOnly: true,
        },
      },
      audit: [auditEvent("agentCore.basicTool.computeruse.rectangularSelectionScreenRecording.dryRun", context, target.displayId, metadata)],
      events: ["basicTool.computeruse.rectangularSelectionScreenRecording.dryRun"],
    };
  }

  if (provider === undefined) {
    return failure(
      "PROVIDER_UNAVAILABLE",
      "computeruse.rectangularSelectionScreenRecording requires runtime executor.computeruse.startRecording for dryRun:false",
      "provider",
      context,
      target.displayId,
    );
  }

  let providerResult: RectangularSelectionScreenRecordingProviderResult;
  try {
    const result = await provider({
      operation: "computeruse.rectangularSelectionScreenRecording.start",
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
      "computeruse.rectangularSelectionScreenRecording runtime provider failed without exposing private details",
      "provider",
      context,
      target.displayId,
    );
  }

  return {
    ok: true,
    toolId: rectangularSelectionScreenRecordingDescriptor.toolId,
    output: {
      ...baseOutput(target, purpose, acceptedScopes, false, true),
      recordingEnvelope: {
        resource: "screen",
        target: "region",
        started: true,
        metadataOnly: false,
        recordingId: providerResult.recordingId,
      },
      providerMetadata: providerResult.metadata,
    },
    audit: [
      auditEvent("agentCore.basicTool.computeruse.rectangularSelectionScreenRecording.started", context, target.displayId, {
        recordingId: providerResult.recordingId,
        ...(providerResult.metadata ?? {}),
      }),
    ],
    events: ["basicTool.computeruse.rectangularSelectionScreenRecording.started"],
  };
}

export function planRectangularSelectionScreenRecording(request: unknown = {}): Promise<RectangularSelectionScreenRecordingResult> {
  return executeRectangularSelectionScreenRecording(request);
}
