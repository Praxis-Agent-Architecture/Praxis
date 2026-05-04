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
export type MainLoopTickKind =
  | "model-only"
  | "tool-call"
  | "ephemeral-procedure"
  | "approval-wait"
  | "resume"
  | "interrupt"
  | "failure";

export type MainLoopActionPrimitive =
  | "receiveInput"
  | "advanceState"
  | "planMainLoopTick"
  | "assemblePromptPack"
  | "handoffPromptPack"
  | "lowerPrompt"
  | "handoffModelInvocation"
  | "invokeModel"
  | "interpretModelDecision"
  | "handoffModelDecision"
  | "handoffToolCall"
  | "invokeBaseTool"
  | "handoffEphemeralProcedure"
  | "executeEphemeralProcedure"
  | "integrateObservation"
  | "requestApproval"
  | "waitApproval"
  | "resume"
  | "interrupt"
  | "retry"
  | "timeout"
  | "emitEvent"
  | "recordSessionEvent"
  | "requestTapCapability"
  | "exposeOutput"
  | "fail";

export const MAIN_LOOP_ACTION_PRIMITIVES = [
  "receiveInput",
  "advanceState",
  "planMainLoopTick",
  "assemblePromptPack",
  "handoffPromptPack",
  "lowerPrompt",
  "handoffModelInvocation",
  "invokeModel",
  "interpretModelDecision",
  "handoffModelDecision",
  "handoffToolCall",
  "invokeBaseTool",
  "handoffEphemeralProcedure",
  "executeEphemeralProcedure",
  "integrateObservation",
  "requestApproval",
  "waitApproval",
  "resume",
  "interrupt",
  "retry",
  "timeout",
  "emitEvent",
  "recordSessionEvent",
  "requestTapCapability",
  "exposeOutput",
  "fail",
] as const satisfies readonly MainLoopActionPrimitive[];

export type MainLoopStepStatus =
  | "planned"
  | "running"
  | "completed"
  | "failed"
  | "interrupted"
  | "waitingApproval";

