/*
 * 文件定位：Agent 执行引擎 / 执行核心逻辑 / 事件暴露面 / 多 Agent 调用事件。
 * 核心目的：承载 resume Sub Agent 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：只服务 agentCore 内核，不写上层产品逻辑。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type ResumeSubAgentEventBoundary = "input" | "contract" | "governance" | "runtime-state" | "scope";

export type ResumeSubAgentEventGate = {
  accepted: boolean;
  reason?: string;
};

export type ResumeSubAgentEventRequest = {
  runtimeId?: string;
  sessionId?: string;
  parentAgentId?: string;
  subAgentId?: string;
  invocationId?: string;
  eventSource?: "mainLoop" | "stateEngine" | "runtime.execEngine" | "multiagentInterface";
  resumeReason?: string;
  resumeToken?: string;
  governanceContext?: readonly string[];
  requestedSubscribers?: readonly string[];
  allowedSubscribers?: readonly string[];
  runtimeReady?: boolean;
  contract?: ResumeSubAgentEventGate;
  governance?: ResumeSubAgentEventGate;
};

export type ResumeSubAgentEventErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_SESSION_ID"
  | "MISSING_PARENT_AGENT_ID"
  | "MISSING_SUB_AGENT_ID"
  | "MISSING_INVOCATION_ID"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SUBSCRIBER_SCOPE_DENIED";

export type ResumeSubAgentEventError = {
  code: ResumeSubAgentEventErrorCode;
  message: string;
  boundary: ResumeSubAgentEventBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type ResumeSubAgentEventRecord = {
  type: "multiAgent.subAgent.resume.requested";
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
    action: "resume";
    resumeReason?: string;
    resumeTokenPresent: boolean;
    governanceContext: readonly string[];
  };
  contractSurface: "runtime.contractSurface";
  governanceRequired: true;
  dryRun: true;
  unsafeSideEffects: false;
};

export type ResumeSubAgentDispatchRecord = {
  mode: "dry-run";
  requestedSubscribers: readonly string[];
  deliverableSubscribers: readonly string[];
  actualResumeStarted: false;
};

export type ResumeSubAgentEventResult =
  | {
      ok: true;
      event: ResumeSubAgentEventRecord;
      dispatch: ResumeSubAgentDispatchRecord;
      events: readonly string[];
    }
  | {
      ok: false;
      error: ResumeSubAgentEventError;
      events: readonly string[];
    };

export const resumeSubAgentEventDescriptor = {
  type: "multiAgent.subAgent.resume.requested",
  route: "agent_executionEngine.coreLogic.eventExposurePlane.multiAgentInvocation",
  purpose: "expose a dry-run sub-agent resume invocation event without resuming a child agent",
  unsafeSideEffects: false,
} as const;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(
  code: ResumeSubAgentEventErrorCode,
  message: string,
  boundary: ResumeSubAgentEventBoundary,
): ResumeSubAgentEventResult {
  return {
    ok: false,
    error: { code, message, boundary, safeForRuntimeInspection: true, internalDetailExposed: false },
    events: ["multiAgent.subAgent.resume.rejected"],
  };
}

function resolveSubscribers(
  requestedSubscribers: readonly string[] | undefined,
  allowedSubscribers: readonly string[] | undefined,
): readonly string[] | ResumeSubAgentEventResult {
  const requested = cleanList(requestedSubscribers);
  const allowed = cleanList(allowedSubscribers);

  if (requested.length === 0) {
    return [];
  }

  const denied = requested.filter((subscriber) => !allowed.includes(subscriber));
  if (denied.length > 0) {
    return failure(
      "SUBSCRIBER_SCOPE_DENIED",
      `subscriber ${denied[0]} is outside the sub-agent resume event exposure scope`,
      "scope",
    );
  }

  return requested;
}

export function exposeResumeSubAgentEvent(request?: ResumeSubAgentEventRequest): ResumeSubAgentEventResult {
  if (request === undefined || isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "sub-agent resume event requires runtimeId", "input");
  }

  if (isBlank(request.sessionId)) {
    return failure("MISSING_SESSION_ID", "sub-agent resume event requires sessionId", "input");
  }

  if (isBlank(request.parentAgentId)) {
    return failure("MISSING_PARENT_AGENT_ID", "sub-agent resume event requires parentAgentId", "input");
  }

  if (isBlank(request.subAgentId)) {
    return failure("MISSING_SUB_AGENT_ID", "sub-agent resume event requires subAgentId", "input");
  }

  if (isBlank(request.invocationId)) {
    return failure("MISSING_INVOCATION_ID", "sub-agent resume event requires invocationId", "input");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "sub-agent resume events require a ready runtime", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "sub-agent resume event was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "sub-agent resume event was rejected by runtime governance",
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
  const resumeReason = request.resumeReason?.trim();

  return {
    ok: true,
    event: {
      type: "multiAgent.subAgent.resume.requested",
      runtimeId,
      sessionId,
      route: "agent_executionEngine.coreLogic.eventExposurePlane.multiAgentInvocation",
      source: request.eventSource ?? "runtime.execEngine",
      subject: { parentAgentId, subAgentId, invocationId },
      payload: {
        action: "resume",
        ...(resumeReason ? { resumeReason } : {}),
        resumeTokenPresent: !isBlank(request.resumeToken),
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
      actualResumeStarted: false,
    },
    events: ["multiAgent.subAgent.resume.exposed"],
  };
}
