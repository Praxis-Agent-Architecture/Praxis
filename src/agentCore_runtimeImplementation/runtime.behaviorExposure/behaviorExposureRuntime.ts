/*
 * 文件定位：Agent 运行态实现层 / 行为暴露运行面。
 * 核心目的：承载 behavior Exposure Runtime 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import type {
  BehaviorEventPublisherRequest,
  BehaviorEventPublisherResult,
  BehaviorExposureBoundary,
  BehaviorExposureCaller,
  BehaviorExposureGate,
} from "./behaviorEventPublisher.js";
import { cleanBehaviorExposureList, publishBehaviorEvent } from "./behaviorEventPublisher.js";
import type { BehaviorObservationPortRequest, BehaviorObservationPortResult } from "./behaviorObservationPort.js";
import { openBehaviorObservationPort } from "./behaviorObservationPort.js";
import type { BehaviorTraceSurfaceRequest, BehaviorTraceSurfaceResult } from "./behaviorTraceSurface.js";
import { createBehaviorTraceSurface } from "./behaviorTraceSurface.js";

export type BehaviorExposureRuntimeCapability = "publish-event" | "open-observation-port" | "create-trace-surface";

export type BehaviorExposureRuntimeErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_SESSION_ID"
  | "MISSING_CALLER"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "CAPABILITY_SCOPE_DENIED";

export type BehaviorExposureRuntimeRequest = {
  runtimeId?: string;
  sessionId?: string;
  caller?: BehaviorExposureCaller;
  requestedCapabilities?: readonly BehaviorExposureRuntimeCapability[];
  allowedCapabilities?: readonly BehaviorExposureRuntimeCapability[];
  runtimeReady?: boolean;
  contract?: BehaviorExposureGate;
  governance?: BehaviorExposureGate;
  createdAt?: string;
};

export type BehaviorExposureRuntimeError = {
  code: BehaviorExposureRuntimeErrorCode;
  message: string;
  boundary: BehaviorExposureBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type BehaviorExposureRuntimeSurface = {
  surface: "runtime.behaviorExposure";
  type: "behavior.exposure.runtime";
  runtimeId: string;
  sessionId: string;
  caller: BehaviorExposureCaller;
  capabilities: readonly BehaviorExposureRuntimeCapability[];
  createdAt: string;
  ready: true;
  mode: "dry-run";
  unsafeSideEffects: false;
  route: "agent_runtimeImplementation.runtime.behaviorExposure.behaviorExposureRuntime";
  publishEvent: (request: BehaviorEventPublisherRequest) => BehaviorEventPublisherResult;
  openObservationPort: (request: BehaviorObservationPortRequest) => BehaviorObservationPortResult;
  createTraceSurface: (request: BehaviorTraceSurfaceRequest) => BehaviorTraceSurfaceResult;
};

export type BehaviorExposureRuntimeResult =
  | {
      ok: true;
      runtime: BehaviorExposureRuntimeSurface;
      events: readonly string[];
    }
  | {
      ok: false;
      error: BehaviorExposureRuntimeError;
      events: readonly string[];
    };

export const behaviorExposureRuntimeDescriptor = {
  surface: "runtime.behaviorExposure",
  capability: "behaviorExposureRuntime",
  purpose: "assemble the behavior exposure runtime surface from dry-run event, observation, and trace capabilities",
  mode: "dry-run",
  unsafeSideEffects: false,
} as const;

const defaultCapabilities: readonly BehaviorExposureRuntimeCapability[] = [
  "publish-event",
  "open-observation-port",
  "create-trace-surface",
];

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function failure(
  code: BehaviorExposureRuntimeErrorCode,
  message: string,
  boundary: BehaviorExposureBoundary,
): BehaviorExposureRuntimeResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["runtime.behaviorExposure.runtime.rejected"],
  };
}

function cleanCapabilities(
  values: readonly BehaviorExposureRuntimeCapability[] | undefined,
): readonly BehaviorExposureRuntimeCapability[] {
  return [...new Set(values ?? [])];
}

function resolveCapabilities(
  requestedCapabilities: readonly BehaviorExposureRuntimeCapability[] | undefined,
  allowedCapabilities: readonly BehaviorExposureRuntimeCapability[] | undefined,
): readonly BehaviorExposureRuntimeCapability[] | BehaviorExposureRuntimeResult {
  const requested = cleanCapabilities(requestedCapabilities);
  const effectiveRequested = requested.length === 0 ? defaultCapabilities : requested;
  const allowed = cleanCapabilities(allowedCapabilities);

  if (allowed.length === 0) {
    return effectiveRequested;
  }

  const denied = effectiveRequested.filter((capability) => !allowed.includes(capability));
  if (denied.length > 0) {
    return failure(
      "CAPABILITY_SCOPE_DENIED",
      `behavior exposure runtime capability ${denied[0]} is not allowed`,
      "scope",
    );
  }

  return effectiveRequested;
}

function withRuntimeContext<T extends { runtimeId?: string; sessionId?: string; caller?: BehaviorExposureCaller }>(
  request: T,
  runtimeId: string,
  sessionId: string,
  caller: BehaviorExposureCaller,
): T {
  return {
    ...request,
    runtimeId: request.runtimeId ?? runtimeId,
    sessionId: request.sessionId ?? sessionId,
    caller: request.caller ?? caller,
  };
}

export function createBehaviorExposureRuntime(
  request?: BehaviorExposureRuntimeRequest,
): BehaviorExposureRuntimeResult {
  if (request === undefined || isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "behavior exposure runtime requires runtimeId", "input");
  }

  if (isBlank(request.sessionId)) {
    return failure("MISSING_SESSION_ID", "behavior exposure runtime requires sessionId", "input");
  }

  if (request.caller === undefined) {
    return failure("MISSING_CALLER", "behavior exposure runtime requires a runtime caller", "input");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "behavior exposure runtime requires a ready runtime", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "runtime contract surface rejected behavior exposure runtime",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "runtime governance rejected behavior exposure runtime",
      "governance",
    );
  }

  const capabilities = resolveCapabilities(request.requestedCapabilities, request.allowedCapabilities);
  if ("ok" in capabilities) {
    return capabilities;
  }

  const runtimeId = request.runtimeId?.trim() ?? "";
  const sessionId = request.sessionId?.trim() ?? "";
  const caller = request.caller;

  return {
    ok: true,
    runtime: {
      surface: "runtime.behaviorExposure",
      type: "behavior.exposure.runtime",
      runtimeId,
      sessionId,
      caller,
      capabilities: cleanBehaviorExposureList(capabilities) as readonly BehaviorExposureRuntimeCapability[],
      createdAt: request.createdAt?.trim() || "dry-run",
      ready: true,
      mode: "dry-run",
      unsafeSideEffects: false,
      route: "agent_runtimeImplementation.runtime.behaviorExposure.behaviorExposureRuntime",
      publishEvent: (eventRequest) => publishBehaviorEvent(withRuntimeContext(eventRequest, runtimeId, sessionId, caller)),
      openObservationPort: (portRequest) =>
        openBehaviorObservationPort(withRuntimeContext(portRequest, runtimeId, sessionId, caller)),
      createTraceSurface: (traceRequest) =>
        createBehaviorTraceSurface(withRuntimeContext(traceRequest, runtimeId, sessionId, caller)),
    },
    events: ["runtime.behaviorExposure.runtime.created"],
  };
}
