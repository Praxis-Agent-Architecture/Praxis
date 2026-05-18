/*
 * 文件定位：Agent 执行引擎 / 执行核心逻辑。
 * 核心目的：承载 state Engine 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：只服务 agentCore 内核，不写上层产品逻辑。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type AgentExecutionStatePhase =
  | "idle"
  | "running"
  | "waiting"
  | "replying"
  | "completed"
  | "interrupted"
  | "failed";

export type AgentExecutionStateTransition =
  | "start"
  | "wait"
  | "reply"
  | "complete"
  | "interrupt"
  | "fail"
  | "reset";

export type AgentExecutionStateBoundary = "input" | "state-machine" | "contract" | "governance";

export type AgentExecutionStateGate = {
  accepted: boolean;
  reason?: string;
};

export type AgentExecutionStateTrace = {
  correlationId?: string;
  callerId?: string;
};

export type AgentExecutionStateSnapshot = {
  sessionId: string;
  phase: AgentExecutionStatePhase;
  revision: number;
  reason?: string;
  trace: AgentExecutionStateTrace;
  mutable: false;
  unsafeSideEffects: false;
};

export type AgentExecutionStateRequest = {
  sessionId?: string;
  current?: AgentExecutionStateSnapshot;
  transition?: AgentExecutionStateTransition | string;
  reason?: string;
  trace?: AgentExecutionStateTrace;
  contract?: AgentExecutionStateGate;
  governance?: AgentExecutionStateGate;
};

export type AgentExecutionStateErrorCode =
  | "MISSING_SESSION_ID"
  | "SESSION_MISMATCH"
  | "MISSING_TRANSITION"
  | "INVALID_TRANSITION"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED";

export type AgentExecutionStateError = {
  code: AgentExecutionStateErrorCode;
  message: string;
  boundary: AgentExecutionStateBoundary;
  stateSafe: true;
};

export type AgentExecutionStateResult =
  | {
      ok: true;
      state: AgentExecutionStateSnapshot;
      previousPhase: AgentExecutionStatePhase;
      transition: AgentExecutionStateTransition;
      events: readonly string[];
    }
  | {
      ok: false;
      error: AgentExecutionStateError;
      events: readonly string[];
    };

const allowedTransitions = ["start", "wait", "reply", "complete", "interrupt", "fail", "reset"] as const;

const transitionTable: Record<AgentExecutionStatePhase, Partial<Record<AgentExecutionStateTransition, AgentExecutionStatePhase>>> = {
  idle: { start: "running", fail: "failed" },
  running: { wait: "waiting", reply: "replying", complete: "completed", interrupt: "interrupted", fail: "failed" },
  waiting: { start: "running", interrupt: "interrupted", fail: "failed" },
  replying: { complete: "completed", fail: "failed" },
  completed: { reset: "idle" },
  interrupted: { reset: "idle" },
  failed: { reset: "idle" },
};

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function isAgentExecutionStateTransition(value: string): value is AgentExecutionStateTransition {
  return allowedTransitions.includes(value as AgentExecutionStateTransition);
}

function failure(
  code: AgentExecutionStateErrorCode,
  message: string,
  boundary: AgentExecutionStateBoundary,
): AgentExecutionStateResult {
  return {
    ok: false,
    error: { code, message, boundary, stateSafe: true },
    events: ["agentCore.execution.state.rejected"],
  };
}

function cleanTrace(trace: AgentExecutionStateTrace | undefined): AgentExecutionStateTrace {
  return {
    correlationId: trace?.correlationId?.trim() || undefined,
    callerId: trace?.callerId?.trim() || undefined,
  };
}

export function advanceAgentExecutionState(request?: AgentExecutionStateRequest): AgentExecutionStateResult {
  if (request === undefined || isBlank(request.sessionId)) {
    return failure("MISSING_SESSION_ID", "stateEngine requires a sessionId before changing execution state", "input");
  }

  const sessionId = (request.sessionId ?? "").trim();
  const currentSessionId = request.current?.sessionId.trim();
  if (currentSessionId !== undefined && currentSessionId !== sessionId) {
    return failure("SESSION_MISMATCH", "stateEngine current snapshot belongs to a different session", "input");
  }

  if (isBlank(request.transition)) {
    return failure("MISSING_TRANSITION", "stateEngine requires an explicit transition intent", "input");
  }

  const transition = (request.transition ?? "").trim();
  if (!isAgentExecutionStateTransition(transition)) {
    return failure("INVALID_TRANSITION", `execution transition ${transition} is not supported by stateEngine`, "input");
  }

  if (request.contract?.accepted === false) {
    return failure("CONTRACT_REJECTED", request.contract.reason ?? "state transition was rejected by contract surface", "contract");
  }

  if (request.governance?.accepted === false) {
    return failure("GOVERNANCE_REJECTED", request.governance.reason ?? "state transition was rejected by governance", "governance");
  }

  const previousPhase = request.current?.phase ?? "idle";
  const nextPhase = transitionTable[previousPhase][transition];

  if (nextPhase === undefined) {
    return failure(
      "INVALID_TRANSITION",
      `stateEngine cannot apply ${transition} while execution phase is ${previousPhase}`,
      "state-machine",
    );
  }

  return {
    ok: true,
    state: {
      sessionId,
      phase: nextPhase,
      revision: (request.current?.revision ?? 0) + 1,
      reason: request.reason?.trim() || undefined,
      trace: cleanTrace(request.trace ?? request.current?.trace),
      mutable: false,
      unsafeSideEffects: false,
    },
    previousPhase,
    transition,
    events: [`agentCore.execution.state.${previousPhase}.${transition}.${nextPhase}`],
  };
}
