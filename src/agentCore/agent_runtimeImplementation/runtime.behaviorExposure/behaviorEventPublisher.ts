/*
 * 文件定位：Agent 运行态实现层 / 行为暴露运行面。
 * 核心目的：承载 behavior Event Publisher 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type BehaviorExposureBoundary = "input" | "contract" | "governance" | "scope" | "runtime-state";

export type BehaviorExposureCaller =
  | "applicationSurface"
  | "officialModuleSurface"
  | "governancePlane"
  | "invocationMethod"
  | "inspection"
  | "debug"
  | "runtime.behaviorExposure";

export type BehaviorEventSource =
  | "runtime"
  | "executionEngine"
  | "modelAdapter"
  | "interfaceAdapter"
  | "officialModule"
  | "application";

export type BehaviorExposureGate = {
  accepted: boolean;
  reason?: string;
};

export type BehaviorExposureTrace = {
  correlationId?: string;
  parentEventId?: string;
  sessionId?: string;
};

export type BehaviorExposureErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_SESSION_ID"
  | "MISSING_EVENT_KIND"
  | "MISSING_EVENT_SOURCE"
  | "MISSING_CALLER"
  | "INVALID_EVENT_PAYLOAD"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SUBSCRIBER_SCOPE_DENIED"
  | "REAL_DELIVERY_BLOCKED";

export type BehaviorExposureError = {
  code: BehaviorExposureErrorCode;
  message: string;
  boundary: BehaviorExposureBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type BehaviorEventPublisherRequest = {
  runtimeId?: string;
  sessionId?: string;
  eventId?: string;
  eventKind?: string;
  source?: BehaviorEventSource;
  caller?: BehaviorExposureCaller;
  payload?: Readonly<Record<string, unknown>>;
  requestedSubscribers?: readonly string[];
  allowedSubscribers?: readonly string[];
  runtimeReady?: boolean;
  deliver?: boolean;
  contract?: BehaviorExposureGate;
  governance?: BehaviorExposureGate;
  trace?: BehaviorExposureTrace;
  observedAt?: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type PublishedBehaviorEvent = {
  surface: "runtime.behaviorExposure";
  type: "behavior.event.published";
  runtimeId: string;
  sessionId: string;
  eventId: string;
  eventKind: string;
  source: BehaviorEventSource;
  caller: BehaviorExposureCaller;
  payload: Readonly<Record<string, unknown>>;
  payloadKeys: readonly string[];
  trace: BehaviorExposureTrace;
  observedAt: string;
  route: "agent_runtimeImplementation.runtime.behaviorExposure.behaviorEventPublisher";
  audit: {
    dryRun: true;
    delivered: false;
    unsafeSideEffects: false;
    contractSurface: "runtime.contractSurface";
    governanceRequired: true;
  };
  metadata: Readonly<Record<string, unknown>>;
};

export type BehaviorEventPublication = {
  mode: "dry-run";
  requestedSubscribers: readonly string[];
  deliverableSubscribers: readonly string[];
  actualSubscriberNotificationStarted: false;
};

export type BehaviorEventPublisherResult =
  | {
      ok: true;
      event: PublishedBehaviorEvent;
      publication: BehaviorEventPublication;
      events: readonly string[];
    }
  | {
      ok: false;
      error: BehaviorExposureError;
      events: readonly string[];
    };

export const behaviorEventPublisherDescriptor = {
  surface: "runtime.behaviorExposure",
  capability: "behaviorEventPublisher",
  purpose: "publish a governed behavior event envelope without notifying subscribers in the first implementation",
  mode: "dry-run",
  unsafeSideEffects: false,
} as const;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function cleanBehaviorExposureList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

export function behaviorExposureFailure(
  code: BehaviorExposureErrorCode,
  message: string,
  boundary: BehaviorExposureBoundary,
): BehaviorEventPublisherResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["runtime.behaviorExposure.behaviorEvent.rejected"],
  };
}

function resolveSubscribers(
  requestedSubscribers: readonly string[] | undefined,
  allowedSubscribers: readonly string[] | undefined,
): readonly string[] | BehaviorEventPublisherResult {
  const requested = cleanBehaviorExposureList(requestedSubscribers);
  const allowed = cleanBehaviorExposureList(allowedSubscribers);

  if (requested.length === 0) {
    return [];
  }

  const denied = requested.filter((subscriber) => !allowed.includes(subscriber));
  if (denied.length > 0) {
    return behaviorExposureFailure(
      "SUBSCRIBER_SCOPE_DENIED",
      `behavior event subscriber ${denied[0]} is outside runtime behavior exposure scope`,
      "scope",
    );
  }

  return requested;
}

function cleanTrace(trace: BehaviorExposureTrace | undefined, sessionId: string): BehaviorExposureTrace {
  return {
    correlationId: trace?.correlationId?.trim() || undefined,
    parentEventId: trace?.parentEventId?.trim() || undefined,
    sessionId: trace?.sessionId?.trim() || sessionId,
  };
}

export function publishBehaviorEvent(request?: BehaviorEventPublisherRequest): BehaviorEventPublisherResult {
  if (request === undefined || isBlank(request.runtimeId)) {
    return behaviorExposureFailure("MISSING_RUNTIME_ID", "behavior event publisher requires runtimeId", "input");
  }

  if (isBlank(request.sessionId)) {
    return behaviorExposureFailure("MISSING_SESSION_ID", "behavior event publisher requires sessionId", "input");
  }

  if (isBlank(request.eventKind)) {
    return behaviorExposureFailure("MISSING_EVENT_KIND", "behavior event publisher requires eventKind", "input");
  }

  if (request.source === undefined) {
    return behaviorExposureFailure("MISSING_EVENT_SOURCE", "behavior event publisher requires an event source", "input");
  }

  if (request.caller === undefined) {
    return behaviorExposureFailure("MISSING_CALLER", "behavior event publisher requires a runtime caller", "input");
  }

  if (request.payload !== undefined && !isRecord(request.payload)) {
    return behaviorExposureFailure("INVALID_EVENT_PAYLOAD", "behavior event payload must be a plain record", "input");
  }

  if (request.runtimeReady === false) {
    return behaviorExposureFailure("RUNTIME_NOT_READY", "behavior events require a ready runtime", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return behaviorExposureFailure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "runtime contract surface rejected the behavior event",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return behaviorExposureFailure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "runtime governance rejected the behavior event",
      "governance",
    );
  }

  if (request.deliver === true) {
    return behaviorExposureFailure(
      "REAL_DELIVERY_BLOCKED",
      "behaviorEventPublisher only creates a dry-run publication envelope in the first implementation",
      "governance",
    );
  }

  const deliverableSubscribers = resolveSubscribers(request.requestedSubscribers, request.allowedSubscribers);
  if ("ok" in deliverableSubscribers) {
    return deliverableSubscribers;
  }

  const runtimeId = request.runtimeId?.trim() ?? "";
  const sessionId = request.sessionId?.trim() ?? "";
  const eventKind = request.eventKind?.trim() ?? "";
  const observedAt = request.observedAt?.trim() || "dry-run";
  const payload = request.payload ?? {};

  return {
    ok: true,
    event: {
      surface: "runtime.behaviorExposure",
      type: "behavior.event.published",
      runtimeId,
      sessionId,
      eventId: request.eventId?.trim() || `${runtimeId}:${sessionId}:behavior:${eventKind}`,
      eventKind,
      source: request.source,
      caller: request.caller,
      payload,
      payloadKeys: Object.keys(payload).sort(),
      trace: cleanTrace(request.trace, sessionId),
      observedAt,
      route: "agent_runtimeImplementation.runtime.behaviorExposure.behaviorEventPublisher",
      audit: {
        dryRun: true,
        delivered: false,
        unsafeSideEffects: false,
        contractSurface: "runtime.contractSurface",
        governanceRequired: true,
      },
      metadata: request.metadata ?? {},
    },
    publication: {
      mode: "dry-run",
      requestedSubscribers: cleanBehaviorExposureList(request.requestedSubscribers),
      deliverableSubscribers,
      actualSubscriberNotificationStarted: false,
    },
    events: ["runtime.behaviorExposure.behaviorEvent.published"],
  };
}
