/*
 * omni.viewImage storage core.
 *
 * The baseTool owns only the invocation contract and public-safe result envelope.
 * Runtime/modelAdapter owns image bytes, artifact storage, provider body lowering,
 * and model capability routing.
 */

export type OmniViewImagePermission = "filesystem:read" | "omni:image:view";

export type OmniViewImageBoundary = "input" | "scope" | "permission" | "contract" | "governance" | "provider";

export type OmniViewImageGate = {
  accepted?: boolean;
  allowed?: boolean;
  reason?: string;
};

export type OmniViewImageDetail = "low" | "high" | "original";

export type OmniViewImageMediaType = "image/png" | "image/jpeg" | "image/webp" | "image/gif" | "unknown";

export type OmniViewImageTarget = {
  imagePath?: string;
  imageRef?: string;
  mediaType: OmniViewImageMediaType;
  detail: OmniViewImageDetail;
  maxBytes?: number;
};

export type OmniViewImageContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: OmniViewImageGate;
  allowedImageRoots?: readonly string[];
  grantedPermissions?: readonly OmniViewImagePermission[];
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  contract?: OmniViewImageGate;
  governance?: OmniViewImageGate;
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type OmniViewImageRequest = {
  target?: unknown;
  context?: unknown;
  provider?: OmniViewImageProvider;
};

export type OmniViewImageProviderRequest = {
  operation: "omni.viewImage.prepareImageInput";
  target: OmniViewImageTarget;
  context: {
    runtimeId?: string;
    sessionId?: string;
    invocationId?: string;
    auditMetadata?: Readonly<Record<string, unknown>>;
  };
};

