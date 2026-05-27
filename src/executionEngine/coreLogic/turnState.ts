/*
 * 文件定位：Agent 执行引擎 / MainLoop turn state。
 * 核心目的：承载单个 user turn 内可恢复、可审计、可被 application 观察的细状态。
 * 边界：只描述状态与转换，不执行模型、工具、审批或沙箱副作用。
 */

export type MainLoopTurnPhase =
  | "idle"
  | "preparing"
  | "modelInvoking"
  | "decisionInterpreting"
  | "toolScheduling"
  | "awaitingApproval"
  | "summarizing"
  | "finalizing"
  | "completed"
  | "failed"
  | "interrupted";

export type PendingInputDisposition =
  | "nextTurn"
  | "interruptAndRestart"
  | "appendContextForCurrentTurn";

export type MainLoopPendingInput = {
  inputId: string;
  text: string;
  disposition: PendingInputDisposition;
  receivedAt: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type MainLoopResumeToken = {
  sessionId: string;
  turnId: string;
  approvalId: string;
  checkpointRef: string;
  pendingActionRef: string;
  createdAt: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type MainLoopToolContextSelection = {
  selectionId: string;
  targetKind: "family" | "group" | "tool";
  family?: string;
  group?: string;
  toolId?: string;
  reason?: string;
  expiresAfterPrompt: true;
};

export type MainLoopInterruptCheckpoint = {
  controlActionId: string;
  cancelTokenId: string;
  rollbackPointRef?: string;
  replayPlanRef?: string;
  reason?: string;
  createdAt: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type MainLoopBudgetUsage = {
  modelTurns: number;
  toolCalls: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  metadata: Readonly<Record<string, unknown>>;
};

export type MainLoopTurnStateTransition = {
  transitionId: string;
  sessionId: string;
  turnId: string;
  from: MainLoopTurnPhase;
  to: MainLoopTurnPhase;
  reason?: string;
  createdAt: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type MainLoopTurnState = {
  sessionId: string;
  turnId: string;
  turnIndex: number;
  phase: MainLoopTurnPhase;
  revision: number;
  createdAt: string;
  updatedAt: string;
  pendingInputQueue: readonly MainLoopPendingInput[];
  resumeToken?: MainLoopResumeToken;
  toolContextSelection?: MainLoopToolContextSelection;
  interruptCheckpoint?: MainLoopInterruptCheckpoint;
  observationRefs: readonly string[];
  stateRefs: readonly string[];
  budgetUsage: MainLoopBudgetUsage;
  transitions: readonly MainLoopTurnStateTransition[];
  metadata: Readonly<Record<string, unknown>>;
};

export function createMainLoopBudgetUsage(input: Partial<MainLoopBudgetUsage> = {}): MainLoopBudgetUsage {
  return {
    modelTurns: positiveInteger(input.modelTurns),
    toolCalls: positiveInteger(input.toolCalls),
    inputTokens: positiveInteger(input.inputTokens),
    outputTokens: positiveInteger(input.outputTokens),
    totalTokens: positiveInteger(input.totalTokens ?? (positiveInteger(input.inputTokens) + positiveInteger(input.outputTokens))),
    estimatedCostUsd: typeof input.estimatedCostUsd === "number" && Number.isFinite(input.estimatedCostUsd)
      ? Math.max(0, input.estimatedCostUsd)
      : 0,
    metadata: input.metadata ?? {},
  };
}

export function createMainLoopTurnState(input: {
  sessionId: string;
  turnIndex: number;
  turnId?: string;
  now?: string;
  phase?: MainLoopTurnPhase;
  metadata?: Readonly<Record<string, unknown>>;
}): MainLoopTurnState {
  const now = input.now ?? new Date().toISOString();
  const turnId = normalizeString(input.turnId) ?? `${input.sessionId}:turn:${input.turnIndex}`;
  return {
    sessionId: input.sessionId,
    turnId,
    turnIndex: input.turnIndex,
    phase: input.phase ?? "idle",
    revision: 0,
    createdAt: now,
    updatedAt: now,
    pendingInputQueue: [],
    observationRefs: [],
    stateRefs: [],
    budgetUsage: createMainLoopBudgetUsage(),
    transitions: [],
    metadata: input.metadata ?? {},
  };
}

export function transitionMainLoopTurnState(
  state: MainLoopTurnState,
  input: {
    to: MainLoopTurnPhase;
    reason?: string;
    now?: string;
    metadata?: Readonly<Record<string, unknown>>;
  },
): MainLoopTurnState {
  const now = input.now ?? new Date().toISOString();
  const transition: MainLoopTurnStateTransition = {
    transitionId: `${state.turnId}:transition:${state.revision + 1}`,
    sessionId: state.sessionId,
    turnId: state.turnId,
    from: state.phase,
    to: input.to,
    reason: input.reason,
    createdAt: now,
    metadata: input.metadata ?? {},
  };
  return {
    ...state,
    phase: input.to,
    revision: state.revision + 1,
    updatedAt: now,
    transitions: [...state.transitions, transition],
  };
}

export function enqueueMainLoopPendingInput(
  state: MainLoopTurnState,
  input: {
    inputId: string;
    text: string;
    disposition?: PendingInputDisposition;
    now?: string;
    metadata?: Readonly<Record<string, unknown>>;
  },
): MainLoopTurnState {
  const text = input.text.trim();
  if (text.length === 0) {
    return state;
  }
  const now = input.now ?? new Date().toISOString();
  const pending: MainLoopPendingInput = {
    inputId: input.inputId,
    text,
    disposition: input.disposition ?? "nextTurn",
    receivedAt: now,
    metadata: input.metadata ?? {},
  };
  return {
    ...state,
    revision: state.revision + 1,
    updatedAt: now,
    pendingInputQueue: [...state.pendingInputQueue, pending],
  };
}

export function consumeMainLoopPendingInputs(
  state: MainLoopTurnState,
  disposition?: PendingInputDisposition,
): { state: MainLoopTurnState; inputs: readonly MainLoopPendingInput[] } {
  const inputs = disposition === undefined
    ? state.pendingInputQueue
    : state.pendingInputQueue.filter((input) => input.disposition === disposition);
  const consumed = new Set(inputs.map((input) => input.inputId));
  return {
    state: {
      ...state,
      revision: inputs.length > 0 ? state.revision + 1 : state.revision,
      updatedAt: inputs.length > 0 ? new Date().toISOString() : state.updatedAt,
      pendingInputQueue: state.pendingInputQueue.filter((input) => !consumed.has(input.inputId)),
    },
    inputs,
  };
}

export function registerMainLoopApprovalWait(
  state: MainLoopTurnState,
  input: {
    approvalId: string;
    checkpointRef: string;
    pendingActionRef: string;
    now?: string;
    metadata?: Readonly<Record<string, unknown>>;
  },
): MainLoopTurnState {
  const now = input.now ?? new Date().toISOString();
  const waiting = transitionMainLoopTurnState(state, {
    to: "awaitingApproval",
    reason: "approval requested",
    now,
    metadata: { approvalId: input.approvalId },
  });
  return {
    ...waiting,
    resumeToken: {
      sessionId: state.sessionId,
      turnId: state.turnId,
      approvalId: input.approvalId,
      checkpointRef: input.checkpointRef,
      pendingActionRef: input.pendingActionRef,
      createdAt: now,
      metadata: input.metadata ?? {},
    },
  };
}

export function resumeMainLoopTurnState(
  state: MainLoopTurnState,
  input: {
    resumeToken: MainLoopResumeToken;
    now?: string;
    metadata?: Readonly<Record<string, unknown>>;
  },
): MainLoopTurnState {
  const resumed = transitionMainLoopTurnState(state, {
    to: "preparing",
    reason: "resume from approval wait",
    now: input.now,
    metadata: {
      approvalId: input.resumeToken.approvalId,
      checkpointRef: input.resumeToken.checkpointRef,
      pendingActionRef: input.resumeToken.pendingActionRef,
      ...(input.metadata ?? {}),
    },
  });
  return {
    ...resumed,
    resumeToken: undefined,
  };
}

export function setMainLoopToolContextSelection(
  state: MainLoopTurnState,
  selection: Omit<MainLoopToolContextSelection, "expiresAfterPrompt">,
): MainLoopTurnState {
  return {
    ...state,
    revision: state.revision + 1,
    updatedAt: new Date().toISOString(),
    toolContextSelection: { ...selection, expiresAfterPrompt: true },
  };
}

export function clearMainLoopOneShotToolContextSelection(state: MainLoopTurnState): MainLoopTurnState {
  if (state.toolContextSelection === undefined) {
    return state;
  }
  return {
    ...state,
    revision: state.revision + 1,
    updatedAt: new Date().toISOString(),
    toolContextSelection: undefined,
  };
}

export function addMainLoopObservationRefs(
  state: MainLoopTurnState,
  observationRefs: readonly string[],
): MainLoopTurnState {
  const refs = uniqueStrings([...state.observationRefs, ...observationRefs]);
  return {
    ...state,
    revision: refs.length === state.observationRefs.length ? state.revision : state.revision + 1,
    updatedAt: refs.length === state.observationRefs.length ? state.updatedAt : new Date().toISOString(),
    observationRefs: refs,
  };
}

export function addMainLoopBudgetUsage(
  state: MainLoopTurnState,
  usage: Partial<MainLoopBudgetUsage>,
): MainLoopTurnState {
  const inputTokenDelta = positiveInteger(usage.inputTokens);
  const outputTokenDelta = positiveInteger(usage.outputTokens);
  const totalTokenDelta = usage.totalTokens === undefined
    ? inputTokenDelta + outputTokenDelta
    : positiveInteger(usage.totalTokens);
  const next = {
    modelTurns: state.budgetUsage.modelTurns + positiveInteger(usage.modelTurns),
    toolCalls: state.budgetUsage.toolCalls + positiveInteger(usage.toolCalls),
    inputTokens: state.budgetUsage.inputTokens + inputTokenDelta,
    outputTokens: state.budgetUsage.outputTokens + outputTokenDelta,
    totalTokens: state.budgetUsage.totalTokens + totalTokenDelta,
    estimatedCostUsd: state.budgetUsage.estimatedCostUsd
      + (typeof usage.estimatedCostUsd === "number" && Number.isFinite(usage.estimatedCostUsd) ? Math.max(0, usage.estimatedCostUsd) : 0),
    metadata: { ...state.budgetUsage.metadata, ...(usage.metadata ?? {}) },
  };
  return {
    ...state,
    revision: state.revision + 1,
    updatedAt: new Date().toISOString(),
    budgetUsage: next,
  };
}

export function interruptMainLoopTurnState(
  state: MainLoopTurnState,
  input: {
    controlActionId: string;
    cancelTokenId: string;
    rollbackPointRef?: string;
    replayPlanRef?: string;
    reason?: string;
    now?: string;
    metadata?: Readonly<Record<string, unknown>>;
  },
): MainLoopTurnState {
  const now = input.now ?? new Date().toISOString();
  const interrupted = transitionMainLoopTurnState(state, {
    to: "interrupted",
    reason: input.reason,
    now,
    metadata: { controlActionId: input.controlActionId, cancelTokenId: input.cancelTokenId },
  });
  return {
    ...interrupted,
    interruptCheckpoint: {
      controlActionId: input.controlActionId,
      cancelTokenId: input.cancelTokenId,
      rollbackPointRef: input.rollbackPointRef,
      replayPlanRef: input.replayPlanRef,
      reason: input.reason,
      createdAt: now,
      metadata: input.metadata ?? {},
    },
  };
}

function normalizeString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function positiveInteger(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];
}
