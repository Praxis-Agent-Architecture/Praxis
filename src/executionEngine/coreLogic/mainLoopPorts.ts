/*
 * 文件定位：Agent 执行引擎 / MainLoop ports。
 * 核心目的：定义 MainLoopEngine 面向 runtime/application 的注入端口。
 * 边界：端口是合同，不绑定 OpenAI/Anthropic/Gemini 等 provider 字段形状。
 */

import type {
  MainLoopRunnerActionResult,
  MainLoopRunnerDecisionResult,
  MainLoopRunnerError,
  MainLoopRunnerFinalResult,
  MainLoopRunnerModelResult,
  MainLoopRunnerUsageReport,
  MainLoopRunnerTurnPackage,
} from "./mainLoop.js";
import type { MainLoopStepRecord } from "./mainLoop.js";
import type { ModelDecision } from "./modelDecision.js";
import type { MainLoopTurnState } from "./turnState.js";

export type MainLoopCoreEventName =
  | "turn.started"
  | "turn.state.changed"
  | "turn.completed"
  | "turn.failed"
  | "turn.interrupted"
  | "model.started"
  | "model.delta"
  | "model.completed"
  | "model.failed"
  | "tool.queued"
  | "tool.started"
  | "tool.progress"
  | "tool.completed"
  | "tool.failed"
  | "approval.requested"
  | "approval.resolved"
  | "observation.added"
  | "summary.started"
  | "summary.completed"
  | "final.accepted";

export type MainLoopCoreEvent = {
  eventId: string;
  name: MainLoopCoreEventName;
  sessionId: string;
  turnId?: string;
  turnIndex?: number;
  createdAt: string;
  payload: Readonly<Record<string, unknown>>;
  metadata: Readonly<Record<string, unknown>>;
};

export type MainLoopModelStreamEvent<TRaw = unknown> =
  | {
      kind: "model.started";
      providerRef?: string;
      metadata?: Readonly<Record<string, unknown>>;
    }
  | {
      kind: "model.delta";
      textDelta?: string;
      rawDelta?: TRaw;
      metadata?: Readonly<Record<string, unknown>>;
    }
  | {
      kind: "model.completed";
      raw?: TRaw;
      usage?: MainLoopUsageReport;
      metadata?: Readonly<Record<string, unknown>>;
    };

export type MainLoopStreamAccumulatorState<TRaw = unknown> = {
  eventCount: number;
  text: string;
  rawDeltas: readonly TRaw[];
  usage?: MainLoopUsageReport;
  providerRef?: string;
  completed: boolean;
  metadata: Readonly<Record<string, unknown>>;
};

export type MainLoopUsageReport = MainLoopRunnerUsageReport;

