/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 多模态基础工具 / 图像转换工具。
 * 核心目的：提供 多模态基础工具 / 图像转换工具 中的“查看图像”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type OmniViewImagePermission = "filesystem:read" | "omni:image:view";

export type OmniViewImageBoundary = "input" | "scope" | "permission" | "contract" | "governance";

export type OmniViewImageGate = {
  accepted: boolean;
  reason?: string;
};

export type OmniViewImageDetail = "low" | "high" | "original";

export type OmniViewImageTarget = {
  imagePath: string;
  mediaType?: "image/png" | "image/jpeg" | "image/webp" | "image/gif" | "unknown";
  detail?: OmniViewImageDetail;
  maxBytes?: number;
};

export type OmniViewImageContext = {
  invocationId?: string;
  dryRun?: boolean;
  allowedImageRoots?: readonly string[];
  grantedPermissions?: readonly OmniViewImagePermission[];
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  contract?: OmniViewImageGate;
  governance?: OmniViewImageGate;
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type OmniViewImageRequest = {
  target?: Partial<OmniViewImageTarget>;
  context?: OmniViewImageContext;
};

export type OmniViewImageErrorCode =
  | "MISSING_IMAGE_PATH"
  | "IMAGE_PATH_OUT_OF_SCOPE"
  | "INVALID_DETAIL"
  | "INVALID_MAX_BYTES"
  | "PERMISSION_DENIED"
  | "SCOPE_DENIED"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "REAL_EXECUTION_BLOCKED";

export type OmniViewImageError = {
  code: OmniViewImageErrorCode;
  message: string;
  boundary: OmniViewImageBoundary;
  publicSafe: true;
  internalDetailExposed: false;
};

export type OmniViewImageAuditEvent = {
  type: string;
  toolId: "omni.viewImage";
  invocationId: string;
  dryRun: true;
  imagePath?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type OmniViewImageOutput = {
  kind: "agentCore.basicTool.omni.viewImage";
  target: OmniViewImageTarget;
  dryRun: true;
  executionBlocked: true;
  unsafeSideEffects: false;
  permissionsRequired: readonly OmniViewImagePermission[];
  requiresTapApproval: true;
  viewEnvelope: {
    resource: "image";
    opened: false;
    metadataOnly: true;
    detail: OmniViewImageDetail;
  };
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
} as const;

function cleanList<T extends string>(values: readonly T[] | undefined): T[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean) as T[])];
}

function invocationId(context: OmniViewImageContext | undefined): string {
  return context?.invocationId?.trim() || "omni.viewImage:dry-run";
}

