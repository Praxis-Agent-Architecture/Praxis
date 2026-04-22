/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 多模态基础工具 / 图像转换工具。
 * 核心目的：提供 多模态基础工具 / 图像转换工具 中的“生成图像”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type GenerateImageBoundary = "input" | "contract" | "governance" | "scope" | "resource";

export type GenerateImageGate = {
  accepted: boolean;
  reason?: string;
};

export type GenerateImageOutputFormat = "png" | "jpeg" | "webp";

export type GenerateImageRequest = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  prompt?: string;
  negativePrompt?: string;
  outputFormat?: GenerateImageOutputFormat;
  imageCount?: number;
  maxImages?: number;
  providerHint?: string;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  dryRun?: boolean;
  contract?: GenerateImageGate;
  governance?: GenerateImageGate;
  metadata?: Readonly<Record<string, unknown>>;
};

export type GenerateImageErrorCode =
  | "MISSING_PROMPT"
  | "INVALID_IMAGE_COUNT"
  | "IMAGE_COUNT_LIMIT_EXCEEDED"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "REAL_SIDE_EFFECT_NOT_ALLOWED";

export type GenerateImageError = {
  code: GenerateImageErrorCode;
  message: string;
  boundary: GenerateImageBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type GenerateImagePlan = {
  tool: "omni.generateImage";
  capability: "generate-image";
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  promptCharacters: number;
  negativePromptCharacters: number;
  outputFormat: GenerateImageOutputFormat;
  imageCount: number;
  providerHint?: string;
  requiredPermission: "omni:image:generate";
  requiresTapApproval: true;
  dispatch: "dry-run";
  dryRun: true;
  wouldRequestGeneration: true;
  unsafeSideEffects: false;
  acceptedScopes: readonly string[];
  audit: {
    guard: "image-generation-prompt-governance-and-dry-run";
    event: "basicTool.omni.generateImage.planned";
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type GenerateImageResult =
  | {
      ok: true;
      plan: GenerateImagePlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: GenerateImageError;
      events: readonly string[];
    };

export const generateImageDescriptor = {
  tool: "omni.generateImage",
  capability: "generate-image",
  layer: "agent_executionEngine.basic_toolLayer.baseTools.omniBase.imageTransformer",
  defaultDispatch: "dry-run",
  requiresTapApproval: true,
  unsafeSideEffects: false,
} as const;

const defaultMaxImages = 4;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(
  code: GenerateImageErrorCode,
  message: string,
  boundary: GenerateImageBoundary,
): GenerateImageResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["basicTool.omni.generateImage.rejected"],
  };
}

function resolveScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): string[] | GenerateImageResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);

  if (requested.length === 0) {
    return [];
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure("SCOPE_DENIED", `omni.generateImage scope ${denied[0]} is outside runtime governance`, "scope");
  }

  return requested;
}

export function planGenerateImage(request: GenerateImageRequest = {}): GenerateImageResult {
  if (isBlank(request.prompt)) {
    return failure("MISSING_PROMPT", "omni.generateImage requires a non-empty prompt", "input");
  }

  const imageCount = request.imageCount ?? 1;
  if (!Number.isInteger(imageCount) || imageCount < 1) {
    return failure("INVALID_IMAGE_COUNT", "omni.generateImage imageCount must be a positive integer", "input");
  }

  const maxImages = request.maxImages ?? defaultMaxImages;
  if (!Number.isInteger(maxImages) || maxImages < 1 || imageCount > maxImages) {
    return failure("IMAGE_COUNT_LIMIT_EXCEEDED", "omni.generateImage imageCount exceeds the resource boundary", "resource");
  }

  if (request.dryRun === false) {
    return failure(
      "REAL_SIDE_EFFECT_NOT_ALLOWED",
      "first-round omni.generateImage only returns a dry-run generation plan",
      "governance",
    );
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "omni.generateImage was rejected by runtime contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "omni.generateImage was rejected by runtime governance",
      "governance",
    );
  }

  const acceptedScopes = resolveScopes(request.requestedScopes, request.allowedScopes);
  if (!Array.isArray(acceptedScopes)) {
    return acceptedScopes;
  }

  const prompt = request.prompt ?? "";
  const negativePrompt = request.negativePrompt ?? "";

  return {
    ok: true,
    plan: {
      tool: "omni.generateImage",
      capability: "generate-image",
      runtimeId: request.runtimeId?.trim() || undefined,
      sessionId: request.sessionId?.trim() || undefined,
      invocationId: request.invocationId?.trim() || undefined,
      promptCharacters: prompt.trim().length,
      negativePromptCharacters: negativePrompt.trim().length,
      outputFormat: request.outputFormat ?? "png",
      imageCount,
      providerHint: request.providerHint?.trim() || undefined,
      requiredPermission: "omni:image:generate",
      requiresTapApproval: true,
      dispatch: "dry-run",
      dryRun: true,
      wouldRequestGeneration: true,
      unsafeSideEffects: false,
      acceptedScopes,
      audit: {
        guard: "image-generation-prompt-governance-and-dry-run",
        event: "basicTool.omni.generateImage.planned",
        metadata: request.metadata ?? {},
      },
    },
    events: ["basicTool.omni.generateImage.planned"],
  };
}
