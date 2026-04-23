/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 多模态基础工具 / 图像转换工具。
 * 核心目的：提供 多模态基础工具 / 图像转换工具 中的“转换图像格式”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type ImageFormatConversionBoundary = "input" | "contract" | "governance" | "scope";

export type ImageFormatConversionGate = {
  accepted: boolean;
  reason?: string;
};

export type ImageFormat = "png" | "jpeg" | "webp" | "avif" | "gif";

export type ImageFormatConversionRequest = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  imageRef?: string;
  targetFormat?: ImageFormat;
  outputRef?: string;
  preserveMetadata?: boolean;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  dryRun?: boolean;
  contract?: ImageFormatConversionGate;
  governance?: ImageFormatConversionGate;
  metadata?: Readonly<Record<string, unknown>>;
};

export type ImageFormatConversionErrorCode =
  | "MISSING_IMAGE_REF"
  | "MISSING_TARGET_FORMAT"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "REAL_SIDE_EFFECT_NOT_ALLOWED";

export type ImageFormatConversionError = {
  code: ImageFormatConversionErrorCode;
  message: string;
  boundary: ImageFormatConversionBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type ImageFormatConversionPlan = {
  tool: "omni.imageFormatConversion";
  capability: "convert-image-format";
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  imageRef: string;
  targetFormat: ImageFormat;
  outputRef?: string;
  preserveMetadata: boolean;
  requiredPermission: "omni:image:transform";
  requiresTapApproval: true;
  dispatch: "dry-run";
  dryRun: true;
  wouldConvert: true;
  unsafeSideEffects: false;
  acceptedScopes: readonly string[];
  audit: {
    guard: "image-format-target-scope-and-dry-run";
    event: "basicTool.omni.imageFormatConversion.planned";
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type ImageFormatConversionResult =
  | {
      ok: true;
      plan: ImageFormatConversionPlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: ImageFormatConversionError;
      events: readonly string[];
    };

export const imageFormatConversionDescriptor = {
  tool: "omni.imageFormatConversion",
  capability: "convert-image-format",
  layer: "agent_executionEngine.basic_toolLayer.baseTools.omniBase.imageTransformer",
  defaultDispatch: "dry-run",
  requiresTapApproval: true,
  unsafeSideEffects: false,
} as const;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(
  code: ImageFormatConversionErrorCode,
  message: string,
  boundary: ImageFormatConversionBoundary,
): ImageFormatConversionResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["basicTool.omni.imageFormatConversion.rejected"],
  };
}

function resolveScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): string[] | ImageFormatConversionResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);

  if (requested.length === 0) {
    return [];
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure(
      "SCOPE_DENIED",
      `omni.imageFormatConversion scope ${denied[0]} is outside runtime governance`,
      "scope",
    );
  }

  return requested;
}

export function planImageFormatConversion(
  request: ImageFormatConversionRequest = {},
): ImageFormatConversionResult {
  if (isBlank(request.imageRef)) {
    return failure("MISSING_IMAGE_REF", "omni.imageFormatConversion requires an imageRef to convert", "input");
  }

  if (request.targetFormat === undefined) {
    return failure(
      "MISSING_TARGET_FORMAT",
      "omni.imageFormatConversion requires a targetFormat",
      "input",
    );
  }

  if (request.dryRun === false) {
    return failure(
      "REAL_SIDE_EFFECT_NOT_ALLOWED",
      "first-round omni.imageFormatConversion only returns a dry-run conversion plan",
      "governance",
    );
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "omni.imageFormatConversion was rejected by runtime contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "omni.imageFormatConversion was rejected by runtime governance",
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
      tool: "omni.imageFormatConversion",
      capability: "convert-image-format",
      runtimeId: request.runtimeId?.trim() || undefined,
      sessionId: request.sessionId?.trim() || undefined,
      invocationId: request.invocationId?.trim() || undefined,
      imageRef: request.imageRef?.trim() ?? "",
      targetFormat: request.targetFormat,
      outputRef: request.outputRef?.trim() || undefined,
      preserveMetadata: request.preserveMetadata ?? false,
      requiredPermission: "omni:image:transform",
      requiresTapApproval: true,
      dispatch: "dry-run",
      dryRun: true,
      wouldConvert: true,
      unsafeSideEffects: false,
      acceptedScopes,
      audit: {
        guard: "image-format-target-scope-and-dry-run",
        event: "basicTool.omni.imageFormatConversion.planned",
        metadata: request.metadata ?? {},
      },
    },
    events: ["basicTool.omni.imageFormatConversion.planned"],
  };
}
