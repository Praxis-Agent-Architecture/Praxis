/*
 * 文件定位：Agent 执行引擎 / 执行核心逻辑 / 事件暴露面。
 * 核心目的：承载 interrupt Event 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：只服务 agentCore 内核，不写上层产品逻辑。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type InterruptEventMode = "pause" | "cancel" | "handoff" | "diagnostic";

export type InterruptEventBoundary = "input" | "contract" | "governance" | "runtime-state" | "scope";

export type InterruptEventErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_SESSION_ID"
  | "MISSING_INTERRUPT_ID"
  | "MISSING_REASON"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "REAL_INTERRUPT_BLOCKED";

export type InterruptEventGate = {
  accepted: boolean;
  reason?: string;
};

export type InterruptEventTrace = {
  correlationId?: string;
  callerId?: string;
  sessionId?: string;
};

export type InterruptEventRequest = {
  runtimeId?: string;
  sessionId?: string;
  interruptId?: string;
  reason?: string;
  mode?: InterruptEventMode;
  targetLoopId?: string;
  runtimeReady?: boolean;
  dryRun?: boolean;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  contract?: InterruptEventGate;
  governance?: InterruptEventGate;
  trace?: InterruptEventTrace;
  observedAt?: string;
};

export type ExecutionInterruptEvent = {
  kind: "execution.interrupt";
  eventId: string;
  runtimeId: string;
  sessionId: string;
  interruptId: string;
  reason: string;
  mode: InterruptEventMode;
  targetLoopId?: string;
  requestedScopes: readonly string[];
  grantedScopes: readonly string[];
  deniedScopes: readonly string[];
  trace: InterruptEventTrace;
  observedAt: string;
  dryRun: true;
  interruptDelivered: false;
  unsafeSideEffects: false;
};

export type InterruptEventError = {
  code: InterruptEventErrorCode;
  message: string;
  boundary: InterruptEventBoundary;
  publicSafe: true;
};

export type InterruptEventResult =
  | {
      ok: true;
      event: ExecutionInterruptEvent;
      events: readonly string[];
    }
  | {
      ok: false;
      error: InterruptEventError;
      events: readonly string[];
    };

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(code: InterruptEventErrorCode, message: string, boundary: InterruptEventBoundary): InterruptEventResult {
  return {
    ok: false,
    error: { code, message, boundary, publicSafe: true },
    events: ["agentCore.eventExposure.interrupt.rejected"],
  };
}

function cleanTrace(trace: InterruptEventTrace | undefined, sessionId: string): InterruptEventTrace {
  return {
    correlationId: trace?.correlationId?.trim() || undefined,
    callerId: trace?.callerId?.trim() || undefined,
    sessionId: trace?.sessionId?.trim() || sessionId,
  };
}

export function exposeInterruptEvent(request?: InterruptEventRequest): InterruptEventResult {
  if (request === undefined || isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "interrupt event requires a runtimeId", "input");
  }

  if (isBlank(request.sessionId)) {
    return failure("MISSING_SESSION_ID", "interrupt event requires a sessionId", "input");
  }

  if (isBlank(request.interruptId)) {
    return failure("MISSING_INTERRUPT_ID", "interrupt event requires an interruptId", "input");
  }

  if (isBlank(request.reason)) {
    return failure("MISSING_REASON", "interrupt event requires a public-safe reason", "input");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "interrupt events require a ready runtime", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "interrupt event was rejected by contract",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "interrupt event was rejected by governance",
      "governance",
    );
  }

  if (request.dryRun === false) {
    return failure(
      "REAL_INTERRUPT_BLOCKED",
      "interruptEvent only exposes a dry-run event envelope in the first implementation",
      "contract",
    );
  }

  const requestedScopes = cleanList(request.requestedScopes);
  const allowedScopes = cleanList(request.allowedScopes);
  const grantedScopes =
    allowedScopes.length === 0 ? requestedScopes : requestedScopes.filter((scope) => allowedScopes.includes(scope));
  const deniedScopes =
    allowedScopes.length === 0 ? [] : requestedScopes.filter((scope) => !allowedScopes.includes(scope));

  if (deniedScopes.length > 0) {
    return failure(
      "SCOPE_DENIED",
      `interrupt event includes scopes outside the event exposure boundary: ${deniedScopes.join(", ")}`,
      "scope",
    );
  }

  const runtimeId = (request.runtimeId ?? "").trim();
  const sessionId = (request.sessionId ?? "").trim();
  const interruptId = (request.interruptId ?? "").trim();
  const reason = (request.reason ?? "").trim();
  const trace = cleanTrace(request.trace, sessionId);
  const observedAt = request.observedAt?.trim() || "dry-run";

  return {
    ok: true,
    event: {
      kind: "execution.interrupt",
      eventId: `${runtimeId}:interrupt:${interruptId}:${trace.correlationId ?? observedAt}`,
      runtimeId,
      sessionId,
      interruptId,
      reason,
      mode: request.mode ?? "pause",
      targetLoopId: request.targetLoopId?.trim() || undefined,
      requestedScopes,
      grantedScopes,
      deniedScopes,
      trace,
      observedAt,
      dryRun: true,
      interruptDelivered: false,
      unsafeSideEffects: false,
    },
    events: ["agentCore.eventExposure.interrupt.exposed"],
  };
}
