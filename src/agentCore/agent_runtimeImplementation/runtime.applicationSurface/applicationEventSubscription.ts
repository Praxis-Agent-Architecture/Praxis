/*
 * 文件定位：Agent 运行态实现层 / 应用承托面。
 * 核心目的：让应用订阅 runtime 事件，例如行为、输出、错误、模式变化、debug 信号。
 * 能力要求1：需要支持应用只观察自己有权观察的事件。
 * 能力要求2：它是上层 Agent 应用构建 UI、日志、流程编排的重要入口。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type ApplicationRuntimeEvent = {
  type: string;
  runtimeId: string;
  applicationId: string;
  sessionId?: string;
  payload?: unknown;
};

export type ApplicationEventSubscriptionErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_APPLICATION_ID"
  | "MISSING_EVENT_TYPES"
  | "EVENT_SCOPE_DENIED"
  | "GOVERNANCE_REJECTED";

export type ApplicationEventSubscriptionError = {
  code: ApplicationEventSubscriptionErrorCode;
  message: string;
  boundary: "input" | "governance" | "scope";
};

export type ApplicationEventSubscriptionGate = {
  accepted: boolean;
  reason?: string;
};

export type ApplicationEventSubscriptionRequest = {
  runtimeId: string;
  applicationId: string;
  sessionId?: string;
  eventTypes: readonly string[];
  allowedEventTypes?: readonly string[];
  governance?: ApplicationEventSubscriptionGate;
};

export type ApplicationEventSubscription = {
  subscriptionId: string;
  runtimeId: string;
  applicationId: string;
  sessionId?: string;
  eventTypes: readonly string[];
  governanceState: "accepted";
  accepts: (event: ApplicationRuntimeEvent) => boolean;
};

export type ApplicationEventSubscriptionResult =
  | {
      ok: true;
      subscription: ApplicationEventSubscription;
      events: readonly string[];
    }
  | {
      ok: false;
      error: ApplicationEventSubscriptionError;
      events: readonly string[];
    };

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(
  code: ApplicationEventSubscriptionErrorCode,
  message: string,
  boundary: ApplicationEventSubscriptionError["boundary"],
): ApplicationEventSubscriptionResult {
  return {
    ok: false,
    error: { code, message, boundary },
    events: ["application.events.subscription.rejected"],
  };
}

export function subscribeToApplicationEvents(
  request: ApplicationEventSubscriptionRequest,
): ApplicationEventSubscriptionResult {
  if (isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "runtimeId is required before subscribing to runtime events", "input");
  }

  if (isBlank(request.applicationId)) {
    return failure(
      "MISSING_APPLICATION_ID",
      "applicationId is required before subscribing to runtime events",
      "input",
    );
  }

  const eventTypes = cleanList(request.eventTypes);
  if (eventTypes.length === 0) {
    return failure("MISSING_EVENT_TYPES", "at least one event type is required for application subscription", "input");
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "application event subscription was rejected by governance",
      "governance",
    );
  }

  const allowedEventTypes = cleanList(request.allowedEventTypes);
  const deniedEvent = allowedEventTypes.length > 0
    ? eventTypes.find((eventType) => !allowedEventTypes.includes(eventType))
    : undefined;

  if (deniedEvent !== undefined) {
    return failure(
      "EVENT_SCOPE_DENIED",
      `event type ${deniedEvent} is outside the application visible event scope`,
      "scope",
    );
  }

  const runtimeId = request.runtimeId.trim();
  const applicationId = request.applicationId.trim();
  const sessionId = request.sessionId?.trim() || undefined;

  return {
    ok: true,
    subscription: {
      subscriptionId: [runtimeId, applicationId, sessionId, eventTypes.join("+")].filter(Boolean).join(":"),
      runtimeId,
      applicationId,
      sessionId,
      eventTypes,
      governanceState: "accepted",
      accepts(event: ApplicationRuntimeEvent): boolean {
        if (event.runtimeId !== runtimeId || event.applicationId !== applicationId) {
          return false;
        }

        if (sessionId !== undefined && event.sessionId !== sessionId) {
          return false;
        }

        return eventTypes.includes(event.type);
      },
    },
    events: ["application.events.subscription.accepted"],
  };
}
