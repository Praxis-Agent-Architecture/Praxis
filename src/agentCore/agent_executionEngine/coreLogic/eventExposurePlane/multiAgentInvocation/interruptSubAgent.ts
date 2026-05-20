/*
 * 文件定位：Agent 执行引擎 / 执行核心逻辑 / 事件暴露面 / 多 Agent 调用事件。
 * 核心目的：承载 interrupt Sub Agent 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：只服务 agentCore 内核，不写上层产品逻辑。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type InterruptSubAgentMode = "pause" | "cancel" | "handoff" | "diagnostic";

export type InterruptSubAgentBoundary = "input" | "contract" | "governance" | "runtime-state" | "scope";

export type InterruptSubAgentErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_PARENT_AGENT_ID"
  | "MISSING_SUB_AGENT_ID"
  | "MISSING_INVOCATION_ID"
  | "MISSING_REASON"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "REAL_INTERRUPT_BLOCKED";

export type InterruptSubAgentGate = {
  accepted: boolean;
  reason?: string;
};

export type InterruptSubAgentTrace = {
  correlationId?: string;
  callerId?: string;
  sessionId?: string;
};

export type InterruptSubAgentRequest = {
  runtimeId?: string;
  parentAgentId?: string;
  subAgentId?: string;
  invocationId?: string;
  reason?: string;
  mode?: InterruptSubAgentMode;
  runtimeReady?: boolean;
  dryRun?: boolean;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  contract?: InterruptSubAgentGate;
  governance?: InterruptSubAgentGate;
  trace?: InterruptSubAgentTrace;
  observedAt?: string;
};

export type InterruptSubAgentEvent = {
  kind: "multiAgent.subAgent.interrupt";
  eventId: string;
  runtimeId: string;
  parentAgentId: string;
  subAgentId: string;
  invocationId: string;
  reason: string;
  mode: InterruptSubAgentMode;
  requestedScopes: readonly string[];
  grantedScopes: readonly string[];
  deniedScopes: readonly string[];
  trace: InterruptSubAgentTrace;
  observedAt: string;
  dryRun: true;
  subAgentInterrupted: false;
  unsafeSideEffects: false;
};

export type InterruptSubAgentError = {
  code: InterruptSubAgentErrorCode;
  message: string;
  boundary: InterruptSubAgentBoundary;
  publicSafe: true;
};

export type InterruptSubAgentResult =
  | {
      ok: true;
      event: InterruptSubAgentEvent;
      events: readonly string[];
    }
  | {
      ok: false;
      error: InterruptSubAgentError;
      events: readonly string[];
    };

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(
  code: InterruptSubAgentErrorCode,
  message: string,
  boundary: InterruptSubAgentBoundary,
): InterruptSubAgentResult {
  return {
    ok: false,
    error: { code, message, boundary, publicSafe: true },
    events: ["agentCore.eventExposure.multiAgent.interruptSubAgent.rejected"],
  };
}

function cleanTrace(trace: InterruptSubAgentTrace | undefined): InterruptSubAgentTrace {
  return {
    correlationId: trace?.correlationId?.trim() || undefined,
    callerId: trace?.callerId?.trim() || undefined,
    sessionId: trace?.sessionId?.trim() || undefined,
  };
}

export function exposeInterruptSubAgentEvent(request?: InterruptSubAgentRequest): InterruptSubAgentResult {
  if (request === undefined || isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "interruptSubAgent event requires a runtimeId", "input");
  }

  if (isBlank(request.parentAgentId)) {
    return failure("MISSING_PARENT_AGENT_ID", "interruptSubAgent event requires a parentAgentId", "input");
  }

  if (isBlank(request.subAgentId)) {
    return failure("MISSING_SUB_AGENT_ID", "interruptSubAgent event requires a subAgentId", "input");
  }

  if (isBlank(request.invocationId)) {
    return failure("MISSING_INVOCATION_ID", "interruptSubAgent event requires an invocationId", "input");
  }

  if (isBlank(request.reason)) {
    return failure("MISSING_REASON", "interruptSubAgent event requires a public-safe reason", "input");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "interruptSubAgent events require a ready runtime", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "interruptSubAgent event was rejected by contract",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "interruptSubAgent event was rejected by governance",
      "governance",
    );
  }

  if (request.dryRun === false) {
    return failure(
      "REAL_INTERRUPT_BLOCKED",
      "interruptSubAgent only exposes a dry-run event envelope in the first implementation",
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
      `interruptSubAgent event includes scopes outside the event exposure boundary: ${deniedScopes.join(", ")}`,
      "scope",
    );
  }

  const runtimeId = (request.runtimeId ?? "").trim();
  const parentAgentId = (request.parentAgentId ?? "").trim();
  const subAgentId = (request.subAgentId ?? "").trim();
  const invocationId = (request.invocationId ?? "").trim();
  const reason = (request.reason ?? "").trim();
  const trace = cleanTrace(request.trace);
  const observedAt = request.observedAt?.trim() || "dry-run";

  return {
    ok: true,
    event: {
      kind: "multiAgent.subAgent.interrupt",
      eventId: `${runtimeId}:subAgent.interrupt:${subAgentId}:${invocationId}:${trace.correlationId ?? observedAt}`,
      runtimeId,
      parentAgentId,
      subAgentId,
      invocationId,
      reason,
      mode: request.mode ?? "pause",
      requestedScopes,
      grantedScopes,
      deniedScopes,
      trace,
      observedAt,
      dryRun: true,
      subAgentInterrupted: false,
      unsafeSideEffects: false,
    },
    events: ["agentCore.eventExposure.multiAgent.interruptSubAgent.exposed"],
  };
}
