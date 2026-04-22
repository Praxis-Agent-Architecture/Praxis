/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 多模态基础工具 / 图像转换工具。
 * 核心目的：提供 多模态基础工具 / 图像转换工具 中的“压缩图像”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type ImageCompressorBoundary = "input" | "contract" | "governance" | "scope" | "resource";

export type ImageCompressorGate = {
  accepted: boolean;
  reason?: string;
};

export type ImageCompressionStrategy = "balanced" | "size-first" | "quality-first";

export type ImageCompressorRequest = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  imageRef?: string;
  outputRef?: string;
  quality?: number;
  maxOutputBytes?: number;
  strategy?: ImageCompressionStrategy;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  dryRun?: boolean;
  contract?: ImageCompressorGate;
  governance?: ImageCompressorGate;
  metadata?: Readonly<Record<string, unknown>>;
};

export type ImageCompressorErrorCode =
  | "MISSING_IMAGE_REF"
  | "INVALID_QUALITY"
  | "INVALID_OUTPUT_LIMIT"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "REAL_SIDE_EFFECT_NOT_ALLOWED";

export type ImageCompressorError = {
  code: ImageCompressorErrorCode;
  message: string;
  boundary: ImageCompressorBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type ImageCompressionPlan = {
  tool: "omni.imageCompressor";
  capability: "compress-image";
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  imageRef: string;
  outputRef?: string;
  quality: number;
  maxOutputBytes?: number;
  strategy: ImageCompressionStrategy;
  requiredPermission: "omni:image:transform";
  requiresTapApproval: true;
  dispatch: "dry-run";
  dryRun: true;
  wouldCompress: true;
  unsafeSideEffects: false;
  acceptedScopes: readonly string[];
  audit: {
    guard: "image-compression-resource-scope-and-dry-run";
    event: "basicTool.omni.imageCompressor.planned";
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type ImageCompressorResult =
  | {
      ok: true;
      plan: ImageCompressionPlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: ImageCompressorError;
      events: readonly string[];
    };

export const imageCompressorDescriptor = {
  tool: "omni.imageCompressor",
  capability: "compress-image",
  layer: "agent_executionEngine.basic_toolLayer.baseTools.omniBase.imageTransformer",
  defaultDispatch: "dry-run",
  requiresTapApproval: true,
  unsafeSideEffects: false,
} as const;

const defaultQuality = 82;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(
  code: ImageCompressorErrorCode,
  message: string,
  boundary: ImageCompressorBoundary,
): ImageCompressorResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["basicTool.omni.imageCompressor.rejected"],
  };
}

function resolveScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): string[] | ImageCompressorResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);

  if (requested.length === 0) {
    return [];
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure("SCOPE_DENIED", `omni.imageCompressor scope ${denied[0]} is outside runtime governance`, "scope");
  }

  return requested;
}

export function planImageCompression(request: ImageCompressorRequest = {}): ImageCompressorResult {
  if (isBlank(request.imageRef)) {
    return failure("MISSING_IMAGE_REF", "omni.imageCompressor requires an imageRef to compress", "input");
  }

  const quality = request.quality ?? defaultQuality;
  if (!Number.isFinite(quality) || quality < 1 || quality > 100) {
    return failure("INVALID_QUALITY", "omni.imageCompressor quality must stay between 1 and 100", "resource");
  }

  if (
    request.maxOutputBytes !== undefined &&
    (!Number.isInteger(request.maxOutputBytes) || request.maxOutputBytes < 1)
  ) {
    return failure("INVALID_OUTPUT_LIMIT", "omni.imageCompressor maxOutputBytes must be a positive integer", "resource");
  }

  if (request.dryRun === false) {
    return failure(
      "REAL_SIDE_EFFECT_NOT_ALLOWED",
      "first-round omni.imageCompressor only returns a dry-run compression plan",
      "governance",
    );
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "omni.imageCompressor was rejected by runtime contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "omni.imageCompressor was rejected by runtime governance",
      "governance",
    );
  }

  const acceptedScopes = resolveScopes(request.requestedScopes, request.allowedScopes);
  if (!Array.isArray(acceptedScopes)) {
    return acceptedScopes;
  }

  return {
    ok: true,
    plan: {
      tool: "omni.imageCompressor",
      capability: "compress-image",
      runtimeId: request.runtimeId?.trim() || undefined,
      sessionId: request.sessionId?.trim() || undefined,
      invocationId: request.invocationId?.trim() || undefined,
      imageRef: request.imageRef?.trim() ?? "",
      outputRef: request.outputRef?.trim() || undefined,
      quality,
      maxOutputBytes: request.maxOutputBytes,
      strategy: request.strategy ?? "balanced",
      requiredPermission: "omni:image:transform",
      requiresTapApproval: true,
      dispatch: "dry-run",
      dryRun: true,
      wouldCompress: true,
      unsafeSideEffects: false,
      acceptedScopes,
      audit: {
        guard: "image-compression-resource-scope-and-dry-run",
        event: "basicTool.omni.imageCompressor.planned",
        metadata: request.metadata ?? {},
      },
    },
    events: ["basicTool.omni.imageCompressor.planned"],
  };
}
