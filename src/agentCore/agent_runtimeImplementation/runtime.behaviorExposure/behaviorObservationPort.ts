/*
 * 文件定位：Agent 运行态实现层 / 行为暴露运行面。
 * 核心目的：承载 behavior Observation Port 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import type {
  BehaviorEventSource,
  BehaviorExposureBoundary,
  BehaviorExposureCaller,
  BehaviorExposureGate,
  PublishedBehaviorEvent,
} from "./behaviorEventPublisher.js";
import { cleanBehaviorExposureList } from "./behaviorEventPublisher.js";

export type BehaviorObservationPortErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_SESSION_ID"
  | "MISSING_OBSERVER_ID"
  | "MISSING_CALLER"
  | "MISSING_OBSERVATION_INTEREST"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "OBSERVATION_SCOPE_DENIED"
  | "REAL_SUBSCRIPTION_BLOCKED";

export type BehaviorObservationPortRequest = {
  runtimeId?: string;
  sessionId?: string;
  observerId?: string;
  caller?: BehaviorExposureCaller;
  interestedEventKinds?: readonly string[];
  interestedSources?: readonly BehaviorEventSource[];
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  existingEvents?: readonly PublishedBehaviorEvent[];
  runtimeReady?: boolean;
  subscribe?: boolean;
  contract?: BehaviorExposureGate;
  governance?: BehaviorExposureGate;
  openedAt?: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type BehaviorObservationPortError = {
  code: BehaviorObservationPortErrorCode;
  message: string;
  boundary: BehaviorExposureBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type BehaviorObservationPort = {
  surface: "runtime.behaviorExposure";
  type: "behavior.observation.port";
  runtimeId: string;
  sessionId: string;
  observerId: string;
  caller: BehaviorExposureCaller;
  interestedEventKinds: readonly string[];
  interestedSources: readonly BehaviorEventSource[];
  acceptedScopes: readonly string[];
  matchedEventIds: readonly string[];
  openedAt: string;
  mode: "dry-run";
  liveSubscriptionStarted: false;
  unsafeSideEffects: false;
  route: "agent_runtimeImplementation.runtime.behaviorExposure.behaviorObservationPort";
  metadata: Readonly<Record<string, unknown>>;
};

export type BehaviorObservationPortResult =
  | {
      ok: true;
      port: BehaviorObservationPort;
      events: readonly string[];
    }
  | {
      ok: false;
      error: BehaviorObservationPortError;
      events: readonly string[];
    };

export const behaviorObservationPortDescriptor = {
  surface: "runtime.behaviorExposure",
  capability: "behaviorObservationPort",
  purpose: "open a governed behavior observation port without starting a live subscription",
  mode: "dry-run",
  unsafeSideEffects: false,
} as const;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function failure(
  code: BehaviorObservationPortErrorCode,
  message: string,
  boundary: BehaviorExposureBoundary,
): BehaviorObservationPortResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["runtime.behaviorExposure.observationPort.rejected"],
  };
}

function resolveScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): readonly string[] | BehaviorObservationPortResult {
  const requested = cleanBehaviorExposureList(requestedScopes);
  const allowed = cleanBehaviorExposureList(allowedScopes);

  if (requested.length === 0) {
    return [];
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure("OBSERVATION_SCOPE_DENIED", `behavior observation scope ${denied[0]} is not allowed`, "scope");
  }

  return requested;
}

function cleanSources(values: readonly BehaviorEventSource[] | undefined): readonly BehaviorEventSource[] {
  return [...new Set(values ?? [])];
}

function matchesObservationInterest(
  event: PublishedBehaviorEvent,
  interestedEventKinds: readonly string[],
  interestedSources: readonly BehaviorEventSource[],
): boolean {
  const eventKindMatches = interestedEventKinds.length === 0 || interestedEventKinds.includes(event.eventKind);
  const sourceMatches = interestedSources.length === 0 || interestedSources.includes(event.source);
  return eventKindMatches && sourceMatches;
}

export function openBehaviorObservationPort(
  request?: BehaviorObservationPortRequest,
): BehaviorObservationPortResult {
  if (request === undefined || isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "behavior observation port requires runtimeId", "input");
  }

  if (isBlank(request.sessionId)) {
    return failure("MISSING_SESSION_ID", "behavior observation port requires sessionId", "input");
  }

  if (isBlank(request.observerId)) {
    return failure("MISSING_OBSERVER_ID", "behavior observation port requires observerId", "input");
  }

  if (request.caller === undefined) {
    return failure("MISSING_CALLER", "behavior observation port requires a runtime caller", "input");
  }

  const interestedEventKinds = cleanBehaviorExposureList(request.interestedEventKinds);
  const interestedSources = cleanSources(request.interestedSources);
  if (interestedEventKinds.length === 0 && interestedSources.length === 0) {
    return failure(
      "MISSING_OBSERVATION_INTEREST",
      "behavior observation port requires at least one event kind or source interest",
      "input",
    );
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "behavior observation requires a ready runtime", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "runtime contract surface rejected behavior observation",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "runtime governance rejected behavior observation",
      "governance",
    );
  }

  if (request.subscribe === true) {
    return failure(
      "REAL_SUBSCRIPTION_BLOCKED",
      "behaviorObservationPort only opens a dry-run observation envelope in the first implementation",
      "governance",
    );
  }

  const acceptedScopes = resolveScopes(request.requestedScopes, request.allowedScopes);
  if ("ok" in acceptedScopes) {
    return acceptedScopes;
  }

  const matchedEventIds = (request.existingEvents ?? [])
    .filter((event) => matchesObservationInterest(event, interestedEventKinds, interestedSources))
    .map((event) => event.eventId);

  return {
    ok: true,
    port: {
      surface: "runtime.behaviorExposure",
      type: "behavior.observation.port",
      runtimeId: request.runtimeId?.trim() ?? "",
      sessionId: request.sessionId?.trim() ?? "",
      observerId: request.observerId?.trim() ?? "",
      caller: request.caller,
      interestedEventKinds,
      interestedSources,
      acceptedScopes,
      matchedEventIds,
      openedAt: request.openedAt?.trim() || "dry-run",
      mode: "dry-run",
      liveSubscriptionStarted: false,
      unsafeSideEffects: false,
      route: "agent_runtimeImplementation.runtime.behaviorExposure.behaviorObservationPort",
      metadata: request.metadata ?? {},
    },
    events: ["runtime.behaviorExposure.observationPort.opened"],
  };
}
