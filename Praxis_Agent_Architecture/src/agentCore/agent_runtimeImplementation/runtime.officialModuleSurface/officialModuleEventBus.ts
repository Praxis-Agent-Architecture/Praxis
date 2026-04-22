/*
 * 文件定位：Agent 运行态实现层 / 官方模块承托面。
 * 核心目的：承载 agentCore 与官方模块之间的 runtime 事件流。
 * 能力要求1：需要支持事件发布、订阅、过滤、来源标记和治理约束。
 * 能力要求2：它让官方模块能协作但不互相硬耦合。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import {
  createOfficialModuleRuntimeError,
  type OfficialModuleIdentity,
  type OfficialModuleKind,
  type OfficialModuleRuntimeBoundary,
  type OfficialModuleRuntimeError,
  type OfficialModuleRuntimeGate,
} from "./officialModuleRuntimeSurface.js";

export type OfficialModuleEventVisibility = "runtime" | "official-module" | "inspection" | "debug";

export type OfficialModuleEvent = {
  runtimeId: string;
  type: string;
  source: OfficialModuleIdentity;
  payload?: unknown;
  visibility: OfficialModuleEventVisibility;
  scopes: readonly string[];
  timestamp: number;
  governanceChecked: true;
  unsafeSideEffects: false;
};

export type OfficialModuleEventFilter = {
  runtimeId?: string;
  moduleKinds?: readonly OfficialModuleKind[];
  moduleIds?: readonly string[];
  eventTypes?: readonly string[];
  scopes?: readonly string[];
};

export type OfficialModuleEventSubscriber = {
  id: string;
  filter?: OfficialModuleEventFilter;
  onEvent?: (event: OfficialModuleEvent) => void;
};

export type OfficialModuleEventBusRequest = {
  runtimeId?: string;
  runtimeReady?: boolean;
  subscribers?: readonly OfficialModuleEventSubscriber[];
  governance?: OfficialModuleRuntimeGate;
  now?: () => number;
};

export type OfficialModuleEventPublishRequest = {
  runtimeId?: string;
  type?: string;
  source?: Partial<OfficialModuleIdentity>;
  payload?: unknown;
  visibility?: OfficialModuleEventVisibility;
  scopes?: readonly string[];
  governance?: OfficialModuleRuntimeGate;
};

export type OfficialModuleEventDelivery = {
  subscriberId: string;
  eventType: string;
  delivered: boolean;
};

export type OfficialModuleEventBusPublishResult =
  | {
      ok: true;
      event: OfficialModuleEvent;
      deliveries: readonly OfficialModuleEventDelivery[];
      events: readonly string[];
    }
  | {
      ok: false;
      error: OfficialModuleRuntimeError;
      events: readonly string[];
    };

export type OfficialModuleEventBusSubscriptionResult =
  | {
      ok: true;
      subscriberId: string;
      unsubscribe: () => void;
      events: readonly string[];
    }
  | {
      ok: false;
      error: OfficialModuleRuntimeError;
      events: readonly string[];
    };

export type OfficialModuleEventBus = {
  runtimeId: string;
  publish: (request: OfficialModuleEventPublishRequest) => OfficialModuleEventBusPublishResult;
  subscribe: (subscriber: OfficialModuleEventSubscriber) => OfficialModuleEventBusSubscriptionResult;
  snapshot: () => readonly OfficialModuleEvent[];
};

export type OfficialModuleEventBusResult =
  | {
      ok: true;
      bus: OfficialModuleEventBus;
      events: readonly string[];
    }
  | {
      ok: false;
      error: OfficialModuleRuntimeError;
      events: readonly string[];
    };

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList<T extends string>(values: readonly T[] | undefined): readonly T[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean) as T[])];
}

function hasIntersection(left: readonly string[], right: readonly string[]): boolean {
  return left.length === 0 || right.length === 0 || left.some((value) => right.includes(value));
}

function failure<T>(
  code: string,
  message: string,
  boundary: OfficialModuleRuntimeBoundary,
  eventType: string,
): T {
  return {
    ok: false,
    error: createOfficialModuleRuntimeError(code, message, boundary),
    events: [eventType],
  } as T;
}

function matchesFilter(filter: OfficialModuleEventFilter | undefined, event: OfficialModuleEvent): boolean {
  if (filter === undefined) {
    return true;
  }

  if (filter.runtimeId !== undefined && filter.runtimeId.trim() !== event.runtimeId) {
    return false;
  }

  const moduleKinds = cleanList(filter.moduleKinds);
  if (moduleKinds.length > 0 && !moduleKinds.includes(event.source.moduleKind)) {
    return false;
  }

  const moduleIds = cleanList(filter.moduleIds);
  if (moduleIds.length > 0 && !moduleIds.includes(event.source.moduleId)) {
    return false;
  }

  const eventTypes = cleanList(filter.eventTypes);
  if (eventTypes.length > 0 && !eventTypes.includes(event.type)) {
    return false;
  }

  return hasIntersection(cleanList(filter.scopes), event.scopes);
}

export function createOfficialModuleEventBus(request?: OfficialModuleEventBusRequest): OfficialModuleEventBusResult {
  if (request === undefined || isBlank(request.runtimeId)) {
    return failure(
      "MISSING_RUNTIME_ID",
      "official module event bus requires a runtimeId",
      "input",
      "runtime.officialModule.eventBus.rejected",
    );
  }

  if (request.runtimeReady === false) {
    return failure(
      "RUNTIME_NOT_READY",
      "official module event bus requires a ready runtime",
      "runtime-state",
      "runtime.officialModule.eventBus.rejected",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "official module event bus was rejected by governance",
      "governance",
      "runtime.officialModule.eventBus.rejected",
    );
  }

  const runtimeId = (request.runtimeId ?? "").trim();
  const subscribers = new Map<string, OfficialModuleEventSubscriber>();
  const auditTrail: OfficialModuleEvent[] = [];
  for (const subscriber of request.subscribers ?? []) {
    if (!isBlank(subscriber.id)) {
      subscribers.set(subscriber.id.trim(), { ...subscriber, id: subscriber.id.trim() });
    }
  }

  const bus: OfficialModuleEventBus = {
    runtimeId,
    publish(publishRequest: OfficialModuleEventPublishRequest): OfficialModuleEventBusPublishResult {
      if (isBlank(publishRequest.runtimeId)) {
        return failure(
          "MISSING_RUNTIME_ID",
          "official module event publish requires a runtimeId",
          "input",
          "runtime.officialModule.event.rejected",
        );
      }

      if ((publishRequest.runtimeId ?? "").trim() !== runtimeId) {
        return failure(
          "EVENT_RUNTIME_MISMATCH",
          "official module event cannot cross runtime event bus boundary",
          "scope",
          "runtime.officialModule.event.rejected",
        );
      }

      if (isBlank(publishRequest.type)) {
        return failure(
          "MISSING_EVENT_TYPE",
          "official module event publish requires an event type",
          "input",
          "runtime.officialModule.event.rejected",
        );
      }

      if (isBlank(publishRequest.source?.moduleId)) {
        return failure(
          "MISSING_MODULE_ID",
          "official module event publish requires a source moduleId",
          "input",
          "runtime.officialModule.event.rejected",
        );
      }

      if (isBlank(publishRequest.source?.moduleKind)) {
        return failure(
          "MISSING_MODULE_KIND",
          "official module event publish requires a source module kind",
          "input",
          "runtime.officialModule.event.rejected",
        );
      }

      if (publishRequest.governance?.accepted === false) {
        return failure(
          "GOVERNANCE_REJECTED",
          publishRequest.governance.reason ?? "official module event publish was rejected by governance",
          "governance",
          "runtime.officialModule.event.rejected",
        );
      }

      const event: OfficialModuleEvent = {
        runtimeId,
        type: (publishRequest.type ?? "").trim(),
        source: {
          moduleId: (publishRequest.source?.moduleId ?? "").trim(),
          moduleKind: (publishRequest.source?.moduleKind ?? "").trim() as OfficialModuleKind,
        },
        payload: publishRequest.payload,
        visibility: publishRequest.visibility ?? "official-module",
        scopes: cleanList(publishRequest.scopes),
        timestamp: request.now?.() ?? Date.now(),
        governanceChecked: true,
        unsafeSideEffects: false,
      };

      auditTrail.push(event);
      const deliveries: OfficialModuleEventDelivery[] = [];
      for (const subscriber of subscribers.values()) {
        if (matchesFilter(subscriber.filter, event)) {
          subscriber.onEvent?.(event);
          deliveries.push({ subscriberId: subscriber.id, eventType: event.type, delivered: true });
        }
      }

      return {
        ok: true,
        event,
        deliveries,
        events: ["runtime.officialModule.event.published"],
      };
    },
    subscribe(subscriber: OfficialModuleEventSubscriber): OfficialModuleEventBusSubscriptionResult {
      if (isBlank(subscriber.id)) {
        return failure(
          "MISSING_SUBSCRIBER_ID",
          "official module event subscription requires a subscriber id",
          "input",
          "runtime.officialModule.subscription.rejected",
        );
      }

      const subscriberId = subscriber.id.trim();
      subscribers.set(subscriberId, { ...subscriber, id: subscriberId });

      return {
        ok: true,
        subscriberId,
        unsubscribe(): void {
          subscribers.delete(subscriberId);
        },
        events: ["runtime.officialModule.subscription.accepted"],
      };
    },
    snapshot(): readonly OfficialModuleEvent[] {
      return [...auditTrail];
    },
  };

  return {
    ok: true,
    bus,
    events: ["runtime.officialModule.eventBus.created"],
  };
}
