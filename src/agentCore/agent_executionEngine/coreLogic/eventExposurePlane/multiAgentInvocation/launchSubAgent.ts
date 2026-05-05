/*
 * 文件定位：Agent 执行引擎 / 执行核心逻辑 / 事件暴露面 / 多 Agent 调用事件。
 * 核心目的：承载 launch Sub Agent 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：只服务 agentCore 内核，不写上层产品逻辑。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type LaunchSubAgentEventBoundary = "input" | "contract" | "governance" | "runtime-state" | "scope";

export type LaunchSubAgentEventGate = {
  accepted: boolean;
  reason?: string;
};

export type LaunchSubAgentEventRequest = {
  runtimeId?: string;
  sessionId?: string;
  parentAgentId?: string;
  subAgentId?: string;
  invocationId?: string;
  eventSource?: "mainLoop" | "stateEngine" | "runtime.execEngine" | "multiagentInterface";
  launchReason?: string;
  callContext?: Readonly<Record<string, unknown>>;
  governanceContext?: readonly string[];
  requestedSubscribers?: readonly string[];
  allowedSubscribers?: readonly string[];
  runtimeReady?: boolean;
  contract?: LaunchSubAgentEventGate;
  governance?: LaunchSubAgentEventGate;
};

export type LaunchSubAgentEventErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_SESSION_ID"
  | "MISSING_PARENT_AGENT_ID"
  | "MISSING_SUB_AGENT_ID"
  | "MISSING_INVOCATION_ID"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SUBSCRIBER_SCOPE_DENIED";

export type LaunchSubAgentEventError = {
  code: LaunchSubAgentEventErrorCode;
  message: string;
  boundary: LaunchSubAgentEventBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type LaunchSubAgentEventRecord = {
  type: "multiAgent.subAgent.launch.requested";
  runtimeId: string;
  sessionId: string;
  route: "agent_executionEngine.coreLogic.eventExposurePlane.multiAgentInvocation";
  source: "mainLoop" | "stateEngine" | "runtime.execEngine" | "multiagentInterface";
  subject: {
    parentAgentId: string;
    subAgentId: string;
    invocationId: string;
  };
  payload: {
    action: "launch";
    launchReason?: string;
    callContextKeys: readonly string[];
    governanceContext: readonly string[];
  };
  contractSurface: "runtime.contractSurface";
  governanceRequired: true;
  dryRun: true;
  unsafeSideEffects: false;
};

export type LaunchSubAgentDispatchRecord = {
  mode: "dry-run";
  requestedSubscribers: readonly string[];
  deliverableSubscribers: readonly string[];
  actualLaunchStarted: false;
};

export type LaunchSubAgentEventResult =
  | {
      ok: true;
      event: LaunchSubAgentEventRecord;
      dispatch: LaunchSubAgentDispatchRecord;
      events: readonly string[];
    }
  | {
      ok: false;
      error: LaunchSubAgentEventError;
      events: readonly string[];
    };

export const launchSubAgentEventDescriptor = {
  type: "multiAgent.subAgent.launch.requested",
  route: "agent_executionEngine.coreLogic.eventExposurePlane.multiAgentInvocation",
  purpose: "expose a dry-run sub-agent launch invocation event without starting a child agent",
  unsafeSideEffects: false,
} as const;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(
  code: LaunchSubAgentEventErrorCode,
  message: string,
  boundary: LaunchSubAgentEventBoundary,
): LaunchSubAgentEventResult {
  return {
    ok: false,
    error: { code, message, boundary, safeForRuntimeInspection: true, internalDetailExposed: false },
    events: ["multiAgent.subAgent.launch.rejected"],
  };
}

function resolveSubscribers(
  requestedSubscribers: readonly string[] | undefined,
  allowedSubscribers: readonly string[] | undefined,
): readonly string[] | LaunchSubAgentEventResult {
  const requested = cleanList(requestedSubscribers);
  const allowed = cleanList(allowedSubscribers);

  if (requested.length === 0) {
    return [];
  }

  const denied = requested.filter((subscriber) => !allowed.includes(subscriber));
  if (denied.length > 0) {
    return failure(
      "SUBSCRIBER_SCOPE_DENIED",
      `subscriber ${denied[0]} is outside the sub-agent launch event exposure scope`,
      "scope",
    );
  }

  return requested;
}

export function exposeLaunchSubAgentEvent(request?: LaunchSubAgentEventRequest): LaunchSubAgentEventResult {
  if (request === undefined || isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "sub-agent launch event requires runtimeId", "input");
  }

  if (isBlank(request.sessionId)) {
    return failure("MISSING_SESSION_ID", "sub-agent launch event requires sessionId", "input");
  }

  if (isBlank(request.parentAgentId)) {
    return failure("MISSING_PARENT_AGENT_ID", "sub-agent launch event requires parentAgentId", "input");
  }

  if (isBlank(request.subAgentId)) {
    return failure("MISSING_SUB_AGENT_ID", "sub-agent launch event requires subAgentId", "input");
  }

  if (isBlank(request.invocationId)) {
    return failure("MISSING_INVOCATION_ID", "sub-agent launch event requires invocationId", "input");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "sub-agent launch events require a ready runtime", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "sub-agent launch event was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "sub-agent launch event was rejected by runtime governance",
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
  const subAgentId = request.subAgentId?.trim() ?? "";
  const invocationId = request.invocationId?.trim() ?? "";
  const launchReason = request.launchReason?.trim();

  return {
    ok: true,
    event: {
      type: "multiAgent.subAgent.launch.requested",
      runtimeId,
      sessionId,
      route: "agent_executionEngine.coreLogic.eventExposurePlane.multiAgentInvocation",
      source: request.eventSource ?? "runtime.execEngine",
      subject: { parentAgentId, subAgentId, invocationId },
      payload: {
        action: "launch",
        ...(launchReason ? { launchReason } : {}),
        callContextKeys: Object.keys(request.callContext ?? {}).sort(),
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
      actualLaunchStarted: false,
    },
    events: ["multiAgent.subAgent.launch.exposed"],
  };
}
