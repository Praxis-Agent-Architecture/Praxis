/*
 * 文件定位：Agent 运行态实现层 / 行为暴露运行面。
 * 核心目的：承载 behavior Trace Surface 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import type {
  BehaviorExposureBoundary,
  BehaviorExposureCaller,
  BehaviorExposureGate,
  PublishedBehaviorEvent,
} from "./behaviorEventPublisher.js";
import { cleanBehaviorExposureList } from "./behaviorEventPublisher.js";

export type BehaviorTraceSurfaceErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_SESSION_ID"
  | "MISSING_TRACE_ID"
  | "MISSING_CALLER"
  | "EMPTY_TRACE_EVENTS"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "TRACE_SCOPE_DENIED"
  | "REAL_STREAM_BLOCKED";

export type BehaviorTraceSurfaceRequest = {
  runtimeId?: string;
  sessionId?: string;
  traceId?: string;
  caller?: BehaviorExposureCaller;
  events?: readonly PublishedBehaviorEvent[];
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  includePayloadKeys?: boolean;
  runtimeReady?: boolean;
  stream?: boolean;
  contract?: BehaviorExposureGate;
  governance?: BehaviorExposureGate;
  generatedAt?: string;
};

export type BehaviorTraceSurfaceError = {
  code: BehaviorTraceSurfaceErrorCode;
  message: string;
  boundary: BehaviorExposureBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type BehaviorTraceFrame = {
  eventId: string;
  eventKind: string;
  source: string;
  observedAt: string;
  correlationId?: string;
  parentEventId?: string;
  payloadKeys?: readonly string[];
};

export type BehaviorTraceSurface = {
  surface: "runtime.behaviorExposure";
  type: "behavior.trace.surface";
  runtimeId: string;
  sessionId: string;
  traceId: string;
  caller: BehaviorExposureCaller;
  frames: readonly BehaviorTraceFrame[];
  eventKinds: readonly string[];
  acceptedScopes: readonly string[];
  generatedAt: string;
  mode: "dry-run";
  streamStarted: false;
  unsafeSideEffects: false;
  route: "agent_runtimeImplementation.runtime.behaviorExposure.behaviorTraceSurface";
};

export type BehaviorTraceSurfaceResult =
  | {
      ok: true;
      trace: BehaviorTraceSurface;
      events: readonly string[];
    }
  | {
      ok: false;
      error: BehaviorTraceSurfaceError;
      events: readonly string[];
    };

export const behaviorTraceSurfaceDescriptor = {
  surface: "runtime.behaviorExposure",
  capability: "behaviorTraceSurface",
  purpose: "shape behavior events into a trace surface without starting a live stream",
  mode: "dry-run",
  unsafeSideEffects: false,
} as const;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function failure(
  code: BehaviorTraceSurfaceErrorCode,
  message: string,
  boundary: BehaviorExposureBoundary,
): BehaviorTraceSurfaceResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["runtime.behaviorExposure.traceSurface.rejected"],
  };
}

function resolveScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): readonly string[] | BehaviorTraceSurfaceResult {
  const requested = cleanBehaviorExposureList(requestedScopes);
  const allowed = cleanBehaviorExposureList(allowedScopes);

  if (requested.length === 0) {
    return [];
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure("TRACE_SCOPE_DENIED", `behavior trace scope ${denied[0]} is not allowed`, "scope");
  }

  return requested;
}

function toTraceFrame(event: PublishedBehaviorEvent, includePayloadKeys: boolean): BehaviorTraceFrame {
  return {
    eventId: event.eventId,
    eventKind: event.eventKind,
    source: event.source,
    observedAt: event.observedAt,
    correlationId: event.trace.correlationId,
    parentEventId: event.trace.parentEventId,
    payloadKeys: includePayloadKeys ? event.payloadKeys : undefined,
  };
}

export function createBehaviorTraceSurface(request?: BehaviorTraceSurfaceRequest): BehaviorTraceSurfaceResult {
  if (request === undefined || isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "behavior trace surface requires runtimeId", "input");
  }

  if (isBlank(request.sessionId)) {
    return failure("MISSING_SESSION_ID", "behavior trace surface requires sessionId", "input");
  }

  if (isBlank(request.traceId)) {
    return failure("MISSING_TRACE_ID", "behavior trace surface requires traceId", "input");
  }

  if (request.caller === undefined) {
    return failure("MISSING_CALLER", "behavior trace surface requires a runtime caller", "input");
  }

  if ((request.events ?? []).length === 0) {
    return failure("EMPTY_TRACE_EVENTS", "behavior trace surface requires at least one behavior event", "input");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "behavior trace surface requires a ready runtime", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "runtime contract surface rejected behavior trace",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "runtime governance rejected behavior trace",
      "governance",
    );
  }

  if (request.stream === true) {
    return failure(
      "REAL_STREAM_BLOCKED",
      "behaviorTraceSurface only returns a dry-run trace snapshot in the first implementation",
      "governance",
    );
  }

  const acceptedScopes = resolveScopes(request.requestedScopes, request.allowedScopes);
  if ("ok" in acceptedScopes) {
    return acceptedScopes;
  }

  const events = request.events ?? [];
  const frames = events.map((event) => toTraceFrame(event, request.includePayloadKeys === true));
  const eventKinds = cleanBehaviorExposureList(events.map((event) => event.eventKind));

  return {
    ok: true,
    trace: {
      surface: "runtime.behaviorExposure",
      type: "behavior.trace.surface",
      runtimeId: request.runtimeId?.trim() ?? "",
      sessionId: request.sessionId?.trim() ?? "",
      traceId: request.traceId?.trim() ?? "",
      caller: request.caller,
      frames,
      eventKinds,
      acceptedScopes,
      generatedAt: request.generatedAt?.trim() || "dry-run",
      mode: "dry-run",
      streamStarted: false,
      unsafeSideEffects: false,
      route: "agent_runtimeImplementation.runtime.behaviorExposure.behaviorTraceSurface",
    },
    events: ["runtime.behaviorExposure.traceSurface.created"],
  };
}
