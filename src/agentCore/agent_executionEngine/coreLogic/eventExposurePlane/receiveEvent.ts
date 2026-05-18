/*
 * 文件定位：Agent 执行引擎 / 执行核心逻辑 / 事件暴露面。
 * 核心目的：承载 receive Event 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：只服务 agentCore 内核，不写上层产品逻辑。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type ReceiveEventBoundary = "input" | "contract" | "governance" | "scope" | "runtime-state";

export type ReceiveEventSource =
  | "mainLoop"
  | "stateEngine"
  | "IOTransceiver"
  | "promptPack"
  | "basicToolLayer"
  | "officialModuleBridge"
  | "multiAgentBridge"
  | "runtime.execEngine";

export type ReceiveEventGate = {
  accepted: boolean;
  reason?: string;
};

export type ReceiveEventRequest = {
  runtimeId?: string;
  sessionId?: string;
  eventId?: string;
  eventKind?: string;
  source?: ReceiveEventSource;
  payload?: Readonly<Record<string, unknown>>;
  requestedSubscribers?: readonly string[];
  allowedSubscribers?: readonly string[];
  runtimeReady?: boolean;
  contract?: ReceiveEventGate;
  governance?: ReceiveEventGate;
  receivedAt?: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type ReceiveEventErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_SESSION_ID"
  | "MISSING_EVENT_KIND"
  | "MISSING_EVENT_SOURCE"
  | "INVALID_EVENT_PAYLOAD"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SUBSCRIBER_SCOPE_DENIED";

export type ReceiveEventError = {
  code: ReceiveEventErrorCode;
  message: string;
  boundary: ReceiveEventBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type ReceivedExecutionEvent = {
  plane: "eventExposurePlane";
  type: "executionEvent.received";
  runtimeId: string;
  sessionId: string;
  eventId: string;
  eventKind: string;
  source: ReceiveEventSource;
  payload: Readonly<Record<string, unknown>>;
  payloadKeys: readonly string[];
  receivedAt: string;
  route: "agent_executionEngine.coreLogic.eventExposurePlane";
  visibility: "runtime-subscribable";
  audit: {
    dryRun: true;
    unsafeSideEffects: false;
    contractSurface: "runtime.contractSurface";
    governanceRequired: true;
  };
  metadata: Readonly<Record<string, unknown>>;
};

export type ReceiveEventDispatch = {
  mode: "dry-run";
  requestedSubscribers: readonly string[];
  deliverableSubscribers: readonly string[];
  actualSubscriberNotificationStarted: false;
};

export type ReceiveEventResult =
  | {
      ok: true;
      event: ReceivedExecutionEvent;
      dispatch: ReceiveEventDispatch;
      events: readonly string[];
    }
  | {
      ok: false;
      error: ReceiveEventError;
      events: readonly string[];
    };

export const receiveEventDescriptor = {
  type: "executionEvent.received",
  plane: "eventExposurePlane",
  purpose: "receive and normalize execution process events without dispatching side effects",
  dispatch: "dry-run",
  unsafeSideEffects: false,
} as const;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(code: ReceiveEventErrorCode, message: string, boundary: ReceiveEventBoundary): ReceiveEventResult {
  return {
    ok: false,
    error: { code, message, boundary, safeForRuntimeInspection: true, internalDetailExposed: false },
    events: ["executionEvent.receive.rejected"],
  };
}

function resolveSubscribers(
  requestedSubscribers: readonly string[] | undefined,
  allowedSubscribers: readonly string[] | undefined,
): readonly string[] | ReceiveEventResult {
  const requested = cleanList(requestedSubscribers);
  const allowed = cleanList(allowedSubscribers);

  if (requested.length === 0) {
    return [];
  }

  const denied = requested.filter((subscriber) => !allowed.includes(subscriber));
  if (denied.length > 0) {
    return failure(
      "SUBSCRIBER_SCOPE_DENIED",
      `execution event subscriber ${denied[0]} is outside runtime event exposure scope`,
      "scope",
    );
  }

  return requested;
}

export function receiveExecutionEvent(request?: ReceiveEventRequest): ReceiveEventResult {
  if (request === undefined || isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "execution event receiver requires runtimeId", "input");
  }

  if (isBlank(request.sessionId)) {
    return failure("MISSING_SESSION_ID", "execution event receiver requires sessionId", "input");
  }

  if (isBlank(request.eventKind)) {
    return failure("MISSING_EVENT_KIND", "execution event receiver requires eventKind", "input");
  }

  if (request.source === undefined) {
    return failure("MISSING_EVENT_SOURCE", "execution event receiver requires an event source", "input");
  }

  if (request.payload !== undefined && !isRecord(request.payload)) {
    return failure("INVALID_EVENT_PAYLOAD", "execution event payload must be a plain record", "input");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "execution events can only be received through a ready runtime", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "runtime contract surface rejected the execution event",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "runtime governance rejected the execution event",
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
  const payload = request.payload ?? {};

  return {
    ok: true,
    event: {
      plane: "eventExposurePlane",
      type: "executionEvent.received",
      runtimeId,
      sessionId,
      eventId: request.eventId?.trim() || `${runtimeId}:${sessionId}:${eventKind}`,
      eventKind,
      source: request.source,
      payload,
      payloadKeys: Object.keys(payload).sort(),
      receivedAt: request.receivedAt?.trim() || "dry-run",
      route: "agent_executionEngine.coreLogic.eventExposurePlane",
      visibility: "runtime-subscribable",
      audit: {
        dryRun: true,
        unsafeSideEffects: false,
        contractSurface: "runtime.contractSurface",
        governanceRequired: true,
      },
      metadata: request.metadata ?? {},
    },
    dispatch: {
      mode: "dry-run",
      requestedSubscribers: cleanList(request.requestedSubscribers),
      deliverableSubscribers,
      actualSubscriberNotificationStarted: false,
    },
    events: ["executionEvent.receive.accepted"],
  };
}
