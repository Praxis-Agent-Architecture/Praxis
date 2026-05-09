export type FullscreenScreenshotBoundary = "input" | "contract" | "governance" | "scope" | "provider";

export type FullscreenScreenshotGate = {
  accepted?: boolean;
  allowed?: boolean;
  reason?: string;
};

export type FullscreenScreenshotContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: FullscreenScreenshotGate;
  contract?: FullscreenScreenshotGate;
  governance?: FullscreenScreenshotGate;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type FullscreenScreenshotTarget = {
  displayId: string;
  outputFormat: string;
};

export type FullscreenScreenshotProviderRequest = {
  operation: "computeruse.fullscreenScreenshot.capture";
  target: FullscreenScreenshotTarget;
  context: {
    runtimeId?: string;
    sessionId?: string;
    invocationId?: string;
    auditMetadata?: Readonly<Record<string, unknown>>;
  };
  purpose: string;
};

export type FullscreenScreenshotProviderResult = {
  artifactId: string;
  mimeType: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type FullscreenScreenshotProvider = (
  request: FullscreenScreenshotProviderRequest,
) => Promise<FullscreenScreenshotProviderResult> | FullscreenScreenshotProviderResult;

export type FullscreenScreenshotRequest = {
  target?: unknown;
  context?: unknown;
  displayId?: unknown;
  purpose?: unknown;
  outputFormat?: unknown;
  metadata?: unknown;
  provider?: FullscreenScreenshotProvider;
};

export type FullscreenScreenshotErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_TARGET"
  | "INVALID_CONTEXT"
  | "MISSING_RUNTIME_ID"
  | "MISSING_PURPOSE"
  | "INVALID_DISPLAY_ID"
  | "INVALID_OUTPUT_FORMAT"
  | "SCOPE_DENIED"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "PROVIDER_UNAVAILABLE"
  | "EXECUTION_TIMEOUT"
  | "PROVIDER_FAILURE";

export type FullscreenScreenshotError = {
  code: FullscreenScreenshotErrorCode;
  message: string;
  boundary: FullscreenScreenshotBoundary;
  publicSafe: true;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type FullscreenScreenshotAuditEvent = {
  type: string;
  toolId: "computeruse.fullscreenScreenshot";
  invocationId: string;
  dryRun: boolean;
  displayId?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type FullscreenScreenshotOutput = {
  kind: "agentCore.basicTool.computeruse.fullscreenScreenshot";
  target: FullscreenScreenshotTarget;
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
    operation: "computeruse.fullscreenScreenshot.capture";
    runtimeOwnsScreenAccess: true;
    runtimeOwnsArtifactStorage: true;
    baseToolOwnsTapStrategy: false;
  };
  captureEnvelope: {
    resource: "screen";
    target: "fullscreen";
    captured: boolean;
    metadataOnly: boolean;
    artifactId?: string;
    mimeType?: string;
  };
  providerMetadata?: Readonly<Record<string, unknown>>;
};

export type FullscreenScreenshotResult =
  | {
      ok: true;
      toolId: "computeruse.fullscreenScreenshot";
      output: FullscreenScreenshotOutput;
      audit: readonly FullscreenScreenshotAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "computeruse.fullscreenScreenshot";
      error: FullscreenScreenshotError;
      audit: readonly FullscreenScreenshotAuditEvent[];
      events: readonly string[];
    };

export const fullscreenScreenshotDescriptor = {
  toolId: "computeruse.fullscreenScreenshot",
  capability: "capture-fullscreen-screenshot",
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

function cleanGate(value: unknown): FullscreenScreenshotGate | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return undefined;
  const gate: FullscreenScreenshotGate = {};
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
  context: FullscreenScreenshotContext | undefined,
  displayId: string | undefined,
  metadata?: Readonly<Record<string, unknown>>,
): FullscreenScreenshotAuditEvent {
  return {
    type,
    toolId: fullscreenScreenshotDescriptor.toolId,
    invocationId: context?.invocationId ?? "computeruse.fullscreenScreenshot:dry-run",
    dryRun: context?.dryRun !== false,
    displayId,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: FullscreenScreenshotErrorCode,
  message: string,
  boundary: FullscreenScreenshotBoundary,
  context: FullscreenScreenshotContext | undefined,
  displayId?: string,
): FullscreenScreenshotResult {
  return {
    ok: false,
    toolId: fullscreenScreenshotDescriptor.toolId,
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("agentCore.basicTool.computeruse.fullscreenScreenshot.rejected", context, displayId, { code })],
    events: ["basicTool.computeruse.fullscreenScreenshot.rejected"],
  };
}

function normalizeContext(value: unknown): FullscreenScreenshotContext | FullscreenScreenshotResult {
  if (value === undefined) return {};
  if (!isRecord(value)) return failure("INVALID_CONTEXT", "computeruse.fullscreenScreenshot context must be an object", "input", undefined);

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
      "computeruse.fullscreenScreenshot context contains malformed guard, governance, or scope fields",
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

function normalizeTarget(request: Record<string, unknown>, context: FullscreenScreenshotContext): FullscreenScreenshotTarget | FullscreenScreenshotResult {
  const targetValue = request.target;
  if (targetValue !== undefined && !isRecord(targetValue)) {
    return failure("INVALID_TARGET", "computeruse.fullscreenScreenshot target must be an object when provided", "input", context);
  }
  const target = isRecord(targetValue) ? targetValue : {};
  const displayId = cleanString(target.displayId ?? request.displayId) ?? fullscreenScreenshotDescriptor.defaultDisplayId;
  const outputFormat = cleanString(target.outputFormat ?? request.outputFormat) ?? fullscreenScreenshotDescriptor.defaultOutputFormat;

  if (displayId.length === 0) {
    return failure("INVALID_DISPLAY_ID", "computeruse.fullscreenScreenshot displayId must be a safe string", "input", context);
  }

  if (!["image/png", "image/jpeg", "image/webp"].includes(outputFormat)) {
    return failure("INVALID_OUTPUT_FORMAT", "computeruse.fullscreenScreenshot outputFormat must be image/png, image/jpeg, or image/webp", "input", context, displayId);
  }

  return { displayId, outputFormat };
}

function ensureScopes(target: FullscreenScreenshotTarget, context: FullscreenScreenshotContext): FullscreenScreenshotResult | undefined {
  const requested = context.requestedScopes ?? [];
  const allowed = context.allowedScopes ?? [];
  if (requested.length === 0) return undefined;

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length === 0) return undefined;

  return failure(
    "SCOPE_DENIED",
    `computeruse.fullscreenScreenshot scope ${denied[0]} is outside runtime governance`,
    "scope",
    context,
    target.displayId,
  );
}

function ensureStaticGates(target: FullscreenScreenshotTarget, context: FullscreenScreenshotContext): FullscreenScreenshotResult | undefined {
  if (context.contract?.accepted === false || context.contract?.allowed === false) {
    return failure(
      "CONTRACT_REJECTED",
      context.contract.reason ?? "computeruse.fullscreenScreenshot was rejected by runtime contract surface",
      "contract",
      context,
      target.displayId,
    );
  }

  if (context.governance?.accepted === false || context.governance?.allowed === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      context.governance.reason ?? "computeruse.fullscreenScreenshot was rejected by runtime governance",
      "governance",
      context,
      target.displayId,
    );
  }

  return undefined;
}

function ensureRealExecutionGuard(target: FullscreenScreenshotTarget, context: FullscreenScreenshotContext): FullscreenScreenshotResult | undefined {
  if (context.dryRun !== false) return undefined;
  if (context.guard?.accepted === true || context.guard?.allowed === true) return undefined;

  return failure(
    "GOVERNANCE_REJECTED",
    context.guard?.reason ?? "computeruse.fullscreenScreenshot dryRun:false requires an affirmative runtime guard",
    "governance",
    context,
    target.displayId,
  );
}

function baseOutput(
  target: FullscreenScreenshotTarget,
  purpose: string,
  acceptedScopes: readonly string[],
  dryRun: boolean,
  providerCalled: boolean,
): Omit<FullscreenScreenshotOutput, "captureEnvelope"> {
  return {
    kind: "agentCore.basicTool.computeruse.fullscreenScreenshot",
    target,
    purpose,
    dispatch: dryRun ? "dry-run" : "runtime-computeruse",
    dryRun,
    providerCalled,
    executionBlocked: dryRun,
    unsafeSideEffects: false,
    permissionsRequired: fullscreenScreenshotDescriptor.permissionsRequired,
    requiresTapApproval: true,
    acceptedScopes,
    runtimeEntry: {
      port: "BaseToolExecutorPort.computeruse.captureScreenshot",
      operation: "computeruse.fullscreenScreenshot.capture",
      runtimeOwnsScreenAccess: true,
      runtimeOwnsArtifactStorage: true,
      baseToolOwnsTapStrategy: false,
    },
  };
}

function normalizeProviderResult(
  value: unknown,
  context: FullscreenScreenshotContext,
  target: FullscreenScreenshotTarget,
): FullscreenScreenshotProviderResult | FullscreenScreenshotResult {
  if (!isRecord(value) || cleanString(value.artifactId) === undefined || cleanString(value.mimeType) === undefined) {
    return failure(
      "PROVIDER_FAILURE",
      "computeruse.fullscreenScreenshot runtime provider returned a malformed public-safe screenshot envelope",
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
  target: FullscreenScreenshotTarget;
  context: FullscreenScreenshotContext;
  purpose: string;
  metadata?: Readonly<Record<string, unknown>>;
  provider?: FullscreenScreenshotProvider;
} | FullscreenScreenshotResult {
  if (request === undefined) request = {};
  if (!isRecord(request)) return failure("INVALID_REQUEST", "computeruse.fullscreenScreenshot request must be an object", "input", undefined);

  const context = normalizeContext(request.context);
  if ("ok" in context) return context;

  const target = normalizeTarget(request, context);
  if ("ok" in target) return target;

  const purpose = cleanString(request.purpose);
  if (purpose === undefined) {
    return failure("MISSING_PURPOSE", "computeruse.fullscreenScreenshot requires an explicit purpose", "input", context, target.displayId);
  }

  if (context.runtimeId === undefined) {
    return failure("MISSING_RUNTIME_ID", "computeruse.fullscreenScreenshot requires context.runtimeId for audit", "input", context, target.displayId);
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
    provider: typeof request.provider === "function" ? (request.provider as FullscreenScreenshotProvider) : undefined,
  };
}

export async function executeFullscreenScreenshot(request: unknown = {}): Promise<FullscreenScreenshotResult> {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) return normalized;

  const { target, context, purpose, metadata, provider } = normalized;
  const acceptedScopes = context.requestedScopes ?? [];
  const dryRun = context.dryRun !== false;

  if (dryRun) {
    return {
      ok: true,
      toolId: fullscreenScreenshotDescriptor.toolId,
      output: {
        ...baseOutput(target, purpose, acceptedScopes, true, false),
        captureEnvelope: {
          resource: "screen",
          target: "fullscreen",
          captured: false,
          metadataOnly: true,
        },
      },
      audit: [auditEvent("agentCore.basicTool.computeruse.fullscreenScreenshot.dryRun", context, target.displayId, metadata)],
      events: ["basicTool.computeruse.fullscreenScreenshot.dryRun"],
    };
  }

  if (provider === undefined) {
    return failure(
      "PROVIDER_UNAVAILABLE",
      "computeruse.fullscreenScreenshot requires runtime executor.computeruse.captureScreenshot for dryRun:false",
      "provider",
      context,
      target.displayId,
    );
  }

  let providerResult: FullscreenScreenshotProviderResult;
  try {
    const result = await provider({
      operation: "computeruse.fullscreenScreenshot.capture",
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
  } catch (error) {
    const rawCode = typeof error === "object" && error !== null && "code" in error ? (error as { code?: unknown }).code : undefined;
    const providerCode =
      rawCode === "PROVIDER_UNAVAILABLE" || rawCode === "PROVIDER_FAILURE" || rawCode === "EXECUTION_TIMEOUT"
        ? rawCode
        : "PROVIDER_FAILURE";
    const providerMessage = rawCode === providerCode && error instanceof Error && error.message.trim().length > 0
      ? error.message
      : "computeruse.fullscreenScreenshot runtime provider failed without exposing private details";
    return failure(
      providerCode,
      providerMessage,
      "provider",
      context,
      target.displayId,
    );
  }

  return {
    ok: true,
    toolId: fullscreenScreenshotDescriptor.toolId,
    output: {
      ...baseOutput(target, purpose, acceptedScopes, false, true),
      captureEnvelope: {
        resource: "screen",
        target: "fullscreen",
        captured: true,
        metadataOnly: false,
        artifactId: providerResult.artifactId,
        mimeType: providerResult.mimeType,
      },
      providerMetadata: providerResult.metadata,
    },
    audit: [
      auditEvent("agentCore.basicTool.computeruse.fullscreenScreenshot.captured", context, target.displayId, {
        artifactId: providerResult.artifactId,
        mimeType: providerResult.mimeType,
        ...(providerResult.metadata ?? {}),
      }),
    ],
    events: ["basicTool.computeruse.fullscreenScreenshot.captured"],
  };
}

export function planFullscreenScreenshot(request: unknown = {}): Promise<FullscreenScreenshotResult> {
  return executeFullscreenScreenshot(request);
}
