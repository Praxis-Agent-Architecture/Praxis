/*
 * 文件定位：Agent 执行引擎 / 输入输出收发层 / 输出暴露面。
 * 核心目的：暴露视频输出能力，让 Agent 可以返回视频生成、视频剪辑、视频理解结果或视频引用。
 * 能力要求1：需要保留视频格式、时长、来源和可展示元信息。
 * 能力要求2：不直接实现视频算法，只定义执行引擎的视频输出能力位点。
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

export type VideoOutputKind = "generated-video" | "edited-video" | "video-understanding" | "video-reference";

export type VideoOutputPayload = {
  kind: VideoOutputKind;
  mimeType?: string;
  displayRef?: string;
  durationMs?: number;
  width?: number;
  height?: number;
  summary?: string;
};

export type VideoOutputExposureRequest = OutputExposureRequestBase & {
  kind?: VideoOutputKind;
  mimeType?: string;
  displayRef?: string;
  durationMs?: number;
  width?: number;
  height?: number;
  summary?: string;
};

export type VideoOutputExposureResult = OutputExposureResult<"video", VideoOutputPayload>;

function normalizeVideoPayload(request: VideoOutputExposureRequest): VideoOutputPayload | undefined {
  const displayRef = request.displayRef?.trim();
  const mimeType = request.mimeType?.trim();
  const summary = request.summary?.trim();

  if (!hasOutputText(displayRef) && !hasOutputText(summary)) {
    return undefined;
  }

  return {
    kind: request.kind ?? (hasOutputText(summary) && !hasOutputText(displayRef) ? "video-understanding" : "video-reference"),
    mimeType: hasOutputText(mimeType) ? mimeType : undefined,
    displayRef: hasOutputText(displayRef) ? displayRef : undefined,
    durationMs: request.durationMs,
    width: request.width,
    height: request.height,
    summary: hasOutputText(summary) ? summary : undefined,
  };
}

function hasInvalidVideoMetadata(payload: VideoOutputPayload): boolean {
  return (
    (payload.durationMs !== undefined && (!Number.isFinite(payload.durationMs) || payload.durationMs < 0)) ||
    (payload.width !== undefined && (!Number.isInteger(payload.width) || payload.width <= 0)) ||
    (payload.height !== undefined && (!Number.isInteger(payload.height) || payload.height <= 0))
  );
}

export function exposeVideoOutput(request?: VideoOutputExposureRequest): VideoOutputExposureResult {
  const baseFailure = validateOutputExposureBase<"video", VideoOutputPayload>(request, "video");
  if (baseFailure !== undefined) {
    return baseFailure;
  }

  const safeRequest = request as VideoOutputExposureRequest;
  const payload = normalizeVideoPayload(safeRequest);
  if (payload === undefined) {
    return rejectOutputExposure(
      "MISSING_PAYLOAD",
      "video output exposure requires a display reference or summary",
      "input",
      "video",
    );
  }

  if (hasInvalidVideoMetadata(payload)) {
    return rejectOutputExposure("INVALID_PAYLOAD", "video output metadata must use positive finite values", "input", "video");
  }

  return {
    ok: true,
    exposed: createOutputExposureEnvelope(safeRequest, "video", payload),
    events: ["output.video.exposure.ready"],
  };
}
