/*
 * 文件定位：Agent 运行态实现层 / 运行态调用方法层。
 * 核心目的：承载 stream Invocation Surface 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import {
  createInvocationEnvelope,
  type InvocationEnvelope,
  type InvocationEnvelopeError,
  type InvocationEnvelopeGate,
  type InvocationEnvelopeSource,
  type InvocationEnvelopeTrace,
} from "./invocationEnvelope.js";

export type StreamInvocationFrameKind = "open" | "chunk" | "done" | "error";

export type StreamInvocationFrameInput = {
  kind: StreamInvocationFrameKind;
  data?: unknown;
  eventId?: string;
};

export type StreamInvocationFrame = {
  kind: StreamInvocationFrameKind;
  data?: unknown;
  eventId?: string;
  sequence: number;
};

export type StreamInvocationSurfaceRequest = {
  runtimeId: string;
  streamId: string;
  targetId: string;
  source: InvocationEnvelopeSource;
  channel?: "agent" | "tool" | "model" | "interface";
  frames?: readonly StreamInvocationFrameInput[];
  runtimeReady?: boolean;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  contract?: InvocationEnvelopeGate;
  governance?: InvocationEnvelopeGate;
  trace?: InvocationEnvelopeTrace;
};

export type StreamInvocationSurfaceErrorCode = InvocationEnvelopeError["code"] | "MISSING_STREAM_ID";

export type StreamInvocationSurfaceError = {
  code: StreamInvocationSurfaceErrorCode;
  message: string;
  boundary: InvocationEnvelopeError["boundary"] | "stream";
};

export type StreamInvocationSurfaceView = {
  invocationType: "stream";
  runtimeId: string;
  streamId: string;
  targetId: string;
  channel?: "agent" | "tool" | "model" | "interface";
  envelope: InvocationEnvelope;
  frames: readonly StreamInvocationFrame[];
  status: "open" | "streaming" | "done" | "failed";
  dispatch: "dry-run";
  opensLiveTransport: false;
  providerRawShapeExposed: false;
  unsafeSideEffects: false;
};

export type StreamInvocationSurfaceResult =
  | {
      ok: true;
      surface: StreamInvocationSurfaceView;
      events: readonly string[];
    }
  | {
      ok: false;
      error: StreamInvocationSurfaceError;
      events: readonly string[];
    };

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function failure(
  code: StreamInvocationSurfaceErrorCode,
  message: string,
  boundary: StreamInvocationSurfaceError["boundary"],
): StreamInvocationSurfaceResult {
  return {
    ok: false,
    error: { code, message, boundary },
    events: ["runtime.invocation.stream.rejected"],
  };
}

function mapEnvelopeError(error: InvocationEnvelopeError): StreamInvocationSurfaceResult {
  return failure(error.code, error.message, error.boundary);
}

function normalizeFrames(frames: readonly StreamInvocationFrameInput[] | undefined): readonly StreamInvocationFrame[] {
  return (frames ?? []).map((frame, index) => ({
    kind: frame.kind,
    data: frame.data,
    eventId: frame.eventId?.trim() || undefined,
    sequence: index,
  }));
}

function streamStatus(frames: readonly StreamInvocationFrame[]): StreamInvocationSurfaceView["status"] {
  const lastKind = frames.at(-1)?.kind;

  if (lastKind === "done") {
    return "done";
  }

  if (lastKind === "error") {
    return "failed";
  }

  if (frames.some((frame) => frame.kind === "chunk")) {
    return "streaming";
  }

  return "open";
}

export function createStreamInvocationSurface(
  request: StreamInvocationSurfaceRequest,
): StreamInvocationSurfaceResult {
  if (isBlank(request.streamId)) {
    return failure("MISSING_STREAM_ID", "streamId is required before creating a stream invocation surface", "input");
  }

  const streamId = request.streamId.trim();
  const channel = request.channel;
  const frames = normalizeFrames(request.frames);
  const envelopeResult = createInvocationEnvelope({
    runtimeId: request.runtimeId,
    targetId: request.targetId,
    invocationKind: "stream",
    source: request.source,
    payload: {
      streamId,
      channel,
      frames,
    },
    runtimeReady: request.runtimeReady,
    requestedScopes: request.requestedScopes,
    allowedScopes: request.allowedScopes,
    contract: request.contract,
    governance: request.governance,
    trace: {
      correlationId: request.trace?.correlationId ?? streamId,
      callerId: request.trace?.callerId,
      sessionId: request.trace?.sessionId,
    },
  });

  if (!envelopeResult.ok) {
    return mapEnvelopeError(envelopeResult.error);
  }

  return {
    ok: true,
    surface: {
      invocationType: "stream",
      runtimeId: envelopeResult.envelope.runtimeId,
      streamId,
      targetId: envelopeResult.envelope.targetId,
      channel,
      envelope: envelopeResult.envelope,
      frames,
      status: streamStatus(frames),
      dispatch: "dry-run",
      opensLiveTransport: false,
      providerRawShapeExposed: false,
      unsafeSideEffects: false,
    },
    events: ["runtime.invocation.stream.surface.ready", ...envelopeResult.events],
  };
}
