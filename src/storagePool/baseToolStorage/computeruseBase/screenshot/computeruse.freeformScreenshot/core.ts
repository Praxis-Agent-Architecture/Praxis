export type FreeformScreenshotBoundary = "input" | "contract" | "governance" | "scope" | "resource" | "provider";

export type FreeformScreenshotGate = {
  accepted?: boolean;
  allowed?: boolean;
  reason?: string;
};

export type FreeformScreenshotContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: FreeformScreenshotGate;
  contract?: FreeformScreenshotGate;
  governance?: FreeformScreenshotGate;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type FreeformScreenshotRect = {
  x: number;
  y: number;
  width: number;
  height: number;
  coordinateSpace: "screen" | "window" | "normalized";
};

export type FreeformScreenshotPoint = {
  x: number;
  y: number;
};

export type FreeformScreenshotTarget = {
  displayId: string;
  points: readonly FreeformScreenshotPoint[];
  boundingBox: FreeformScreenshotRect;
  outputFormat: string;
};

export type FreeformScreenshotProviderRequest = {
  operation: "computeruse.freeformScreenshot.capture";
  target: FreeformScreenshotTarget;
  context: {
    runtimeId?: string;
    sessionId?: string;
    invocationId?: string;
    auditMetadata?: Readonly<Record<string, unknown>>;
  };
  purpose: string;
};

