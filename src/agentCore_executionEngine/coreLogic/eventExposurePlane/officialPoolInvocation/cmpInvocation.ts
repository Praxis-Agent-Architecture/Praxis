/*
 * 文件定位：Agent 执行引擎 / 执行核心逻辑 / 事件暴露面 / 官方能力池调用事件。
 * 核心目的：承载 cmp Invocation 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：只服务 agentCore 内核，不写上层产品逻辑。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type CmpInvocationBoundary = "input" | "contract" | "governance" | "scope" | "runtime-state";

export type CmpInvocationSource =
  | "mainLoop"
  | "stateEngine"
  | "officialModuleBridge"
  | "runtime.execEngine"
  | "runtime.officialModuleSurface";

export type CmpInvocationGate = {
  accepted: boolean;
  reason?: string;
};

export type CmpInvocationTrace = {
  correlationId?: string;
  callerId?: string;
};

export type CmpInvocationRequest = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  source?: CmpInvocationSource;
  operation?: string;
  callContext?: Readonly<Record<string, unknown>>;
  governanceContext?: readonly string[];
  requestedSubscribers?: readonly string[];
  allowedSubscribers?: readonly string[];
  runtimeReady?: boolean;
  contract?: CmpInvocationGate;
  governance?: CmpInvocationGate;
  trace?: CmpInvocationTrace;
  emittedAt?: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type CmpInvocationErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_SESSION_ID"
  | "MISSING_INVOCATION_ID"
  | "MISSING_EVENT_SOURCE"
  | "MISSING_OPERATION"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SUBSCRIBER_SCOPE_DENIED";

export type CmpInvocationError = {
  code: CmpInvocationErrorCode;
  message: string;
  boundary: CmpInvocationBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type CmpInvocationEvent = {
  type: "officialPoolInvocation.cmp.requested";
  runtimeId: string;
  sessionId: string;
  invocationId: string;
  route: "agent_executionEngine.coreLogic.eventExposurePlane.officialPoolInvocation";
  source: CmpInvocationSource;
  officialModule: {
    name: "CMP";
    operation: string;
    resultEnvelope: "not-executed";
  };
  payload: {
    callContextKeys: readonly string[];
    governanceContext: readonly string[];
  };
  trace: CmpInvocationTrace;
  emittedAt: string;
  contractSurface: "runtime.contractSurface";
  governanceRequired: true;
  dryRun: true;
  unsafeSideEffects: false;
  metadata: Readonly<Record<string, unknown>>;
};

export type CmpInvocationDispatch = {
  mode: "dry-run";
  requestedSubscribers: readonly string[];
  deliverableSubscribers: readonly string[];
  actualModuleCallStarted: false;
};

export type CmpInvocationResult =
  | {
      ok: true;
      event: CmpInvocationEvent;
      dispatch: CmpInvocationDispatch;
      events: readonly string[];
    }
  | {
      ok: false;
      error: CmpInvocationError;
      events: readonly string[];
    };

export const cmpInvocationDescriptor = {
  type: "officialPoolInvocation.cmp.requested",
  route: "agent_executionEngine.coreLogic.eventExposurePlane.officialPoolInvocation",
  purpose: "expose CMP official module invocation events without executing CMP behavior",
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
  code: CmpInvocationErrorCode,
  message: string,
  boundary: CmpInvocationBoundary,
): CmpInvocationResult {
  return {
    ok: false,
    error: { code, message, boundary, safeForRuntimeInspection: true, internalDetailExposed: false },
    events: ["officialPoolInvocation.cmp.rejected"],
  };
}

function resolveSubscribers(
  requestedSubscribers: readonly string[] | undefined,
  allowedSubscribers: readonly string[] | undefined,
): readonly string[] | CmpInvocationResult {
  const requested = cleanList(requestedSubscribers);
  const allowed = cleanList(allowedSubscribers);

  if (requested.length === 0) {
    return [];
  }

  const denied = requested.filter((subscriber) => !allowed.includes(subscriber));
  if (denied.length > 0) {
    return failure(
      "SUBSCRIBER_SCOPE_DENIED",
      `CMP invocation subscriber ${denied[0]} is outside runtime event exposure scope`,
      "scope",
    );
  }

  return requested;
}

export function exposeCmpInvocationEvent(request?: CmpInvocationRequest): CmpInvocationResult {
  if (request === undefined || isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "CMP invocation event requires runtimeId", "input");
  }

  if (isBlank(request.sessionId)) {
    return failure("MISSING_SESSION_ID", "CMP invocation event requires sessionId", "input");
  }

  if (isBlank(request.invocationId)) {
    return failure("MISSING_INVOCATION_ID", "CMP invocation event requires invocationId", "input");
  }

  if (request.source === undefined) {
    return failure("MISSING_EVENT_SOURCE", "CMP invocation event requires an execution event source", "input");
  }

  if (isBlank(request.operation)) {
    return failure("MISSING_OPERATION", "CMP invocation event requires an operation name", "input");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "CMP invocation events require a ready runtime", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "runtime contract surface rejected the CMP invocation event",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "runtime governance rejected the CMP invocation event",
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
      type: "officialPoolInvocation.cmp.requested",
      runtimeId,
      sessionId,
      invocationId,
      route: "agent_executionEngine.coreLogic.eventExposurePlane.officialPoolInvocation",
      source: request.source,
      officialModule: {
        name: "CMP",
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
    events: ["officialPoolInvocation.cmp.exposed"],
  };
}
