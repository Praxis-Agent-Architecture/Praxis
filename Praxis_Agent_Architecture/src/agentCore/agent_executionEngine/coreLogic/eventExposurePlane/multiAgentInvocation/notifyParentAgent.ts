/*
 * 文件定位：Agent 执行引擎 / 执行核心逻辑 / 事件暴露面 / 多 Agent 调用事件。
 * 核心目的：承载 notify Parent Agent 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：只服务 agentCore 内核，不写上层产品逻辑。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type NotifyParentAgentEventBoundary = "input" | "contract" | "governance" | "runtime-state" | "scope";

export type NotifyParentAgentEventGate = {
  accepted: boolean;
  reason?: string;
};

export type NotifyParentAgentEventRequest = {
  runtimeId?: string;
  sessionId?: string;
  parentAgentId?: string;
  sourceAgentId?: string;
  notificationId?: string;
  eventSource?: "mainLoop" | "stateEngine" | "runtime.execEngine" | "multiagentInterface";
  notificationKind?: "progress" | "result" | "warning" | "failure";
  message?: string;
  governanceContext?: readonly string[];
  requestedSubscribers?: readonly string[];
  allowedSubscribers?: readonly string[];
  runtimeReady?: boolean;
  contract?: NotifyParentAgentEventGate;
  governance?: NotifyParentAgentEventGate;
};

export type NotifyParentAgentEventErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_SESSION_ID"
  | "MISSING_PARENT_AGENT_ID"
  | "MISSING_SOURCE_AGENT_ID"
  | "MISSING_NOTIFICATION_ID"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SUBSCRIBER_SCOPE_DENIED";

export type NotifyParentAgentEventError = {
  code: NotifyParentAgentEventErrorCode;
  message: string;
  boundary: NotifyParentAgentEventBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type NotifyParentAgentEventRecord = {
  type: "multiAgent.parentAgent.notification.exposed";
  runtimeId: string;
  sessionId: string;
  route: "agent_executionEngine.coreLogic.eventExposurePlane.multiAgentInvocation";
  source: "mainLoop" | "stateEngine" | "runtime.execEngine" | "multiagentInterface";
  subject: {
    parentAgentId: string;
    sourceAgentId: string;
    notificationId: string;
  };
  payload: {
    action: "notify-parent";
    notificationKind: "progress" | "result" | "warning" | "failure";
    message?: string;
    governanceContext: readonly string[];
  };
  contractSurface: "runtime.contractSurface";
  governanceRequired: true;
  dryRun: true;
  unsafeSideEffects: false;
};

export type NotifyParentAgentDispatchRecord = {
  mode: "dry-run";
  requestedSubscribers: readonly string[];
  deliverableSubscribers: readonly string[];
  actualParentNotificationSent: false;
};

export type NotifyParentAgentEventResult =
  | {
      ok: true;
      event: NotifyParentAgentEventRecord;
      dispatch: NotifyParentAgentDispatchRecord;
      events: readonly string[];
    }
  | {
      ok: false;
      error: NotifyParentAgentEventError;
      events: readonly string[];
    };

export const notifyParentAgentEventDescriptor = {
  type: "multiAgent.parentAgent.notification.exposed",
  route: "agent_executionEngine.coreLogic.eventExposurePlane.multiAgentInvocation",
  purpose: "expose a dry-run parent-agent notification event without sending a parent callback",
  unsafeSideEffects: false,
} as const;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(
  code: NotifyParentAgentEventErrorCode,
  message: string,
  boundary: NotifyParentAgentEventBoundary,
): NotifyParentAgentEventResult {
  return {
    ok: false,
    error: { code, message, boundary, safeForRuntimeInspection: true, internalDetailExposed: false },
    events: ["multiAgent.parentAgent.notification.rejected"],
  };
}

function resolveSubscribers(
  requestedSubscribers: readonly string[] | undefined,
  allowedSubscribers: readonly string[] | undefined,
): readonly string[] | NotifyParentAgentEventResult {
  const requested = cleanList(requestedSubscribers);
  const allowed = cleanList(allowedSubscribers);

  if (requested.length === 0) {
    return [];
  }

  const denied = requested.filter((subscriber) => !allowed.includes(subscriber));
  if (denied.length > 0) {
    return failure(
      "SUBSCRIBER_SCOPE_DENIED",
      `subscriber ${denied[0]} is outside the parent-agent notification event exposure scope`,
      "scope",
    );
  }

  return requested;
}

export function exposeNotifyParentAgentEvent(
  request?: NotifyParentAgentEventRequest,
): NotifyParentAgentEventResult {
  if (request === undefined || isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "parent-agent notification event requires runtimeId", "input");
  }

  if (isBlank(request.sessionId)) {
    return failure("MISSING_SESSION_ID", "parent-agent notification event requires sessionId", "input");
  }

  if (isBlank(request.parentAgentId)) {
    return failure("MISSING_PARENT_AGENT_ID", "parent-agent notification event requires parentAgentId", "input");
  }

  if (isBlank(request.sourceAgentId)) {
    return failure("MISSING_SOURCE_AGENT_ID", "parent-agent notification event requires sourceAgentId", "input");
  }

  if (isBlank(request.notificationId)) {
    return failure("MISSING_NOTIFICATION_ID", "parent-agent notification event requires notificationId", "input");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "parent-agent notification events require a ready runtime", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "parent-agent notification event was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "parent-agent notification event was rejected by runtime governance",
      "governance",
    );
  }

  const deliverableSubscribers = resolveSubscribers(request.requestedSubscribers, request.allowedSubscribers);
  if ("ok" in deliverableSubscribers) {
    return deliverableSubscribers;
  }

  const runtimeId = request.runtimeId?.trim() ?? "";
  const sessionId = request.sessionId?.trim() ?? "";
  const parentAgentId = request.parentAgentId?.trim() ?? "";
  const sourceAgentId = request.sourceAgentId?.trim() ?? "";
  const notificationId = request.notificationId?.trim() ?? "";
  const message = request.message?.trim();

  return {
    ok: true,
    event: {
      type: "multiAgent.parentAgent.notification.exposed",
      runtimeId,
      sessionId,
      route: "agent_executionEngine.coreLogic.eventExposurePlane.multiAgentInvocation",
      source: request.eventSource ?? "runtime.execEngine",
      subject: { parentAgentId, sourceAgentId, notificationId },
      payload: {
        action: "notify-parent",
        notificationKind: request.notificationKind ?? "progress",
        ...(message ? { message } : {}),
        governanceContext: cleanList(request.governanceContext),
      },
      contractSurface: "runtime.contractSurface",
      governanceRequired: true,
      dryRun: true,
      unsafeSideEffects: false,
    },
    dispatch: {
      mode: "dry-run",
      requestedSubscribers: cleanList(request.requestedSubscribers),
      deliverableSubscribers,
      actualParentNotificationSent: false,
    },
    events: ["multiAgent.parentAgent.notification.exposed"],
  };
}