export type MainLoopStepGateResult = {
  accepted: boolean;
  reason?: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type MainLoopPublicSafeFailure = {
  code: string;
  message: string;
  boundary: "input" | "runtime-state" | "contract" | "governance" | "prompt" | "model" | "tool" | "procedure" | "output";
  publicSafe: true;
};

export type MainLoopStepTrace = AgentExecutionStateTrace & {
  traceId?: string;
};

export type MainLoopStepRecord = {
  stepId: string;
  sessionId: string;
  turnIndex: number;
  stepIndex: number;
  actionPrimitive: MainLoopActionPrimitive;
  status: MainLoopStepStatus;
  inputRefs: readonly string[];
  outputRefs: readonly string[];
  modelCallId?: string;
  toolCallId?: string;
  procedureId?: string;
  stateBeforeRef?: string;
  stateAfterRef?: string;
  promptPackRef?: string;
  loweredPromptRef?: string;
  observationRefs: readonly string[];
  governance: MainLoopStepGateResult;
  contract: MainLoopStepGateResult;
  error?: MainLoopPublicSafeFailure;
  timestamps: {
    plannedAt: string;
    startedAt?: string;
    completedAt?: string;
    failedAt?: string;
    interruptedAt?: string;
    waitingApprovalAt?: string;
  };
  trace: MainLoopStepTrace;
  metadata: Readonly<Record<string, unknown>>;
};

export type AgentMainLoopBoundary = "input" | "runtime-state" | "contract" | "governance";

export type AgentMainLoopRequest = {
  sessionId?: string;
  input?: unknown;
  now?: string;
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
  stepRecords: readonly MainLoopStepRecord[];
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

export type FrameworkMainLoopHandoffRequest = {
  sessionId?: string;
  turnIndex?: number;
  startStepIndex?: number;
  now?: string;
  tickKind: MainLoopTickKind;
  promptPackRef?: string;
  loweredPromptRef?: string;
  modelCallId?: string;
  toolCallId?: string;
  procedureId?: string;
  observationRefs?: readonly string[];
  stateBeforeRef?: string;
  stateAfterRef?: string;
  inputRefs?: readonly string[];
  outputRefs?: readonly string[];
  error?: MainLoopPublicSafeFailure;
  trace?: MainLoopStepTrace;
  governance?: MainLoopStepGateResult;
  contract?: MainLoopStepGateResult;
};

export type FrameworkMainLoopHandoffPlan = {
  kind: "praxis.mainLoopHandoffPlan";
  sessionId: string;
  tickKind: MainLoopTickKind;
  stepRecords: readonly MainLoopStepRecord[];
  nextAction?: MainLoopActionPrimitive;
  eventRefs: readonly string[];
  dryRun: true;
  unsafeSideEffects: false;
};

export type FrameworkMainLoopHandoffResult =
  | { ok: true; plan: FrameworkMainLoopHandoffPlan; events: readonly string[] }
  | { ok: false; error: AgentMainLoopError; events: readonly string[] };

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

function defaultTimestamp(): string {
  return new Date(0).toISOString();
}

function cleanRefs(refs: readonly string[] | undefined): readonly string[] {
  return [...new Set((refs ?? []).map((ref) => ref.trim()).filter(Boolean))];
}

function gateResult(gate: AgentExecutionStateGate | undefined): MainLoopStepGateResult {
  if (gate === undefined) {
    return { accepted: true };
  }
  return gate.reason === undefined
    ? { accepted: gate.accepted }
    : { accepted: gate.accepted, reason: gate.reason };
}

export function createMainLoopStepRecord(input: {
  sessionId: string;
  turnIndex: number;
  stepIndex: number;
  actionPrimitive: MainLoopActionPrimitive;
  status?: MainLoopStepStatus;
  inputRefs?: readonly string[];
  outputRefs?: readonly string[];
  modelCallId?: string;
  toolCallId?: string;
  procedureId?: string;
  stateBeforeRef?: string;
  stateAfterRef?: string;
  promptPackRef?: string;
  loweredPromptRef?: string;
  observationRefs?: readonly string[];
  governance?: MainLoopStepGateResult;
  contract?: MainLoopStepGateResult;
  error?: MainLoopPublicSafeFailure;
  now?: string;
  trace?: MainLoopStepTrace;
  metadata?: Readonly<Record<string, unknown>>;
}): MainLoopStepRecord {
  const status = input.status ?? "planned";
  const timestamp = input.now ?? defaultTimestamp();
  return {
    stepId: `${input.sessionId}:turn:${input.turnIndex}:step:${input.stepIndex}:${input.actionPrimitive}`,
    sessionId: input.sessionId,
    turnIndex: input.turnIndex,
    stepIndex: input.stepIndex,
    actionPrimitive: input.actionPrimitive,
    status,
    inputRefs: cleanRefs(input.inputRefs),
    outputRefs: cleanRefs(input.outputRefs),
    modelCallId: input.modelCallId?.trim() || undefined,
    toolCallId: input.toolCallId?.trim() || undefined,
    procedureId: input.procedureId?.trim() || undefined,
    stateBeforeRef: input.stateBeforeRef?.trim() || undefined,
    stateAfterRef: input.stateAfterRef?.trim() || undefined,
    promptPackRef: input.promptPackRef?.trim() || undefined,
    loweredPromptRef: input.loweredPromptRef?.trim() || undefined,
    observationRefs: cleanRefs(input.observationRefs),
    governance: input.governance ?? { accepted: true },
    contract: input.contract ?? { accepted: true },
    error: input.error,
    timestamps: {
      plannedAt: timestamp,
      ...(status === "running" ? { startedAt: timestamp } : {}),
      ...(status === "completed" ? { completedAt: timestamp } : {}),
      ...(status === "failed" ? { failedAt: timestamp } : {}),
      ...(status === "interrupted" ? { interruptedAt: timestamp } : {}),
      ...(status === "waitingApproval" ? { waitingApprovalAt: timestamp } : {}),
    },
    trace: input.trace ?? {},
    metadata: input.metadata ?? {},
  };
}

function handoffPrimitivesForTick(kind: MainLoopTickKind): readonly MainLoopActionPrimitive[] {
  if (kind === "model-only") {
    return ["handoffPromptPack", "handoffModelInvocation", "handoffModelDecision"];
  }
  if (kind === "tool-call") {
    return ["handoffToolCall", "invokeBaseTool", "integrateObservation", "recordSessionEvent"];
  }
  if (kind === "ephemeral-procedure") {
    return ["handoffEphemeralProcedure", "executeEphemeralProcedure", "integrateObservation", "recordSessionEvent"];
  }
  if (kind === "approval-wait") {
    return ["requestApproval", "waitApproval", "recordSessionEvent"];
  }
  if (kind === "resume") {
    return ["resume", "advanceState", "recordSessionEvent"];
  }
  if (kind === "interrupt") {
    return ["interrupt", "advanceState", "recordSessionEvent"];
  }
  return ["fail", "recordSessionEvent"];
}

export function planFrameworkMainLoopHandoff(request: FrameworkMainLoopHandoffRequest): FrameworkMainLoopHandoffResult {
  if (isBlank(request.sessionId)) {
    return {
      ok: false,
      error: {
        code: "MISSING_SESSION_ID",
        message: "framework mainLoop handoff requires a sessionId",
        boundary: "input",
        stateSafe: true,
      },
      events: ["agentCore.execution.mainLoop.rejected"],
    };
  }

  const sessionId = request.sessionId?.trim() ?? "";
  const turnIndex = request.turnIndex ?? 0;
  const startStepIndex = request.startStepIndex ?? 0;
  const primitives = handoffPrimitivesForTick(request.tickKind);
  const governance = request.governance ?? { accepted: true };
  const contract = request.contract ?? { accepted: true };
  const eventRefs = [`mainLoop.tick.${request.tickKind}`];

  const stepRecords = primitives.map((primitive, index) => {
    const isFailure = request.tickKind === "failure" || request.error !== undefined;
    const status: MainLoopStepStatus =
      primitive === "waitApproval"
        ? "waitingApproval"
        : primitive === "interrupt"
          ? "interrupted"
          : isFailure && primitive === "fail"
            ? "failed"
            : "planned";
    return createMainLoopStepRecord({
      sessionId,
      turnIndex,
      stepIndex: startStepIndex + index,
      actionPrimitive: primitive,
      status,
      inputRefs: request.inputRefs,
      outputRefs: request.outputRefs,
      modelCallId: request.modelCallId,
      toolCallId: request.toolCallId,
      procedureId: request.procedureId,
      promptPackRef: request.promptPackRef,
      loweredPromptRef: request.loweredPromptRef,
      observationRefs: request.observationRefs,
      stateBeforeRef: request.stateBeforeRef,
      stateAfterRef: request.stateAfterRef,
      governance,
      contract,
      error: primitive === "fail" ? request.error : undefined,
      trace: request.trace,
      now: request.now,
      metadata: { tickKind: request.tickKind },
    });
  });

  return {
    ok: true,
    plan: {
      kind: "praxis.mainLoopHandoffPlan",
      sessionId,
      tickKind: request.tickKind,
      stepRecords,
      nextAction: primitives[0],
      eventRefs,
      dryRun: true,
      unsafeSideEffects: false,
    },
    events: ["agentCore.execution.mainLoop.handoffPlanned"],
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
  const sessionId = (request.sessionId ?? "").trim();

  return {
    ok: true,
    tick: {
      sessionId,
      input: request.input,
      state: stateResult.state,
      nextHop,
      plannedSteps: ["receive-input", "advance-state", `handoff:${nextHop}`],
      stepRecords: [
        createMainLoopStepRecord({
          sessionId,
          turnIndex: 0,
          stepIndex: 0,
          actionPrimitive: "receiveInput",
          status: "completed",
          inputRefs: ["runtime.input"],
          outputRefs: ["runtime.input.normalized"],
          stateAfterRef: `${sessionId}:state:${stateResult.state.revision}`,
          governance: gateResult(request.governance),
          contract: gateResult(request.contract),
          trace: request.trace,
          now: request.now,
        }),
        createMainLoopStepRecord({
          sessionId,
          turnIndex: 0,
          stepIndex: 1,
          actionPrimitive: "assemblePromptPack",
          status: "planned",
          inputRefs: ["runtime.input.normalized"],
          stateBeforeRef: `${sessionId}:state:${stateResult.state.revision}`,
          governance: gateResult(request.governance),
          contract: gateResult(request.contract),
          trace: request.trace,
          now: request.now,
        }),
      ],
      dryRun: true,
      unsafeSideEffects: false,
    },
    events: ["agentCore.execution.mainLoop.tickPlanned", ...stateResult.events],
  };
}
