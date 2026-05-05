/*
 * 文件定位：Agent 执行引擎 / 输入输出收发层 / 输入接收面。
 * 核心目的：接收来自用户、应用或多模态链路的音频输入。
 * 能力要求1：需要把原始音频、引用地址或采样结果整理成执行引擎可消费的输入对象。
 * 能力要求2：需要保留输入来源、格式、时长、采样状态等后续模型调用可能需要的元信息。
 * 边界：只服务 agentCore 内核，不写上层产品逻辑。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type AudioReceiverSource = "user" | "application" | "runtime" | "official-module";

export type AudioReceiverBoundary = "input" | "contract" | "governance" | "scope" | "runtime-state";

export type AudioReceiverErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_SESSION_ID"
  | "MISSING_AUDIO_PAYLOAD"
  | "INVALID_AUDIO_PAYLOAD"
  | "INVALID_AUDIO_DURATION"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED";

export type AudioReceiverGate = {
  accepted: boolean;
  reason?: string;
};

export type RawAudioInput = {
  kind: "raw-audio";
  bytes: Uint8Array | readonly number[];
  format: string;
  durationMs?: number;
};

export type ReferencedAudioInput = {
  kind: "audio-reference";
  uri: string;
  format?: string;
  durationMs?: number;
};

export type SampledAudioInput = {
  kind: "sampled-audio";
  samples: readonly number[];
  sampleRateHz: number;
  format?: string;
  durationMs?: number;
};

export type AudioReceiverPayload = RawAudioInput | ReferencedAudioInput | SampledAudioInput;

export type AudioReceiverRequest = {
  runtimeId?: string;
  sessionId?: string;
  source?: AudioReceiverSource;
  payload?: AudioReceiverPayload;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  transcriptRequested?: boolean;
  runtimeReady?: boolean;
  contract?: AudioReceiverGate;
  governance?: AudioReceiverGate;
};

export type AudioReceiverError = {
  code: AudioReceiverErrorCode;
  message: string;
  boundary: AudioReceiverBoundary;
  safeForRuntimeInspection: true;
};

export type ReceivedAudioInput = {
  kind: "audio";
  runtimeId: string;
  sessionId: string;
  source: AudioReceiverSource;
  payloadKind: AudioReceiverPayload["kind"];
  media: {
    format: string;
    durationMs?: number;
    byteLength?: number;
    uri?: string;
    sampleCount?: number;
    sampleRateHz?: number;
  };
  samplingState: "raw" | "referenced" | "sampled";
  transcriptRequested: boolean;
  promptPackHandoff: "pending";
  providerPayloadCreated: false;
  unsafeSideEffects: false;
};

export type AudioReceiverResult =
  | {
      ok: true;
      input: ReceivedAudioInput;
      events: readonly string[];
    }
  | {
      ok: false;
      error: AudioReceiverError;
      events: readonly string[];
    };

export const audioInputReceiverDescriptor = {
  modality: "audio",
  route: "agent_executionEngine.IOTransceiver.inputReceiver",
  purpose: "normalize raw audio, audio references, or sampled audio for execution engine handoff",
  providerPayloadCreated: false,
  unsafeSideEffects: false,
} as const;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(code: AudioReceiverErrorCode, message: string, boundary: AudioReceiverBoundary): AudioReceiverResult {
  return {
    ok: false,
    error: { code, message, boundary, safeForRuntimeInspection: true },
    events: ["input.audio.rejected"],
  };
}

function guardScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): AudioReceiverResult | undefined {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);

  if (requested.length === 0 || allowed.length === 0) {
    return undefined;
  }

  const denied = requested.find((scope) => !allowed.includes(scope));
  if (denied) {
    return failure("SCOPE_DENIED", `audio input scope ${denied} is outside runtime governance`, "scope");
  }

  return undefined;
}

function invalidDuration(durationMs: number | undefined): boolean {
  return durationMs !== undefined && (!Number.isFinite(durationMs) || durationMs < 0);
}

function normalizeAudioPayload(payload: AudioReceiverPayload): ReceivedAudioInput["media"] | AudioReceiverResult {
  if (invalidDuration(payload.durationMs)) {
    return failure("INVALID_AUDIO_DURATION", "audio duration must be a non-negative finite number", "input");
  }

  if (payload.kind === "raw-audio") {
    if (payload.bytes.length === 0 || isBlank(payload.format)) {
      return failure("INVALID_AUDIO_PAYLOAD", "raw audio requires non-empty bytes and format", "input");
    }

    return {
      format: payload.format.trim(),
      durationMs: payload.durationMs,
      byteLength: payload.bytes.length,
    };
  }

  if (payload.kind === "audio-reference") {
    if (isBlank(payload.uri)) {
      return failure("INVALID_AUDIO_PAYLOAD", "audio reference requires a uri", "input");
    }

    return {
      format: payload.format?.trim() || "unknown",
      durationMs: payload.durationMs,
      uri: payload.uri.trim(),
    };
  }

  if (payload.samples.length === 0 || !Number.isFinite(payload.sampleRateHz) || payload.sampleRateHz <= 0) {
    return failure("INVALID_AUDIO_PAYLOAD", "sampled audio requires samples and a positive sampleRateHz", "input");
  }

  return {
    format: payload.format?.trim() || "sampled",
    durationMs: payload.durationMs,
    sampleCount: payload.samples.length,
    sampleRateHz: payload.sampleRateHz,
  };
}

function samplingState(payloadKind: AudioReceiverPayload["kind"]): ReceivedAudioInput["samplingState"] {
  if (payloadKind === "raw-audio") {
    return "raw";
  }

  if (payloadKind === "audio-reference") {
    return "referenced";
  }

  return "sampled";
}

export function receiveAudioInput(request?: AudioReceiverRequest): AudioReceiverResult {
  if (request === undefined || isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "runtimeId is required before receiving audio input", "input");
  }

  if (isBlank(request.sessionId)) {
    return failure("MISSING_SESSION_ID", "sessionId is required before receiving audio input", "input");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "audio input can only be accepted by a ready runtime", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "audio input was rejected by runtime contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "audio input was rejected by runtime governance",
      "governance",
    );
  }

  const scopeFailure = guardScopes(request.requestedScopes, request.allowedScopes);
  if (scopeFailure) {
    return scopeFailure;
  }

  if (request.payload === undefined) {
    return failure("MISSING_AUDIO_PAYLOAD", "audio input requires a raw, referenced, or sampled payload", "input");
  }

  const media = normalizeAudioPayload(request.payload);
  if ("ok" in media) {
    return media;
  }

  const runtimeId = request.runtimeId?.trim() ?? "";
  const sessionId = request.sessionId?.trim() ?? "";

  return {
    ok: true,
    input: {
      kind: "audio",
      runtimeId,
      sessionId,
      source: request.source ?? "user",
      payloadKind: request.payload.kind,
      media,
      samplingState: samplingState(request.payload.kind),
      transcriptRequested: request.transcriptRequested ?? false,
      promptPackHandoff: "pending",
      providerPayloadCreated: false,
      unsafeSideEffects: false,
    },
    events: ["input.audio.received"],
  };
}