export type MainLoopUsagePricing = {
  inputUsdPerMillionTokens?: number;
  outputUsdPerMillionTokens?: number;
  modelRef?: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export function createMainLoopStreamAccumulator<TRaw = unknown>(): {
  push: (event: MainLoopModelStreamEvent<TRaw>) => MainLoopStreamAccumulatorState<TRaw>;
  snapshot: () => MainLoopStreamAccumulatorState<TRaw>;
} {
  let state: MainLoopStreamAccumulatorState<TRaw> = {
    eventCount: 0,
    text: "",
    rawDeltas: [],
    completed: false,
    metadata: {},
  };
  return {
    push(event) {
      state = reduceMainLoopStreamAccumulator(state, event);
      return state;
    },
    snapshot() {
      return {
        ...state,
        rawDeltas: [...state.rawDeltas],
        metadata: { ...state.metadata },
      };
    },
  };
}

export function reduceMainLoopStreamAccumulator<TRaw>(
  state: MainLoopStreamAccumulatorState<TRaw>,
  event: MainLoopModelStreamEvent<TRaw>,
): MainLoopStreamAccumulatorState<TRaw> {
  if (event.kind === "model.started") {
    return {
      ...state,
      eventCount: state.eventCount + 1,
      providerRef: event.providerRef ?? state.providerRef,
      metadata: { ...state.metadata, ...(event.metadata ?? {}) },
    };
  }
  if (event.kind === "model.delta") {
    return {
      ...state,
      eventCount: state.eventCount + 1,
      text: state.text + (event.textDelta ?? ""),
      rawDeltas: event.rawDelta === undefined ? state.rawDeltas : [...state.rawDeltas, event.rawDelta],
      metadata: { ...state.metadata, ...(event.metadata ?? {}) },
    };
  }
  return {
    ...state,
    eventCount: state.eventCount + 1,
    rawDeltas: event.raw === undefined ? state.rawDeltas : [...state.rawDeltas, event.raw],
    usage: event.usage ?? state.usage,
    completed: true,
    metadata: { ...state.metadata, ...(event.metadata ?? {}) },
  };
}

export type MainLoopSummarizerRequest = {
  sessionId: string;
  turnId: string;
  materialRefs: readonly string[];
  maxOutputTokens?: number;
  metadata: Readonly<Record<string, unknown>>;
};

export type MainLoopSummarizerResult =
  | {
      ok: true;
      summaryText: string;
      artifactRef?: string;
      events: readonly string[];
      metadata: Readonly<Record<string, unknown>>;
    }
  | {
      ok: false;
      error: MainLoopRunnerError;
      events: readonly string[];
    };

export type MainLoopSummarizerPort = {
  summarize: (request: MainLoopSummarizerRequest) => Promise<MainLoopSummarizerResult>;
};

export const noopMainLoopSummarizer: MainLoopSummarizerPort = {
  async summarize() {
    return {
      ok: false,
      error: {
        code: "SUMMARY_PORT_NOT_CONFIGURED",
        message: "no MainLoop summarizer port configured",
        boundary: "output",
        publicSafe: true,
      },
      events: ["agentCore.execution.mainLoop.summary.noop"],
    };
  },
};

export type MainLoopRecorderPort = {
  recordEvent: (event: MainLoopCoreEvent) => Promise<void> | void;
  recordStep: (step: MainLoopStepRecord) => Promise<void> | void;
  recordTurnState: (state: MainLoopTurnState) => Promise<void> | void;
};

export type MainLoopEnginePorts<TPrompt, TRaw> = {
  prepareTurn: (turnIndex: number, state: MainLoopTurnState) => Promise<MainLoopRunnerTurnPackage<TPrompt> | { ok: false; error: MainLoopRunnerError; events: readonly string[] }>;
  invokeModel: (
    turnIndex: number,
    prompt: TPrompt,
    state: MainLoopTurnState,
    onStreamEvent?: (event: MainLoopModelStreamEvent<TRaw>) => void | Promise<void>,
  ) => Promise<MainLoopRunnerModelResult<TRaw>>;
  interpretDecision: (
    turnIndex: number,
    model: Extract<MainLoopRunnerModelResult<TRaw>, { ok: true }>,
    prompt: TPrompt,
    state: MainLoopTurnState,
  ) => Promise<MainLoopRunnerDecisionResult>;
  acceptFinalOutput: (input: { turnIndex: number; decisionIndex: number; decision: ModelDecision; prompt: TPrompt; state: MainLoopTurnState }) => Promise<MainLoopRunnerFinalResult>;
  handleContinue: (input: { turnIndex: number; decisionIndex: number; decision: ModelDecision; prompt: TPrompt; state: MainLoopTurnState }) => Promise<MainLoopRunnerActionResult>;
  handleFailure: (input: { turnIndex: number; decisionIndex: number; decision: ModelDecision; prompt: TPrompt; state: MainLoopTurnState }) => Promise<MainLoopRunnerActionResult>;
  handleApproval: (input: { turnIndex: number; decisionIndex: number; decision: ModelDecision; prompt: TPrompt; state: MainLoopTurnState }) => Promise<MainLoopRunnerActionResult>;
  handleToolCall: (input: { turnIndex: number; decisionIndex: number; decision: ModelDecision; prompt: TPrompt; state: MainLoopTurnState }) => Promise<MainLoopRunnerActionResult>;
  handleEphemeralProcedure: (input: { turnIndex: number; decisionIndex: number; decision: ModelDecision; prompt: TPrompt; state: MainLoopTurnState }) => Promise<MainLoopRunnerActionResult>;
};
