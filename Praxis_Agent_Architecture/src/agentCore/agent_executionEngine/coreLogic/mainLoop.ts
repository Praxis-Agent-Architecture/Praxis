/*
 * 文件定位：Agent 执行引擎 / 执行核心逻辑。
 * 核心目的：承载 main Loop 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：只服务 agentCore 内核，不写上层产品逻辑。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import {
  advanceAgentExecutionState,
  type AgentExecutionStateGate,
  type AgentExecutionStateSnapshot,
  type AgentExecutionStateTrace,
} from "./stateEngine.js";

export type AgentMainLoopNextHop = "prompt-pack" | "model-adapter" | "tool-layer" | "event-exposure" | "none";

export type AgentMainLoopBoundary = "input" | "runtime-state" | "contract" | "governance";

export type AgentMainLoopRequest = {
  sessionId?: string;
  input?: unknown;
  currentState?: AgentExecutionStateSnapshot;
  requestedNextHop?: AgentMainLoopNextHop;
  maxSteps?: number;
  trace?: AgentExecutionStateTrace;
  contract?: AgentExecutionStateGate;
  governance?: AgentExecutionStateGate;
};

export type AgentMainLoopErrorCode =
  | "MISSING_SESSION_ID"
  | "MISSING_INPUT"
  | "LOOP_LIMIT_EXCEEDED"
  | "STATE_REJECTED"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED";

export type AgentMainLoopError = {
  code: AgentMainLoopErrorCode;
  message: string;
  boundary: AgentMainLoopBoundary;
  stateSafe: true;
};

export type AgentMainLoopTick = {
  sessionId: string;
  input: unknown;
  state: AgentExecutionStateSnapshot;
  nextHop: AgentMainLoopNextHop;
  plannedSteps: readonly string[];
  dryRun: true;
  unsafeSideEffects: false;
};

export type AgentMainLoopResult =
  | {
      ok: true;
      tick: AgentMainLoopTick;
      events: readonly string[];
    }
  | {
      ok: false;
      error: AgentMainLoopError;
      events: readonly string[];
    };

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function failure(code: AgentMainLoopErrorCode, message: string, boundary: AgentMainLoopBoundary): AgentMainLoopResult {
  return {
    ok: false,
    error: { code, message, boundary, stateSafe: true },
    events: ["agentCore.execution.mainLoop.rejected"],
  };
}

export function planAgentMainLoopTick(request: AgentMainLoopRequest): AgentMainLoopResult {
  if (isBlank(request.sessionId)) {
    return failure("MISSING_SESSION_ID", "mainLoop requires a sessionId before planning execution", "input");
  }

  if (request.input === undefined) {
    return failure("MISSING_INPUT", "mainLoop requires an input payload to advance the execution loop", "input");
  }

  if (request.maxSteps !== undefined && request.maxSteps < 1) {
    return failure("LOOP_LIMIT_EXCEEDED", "mainLoop maxSteps must allow at least one dry-run step", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure("CONTRACT_REJECTED", request.contract.reason ?? "mainLoop request was rejected by contract surface", "contract");
  }

  if (request.governance?.accepted === false) {
    return failure("GOVERNANCE_REJECTED", request.governance.reason ?? "mainLoop request was rejected by governance", "governance");
  }

  const stateResult = advanceAgentExecutionState({
    sessionId: request.sessionId,
    current: request.currentState,
    transition: request.currentState?.phase === "waiting" ? "start" : "start",
    reason: "mainLoop accepted execution input",
    trace: request.trace,
    contract: request.contract,
    governance: request.governance,
  });

  if (!stateResult.ok) {
    return failure("STATE_REJECTED", stateResult.error.message, "runtime-state");
  }

  const nextHop = request.requestedNextHop ?? "prompt-pack";

  return {
    ok: true,
    tick: {
      sessionId: (request.sessionId ?? "").trim(),
      input: request.input,
      state: stateResult.state,
      nextHop,
      plannedSteps: ["receive-input", "advance-state", `handoff:${nextHop}`],
      dryRun: true,
      unsafeSideEffects: false,
    },
    events: ["agentCore.execution.mainLoop.tickPlanned", ...stateResult.events],
  };
}