export type OmniViewImageProviderResult = {
  artifactId: string;
  mimeType?: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type OmniViewImageProvider = (
  request: OmniViewImageProviderRequest,
) => Promise<OmniViewImageProviderResult> | OmniViewImageProviderResult;

export type OmniViewImageErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_TARGET"
  | "INVALID_CONTEXT"
  | "MISSING_IMAGE_TARGET"
  | "IMAGE_PATH_OUT_OF_SCOPE"
  | "INVALID_DETAIL"
  | "INVALID_MAX_BYTES"
  | "INVALID_MEDIA_TYPE"
  | "PERMISSION_DENIED"
  | "SCOPE_DENIED"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_REJECTED";

export type OmniViewImageError = {
  code: OmniViewImageErrorCode;
  message: string;
  boundary: OmniViewImageBoundary;
  publicSafe: true;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type OmniViewImageAuditEvent = {
  type: string;
  toolId: "omni.viewImage";
  invocationId: string;
  dryRun: boolean;
  imagePath?: string;
  imageRef?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type OmniViewImageOutput = {
  kind: "agentCore.basicTool.omni.viewImage";
  target: OmniViewImageTarget;
  dispatch: "dry-run" | "runtime-omni";
  dryRun: boolean;
  providerCalled: boolean;
  executionBlocked: boolean;
  unsafeSideEffects: false;
  permissionsRequired: readonly OmniViewImagePermission[];
  requiresTapApproval: true;
  runtimeEntry: {
    port: "BaseToolExecutorPort.omni.transformMedia";
    operation: "omni.viewImage.prepareImageInput";
    runtimeOwnsMaterial: true;
    baseToolOwnsProviderBodyLowering: false;
  };
  viewEnvelope: {
    resource: "image";
    opened: false;
    metadataOnly: boolean;
    detail: OmniViewImageDetail;
    artifactId?: string;
    mimeType?: string;
  };
  providerMetadata?: Readonly<Record<string, unknown>>;
};

export type OmniViewImageResult =
  | {
      ok: true;
      toolId: "omni.viewImage";
      output: OmniViewImageOutput;
      audit: readonly OmniViewImageAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "omni.viewImage";
      error: OmniViewImageError;
      audit: readonly OmniViewImageAuditEvent[];
      events: readonly string[];
    };

export const omniViewImageDescriptor = {
  toolId: "omni.viewImage",
  capability: "view-image",
  route: "agent_executionEngine.basic_toolLayer.baseTools.omniBase.imageTransformer",
  defaultDryRun: true,
  tapOwnsApproval: true,
  permissionsRequired: ["filesystem:read", "omni:image:view"],
  runtimeEntry: "BaseToolExecutorPort.omni.transformMedia",
} as const;

const validMediaTypes = new Set<OmniViewImageMediaType>(["image/png", "image/jpeg", "image/webp", "image/gif", "unknown"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function cleanStringList(value: unknown): readonly string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return undefined;
  const cleaned: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") return undefined;
    const text = item.trim();
    if (text.length > 0 && !cleaned.includes(text)) cleaned.push(text);
  }
  return cleaned;
}

function cleanPermissionList(value: unknown): readonly OmniViewImagePermission[] | undefined {
  const cleaned = cleanStringList(value);
  if (cleaned === undefined) return undefined;
  if (cleaned.some((item) => item !== "filesystem:read" && item !== "omni:image:view")) return undefined;
  return cleaned as readonly OmniViewImagePermission[];
}

function cleanGate(value: unknown): OmniViewImageGate | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return undefined;
  const gate: OmniViewImageGate = {};
  if (typeof value.accepted === "boolean") gate.accepted = value.accepted;
  if (typeof value.allowed === "boolean") gate.allowed = value.allowed;
  if (typeof value.reason === "string" && value.reason.trim().length > 0) gate.reason = value.reason.trim();
  return gate;
}

function cleanAuditMetadata(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return isRecord(value) ? value : undefined;
}

function normalizeContext(value: unknown): OmniViewImageContext | OmniViewImageResult {
  if (value === undefined) return {};
  if (!isRecord(value)) return failure("INVALID_CONTEXT", "omni.viewImage context must be an object", "input", undefined);

  const allowedImageRoots = cleanStringList(value.allowedImageRoots);
  const grantedPermissions = cleanPermissionList(value.grantedPermissions);
  const requestedScopes = cleanStringList(value.requestedScopes);
  const allowedScopes = cleanStringList(value.allowedScopes);
  const contract = cleanGate(value.contract);
  const governance = cleanGate(value.governance);
  const guard = cleanGate(value.guard);

  if (
    (value.allowedImageRoots !== undefined && allowedImageRoots === undefined) ||
    (value.grantedPermissions !== undefined && grantedPermissions === undefined) ||
    (value.requestedScopes !== undefined && requestedScopes === undefined) ||
    (value.allowedScopes !== undefined && allowedScopes === undefined) ||
    (value.contract !== undefined && contract === undefined) ||
    (value.governance !== undefined && governance === undefined) ||
    (value.guard !== undefined && guard === undefined) ||
    (value.dryRun !== undefined && typeof value.dryRun !== "boolean")
  ) {
    return failure("INVALID_CONTEXT", "omni.viewImage context contains malformed governance or scope fields", "input", undefined);
  }

  return {
    runtimeId: cleanString(value.runtimeId),
    sessionId: cleanString(value.sessionId),
    invocationId: cleanString(value.invocationId),
    dryRun: typeof value.dryRun === "boolean" ? value.dryRun : undefined,
    guard,
    allowedImageRoots,
    grantedPermissions,
    requestedScopes,
    allowedScopes,
    contract,
    governance,
    auditMetadata: cleanAuditMetadata(value.auditMetadata),
  };
}

function normalizePath(value: unknown): string | undefined {
  const raw = cleanString(value);
  if (raw === undefined || raw.includes("\0")) return undefined;

  const absolute = raw.startsWith("/") || /^[A-Za-z]:[\\/]/.test(raw);
  const normalized = raw.replaceAll("\\", "/").replace(/\/+/g, "/");
  const parts = normalized.split("/").filter((part) => part.length > 0 && part !== ".");
  if (parts.some((part) => part === "..")) return undefined;

  return `${absolute ? "/" : ""}${parts.join("/")}`;
}

function normalizeRoot(root: string): string {
  const normalized = normalizePath(root) ?? root.trim().replaceAll("\\", "/");
  return normalized === "/" ? normalized : normalized.replace(/\/+$/, "");
}

function normalizeDetail(value: unknown, context: OmniViewImageContext, targetLabel: string): OmniViewImageDetail | OmniViewImageResult {
  if (value === undefined || value === "") return "high";
  if (value === "low" || value === "high" || value === "original") return value;
  return failure("INVALID_DETAIL", "omni.viewImage detail must be low, high, or original", "input", context, targetLabel);
}

function normalizeMaxBytes(value: unknown, context: OmniViewImageContext, targetLabel: string): number | undefined | OmniViewImageResult {
  if (value === undefined) return undefined;
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  return failure("INVALID_MAX_BYTES", "omni.viewImage maxBytes must be a positive integer", "input", context, targetLabel);
}

function normalizeMediaType(value: unknown, context: OmniViewImageContext, targetLabel: string): OmniViewImageMediaType | OmniViewImageResult {
  if (value === undefined || value === "") return "unknown";
  if (typeof value === "string" && validMediaTypes.has(value as OmniViewImageMediaType)) return value as OmniViewImageMediaType;
  return failure("INVALID_MEDIA_TYPE", "omni.viewImage mediaType is not supported by the base primitive", "input", context, targetLabel);
}

function normalizeTarget(value: unknown, context: OmniViewImageContext): OmniViewImageTarget | OmniViewImageResult {
  if (value === undefined) {
    return failure("MISSING_IMAGE_TARGET", "omni.viewImage requires target.imagePath or target.imageRef", "input", context);
  }
  if (!isRecord(value)) return failure("INVALID_TARGET", "omni.viewImage target must be an object", "input", context);

  const imagePath = normalizePath(value.imagePath);
  const imageRef = cleanString(value.imageRef);
  const targetLabel = imagePath ?? imageRef;
  if (targetLabel === undefined) {
    return failure("MISSING_IMAGE_TARGET", "omni.viewImage requires target.imagePath or target.imageRef", "input", context);
  }

  const detail = normalizeDetail(value.detail, context, targetLabel);
  if (typeof detail !== "string") return detail;

  const maxBytes = normalizeMaxBytes(value.maxBytes, context, targetLabel);
  if (typeof maxBytes === "object") return maxBytes;

  const mediaType = normalizeMediaType(value.mediaType, context, targetLabel);
  if (typeof mediaType !== "string") return mediaType;

  return { imagePath, imageRef, mediaType, detail, maxBytes };
}

function invocationId(context: OmniViewImageContext | undefined): string {
  return context?.invocationId ?? "omni.viewImage:dry-run";
}

function auditEvent(
  type: string,
  context: OmniViewImageContext | undefined,
  target?: Pick<OmniViewImageTarget, "imagePath" | "imageRef">,
  metadata?: Readonly<Record<string, unknown>>,
): OmniViewImageAuditEvent {
  return {
    type,
    toolId: omniViewImageDescriptor.toolId,
    invocationId: invocationId(context),
    dryRun: context?.dryRun !== false,
    imagePath: target?.imagePath,
    imageRef: target?.imageRef,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: OmniViewImageErrorCode,
  message: string,
  boundary: OmniViewImageBoundary,
  context: OmniViewImageContext | undefined,
  target?: string | Pick<OmniViewImageTarget, "imagePath" | "imageRef">,
): OmniViewImageResult {
  const eventTarget = typeof target === "string" ? { imagePath: target } : target;
  return {
    ok: false,
    toolId: omniViewImageDescriptor.toolId,
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("agentCore.basicTool.omni.viewImage.rejected", context, eventTarget, { code })],
    events: ["basicTool.omni.viewImage.rejected"],
  };
}

function ensurePathInRoots(target: OmniViewImageTarget, context: OmniViewImageContext): OmniViewImageResult | undefined {
  if (target.imagePath === undefined) return undefined;
  const roots = (context.allowedImageRoots ?? []).map(normalizeRoot);
  if (roots.length === 0) return undefined;

  const allowed = roots.some((root) => target.imagePath === root || target.imagePath?.startsWith(`${root}/`));
  if (allowed) return undefined;

  return failure(
    "IMAGE_PATH_OUT_OF_SCOPE",
    "omni.viewImage imagePath must stay inside the declared image roots",
    "scope",
    context,
    target,
  );
}

function ensurePermissions(target: OmniViewImageTarget, context: OmniViewImageContext): OmniViewImageResult | undefined {
  const granted = context.grantedPermissions ?? [];
  if (granted.length === 0) return undefined;

  const missing = omniViewImageDescriptor.permissionsRequired.filter((permission) => !granted.includes(permission));
  if (missing.length === 0) return undefined;

  return failure("PERMISSION_DENIED", `omni.viewImage is missing permission: ${missing[0]}`, "permission", context, target);
}

function ensureScopes(target: OmniViewImageTarget, context: OmniViewImageContext): OmniViewImageResult | undefined {
  const requested = context.requestedScopes ?? [];
  const allowed = context.allowedScopes ?? [];
  if (requested.length === 0) return undefined;

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length === 0) return undefined;

  return failure("SCOPE_DENIED", `omni.viewImage scope ${denied[0]} is outside runtime governance`, "scope", context, target);
}

function ensureStaticGates(target: OmniViewImageTarget, context: OmniViewImageContext): OmniViewImageResult | undefined {
  if (context.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      context.contract.reason ?? "omni.viewImage was rejected by runtime contract surface",
      "contract",
      context,
      target,
    );
  }

  if (context.governance?.accepted === false || context.governance?.allowed === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      context.governance.reason ?? "omni.viewImage was rejected by runtime governance",
      "governance",
      context,
      target,
    );
  }

  return undefined;
}