function auditEvent(
  type: string,
  context: OmniViewImageContext | undefined,
  imagePath?: string,
  metadata?: Readonly<Record<string, unknown>>,
): OmniViewImageAuditEvent {
  return {
    type,
    toolId: omniViewImageDescriptor.toolId,
    invocationId: invocationId(context),
    dryRun: true,
    imagePath,
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
  imagePath?: string,
): OmniViewImageResult {
  return {
    ok: false,
    toolId: omniViewImageDescriptor.toolId,
    error: { code, message, boundary, publicSafe: true, internalDetailExposed: false },
    audit: [auditEvent("agentCore.basicTool.omni.viewImage.rejected", context, imagePath, { code })],
    events: ["basicTool.omni.viewImage.rejected"],
  };
}

function normalizePath(value: string | undefined): string | undefined {
  const raw = value?.trim() ?? "";
  if (raw.length === 0 || raw.includes("\0")) {
    return undefined;
  }

  const absolute = raw.startsWith("/") || /^[A-Za-z]:[\\/]/.test(raw);
  const normalized = raw.replaceAll("\\", "/").replace(/\/+/g, "/");
  const parts = normalized.split("/").filter((part) => part.length > 0 && part !== ".");
  if (parts.some((part) => part === "..")) {
    return undefined;
  }

  return `${absolute ? "/" : ""}${parts.join("/")}`;
}

function normalizeRoot(root: string): string {
  const normalized = normalizePath(root) ?? root.trim().replaceAll("\\", "/");
  return normalized === "/" ? normalized : normalized.replace(/\/+$/, "");
}

function ensurePathInRoots(
  imagePath: string,
  context: OmniViewImageContext | undefined,
): OmniViewImageResult | undefined {
  const roots = cleanList(context?.allowedImageRoots).map(normalizeRoot);
  if (roots.length === 0) {
    return undefined;
  }

  const allowed = roots.some((root) => imagePath === root || imagePath.startsWith(`${root}/`));
  if (allowed) {
    return undefined;
  }

  return failure(
    "IMAGE_PATH_OUT_OF_SCOPE",
    "omni.viewImage imagePath must stay inside the declared image roots",
    "scope",
    context,
    imagePath,
  );
}

function ensurePermissions(
  imagePath: string,
  context: OmniViewImageContext | undefined,
): OmniViewImageResult | undefined {
  const granted = cleanList(context?.grantedPermissions);
  if (granted.length === 0) {
    return undefined;
  }

  const missing = omniViewImageDescriptor.permissionsRequired.filter((permission) => !granted.includes(permission));
  if (missing.length === 0) {
    return undefined;
  }

  return failure("PERMISSION_DENIED", `omni.viewImage is missing permission: ${missing[0]}`, "permission", context, imagePath);
}

function ensureScopes(imagePath: string, context: OmniViewImageContext | undefined): OmniViewImageResult | undefined {
  const requested = cleanList(context?.requestedScopes);
  const allowed = cleanList(context?.allowedScopes);
  const denied = requested.filter((scope) => !allowed.includes(scope));

  if (requested.length === 0 || denied.length === 0) {
    return undefined;
  }

  return failure("SCOPE_DENIED", `omni.viewImage scope ${denied[0]} is outside runtime governance`, "scope", context, imagePath);
}

function normalizeDetail(
  detail: string | undefined,
  context: OmniViewImageContext | undefined,
  imagePath: string,
): OmniViewImageDetail | OmniViewImageResult {
  if (detail === undefined || detail.trim() === "") {
    return "high";
  }

  if (detail === "low" || detail === "high" || detail === "original") {
    return detail;
  }

  return failure("INVALID_DETAIL", "omni.viewImage detail must be low, high, or original", "input", context, imagePath);
}

function normalizeMaxBytes(
  maxBytes: number | undefined,
  context: OmniViewImageContext | undefined,
  imagePath: string,
): number | undefined | OmniViewImageResult {
  if (maxBytes === undefined) {
    return undefined;
  }

  if (Number.isInteger(maxBytes) && maxBytes > 0) {
    return maxBytes;
  }

  return failure("INVALID_MAX_BYTES", "omni.viewImage maxBytes must be a positive integer", "input", context, imagePath);
}

function ensureGates(imagePath: string, context: OmniViewImageContext | undefined): OmniViewImageResult | undefined {
  if (context?.dryRun === false) {
    return failure(
      "REAL_EXECUTION_BLOCKED",
      "first-round omni.viewImage only returns a dry-run view envelope",
      "contract",
      context,
      imagePath,
    );
  }

  if (context?.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      context.contract.reason ?? "omni.viewImage was rejected by runtime contract surface",
      "contract",
      context,
      imagePath,
    );
  }

  if (context?.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      context.governance.reason ?? "omni.viewImage was rejected by runtime governance",
      "governance",
      context,
      imagePath,
    );
  }

  return undefined;
}

export function planOmniViewImage(request: OmniViewImageRequest = {}): OmniViewImageResult {
  const imagePath = normalizePath(request.target?.imagePath);
  if (imagePath === undefined) {
    return failure("MISSING_IMAGE_PATH", "omni.viewImage requires target.imagePath", "input", request.context);
  }

  const detail = normalizeDetail(request.target?.detail, request.context, imagePath);
  if (typeof detail !== "string") {
    return detail;
  }

  const maxBytes = normalizeMaxBytes(request.target?.maxBytes, request.context, imagePath);
  if (typeof maxBytes === "object") {
    return maxBytes;
  }

  const scoped = ensurePathInRoots(imagePath, request.context);
  if (scoped !== undefined) {
    return scoped;
  }

  const permissions = ensurePermissions(imagePath, request.context);
  if (permissions !== undefined) {
    return permissions;
  }

  const scopes = ensureScopes(imagePath, request.context);
  if (scopes !== undefined) {
    return scopes;
  }

  const gates = ensureGates(imagePath, request.context);
  if (gates !== undefined) {
    return gates;
  }

  const target: OmniViewImageTarget = {
    imagePath,
    mediaType: request.target?.mediaType ?? "unknown",
    detail,
    maxBytes,
  };

  return {
    ok: true,
    toolId: omniViewImageDescriptor.toolId,
    output: {
      kind: "agentCore.basicTool.omni.viewImage",
      target,
      dryRun: true,
      executionBlocked: true,
      unsafeSideEffects: false,
      permissionsRequired: omniViewImageDescriptor.permissionsRequired,
      requiresTapApproval: true,
      viewEnvelope: {
        resource: "image",
        opened: false,
        metadataOnly: true,
        detail,
      },
    },
    audit: [
      auditEvent("agentCore.basicTool.omni.viewImage.dryRun", request.context, imagePath, {
        mediaType: target.mediaType,
        detail,
        maxBytes,
      }),
    ],
    events: ["basicTool.omni.viewImage.dryRun"],
  };
}
