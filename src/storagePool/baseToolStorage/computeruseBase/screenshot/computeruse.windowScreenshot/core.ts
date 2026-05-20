export type WindowScreenshotBoundary = "input" | "contract" | "governance" | "scope" | "provider";

export type WindowScreenshotGate = {
  accepted?: boolean;
  allowed?: boolean;
  reason?: string;
};

export type WindowScreenshotContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: WindowScreenshotGate;
  contract?: WindowScreenshotGate;
  governance?: WindowScreenshotGate;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type WindowScreenshotTarget = {
  displayId: string;
  windowRef: string;
  titleHint?: string;
  outputFormat: string;
  includeWindowFrame: boolean;
};

export type WindowScreenshotProviderRequest = {
  operation: "computeruse.windowScreenshot.capture";
  target: WindowScreenshotTarget;
  context: {
    runtimeId?: string;
    sessionId?: string;
    invocationId?: string;
    auditMetadata?: Readonly<Record<string, unknown>>;
  };
  purpose: string;
};

export type WindowScreenshotProviderResult = {
  artifactId: string;
  mimeType: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type WindowScreenshotProvider = (
  request: WindowScreenshotProviderRequest,
) => Promise<WindowScreenshotProviderResult> | WindowScreenshotProviderResult;

export type WindowScreenshotRequest = {
  target?: unknown;
  context?: unknown;
  displayId?: unknown;
  windowRef?: unknown;
  titleHint?: unknown;
  includeWindowFrame?: unknown;
  purpose?: unknown;
  outputFormat?: unknown;
  metadata?: unknown;
  provider?: WindowScreenshotProvider;
};

export type WindowScreenshotErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_TARGET"
  | "INVALID_CONTEXT"
  | "MISSING_RUNTIME_ID"
  | "MISSING_PURPOSE"
  | "MISSING_WINDOW_REF"
  | "INVALID_DISPLAY_ID"
  | "INVALID_WINDOW_REF"
  | "INVALID_TITLE_HINT"
  | "INVALID_OUTPUT_FORMAT"
  | "SCOPE_DENIED"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_FAILURE";

export type WindowScreenshotError = {
  code: WindowScreenshotErrorCode;
  message: string;
  boundary: WindowScreenshotBoundary;
  publicSafe: true;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type WindowScreenshotAuditEvent = {
  type: string;
  toolId: "computeruse.windowScreenshot";
  invocationId: string;
  dryRun: boolean;
  displayId?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type WindowScreenshotOutput = {
  kind: "agentCore.basicTool.computeruse.windowScreenshot";
  target: WindowScreenshotTarget;
  purpose: string;
  dispatch: "dry-run" | "runtime-computeruse";
  dryRun: boolean;
  providerCalled: boolean;
  executionBlocked: boolean;
  unsafeSideEffects: false;
  permissionsRequired: readonly ["screen:read", "display:capture"];
  requiresTapApproval: true;
  acceptedScopes: readonly string[];
  runtimeEntry: {
    port: "BaseToolExecutorPort.computeruse.captureScreenshot";
    operation: "computeruse.windowScreenshot.capture";
    runtimeOwnsScreenAccess: true;
    runtimeOwnsArtifactStorage: true;
    baseToolOwnsTapStrategy: false;
  };
  captureEnvelope: {
    resource: "screen";
    target: "window";
    captured: boolean;
    metadataOnly: boolean;
    artifactId?: string;
    mimeType?: string;
  };
  providerMetadata?: Readonly<Record<string, unknown>>;
};

export type WindowScreenshotResult =
  | {
      ok: true;
      toolId: "computeruse.windowScreenshot";
      output: WindowScreenshotOutput;
      audit: readonly WindowScreenshotAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "computeruse.windowScreenshot";
      error: WindowScreenshotError;
      audit: readonly WindowScreenshotAuditEvent[];
      events: readonly string[];
    };

export const windowScreenshotDescriptor = {
  toolId: "computeruse.windowScreenshot",
  capability: "capture-window-screenshot",
  route: "agent_executionEngine.basic_toolLayer.baseTools.computeruseBase.screenshot",
  defaultDryRun: true,
  defaultDisplayId: "primary-display",
  defaultOutputFormat: "image/png",
  tapOwnsApproval: true,
  runtimeEntry: "BaseToolExecutorPort.computeruse.captureScreenshot",
  permissionsRequired: ["screen:read", "display:capture"],
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

function cleanGate(value: unknown): WindowScreenshotGate | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return undefined;
  const gate: WindowScreenshotGate = {};
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
  context: WindowScreenshotContext | undefined,
  displayId: string | undefined,
  metadata?: Readonly<Record<string, unknown>>,
): WindowScreenshotAuditEvent {
  return {
    type,
    toolId: windowScreenshotDescriptor.toolId,
    invocationId: context?.invocationId ?? "computeruse.windowScreenshot:dry-run",
    dryRun: context?.dryRun !== false,
    displayId,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: WindowScreenshotErrorCode,
  message: string,
  boundary: WindowScreenshotBoundary,
  context: WindowScreenshotContext | undefined,
  displayId?: string,
): WindowScreenshotResult {
  return {
    ok: false,
    toolId: windowScreenshotDescriptor.toolId,
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("agentCore.basicTool.computeruse.windowScreenshot.rejected", context, displayId, { code })],
    events: ["basicTool.computeruse.windowScreenshot.rejected"],
  };
}

function normalizeContext(value: unknown): WindowScreenshotContext | WindowScreenshotResult {
  if (value === undefined) return {};
  if (!isRecord(value)) return failure("INVALID_CONTEXT", "computeruse.windowScreenshot context must be an object", "input", undefined);

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
      "computeruse.windowScreenshot context contains malformed guard, governance, or scope fields",
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

function normalizeTarget(request: Record<string, unknown>, context: WindowScreenshotContext): WindowScreenshotTarget | WindowScreenshotResult {
  const targetValue = request.target;
  if (targetValue !== undefined && !isRecord(targetValue)) {
    return failure("INVALID_TARGET", "computeruse.windowScreenshot target must be an object when provided", "input", context);
  }
  const target = isRecord(targetValue) ? targetValue : {};
  const displayId = cleanString(target.displayId ?? request.displayId) ?? windowScreenshotDescriptor.defaultDisplayId;
  const windowRefValue = target.windowRef ?? target.windowId ?? request.windowRef;
  const windowRef = cleanString(windowRefValue);
  const titleHintValue = target.titleHint ?? request.titleHint;
  const titleHint = titleHintValue === undefined ? undefined : cleanString(titleHintValue);
  const includeWindowFrameValue = target.includeWindowFrame ?? request.includeWindowFrame;
  const outputFormat = cleanString(target.outputFormat ?? request.outputFormat) ?? windowScreenshotDescriptor.defaultOutputFormat;

  if (displayId.length === 0) {
    return failure("INVALID_DISPLAY_ID", "computeruse.windowScreenshot displayId must be a safe string", "input", context);
  }

  if (windowRefValue === undefined) {
    return failure("MISSING_WINDOW_REF", "computeruse.windowScreenshot requires target.windowRef", "input", context, displayId);
  }

  if (windowRef === undefined) {
    return failure("INVALID_WINDOW_REF", "computeruse.windowScreenshot windowRef must be a safe string", "input", context, displayId);
  }

  if (titleHintValue !== undefined && titleHint === undefined) {
    return failure("INVALID_TITLE_HINT", "computeruse.windowScreenshot titleHint must be a safe string", "input", context, displayId);
  }

  if (includeWindowFrameValue !== undefined && typeof includeWindowFrameValue !== "boolean") {
    return failure(
      "INVALID_TARGET",
      "computeruse.windowScreenshot includeWindowFrame must be a boolean when provided",
      "input",
      context,
      displayId,
    );
  }

  if (!["image/png", "image/jpeg", "image/webp"].includes(outputFormat)) {
    return failure("INVALID_OUTPUT_FORMAT", "computeruse.windowScreenshot outputFormat must be image/png, image/jpeg, or image/webp", "input", context, displayId);
  }

  return {
    displayId,
    windowRef,
    titleHint,
    outputFormat,
    includeWindowFrame: includeWindowFrameValue === undefined ? true : includeWindowFrameValue,
  };
}

function ensureScopes(target: WindowScreenshotTarget, context: WindowScreenshotContext): WindowScreenshotResult | undefined {
  const requested = context.requestedScopes ?? [];
  const allowed = context.allowedScopes ?? [];
  if (requested.length === 0) return undefined;

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length === 0) return undefined;

  return failure(
    "SCOPE_DENIED",
    `computeruse.windowScreenshot scope ${denied[0]} is outside runtime governance`,
    "scope",
    context,
    target.displayId,
  );
}

function ensureStaticGates(target: WindowScreenshotTarget, context: WindowScreenshotContext): WindowScreenshotResult | undefined {
  if (context.contract?.accepted === false || context.contract?.allowed === false) {
    return failure(
      "CONTRACT_REJECTED",
      context.contract.reason ?? "computeruse.windowScreenshot was rejected by runtime contract surface",
      "contract",
      context,
      target.displayId,
    );
  }

  if (context.governance?.accepted === false || context.governance?.allowed === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      context.governance.reason ?? "computeruse.windowScreenshot was rejected by runtime governance",
      "governance",
      context,
      target.displayId,
    );
  }

  return undefined;
}

function ensureRealExecutionGuard(target: WindowScreenshotTarget, context: WindowScreenshotContext): WindowScreenshotResult | undefined {
  if (context.dryRun !== false) return undefined;
  if (context.guard?.accepted === true || context.guard?.allowed === true) return undefined;

  return failure(
    "GOVERNANCE_REJECTED",
    context.guard?.reason ?? "computeruse.windowScreenshot dryRun:false requires an affirmative runtime guard",
    "governance",
    context,
    target.displayId,
  );
}

function baseOutput(
  target: WindowScreenshotTarget,
  purpose: string,
  acceptedScopes: readonly string[],
  dryRun: boolean,
  providerCalled: boolean,
): Omit<WindowScreenshotOutput, "captureEnvelope"> {
  return {
    kind: "agentCore.basicTool.computeruse.windowScreenshot",
    target,
    purpose,
    dispatch: dryRun ? "dry-run" : "runtime-computeruse",
    dryRun,
    providerCalled,
    executionBlocked: dryRun,
    unsafeSideEffects: false,
    permissionsRequired: windowScreenshotDescriptor.permissionsRequired,
    requiresTapApproval: true,
    acceptedScopes,
    runtimeEntry: {
      port: "BaseToolExecutorPort.computeruse.captureScreenshot",
      operation: "computeruse.windowScreenshot.capture",
      runtimeOwnsScreenAccess: true,
      runtimeOwnsArtifactStorage: true,
      baseToolOwnsTapStrategy: false,
    },
  };
}

function normalizeProviderResult(
  value: unknown,
  context: WindowScreenshotContext,
  target: WindowScreenshotTarget,
): WindowScreenshotProviderResult | WindowScreenshotResult {
  if (!isRecord(value) || cleanString(value.artifactId) === undefined || cleanString(value.mimeType) === undefined) {
    return failure(
      "PROVIDER_FAILURE",
      "computeruse.windowScreenshot runtime provider returned a malformed public-safe screenshot envelope",
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
  target: WindowScreenshotTarget;
  context: WindowScreenshotContext;
  purpose: string;
  metadata?: Readonly<Record<string, unknown>>;
  provider?: WindowScreenshotProvider;
} | WindowScreenshotResult {
  if (request === undefined) request = {};
  if (!isRecord(request)) return failure("INVALID_REQUEST", "computeruse.windowScreenshot request must be an object", "input", undefined);

  const context = normalizeContext(request.context);
  if ("ok" in context) return context;

  const target = normalizeTarget(request, context);
  if ("ok" in target) return target;

  const purpose = cleanString(request.purpose);
  if (purpose === undefined) {
    return failure("MISSING_PURPOSE", "computeruse.windowScreenshot requires an explicit purpose", "input", context, target.displayId);
  }

  if (context.runtimeId === undefined) {
    return failure("MISSING_RUNTIME_ID", "computeruse.windowScreenshot requires context.runtimeId for audit", "input", context, target.displayId);
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
    provider: typeof request.provider === "function" ? (request.provider as WindowScreenshotProvider) : undefined,
  };
}

export async function executeWindowScreenshot(request: unknown = {}): Promise<WindowScreenshotResult> {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) return normalized;

  const { target, context, purpose, metadata, provider } = normalized;
  const acceptedScopes = context.requestedScopes ?? [];
  const dryRun = context.dryRun !== false;

  if (dryRun) {
    return {
      ok: true,
      toolId: windowScreenshotDescriptor.toolId,
      output: {
        ...baseOutput(target, purpose, acceptedScopes, true, false),
        captureEnvelope: {
          resource: "screen",
          target: "window",
          captured: false,
          metadataOnly: true,
        },
      },
      audit: [auditEvent("agentCore.basicTool.computeruse.windowScreenshot.dryRun", context, target.displayId, metadata)],
      events: ["basicTool.computeruse.windowScreenshot.dryRun"],
    };
  }

  if (provider === undefined) {
    return failure(
      "PROVIDER_UNAVAILABLE",
      "computeruse.windowScreenshot requires runtime executor.computeruse.captureScreenshot for dryRun:false",
      "provider",
      context,
      target.displayId,
    );
  }

  let providerResult: WindowScreenshotProviderResult;
  try {
    const result = await provider({
      operation: "computeruse.windowScreenshot.capture",
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
      "computeruse.windowScreenshot runtime provider failed without exposing private details",
      "provider",
      context,
      target.displayId,
    );
  }

  return {
    ok: true,
    toolId: windowScreenshotDescriptor.toolId,
    output: {
      ...baseOutput(target, purpose, acceptedScopes, false, true),
      captureEnvelope: {
        resource: "screen",
        target: "window",
        captured: true,
        metadataOnly: false,
        artifactId: providerResult.artifactId,
        mimeType: providerResult.mimeType,
      },
      providerMetadata: providerResult.metadata,
    },
    audit: [
      auditEvent("agentCore.basicTool.computeruse.windowScreenshot.captured", context, target.displayId, {
        artifactId: providerResult.artifactId,
        mimeType: providerResult.mimeType,
        ...(providerResult.metadata ?? {}),
      }),
    ],
    events: ["basicTool.computeruse.windowScreenshot.captured"],
  };
}

export function planWindowScreenshot(request: unknown = {}): Promise<WindowScreenshotResult> {
  return executeWindowScreenshot(request);
}