function ensureRealExecutionGuard(target: OmniViewImageTarget, context: OmniViewImageContext): OmniViewImageResult | undefined {
  if (context.dryRun !== false) return undefined;
  if (context.guard?.accepted === true || context.guard?.allowed === true) return undefined;
  return failure(
    "GOVERNANCE_REJECTED",
    context.guard?.reason ?? "omni.viewImage dryRun:false requires an affirmative runtime guard",
    "governance",
    context,
    target,
  );
}

function baseOutput(target: OmniViewImageTarget, dryRun: boolean, providerCalled: boolean): Omit<OmniViewImageOutput, "viewEnvelope"> {
  return {
    kind: "agentCore.basicTool.omni.viewImage",
    target,
    dispatch: dryRun ? "dry-run" : "runtime-omni",
    dryRun,
    providerCalled,
    executionBlocked: dryRun,
    unsafeSideEffects: false,
    permissionsRequired: omniViewImageDescriptor.permissionsRequired,
    requiresTapApproval: true,
    runtimeEntry: {
      port: "BaseToolExecutorPort.omni.transformMedia",
      operation: "omni.viewImage.prepareImageInput",
      runtimeOwnsMaterial: true,
      baseToolOwnsProviderBodyLowering: false,
    },
  };
}

function normalizeProviderResult(value: unknown, context: OmniViewImageContext, target: OmniViewImageTarget): OmniViewImageProviderResult | OmniViewImageResult {
  if (!isRecord(value) || typeof value.artifactId !== "string" || value.artifactId.trim().length === 0) {
    return failure(
      "PROVIDER_REJECTED",
      "omni.viewImage runtime provider returned a malformed public-safe image envelope",
      "provider",
      context,
      target,
    );
  }

  return {
    artifactId: value.artifactId.trim(),
    mimeType: typeof value.mimeType === "string" && value.mimeType.trim().length > 0 ? value.mimeType.trim() : undefined,
    metadata: isRecord(value.metadata) ? value.metadata : undefined,
  };
}

