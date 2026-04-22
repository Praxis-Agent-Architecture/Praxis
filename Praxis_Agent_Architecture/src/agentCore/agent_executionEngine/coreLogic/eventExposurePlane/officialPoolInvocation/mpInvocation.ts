/*
 * 文件定位：Agent 执行引擎 / 执行核心逻辑 / 事件暴露面 / 官方能力池调用事件。
 * 核心目的：承载 mp Invocation 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：只服务 agentCore 内核，不写上层产品逻辑。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type MpInvocationBoundary = "input" | "contract" | "governance" | "scope" | "runtime-state";

export type MpInvocationSource =
  | "mainLoop"
  | "stateEngine"
  | "officialModuleBridge"
  | "runtime.execEngine"
  | "runtime.officialModuleSurface";

export type MpInvocationGate = {
  accepted: boolean;
  reason?: string;
};

export type MpInvocationTrace = {
  correlationId?: string;
  callerId?: string;
};

export type MpInvocationRequest = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  source?: MpInvocationSource;
  operation?: string;
  callContext?: Readonly<Record<string, unknown>>;
  governanceContext?: readonly string[];
  requestedSubscribers?: readonly string[];
  allowedSubscribers?: readonly string[];
  runtimeReady?: boolean;
  contract?: MpInvocationGate;
  governance?: MpInvocationGate;
  trace?: MpInvocationTrace;
  emittedAt?: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type MpInvocationErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_SESSION_ID"
  | "MISSING_INVOCATION_ID"
  | "MISSING_EVENT_SOURCE"
  | "MISSING_OPERATION"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SUBSCRIBER_SCOPE_DENIED";

export type MpInvocationError = {
  code: MpInvocationErrorCode;
  message: string;
  boundary: MpInvocationBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type MpInvocationEvent = {
  type: "officialPoolInvocation.mp.requested";
  runtimeId: string;
  sessionId: string;
  invocationId: string;
  route: "agent_executionEngine.coreLogic.eventExposurePlane.officialPoolInvocation";
  source: MpInvocationSource;
  officialModule: {
    name: "MP";
    operation: string;
    resultEnvelope: "not-executed";
  };
  payload: {
    callContextKeys: readonly string[];
    governanceContext: readonly string[];
  };
  trace: MpInvocationTrace;
  emittedAt: string;
  contractSurface: "runtime.contractSurface";
  governanceRequired: true;
  dryRun: true;
  unsafeSideEffects: false;
  metadata: Readonly<Record<string, unknown>>;
};

export type MpInvocationDispatch = {
  mode: "dry-run";
  requestedSubscribers: readonly string[];
  deliverableSubscribers: readonly string[];
  actualModuleCallStarted: false;
};

export type MpInvocationResult =
  | {
      ok: true;
      event: MpInvocationEvent;
      dispatch: MpInvocationDispatch;
      events: readonly string[];
    }
  | {
      ok: false;
      error: MpInvocationError;
      events: readonly string[];
    };

export const mpInvocationDescriptor = {
  type: "officialPoolInvocation.mp.requested",
  route: "agent_executionEngine.coreLogic.eventExposurePlane.officialPoolInvocation",
  purpose: "expose MP official module invocation events without executing MP behavior",
  dispatch: "dry-run",
  unsafeSideEffects: false,
} as const;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(
  code: MpInvocationErrorCode,
  message: string,
  boundary: MpInvocationBoundary,
): MpInvocationResult {
  return {
    ok: false,
    error: { code, message, boundary, safeForRuntimeInspection: true, internalDetailExposed: false },
    events: ["officialPoolInvocation.mp.rejected"],
  };
}

function resolveSubscribers(
  requestedSubscribers: readonly string[] | undefined,
  allowedSubscribers: readonly string[] | undefined,
): readonly string[] | MpInvocationResult {
  const requested = cleanList(requestedSubscribers);
  const allowed = cleanList(allowedSubscribers);

  if (requested.length === 0) {
    return [];
  }

  const denied = requested.filter((subscriber) => !allowed.includes(subscriber));
  if (denied.length > 0) {
    return failure(
      "SUBSCRIBER_SCOPE_DENIED",
      `MP invocation subscriber ${denied[0]} is outside runtime event exposure scope`,
      "scope",
    );
  }

  return requested;
}

export function exposeMpInvocationEvent(request?: MpInvocationRequest): MpInvocationResult {
  if (request === undefined || isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "MP invocation event requires runtimeId", "input");
  }

  if (isBlank(request.sessionId)) {
    return failure("MISSING_SESSION_ID", "MP invocation event requires sessionId", "input");
  }

  if (isBlank(request.invocationId)) {
    return failure("MISSING_INVOCATION_ID", "MP invocation event requires invocationId", "input");
  }

  if (request.source === undefined) {
    return failure("MISSING_EVENT_SOURCE", "MP invocation event requires an execution event source", "input");
  }

  if (isBlank(request.operation)) {
    return failure("MISSING_OPERATION", "MP invocation event requires an operation name", "input");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "MP invocation events require a ready runtime", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "runtime contract surface rejected the MP invocation event",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "runtime governance rejected the MP invocation event",
      "governance",
    );
  }

  const deliverableSubscribers = resolveSubscribers(request.requestedSubscribers, request.allowedSubscribers);
  if ("ok" in deliverableSubscribers) {
    return deliverableSubscribers;
  }

  const runtimeId = request.runtimeId?.trim() ?? "";
  const sessionId = request.sessionId?.trim() ?? "";
  const invocationId = request.invocationId?.trim() ?? "";
  const operation = request.operation?.trim() ?? "";

  return {
    ok: true,
    event: {
      type: "officialPoolInvocation.mp.requested",
      runtimeId,
      sessionId,
      invocationId,
      route: "agent_executionEngine.coreLogic.eventExposurePlane.officialPoolInvocation",
      source: request.source,
      officialModule: {
        name: "MP",
        operation,
        resultEnvelope: "not-executed",
      },
      payload: {
        callContextKeys: Object.keys(request.callContext ?? {}).sort(),
        governanceContext: cleanList(request.governanceContext),
      },
      trace: {
        correlationId: request.trace?.correlationId?.trim() || undefined,
        callerId: request.trace?.callerId?.trim() || undefined,
      },
      emittedAt: request.emittedAt?.trim() || "dry-run",
      contractSurface: "runtime.contractSurface",
      governanceRequired: true,
      dryRun: true,
      unsafeSideEffects: false,
      metadata: request.metadata ?? {},
    },
    dispatch: {
      mode: "dry-run",
      requestedSubscribers: cleanList(request.requestedSubscribers),
      deliverableSubscribers,
      actualModuleCallStarted: false,
    },
    events: ["officialPoolInvocation.mp.exposed"],
  };
}
