/*
 * 文件定位：Agent 执行引擎 / 输入输出收发层 / 输入接收面。
 * 核心目的：接收视频输入，并为视频理解、抽帧、转写或多模态任务建立入口。
 * 能力要求1：需要保留视频来源、时间范围、帧选择线索和后续处理需求。
 * 能力要求2：不直接实现完整视频处理算法，只定义执行引擎接收视频材料的能力位点。
 * 边界：只服务 agentCore 内核，不写上层产品逻辑。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type VideoReceiverSource = "user" | "application" | "runtime" | "official-module";

export type VideoReceiverBoundary = "input" | "contract" | "governance" | "scope" | "runtime-state";

export type VideoReceiverErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_SESSION_ID"
  | "MISSING_VIDEO_PAYLOAD"
  | "INVALID_VIDEO_PAYLOAD"
  | "INVALID_TIME_RANGE"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED";

export type VideoReceiverGate = {
  accepted: boolean;
  reason?: string;
};

export type VideoTimeRange = {
  startMs: number;
  endMs: number;
};

export type FrameSelectionHint = {
  strategy: "keyframes" | "interval" | "timestamps";
  intervalMs?: number;
  timestampsMs?: readonly number[];
};

export type VideoProcessingNeed = "understanding" | "frame-selection" | "transcription" | "multimodal-context";

export type RawVideoInput = {
  kind: "raw-video";
  bytes: Uint8Array | readonly number[];
  format: string;
  durationMs?: number;
  timeRange?: VideoTimeRange;
};

export type ReferencedVideoInput = {
  kind: "video-reference";
  uri: string;
  format?: string;
  durationMs?: number;
  timeRange?: VideoTimeRange;
};

export type VideoReceiverPayload = RawVideoInput | ReferencedVideoInput;

export type VideoReceiverRequest = {
  runtimeId?: string;
  sessionId?: string;
  source?: VideoReceiverSource;
  payload?: VideoReceiverPayload;
  frameSelection?: FrameSelectionHint;
  processingNeeds?: readonly VideoProcessingNeed[];
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  runtimeReady?: boolean;
  contract?: VideoReceiverGate;
  governance?: VideoReceiverGate;
};

export type VideoReceiverError = {
  code: VideoReceiverErrorCode;
  message: string;
  boundary: VideoReceiverBoundary;
  safeForRuntimeInspection: true;
};

export type ReceivedVideoInput = {
  kind: "video";
  runtimeId: string;
  sessionId: string;
  source: VideoReceiverSource;
  payloadKind: VideoReceiverPayload["kind"];
  media: {
    format: string;
    durationMs?: number;
    byteLength?: number;
    uri?: string;
    timeRange?: VideoTimeRange;
  };
  frameSelection?: FrameSelectionHint;
  processingNeeds: readonly VideoProcessingNeed[];
  processingPlan: "dry-run-envelope";
  videoAlgorithmExecuted: false;
  providerPayloadCreated: false;
  unsafeSideEffects: false;
};

export type VideoReceiverResult =
  | {
      ok: true;
      input: ReceivedVideoInput;
      events: readonly string[];
    }
  | {
      ok: false;
      error: VideoReceiverError;
      events: readonly string[];
    };

export const videoInputReceiverDescriptor = {
  modality: "video",
  route: "agent_executionEngine.IOTransceiver.inputReceiver",
  purpose: "capture video source, time range, frame hints, and processing needs without running video algorithms",
  providerPayloadCreated: false,
  videoAlgorithmExecuted: false,
  unsafeSideEffects: false,
} as const;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList<T extends string>(values: readonly T[] | undefined): readonly T[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean) as T[])];
}

function failure(code: VideoReceiverErrorCode, message: string, boundary: VideoReceiverBoundary): VideoReceiverResult {
  return {
    ok: false,
    error: { code, message, boundary, safeForRuntimeInspection: true },
    events: ["input.video.rejected"],
  };
}

function guardScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): VideoReceiverResult | undefined {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);

  if (requested.length === 0 || allowed.length === 0) {
    return undefined;
  }

  const denied = requested.find((scope) => !allowed.includes(scope));
  if (denied) {
    return failure("SCOPE_DENIED", `video input scope ${denied} is outside runtime governance`, "scope");
  }

  return undefined;
}

function validDuration(durationMs: number | undefined): boolean {
  return durationMs === undefined || (Number.isFinite(durationMs) && durationMs >= 0);
}

function validTimeRange(timeRange: VideoTimeRange | undefined): boolean {
  return (
    timeRange === undefined ||
    (Number.isFinite(timeRange.startMs) &&
      Number.isFinite(timeRange.endMs) &&
      timeRange.startMs >= 0 &&
      timeRange.endMs > timeRange.startMs)
  );
}

function validFrameSelection(frameSelection: FrameSelectionHint | undefined): boolean {
  if (frameSelection === undefined) {
    return true;
  }

  if (frameSelection.strategy === "interval") {
    return frameSelection.intervalMs !== undefined && Number.isFinite(frameSelection.intervalMs) && frameSelection.intervalMs > 0;
  }

  if (frameSelection.strategy === "timestamps") {
    return (
      (frameSelection.timestampsMs?.length ?? 0) > 0 &&
      (frameSelection.timestampsMs ?? []).every((timestamp) => Number.isFinite(timestamp) && timestamp >= 0)
    );
  }

  return true;
}

function normalizeVideoPayload(payload: VideoReceiverPayload): ReceivedVideoInput["media"] | VideoReceiverResult {
  if (!validDuration(payload.durationMs)) {
    return failure("INVALID_VIDEO_PAYLOAD", "video duration must be a non-negative finite number", "input");
  }

  if (!validTimeRange(payload.timeRange)) {
    return failure("INVALID_TIME_RANGE", "video timeRange must use non-negative startMs and increasing endMs", "input");
  }

  if (payload.kind === "raw-video") {
    if (payload.bytes.length === 0 || isBlank(payload.format)) {
      return failure("INVALID_VIDEO_PAYLOAD", "raw video requires non-empty bytes and format", "input");
    }

    return {
      format: payload.format.trim(),
      durationMs: payload.durationMs,
      byteLength: payload.bytes.length,
      timeRange: payload.timeRange,
    };
  }

  if (isBlank(payload.uri)) {
    return failure("INVALID_VIDEO_PAYLOAD", "video reference requires a uri", "input");
  }

  return {
    format: payload.format?.trim() || "unknown",
    durationMs: payload.durationMs,
    uri: payload.uri.trim(),
    timeRange: payload.timeRange,
  };
}

export function receiveVideoInput(request?: VideoReceiverRequest): VideoReceiverResult {
  if (request === undefined || isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "runtimeId is required before receiving video input", "input");
  }

  if (isBlank(request.sessionId)) {
    return failure("MISSING_SESSION_ID", "sessionId is required before receiving video input", "input");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "video input can only be accepted by a ready runtime", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "video input was rejected by runtime contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "video input was rejected by runtime governance",
      "governance",
    );
  }

  const scopeFailure = guardScopes(request.requestedScopes, request.allowedScopes);
  if (scopeFailure) {
    return scopeFailure;
  }

  if (request.payload === undefined) {
    return failure("MISSING_VIDEO_PAYLOAD", "video input requires a raw or referenced payload", "input");
  }

  if (!validFrameSelection(request.frameSelection)) {
    return failure("INVALID_VIDEO_PAYLOAD", "video frame selection hints must be finite and positive", "input");
  }

  const media = normalizeVideoPayload(request.payload);
  if ("ok" in media) {
    return media;
  }

  const runtimeId = request.runtimeId?.trim() ?? "";
  const sessionId = request.sessionId?.trim() ?? "";

  return {
    ok: true,
    input: {
      kind: "video",
      runtimeId,
      sessionId,
      source: request.source ?? "user",
      payloadKind: request.payload.kind,
      media,
      frameSelection: request.frameSelection,
      processingNeeds: cleanList(request.processingNeeds),
      processingPlan: "dry-run-envelope",
      videoAlgorithmExecuted: false,
      providerPayloadCreated: false,
      unsafeSideEffects: false,
    },
    events: ["input.video.received"],
  };
}
