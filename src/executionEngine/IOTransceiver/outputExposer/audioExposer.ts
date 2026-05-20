/*
 * 文件定位：Agent 执行引擎 / 输入输出收发层 / 输出暴露面。
 * 核心目的：暴露音频输出能力，让 Agent 可以返回语音、音效、音频生成或转写结果。
 * 能力要求1：需要把执行结果整理成上层应用可接收的音频输出结构。
 * 能力要求2：需要支持普通输出、流式输出和后续多模态组合输出的边界。
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

export type AudioOutputKind = "speech" | "sound-effect" | "generated-audio" | "transcript";

export type AudioOutputPayload = {
  kind: AudioOutputKind;
  mimeType?: string;
  reference?: string;
  bytes?: Uint8Array;
  transcript?: string;
  durationMs?: number;
  sampleRateHz?: number;
};

export type AudioOutputExposureRequest = OutputExposureRequestBase & {
  kind?: AudioOutputKind;
  mimeType?: string;
  reference?: string;
  bytes?: Uint8Array;
  transcript?: string;
  durationMs?: number;
  sampleRateHz?: number;
};

export type AudioOutputExposureResult = OutputExposureResult<"audio", AudioOutputPayload>;

function normalizeAudioPayload(request: AudioOutputExposureRequest): AudioOutputPayload | undefined {
  const reference = request.reference?.trim();
  const transcript = request.transcript?.trim();
  const mimeType = request.mimeType?.trim();
  const hasBytes = request.bytes !== undefined && request.bytes.byteLength > 0;

  if (!hasOutputText(reference) && !hasBytes && !hasOutputText(transcript)) {
    return undefined;
  }

  return {
    kind:
      request.kind ??
      (hasOutputText(transcript) && !hasBytes && !hasOutputText(reference)
        ? "transcript"
        : "generated-audio"),
    mimeType: hasOutputText(mimeType) ? mimeType : undefined,
    reference: hasOutputText(reference) ? reference : undefined,
    bytes: request.bytes,
    transcript: hasOutputText(transcript) ? transcript : undefined,
    durationMs: request.durationMs,
    sampleRateHz: request.sampleRateHz,
  };
}

function hasInvalidAudioNumbers(payload: AudioOutputPayload): boolean {
  return (
    (payload.durationMs !== undefined && (!Number.isFinite(payload.durationMs) || payload.durationMs < 0)) ||
    (payload.sampleRateHz !== undefined && (!Number.isFinite(payload.sampleRateHz) || payload.sampleRateHz <= 0))
  );
}

export function exposeAudioOutput(request?: AudioOutputExposureRequest): AudioOutputExposureResult {
  const baseFailure = validateOutputExposureBase<"audio", AudioOutputPayload>(request, "audio");
  if (baseFailure !== undefined) {
    return baseFailure;
  }

  const safeRequest = request as AudioOutputExposureRequest;
  const payload = normalizeAudioPayload(safeRequest);
  if (payload === undefined) {
    return rejectOutputExposure(
      "MISSING_PAYLOAD",
      "audio output exposure requires an audio reference, bytes, or transcript",
      "input",
      "audio",
    );
  }

  if (hasInvalidAudioNumbers(payload)) {
    return rejectOutputExposure(
      "INVALID_PAYLOAD",
      "audio output metadata must use positive finite values",
      "input",
      "audio",
    );
  }

  return {
    ok: true,
    exposed: createOutputExposureEnvelope(safeRequest, "audio", payload),
    events: ["output.audio.exposure.ready"],
  };
}