export type FreeformScreenshotProviderResult = {
  artifactId: string;
  mimeType: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type FreeformScreenshotProvider = (
  request: FreeformScreenshotProviderRequest,
) => Promise<FreeformScreenshotProviderResult> | FreeformScreenshotProviderResult;

export type FreeformScreenshotRequest = {
  target?: unknown;
  context?: unknown;
  displayId?: unknown;
  points?: unknown;
  coordinateSpace?: unknown;
  purpose?: unknown;
  outputFormat?: unknown;
  metadata?: unknown;
  provider?: FreeformScreenshotProvider;
};

export type FreeformScreenshotErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_TARGET"
  | "INVALID_CONTEXT"
  | "MISSING_RUNTIME_ID"
  | "MISSING_PURPOSE"
  | "MISSING_SELECTION_POINTS"
  | "INVALID_DISPLAY_ID"
  | "INVALID_SELECTION_POINT"
  | "TOO_MANY_SELECTION_POINTS"
  | "RECT_TOO_LARGE"
  | "INVALID_COORDINATE_SPACE"
  | "INVALID_OUTPUT_FORMAT"
  | "SCOPE_DENIED"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_FAILURE";

export type FreeformScreenshotError = {
  code: FreeformScreenshotErrorCode;
  message: string;
  boundary: FreeformScreenshotBoundary;
  publicSafe: true;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type FreeformScreenshotAuditEvent = {
  type: string;
  toolId: "computeruse.freeformScreenshot";
  invocationId: string;
  dryRun: boolean;
  displayId?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type FreeformScreenshotOutput = {
  kind: "agentCore.basicTool.computeruse.freeformScreenshot";
  target: FreeformScreenshotTarget;
  purpose: string;
  dispatch: "dry-run" | "runtime-computeruse";
  dryRun: boolean;
  providerCalled: boolean;
  executionBlocked: boolean;
  unsafeSideEffects: false;
  permissionsRequired: readonly ["screen:read", "display:capture", "ui:selection"];
  requiresTapApproval: true;
  acceptedScopes: readonly string[];
  runtimeEntry: {
    port: "BaseToolExecutorPort.computeruse.captureScreenshot";
    operation: "computeruse.freeformScreenshot.capture";
    runtimeOwnsScreenAccess: true;
    runtimeOwnsArtifactStorage: true;
    baseToolOwnsTapStrategy: false;
  };
  captureEnvelope: {
    resource: "screen";
    target: "freeform";
    captured: boolean;
    metadataOnly: boolean;
    artifactId?: string;
    mimeType?: string;
  };
  providerMetadata?: Readonly<Record<string, unknown>>;
};

export type FreeformScreenshotResult =
  | {
      ok: true;
      toolId: "computeruse.freeformScreenshot";
      output: FreeformScreenshotOutput;
      audit: readonly FreeformScreenshotAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "computeruse.freeformScreenshot";
      error: FreeformScreenshotError;
      audit: readonly FreeformScreenshotAuditEvent[];
      events: readonly string[];
    };

export const freeformScreenshotDescriptor = {
  toolId: "computeruse.freeformScreenshot",
  capability: "capture-freeform-screenshot",
  route: "agent_executionEngine.basic_toolLayer.baseTools.computeruseBase.screenshot",
  defaultDryRun: true,
  defaultDisplayId: "primary-display",
  defaultOutputFormat: "image/png",
  defaultCoordinateSpace: "screen",
  maxSelectionPoints: 128,
  maxAreaPx: 100_000_000,
  tapOwnsApproval: true,
  runtimeEntry: "BaseToolExecutorPort.computeruse.captureScreenshot",
  permissionsRequired: ["screen:read", "display:capture", "ui:selection"],
  unsafeSideEffects: false,
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

function cleanFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function cleanCoordinateSpace(value: unknown): FreeformScreenshotRect["coordinateSpace"] | undefined {
  if (value === undefined) return freeformScreenshotDescriptor.defaultCoordinateSpace;
  return value === "screen" || value === "window" || value === "normalized" ? value : undefined;
}

function normalizePoints(value: unknown): readonly FreeformScreenshotPoint[] | FreeformScreenshotResult {
  if (!Array.isArray(value) || value.length < 3) {
    return failure("MISSING_SELECTION_POINTS", "computeruse.freeformScreenshot requires at least three selection points", "input", undefined);
  }

  if (value.length > freeformScreenshotDescriptor.maxSelectionPoints) {
    return failure("TOO_MANY_SELECTION_POINTS", "computeruse.freeformScreenshot selection exceeds the point limit", "resource", undefined);
  }

  const points: FreeformScreenshotPoint[] = [];
  for (const point of value) {
    if (!isRecord(point)) {
      return failure("INVALID_SELECTION_POINT", "computeruse.freeformScreenshot points must be objects with x and y", "input", undefined);
    }
    const x = cleanFiniteNumber(point.x);
    const y = cleanFiniteNumber(point.y);
    if (x === undefined || y === undefined || x < 0 || y < 0 || x > 100_000 || y > 100_000) {
      return failure("INVALID_SELECTION_POINT", "computeruse.freeformScreenshot points must be finite positive screen coordinates", "input", undefined);
    }
    points.push({ x: Math.round(x), y: Math.round(y) });
  }

  return Object.freeze(points);
}

function computeBoundingBox(
  points: readonly FreeformScreenshotPoint[],
  coordinateSpace: FreeformScreenshotRect["coordinateSpace"],
): FreeformScreenshotRect {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
    coordinateSpace,
  };
}

function cleanGate(value: unknown): FreeformScreenshotGate | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return undefined;
  const gate: FreeformScreenshotGate = {};
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
  context: FreeformScreenshotContext | undefined,
  displayId: string | undefined,
  metadata?: Readonly<Record<string, unknown>>,
): FreeformScreenshotAuditEvent {
  return {
    type,
    toolId: freeformScreenshotDescriptor.toolId,
    invocationId: context?.invocationId ?? "computeruse.freeformScreenshot:dry-run",
    dryRun: context?.dryRun !== false,
    displayId,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: FreeformScreenshotErrorCode,
  message: string,
  boundary: FreeformScreenshotBoundary,
  context: FreeformScreenshotContext | undefined,
  displayId?: string,
): FreeformScreenshotResult {
  return {
    ok: false,
    toolId: freeformScreenshotDescriptor.toolId,
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("agentCore.basicTool.computeruse.freeformScreenshot.rejected", context, displayId, { code })],
    events: ["basicTool.computeruse.freeformScreenshot.rejected"],
  };
}

function normalizeContext(value: unknown): FreeformScreenshotContext | FreeformScreenshotResult {
  if (value === undefined) return {};
  if (!isRecord(value)) return failure("INVALID_CONTEXT", "computeruse.freeformScreenshot context must be an object", "input", undefined);

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
      "computeruse.freeformScreenshot context contains malformed guard, governance, or scope fields",
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

function normalizeTarget(request: Record<string, unknown>, context: FreeformScreenshotContext): FreeformScreenshotTarget | FreeformScreenshotResult {
  const targetValue = request.target;
  if (targetValue !== undefined && !isRecord(targetValue)) {
    return failure("INVALID_TARGET", "computeruse.freeformScreenshot target must be an object when provided", "input", context);
  }
  const target = isRecord(targetValue) ? targetValue : {};
  const displayId = cleanString(target.displayId ?? request.displayId) ?? freeformScreenshotDescriptor.defaultDisplayId;
  const pointsValue = target.points ?? request.points;
  const coordinateSpace = cleanCoordinateSpace(target.coordinateSpace ?? request.coordinateSpace);
  const outputFormat = cleanString(target.outputFormat ?? request.outputFormat) ?? freeformScreenshotDescriptor.defaultOutputFormat;

  if (displayId.length === 0) {
    return failure("INVALID_DISPLAY_ID", "computeruse.freeformScreenshot displayId must be a safe string", "input", context);
  }

  if (coordinateSpace === undefined) {
    return failure("INVALID_COORDINATE_SPACE", "computeruse.freeformScreenshot coordinateSpace must be screen, window, or normalized", "input", context, displayId);
  }

  const points = normalizePoints(pointsValue);
  if ("ok" in points) {
    return points;
  }

  const boundingBox = computeBoundingBox(points, coordinateSpace);
  if (boundingBox.width <= 0 || boundingBox.height <= 0) {
    return failure("INVALID_SELECTION_POINT", "computeruse.freeformScreenshot points must span a non-empty polygon", "input", context, displayId);
  }

  if (boundingBox.width * boundingBox.height > freeformScreenshotDescriptor.maxAreaPx) {
    return failure("RECT_TOO_LARGE", "computeruse.freeformScreenshot bounding box exceeds the resource limit", "resource", context, displayId);
  }

  if (!["image/png", "image/jpeg", "image/webp"].includes(outputFormat)) {
    return failure("INVALID_OUTPUT_FORMAT", "computeruse.freeformScreenshot outputFormat must be image/png, image/jpeg, or image/webp", "input", context, displayId);
  }

  return {
    displayId,
    points,
    boundingBox,
    outputFormat,
  };
}

function ensureScopes(target: FreeformScreenshotTarget, context: FreeformScreenshotContext): FreeformScreenshotResult | undefined {
  const requested = context.requestedScopes ?? [];
  const allowed = context.allowedScopes ?? [];
  if (requested.length === 0) return undefined;

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length === 0) return undefined;

  return failure(
    "SCOPE_DENIED",
    `computeruse.freeformScreenshot scope ${denied[0]} is outside runtime governance`,
    "scope",
    context,
    target.displayId,
  );
}

function ensureStaticGates(target: FreeformScreenshotTarget, context: FreeformScreenshotContext): FreeformScreenshotResult | undefined {
  if (context.contract?.accepted === false || context.contract?.allowed === false) {
    return failure(
      "CONTRACT_REJECTED",
      context.contract.reason ?? "computeruse.freeformScreenshot was rejected by runtime contract surface",
      "contract",
      context,
      target.displayId,
    );
  }

  if (context.governance?.accepted === false || context.governance?.allowed === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      context.governance.reason ?? "computeruse.freeformScreenshot was rejected by runtime governance",
      "governance",
      context,
      target.displayId,
    );
  }

  return undefined;
}

function ensureRealExecutionGuard(target: FreeformScreenshotTarget, context: FreeformScreenshotContext): FreeformScreenshotResult | undefined {
  if (context.dryRun !== false) return undefined;
  if (context.guard?.accepted === true || context.guard?.allowed === true) return undefined;

  return failure(
    "GOVERNANCE_REJECTED",
    context.guard?.reason ?? "computeruse.freeformScreenshot dryRun:false requires an affirmative runtime guard",
    "governance",
    context,
    target.displayId,
  );
}

function baseOutput(
  target: FreeformScreenshotTarget,
  purpose: string,
  acceptedScopes: readonly string[],
  dryRun: boolean,
  providerCalled: boolean,
): Omit<FreeformScreenshotOutput, "captureEnvelope"> {
  return {
    kind: "agentCore.basicTool.computeruse.freeformScreenshot",
    target,
    purpose,
    dispatch: dryRun ? "dry-run" : "runtime-computeruse",
    dryRun,
    providerCalled,
    executionBlocked: dryRun,
    unsafeSideEffects: false,
    permissionsRequired: freeformScreenshotDescriptor.permissionsRequired,
    requiresTapApproval: true,
    acceptedScopes,
    runtimeEntry: {
      port: "BaseToolExecutorPort.computeruse.captureScreenshot",
      operation: "computeruse.freeformScreenshot.capture",
      runtimeOwnsScreenAccess: true,
      runtimeOwnsArtifactStorage: true,
      baseToolOwnsTapStrategy: false,
    },
  };
}

function normalizeProviderResult(
  value: unknown,
  context: FreeformScreenshotContext,
  target: FreeformScreenshotTarget,
): FreeformScreenshotProviderResult | FreeformScreenshotResult {
  if (!isRecord(value) || cleanString(value.artifactId) === undefined || cleanString(value.mimeType) === undefined) {
    return failure(
      "PROVIDER_FAILURE",
      "computeruse.freeformScreenshot runtime provider returned a malformed public-safe screenshot envelope",
      "provider",
      context,
      target.displayId,
    );
  }

  return {
    artifactId: cleanString(value.artifactId) ?? "",
    mimeType: cleanString(value.mimeType) ?? "",
    metadata: cleanAuditMetadata(value.metadata),
  };
}

function normalizeRequest(request: unknown): {
  target: FreeformScreenshotTarget;
  context: FreeformScreenshotContext;
  purpose: string;
  metadata?: Readonly<Record<string, unknown>>;
  provider?: FreeformScreenshotProvider;
} | FreeformScreenshotResult {
  if (request === undefined) request = {};
  if (!isRecord(request)) return failure("INVALID_REQUEST", "computeruse.freeformScreenshot request must be an object", "input", undefined);

  const context = normalizeContext(request.context);
  if ("ok" in context) return context;

  const target = normalizeTarget(request, context);
  if ("ok" in target) return target;

  const purpose = cleanString(request.purpose);
  if (purpose === undefined) {
    return failure("MISSING_PURPOSE", "computeruse.freeformScreenshot requires an explicit purpose", "input", context, target.displayId);
  }

  if (context.runtimeId === undefined) {
    return failure("MISSING_RUNTIME_ID", "computeruse.freeformScreenshot requires context.runtimeId for audit", "input", context, target.displayId);
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
    provider: typeof request.provider === "function" ? (request.provider as FreeformScreenshotProvider) : undefined,
  };
}

export async function executeFreeformScreenshot(request: unknown = {}): Promise<FreeformScreenshotResult> {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) return normalized;

  const { target, context, purpose, metadata, provider } = normalized;
  const acceptedScopes = context.requestedScopes ?? [];
  const dryRun = context.dryRun !== false;

  if (dryRun) {
    return {
      ok: true,
      toolId: freeformScreenshotDescriptor.toolId,
      output: {
        ...baseOutput(target, purpose, acceptedScopes, true, false),
        captureEnvelope: {
          resource: "screen",
          target: "freeform",
          captured: false,
          metadataOnly: true,
        },
      },
      audit: [auditEvent("agentCore.basicTool.computeruse.freeformScreenshot.dryRun", context, target.displayId, metadata)],
      events: ["basicTool.computeruse.freeformScreenshot.dryRun"],
    };
  }

  if (provider === undefined) {
    return failure(
      "PROVIDER_UNAVAILABLE",
      "computeruse.freeformScreenshot requires runtime executor.computeruse.captureScreenshot for dryRun:false",
      "provider",
      context,
      target.displayId,
    );
  }

  let providerResult: FreeformScreenshotProviderResult;
  try {
    const result = await provider({
      operation: "computeruse.freeformScreenshot.capture",
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
      "computeruse.freeformScreenshot runtime provider failed without exposing private details",
      "provider",
      context,
      target.displayId,
    );
  }

  return {
    ok: true,
    toolId: freeformScreenshotDescriptor.toolId,
    output: {
      ...baseOutput(target, purpose, acceptedScopes, false, true),
      captureEnvelope: {
        resource: "screen",
        target: "freeform",
        captured: true,
        metadataOnly: false,
        artifactId: providerResult.artifactId,
        mimeType: providerResult.mimeType,
      },
      providerMetadata: providerResult.metadata,
    },
    audit: [
      auditEvent("agentCore.basicTool.computeruse.freeformScreenshot.captured", context, target.displayId, {
        artifactId: providerResult.artifactId,
        mimeType: providerResult.mimeType,
        ...(providerResult.metadata ?? {}),
      }),
    ],
    events: ["basicTool.computeruse.freeformScreenshot.captured"],
  };
}

export function planFreeformScreenshot(request: unknown = {}): Promise<FreeformScreenshotResult> {
  return executeFreeformScreenshot(request);
}
