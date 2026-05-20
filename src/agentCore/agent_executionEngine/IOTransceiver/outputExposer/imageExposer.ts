/*
 * 文件定位：Agent 执行引擎 / 输入输出收发层 / 输出暴露面。
 * 核心目的：暴露图像输出能力，让 Agent 可以返回生成图、编辑图、截图标注或视觉分析结果。
 * 能力要求1：需要保留图像格式、尺寸、来源和可展示引用。
 * 能力要求2：不直接承担图像生成算法，只负责执行引擎输出面。
 * 边界：只服务 agentCore 内核，不写上层产品逻辑。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import {
  createOutputExposureEnvelope,
  hasOutputText,
  rejectOutputExposure,
  validateOutputExposureBase,
  type OutputExposureRequestBase,
  type OutputExposureResult,
} from "./textExposer.js";

export type ImageOutputKind = "generated-image" | "edited-image" | "screenshot-annotation" | "vision-analysis";

export type ImageOutputPayload = {
  kind: ImageOutputKind;
  format?: string;
  displayRef?: string;
  width?: number;
  height?: number;
  altText?: string;
  analysis?: string;
};

export type ImageOutputExposureRequest = OutputExposureRequestBase & {
  kind?: ImageOutputKind;
  format?: string;
  displayRef?: string;
  width?: number;
  height?: number;
  altText?: string;
  analysis?: string;
};

export type ImageOutputExposureResult = OutputExposureResult<"image", ImageOutputPayload>;

function normalizeImagePayload(request: ImageOutputExposureRequest): ImageOutputPayload | undefined {
  const displayRef = request.displayRef?.trim();
  const format = request.format?.trim();
  const altText = request.altText?.trim();
  const analysis = request.analysis?.trim();

  if (!hasOutputText(displayRef) && !hasOutputText(analysis)) {
    return undefined;
  }

  return {
    kind:
      request.kind ??
      (hasOutputText(analysis) && !hasOutputText(displayRef) ? "vision-analysis" : "generated-image"),
    format: hasOutputText(format) ? format : undefined,
    displayRef: hasOutputText(displayRef) ? displayRef : undefined,
    width: request.width,
    height: request.height,
    altText: hasOutputText(altText) ? altText : undefined,
    analysis: hasOutputText(analysis) ? analysis : undefined,
  };
}

function hasInvalidImageDimensions(payload: ImageOutputPayload): boolean {
  return (
    (payload.width !== undefined && (!Number.isInteger(payload.width) || payload.width <= 0)) ||
    (payload.height !== undefined && (!Number.isInteger(payload.height) || payload.height <= 0))
  );
}

export function exposeImageOutput(request?: ImageOutputExposureRequest): ImageOutputExposureResult {
  const baseFailure = validateOutputExposureBase<"image", ImageOutputPayload>(request, "image");
  if (baseFailure !== undefined) {
    return baseFailure;
  }

  const safeRequest = request as ImageOutputExposureRequest;
  const payload = normalizeImagePayload(safeRequest);
  if (payload === undefined) {
    return rejectOutputExposure(
      "MISSING_PAYLOAD",
      "image output exposure requires a display reference or analysis text",
      "input",
      "image",
    );
  }

  if (hasInvalidImageDimensions(payload)) {
    return rejectOutputExposure(
      "INVALID_PAYLOAD",
      "image output dimensions must be positive integers",
      "input",
      "image",
    );
  }

  return {
    ok: true,
    exposed: createOutputExposureEnvelope(safeRequest, "image", payload),
    events: ["output.image.exposure.ready"],
  };
}