function normalizeRequest(request: unknown): { target: OmniViewImageTarget; context: OmniViewImageContext; provider?: OmniViewImageProvider } | OmniViewImageResult {
  if (request === undefined) request = {};
  if (!isRecord(request)) return failure("INVALID_REQUEST", "omni.viewImage request must be an object", "input", undefined);

  const context = normalizeContext(request.context);
  if ("ok" in context) return context;

  const target = normalizeTarget(request.target, context);
  if ("ok" in target) return target;

  const scoped = ensurePathInRoots(target, context);
  if (scoped !== undefined) return scoped;

  const permissions = ensurePermissions(target, context);
  if (permissions !== undefined) return permissions;

  const scopes = ensureScopes(target, context);
  if (scopes !== undefined) return scopes;

  const staticGates = ensureStaticGates(target, context);
  if (staticGates !== undefined) return staticGates;

  const realGuard = ensureRealExecutionGuard(target, context);
  if (realGuard !== undefined) return realGuard;

  const provider = typeof request.provider === "function" ? (request.provider as OmniViewImageProvider) : undefined;
  return { target, context, provider };
}

export async function executeOmniViewImage(request: unknown = {}): Promise<OmniViewImageResult> {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) return normalized;

  const { target, context, provider } = normalized;
  const dryRun = context.dryRun !== false;
  if (dryRun) {
    return {
      ok: true,
      toolId: omniViewImageDescriptor.toolId,
      output: {
        ...baseOutput(target, true, false),
        viewEnvelope: {
          resource: "image",
          opened: false,
          metadataOnly: true,
          detail: target.detail,
        },
      },
      audit: [
        auditEvent("agentCore.basicTool.omni.viewImage.dryRun", context, target, {
          mediaType: target.mediaType,
          detail: target.detail,
          maxBytes: target.maxBytes,
        }),
      ],
      events: ["basicTool.omni.viewImage.dryRun"],
    };
  }

  if (provider === undefined) {
    return failure(
      "PROVIDER_UNAVAILABLE",
      "omni.viewImage live invocation requires an injected runtime omni provider",
      "provider",
      context,
      target,
    );
  }

  try {
    const providerResult = normalizeProviderResult(
      await provider({
        operation: "omni.viewImage.prepareImageInput",
        target,
        context: {
          runtimeId: context.runtimeId,
          sessionId: context.sessionId,
          invocationId: context.invocationId,
          auditMetadata: context.auditMetadata,
        },
      }),
      context,
      target,
    );
    if ("ok" in providerResult) return providerResult;

    return {
      ok: true,
      toolId: omniViewImageDescriptor.toolId,
      output: {
        ...baseOutput(target, false, true),
        viewEnvelope: {
          resource: "image",
          opened: false,
          metadataOnly: false,
          detail: target.detail,
          artifactId: providerResult.artifactId,
          mimeType: providerResult.mimeType,
        },
        providerMetadata: providerResult.metadata,
      },
      audit: [
        auditEvent("agentCore.basicTool.omni.viewImage.runtimeProvider", context, target, {
          artifactId: providerResult.artifactId,
          mimeType: providerResult.mimeType,
        }),
      ],
      events: ["basicTool.omni.viewImage.runtimeProvider"],
    };
  } catch (error) {
    const rawCode = typeof error === "object" && error !== null && "code" in error ? (error as { code?: unknown }).code : undefined;
    const providerCode = rawCode === "PROVIDER_UNAVAILABLE" ? "PROVIDER_UNAVAILABLE" : "PROVIDER_REJECTED";
    const providerMessage = rawCode === providerCode && error instanceof Error && error.message.trim().length > 0
      ? error.message
      : "omni.viewImage runtime provider failed before returning a public-safe image envelope";
    return failure(
      providerCode,
      providerMessage,
      "provider",
      context,
      target,
    );
  }
}

export function planOmniViewImage(request: unknown = {}): Promise<OmniViewImageResult> {
  return executeOmniViewImage(request);
}
