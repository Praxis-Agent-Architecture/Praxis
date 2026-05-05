export type RectangularSelectionScreenshotBoundary = "input" | "contract" | "governance" | "scope" | "resource" | "provider";

export type RectangularSelectionScreenshotGate = {
  accepted?: boolean;
  allowed?: boolean;
  reason?: string;
};

export type RectangularSelectionScreenshotContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: RectangularSelectionScreenshotGate;
  contract?: RectangularSelectionScreenshotGate;
  governance?: RectangularSelectionScreenshotGate;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type RectangularSelectionScreenshotRect = {
  x: number;
  y: number;
  width: number;
  height: number;
  coordinateSpace: "screen" | "window" | "normalized";
};

export type RectangularSelectionScreenshotTarget = {
  displayId: string;
  rect: RectangularSelectionScreenshotRect;
  outputFormat: string;
};

export type RectangularSelectionScreenshotProviderRequest = {
  operation: "computeruse.rectangularSelectionScreenshot.capture";
  target: RectangularSelectionScreenshotTarget;
  context: {
    runtimeId?: string;
    sessionId?: string;
    invocationId?: string;
    auditMetadata?: Readonly<Record<string, unknown>>;
  };
  purpose: string;
};

export type RectangularSelectionScreenshotProviderResult = {
  artifactId: string;
  mimeType: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type RectangularSelectionScreenshotProvider = (
  request: RectangularSelectionScreenshotProviderRequest,
) => Promise<RectangularSelectionScreenshotProviderResult> | RectangularSelectionScreenshotProviderResult;

export type RectangularSelectionScreenshotRequest = {
  target?: unknown;
  context?: unknown;
  displayId?: unknown;
  rect?: unknown;
  region?: unknown;
  coordinateSpace?: unknown;
  purpose?: unknown;
  outputFormat?: unknown;
  metadata?: unknown;
  provider?: RectangularSelectionScreenshotProvider;
};

export type RectangularSelectionScreenshotErrorCode =
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
  | "INVALID_OUTPUT_FORMAT"
  | "SCOPE_DENIED"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_FAILURE";

export type RectangularSelectionScreenshotError = {
  code: RectangularSelectionScreenshotErrorCode;
  message: string;
  boundary: RectangularSelectionScreenshotBoundary;
  publicSafe: true;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type RectangularSelectionScreenshotAuditEvent = {
  type: string;
  toolId: "computeruse.rectangularSelectionScreenshot";
  invocationId: string;
  dryRun: boolean;
  displayId?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type RectangularSelectionScreenshotOutput = {
  kind: "agentCore.basicTool.computeruse.rectangularSelectionScreenshot";
  target: RectangularSelectionScreenshotTarget;
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
    operation: "computeruse.rectangularSelectionScreenshot.capture";
    runtimeOwnsScreenAccess: true;
    runtimeOwnsArtifactStorage: true;
    baseToolOwnsTapStrategy: false;
  };
  captureEnvelope: {
    resource: "screen";
    target: "region";
    captured: boolean;
    metadataOnly: boolean;
    artifactId?: string;
    mimeType?: string;
  };
  providerMetadata?: Readonly<Record<string, unknown>>;
};

export type RectangularSelectionScreenshotResult =
  | {
      ok: true;
      toolId: "computeruse.rectangularSelectionScreenshot";
      output: RectangularSelectionScreenshotOutput;
      audit: readonly RectangularSelectionScreenshotAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "computeruse.rectangularSelectionScreenshot";
      error: RectangularSelectionScreenshotError;
      audit: readonly RectangularSelectionScreenshotAuditEvent[];
      events: readonly string[];
    };

export const rectangularSelectionScreenshotDescriptor = {
  toolId: "computeruse.rectangularSelectionScreenshot",
  capability: "capture-rectangular-selection-screenshot",
  route: "agent_executionEngine.basic_toolLayer.baseTools.computeruseBase.screenshot",
  defaultDryRun: true,
  defaultDisplayId: "primary-display",
  defaultOutputFormat: "image/png",
  defaultCoordinateSpace: "screen",
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

function cleanCoordinateSpace(value: unknown): RectangularSelectionScreenshotRect["coordinateSpace"] | undefined {
  if (value === undefined) return rectangularSelectionScreenshotDescriptor.defaultCoordinateSpace;
  return value === "screen" || value === "window" || value === "normalized" ? value : undefined;
}

function cleanGate(value: unknown): RectangularSelectionScreenshotGate | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return undefined;
  const gate: RectangularSelectionScreenshotGate = {};
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
  context: RectangularSelectionScreenshotContext | undefined,
  displayId: string | undefined,
  metadata?: Readonly<Record<string, unknown>>,
): RectangularSelectionScreenshotAuditEvent {
  return {
    type,
    toolId: rectangularSelectionScreenshotDescriptor.toolId,
    invocationId: context?.invocationId ?? "computeruse.rectangularSelectionScreenshot:dry-run",
    dryRun: context?.dryRun !== false,
    displayId,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: RectangularSelectionScreenshotErrorCode,
  message: string,
  boundary: RectangularSelectionScreenshotBoundary,
  context: RectangularSelectionScreenshotContext | undefined,
  displayId?: string,
): RectangularSelectionScreenshotResult {
  return {
    ok: false,
    toolId: rectangularSelectionScreenshotDescriptor.toolId,
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("agentCore.basicTool.computeruse.rectangularSelectionScreenshot.rejected", context, displayId, { code })],
    events: ["basicTool.computeruse.rectangularSelectionScreenshot.rejected"],
  };
}

function normalizeContext(value: unknown): RectangularSelectionScreenshotContext | RectangularSelectionScreenshotResult {
  if (value === undefined) return {};
  if (!isRecord(value)) return failure("INVALID_CONTEXT", "computeruse.rectangularSelectionScreenshot context must be an object", "input", undefined);

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
      "computeruse.rectangularSelectionScreenshot context contains malformed guard, governance, or scope fields",
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

function normalizeTarget(request: Record<string, unknown>, context: RectangularSelectionScreenshotContext): RectangularSelectionScreenshotTarget | RectangularSelectionScreenshotResult {
  const targetValue = request.target;
  if (targetValue !== undefined && !isRecord(targetValue)) {
    return failure("INVALID_TARGET", "computeruse.rectangularSelectionScreenshot target must be an object when provided", "input", context);
  }
  const target = isRecord(targetValue) ? targetValue : {};
  const displayId = cleanString(target.displayId ?? request.displayId) ?? rectangularSelectionScreenshotDescriptor.defaultDisplayId;
  const rectValue = target.rect ?? target.region ?? request.rect ?? request.region;
  const coordinateSpace = cleanCoordinateSpace(target.coordinateSpace ?? request.coordinateSpace);
  const outputFormat = cleanString(target.outputFormat ?? request.outputFormat) ?? rectangularSelectionScreenshotDescriptor.defaultOutputFormat;

  if (displayId.length === 0) {
    return failure("INVALID_DISPLAY_ID", "computeruse.rectangularSelectionScreenshot displayId must be a safe string", "input", context);
  }

  if (rectValue === undefined) {
    return failure("MISSING_RECT", "computeruse.rectangularSelectionScreenshot requires target.rect or rect", "input", context, displayId);
  }

  if (!isRecord(rectValue)) {
    return failure(
      "INVALID_RECT",
      "computeruse.rectangularSelectionScreenshot rect must be an object with x, y, width, and height",
      "input",
      context,
      displayId,
    );
  }

  const x = cleanFiniteNumber(rectValue.x);
  const y = cleanFiniteNumber(rectValue.y);
  const width = cleanFiniteNumber(rectValue.width);
  const height = cleanFiniteNumber(rectValue.height);
  if (x === undefined || y === undefined || width === undefined || height === undefined) {
    return failure("INVALID_RECT", "computeruse.rectangularSelectionScreenshot rect coordinates must be finite numbers", "input", context, displayId);
  }

  if (coordinateSpace === undefined) {
    return failure("INVALID_COORDINATE_SPACE", "computeruse.rectangularSelectionScreenshot coordinateSpace must be screen, window, or normalized", "input", context, displayId);
  }

  const rect: RectangularSelectionScreenshotRect = {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
    coordinateSpace,
  };

  if (rect.x < 0 || rect.y < 0 || rect.width <= 0 || rect.height <= 0) {
    return failure("INVALID_RECT", "computeruse.rectangularSelectionScreenshot rect must use positive coordinates", "input", context, displayId);
  }

  if (rect.width * rect.height > rectangularSelectionScreenshotDescriptor.maxAreaPx) {
    return failure("RECT_TOO_LARGE", "computeruse.rectangularSelectionScreenshot rect exceeds the resource limit", "resource", context, displayId);
  }

  if (!["image/png", "image/jpeg", "image/webp"].includes(outputFormat)) {
    return failure("INVALID_OUTPUT_FORMAT", "computeruse.rectangularSelectionScreenshot outputFormat must be image/png, image/jpeg, or image/webp", "input", context, displayId);
  }

  return {
    displayId,
    rect,
    outputFormat,
  };
}

function ensureScopes(target: RectangularSelectionScreenshotTarget, context: RectangularSelectionScreenshotContext): RectangularSelectionScreenshotResult | undefined {
  const requested = context.requestedScopes ?? [];
  const allowed = context.allowedScopes ?? [];
  if (requested.length === 0) return undefined;

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length === 0) return undefined;

  return failure(
    "SCOPE_DENIED",
    `computeruse.rectangularSelectionScreenshot scope ${denied[0]} is outside runtime governance`,
    "scope",
    context,
    target.displayId,
  );
}

function ensureStaticGates(target: RectangularSelectionScreenshotTarget, context: RectangularSelectionScreenshotContext): RectangularSelectionScreenshotResult | undefined {
  if (context.contract?.accepted === false || context.contract?.allowed === false) {
    return failure(
      "CONTRACT_REJECTED",
      context.contract.reason ?? "computeruse.rectangularSelectionScreenshot was rejected by runtime contract surface",
      "contract",
      context,
      target.displayId,
    );
  }

  if (context.governance?.accepted === false || context.governance?.allowed === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      context.governance.reason ?? "computeruse.rectangularSelectionScreenshot was rejected by runtime governance",
      "governance",
      context,
      target.displayId,
    );
  }

  return undefined;
}

function ensureRealExecutionGuard(target: RectangularSelectionScreenshotTarget, context: RectangularSelectionScreenshotContext): RectangularSelectionScreenshotResult | undefined {
  if (context.dryRun !== false) return undefined;
  if (context.guard?.accepted === true || context.guard?.allowed === true) return undefined;

  return failure(
    "GOVERNANCE_REJECTED",
    context.guard?.reason ?? "computeruse.rectangularSelectionScreenshot dryRun:false requires an affirmative runtime guard",
    "governance",
    context,
    target.displayId,
  );
}

function baseOutput(
  target: RectangularSelectionScreenshotTarget,
  purpose: string,
  acceptedScopes: readonly string[],
  dryRun: boolean,
  providerCalled: boolean,
): Omit<RectangularSelectionScreenshotOutput, "captureEnvelope"> {
  return {
    kind: "agentCore.basicTool.computeruse.rectangularSelectionScreenshot",
    target,
    purpose,
    dispatch: dryRun ? "dry-run" : "runtime-computeruse",
    dryRun,
    providerCalled,
    executionBlocked: dryRun,
    unsafeSideEffects: false,
    permissionsRequired: rectangularSelectionScreenshotDescriptor.permissionsRequired,
    requiresTapApproval: true,
    acceptedScopes,
    runtimeEntry: {
      port: "BaseToolExecutorPort.computeruse.captureScreenshot",
      operation: "computeruse.rectangularSelectionScreenshot.capture",
      runtimeOwnsScreenAccess: true,
      runtimeOwnsArtifactStorage: true,
      baseToolOwnsTapStrategy: false,
    },
  };
}

function normalizeProviderResult(
  value: unknown,
  context: RectangularSelectionScreenshotContext,
  target: RectangularSelectionScreenshotTarget,
): RectangularSelectionScreenshotProviderResult | RectangularSelectionScreenshotResult {
  if (!isRecord(value) || cleanString(value.artifactId) === undefined || cleanString(value.mimeType) === undefined) {
    return failure(
      "PROVIDER_FAILURE",
      "computeruse.rectangularSelectionScreenshot runtime provider returned a malformed public-safe screenshot envelope",
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
  target: RectangularSelectionScreenshotTarget;
  context: RectangularSelectionScreenshotContext;
  purpose: string;
  metadata?: Readonly<Record<string, unknown>>;
  provider?: RectangularSelectionScreenshotProvider;
} | RectangularSelectionScreenshotResult {
  if (request === undefined) request = {};
  if (!isRecord(request)) return failure("INVALID_REQUEST", "computeruse.rectangularSelectionScreenshot request must be an object", "input", undefined);

  const context = normalizeContext(request.context);
  if ("ok" in context) return context;

  const target = normalizeTarget(request, context);
  if ("ok" in target) return target;

  const purpose = cleanString(request.purpose);
  if (purpose === undefined) {
    return failure("MISSING_PURPOSE", "computeruse.rectangularSelectionScreenshot requires an explicit purpose", "input", context, target.displayId);
  }

  if (context.runtimeId === undefined) {
    return failure("MISSING_RUNTIME_ID", "computeruse.rectangularSelectionScreenshot requires context.runtimeId for audit", "input", context, target.displayId);
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
    provider: typeof request.provider === "function" ? (request.provider as RectangularSelectionScreenshotProvider) : undefined,
  };
}

export async function executeRectangularSelectionScreenshot(request: unknown = {}): Promise<RectangularSelectionScreenshotResult> {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) return normalized;

  const { target, context, purpose, metadata, provider } = normalized;
  const acceptedScopes = context.requestedScopes ?? [];
  const dryRun = context.dryRun !== false;

  if (dryRun) {
    return {
      ok: true,
      toolId: rectangularSelectionScreenshotDescriptor.toolId,
      output: {
        ...baseOutput(target, purpose, acceptedScopes, true, false),
        captureEnvelope: {
          resource: "screen",
          target: "region",
          captured: false,
          metadataOnly: true,
        },
      },
      audit: [auditEvent("agentCore.basicTool.computeruse.rectangularSelectionScreenshot.dryRun", context, target.displayId, metadata)],
      events: ["basicTool.computeruse.rectangularSelectionScreenshot.dryRun"],
    };
  }

  if (provider === undefined) {
    return failure(
      "PROVIDER_UNAVAILABLE",
      "computeruse.rectangularSelectionScreenshot requires runtime executor.computeruse.captureScreenshot for dryRun:false",
      "provider",
      context,
      target.displayId,
    );
  }

  let providerResult: RectangularSelectionScreenshotProviderResult;
  try {
    const result = await provider({
      operation: "computeruse.rectangularSelectionScreenshot.capture",
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
      "computeruse.rectangularSelectionScreenshot runtime provider failed without exposing private details",
      "provider",
      context,
      target.displayId,
    );
  }

  return {
    ok: true,
    toolId: rectangularSelectionScreenshotDescriptor.toolId,
    output: {
      ...baseOutput(target, purpose, acceptedScopes, false, true),
      captureEnvelope: {
        resource: "screen",
        target: "region",
        captured: true,
        metadataOnly: false,
        artifactId: providerResult.artifactId,
        mimeType: providerResult.mimeType,
      },
      providerMetadata: providerResult.metadata,
    },
    audit: [
      auditEvent("agentCore.basicTool.computeruse.rectangularSelectionScreenshot.captured", context, target.displayId, {
        artifactId: providerResult.artifactId,
        mimeType: providerResult.mimeType,
        ...(providerResult.metadata ?? {}),
      }),
    ],
    events: ["basicTool.computeruse.rectangularSelectionScreenshot.captured"],
  };
}

export function planRectangularSelectionScreenshot(request: unknown = {}): Promise<RectangularSelectionScreenshotResult> {
  return executeRectangularSelectionScreenshot(request);
}
