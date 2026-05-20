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
import type { ModelDecision } from "./modelDecision.js";
import {
  assemblePromptPack,
  type PromptPackCachePlan,
  type PromptPackCacheTelemetry,
  type StandardPromptPack,
} from "../promptPack/promptAssembler.js";
import {
  definePromptPack,
  type PromptPackMaterialDraft,
} from "../promptPack/promptDefiner.js";

export type AgentMainLoopNextHop = "prompt-pack" | "model-adapter" | "tool-layer" | "event-exposure" | "none";
export type MainLoopTickKind =
  | "model-only"
  | "tool-call"
  | "ephemeral-procedure"
  | "approval-wait"
  | "resume"
  | "interrupt"
  | "failure";

export type MainLoopTimelineRefKind = "run" | "userTurn" | "loopTick" | "step" | "checkpoint";

export type MainLoopTimelineRef = {
  kind: MainLoopTimelineRefKind;
  sessionId: string;
  userTurnIndex?: number;
  loopTickIndex?: number;
  stepIndex?: number;
  checkpointId?: string;
  ref: string;
};

export type MainLoopCheckpointKind =
  | "sessionStart"
  | "approvalWait"
  | "failedStep"
  | "observationIntegrated"
  | "manual"
  | "finalized";

export type MainLoopCheckpoint = {
  checkpointId: string;
  kind: MainLoopCheckpointKind;
  sessionId: string;
  userTurnIndex: number;
  loopTickIndex: number;
  stepIndex?: number;
  stateRef?: string;
  promptPackRef?: string;
  loweredPromptRef?: string;
  observationRefs: readonly string[];
  createdAt: string;
  timelineRef: MainLoopTimelineRef;
  metadata: Readonly<Record<string, unknown>>;
};

export type MainLoopStep = {
  timelineRef: MainLoopTimelineRef;
  record: MainLoopStepRecord;
};

export type LoopTickStatus = "planned" | "running" | "waitingApproval" | "completed" | "failed" | "interrupted";

export type LoopTick = {
  tickId: string;
  sessionId: string;
  userTurnIndex: number;
  loopTickIndex: number;
  kind: MainLoopTickKind;
  status: LoopTickStatus;
  steps: readonly MainLoopStep[];
  checkpoints: readonly MainLoopCheckpoint[];
  promptPackRef?: string;
  loweredPromptRef?: string;
  selectedModel?: string;
  cacheHealth?: Readonly<Record<string, unknown>>;
  budgetSnapshot?: Readonly<Record<string, unknown>>;
  stateRefs: readonly string[];
  observationRefs: readonly string[];
  timelineRef: MainLoopTimelineRef;
  metadata: Readonly<Record<string, unknown>>;
};

export type UserTurnStatus = "open" | "running" | "waitingApproval" | "completed" | "failed" | "interrupted";

export type UserTurn = {
  userTurnId: string;
  sessionId: string;
  userTurnIndex: number;
  status: UserTurnStatus;
  inputRefs: readonly string[];
  outputRefs: readonly string[];
  ticks: readonly LoopTick[];
  checkpoints: readonly MainLoopCheckpoint[];
  startedAt: string;
  completedAt?: string;
  timelineRef: MainLoopTimelineRef;
  metadata: Readonly<Record<string, unknown>>;
};

export type MainLoopRunStatus = "created" | "running" | "waitingApproval" | "completed" | "failed" | "interrupted";

export type MainLoopRun = {
  runId: string;
  sessionId: string;
  status: MainLoopRunStatus;
  userTurns: readonly UserTurn[];
  checkpoints: readonly MainLoopCheckpoint[];
  createdAt: string;
  updatedAt: string;
  timelineRef: MainLoopTimelineRef;
  metadata: Readonly<Record<string, unknown>>;
};

export type MainLoopSessionTimeline = {
  sessionId: string;
  run: MainLoopRun;
  timelineRefs: readonly MainLoopTimelineRef[];
  checkpoints: readonly MainLoopCheckpoint[];
  metadata: Readonly<Record<string, unknown>>;
};

export type MainLoopRuntimeSurfaceRef = {
  surfaceId: string;
  kind:
    | "modelAdapter"
    | "baseToolExecutor"
    | "stateEventStore"
    | "promptPack"
    | "interfaceAdapter"
    | "sandbox"
    | "storage"
    | "governance"
    | "inspection"
    | (string & {});
  ready: boolean;
  metadata?: Readonly<Record<string, unknown>>;
};

export type MainLoopRuntimeContext = {
  runtimeId: string;
  sessionId: string;
  manifestRef?: string;
  callerRef?: string;
  surfaces: readonly MainLoopRuntimeSurfaceRef[];
  now?: () => string;
  metadata: Readonly<Record<string, unknown>>;
};

export type RunMainLoopRequest = {
  runtime: MainLoopRuntimeContext;
  input: unknown;
  userTurnIndex?: number;
  loopTickIndex?: number;
  startStepIndex?: number;
  inputRefs?: readonly string[];
  targetModel?: string;
  loweringHint?: string;
  promptPackId?: string;
  materials?: readonly PromptPackMaterialDraft[];
  maxLoopTicks?: number;
  trace?: AgentExecutionStateTrace;
  contract?: AgentExecutionStateGate;
  governance?: AgentExecutionStateGate;
};

export type RunMainLoopResult =
  | {
      ok: true;
      run: MainLoopRun;
      timeline: MainLoopSessionTimeline;
      userTurn: UserTurn;
      loopTicks: readonly LoopTick[];
      stepRecords: readonly MainLoopStepRecord[];
      turnPreparation?: Extract<MainLoopTurnPreparationResult, { ok: true }>;
      events: readonly string[];
      dryRun: true;
      unsafeSideEffects: false;
    }
  | {
      ok: false;
      error: AgentMainLoopError;
      events: readonly string[];
      dryRun: true;
      unsafeSideEffects: false;
    };

export type MainLoopRunnerBoundary =
  | "prompt"
  | "model"
  | "model-decision"
  | "approval"
  | "tool"
  | "procedure"
  | "output";

export type MainLoopRunnerError = {
  code: string;
  message: string;
  boundary: MainLoopRunnerBoundary;
  publicSafe: true;
};

export type MainLoopRunnerTurnPackage<TPrompt> = {
  prompt: TPrompt;
  events: readonly string[];
};

export type MainLoopRunnerModelResult<TRaw> =
  | {
      ok: true;
      modelCallId: string;
      raw: TRaw | null;
      events: readonly string[];
    }
  | {
      ok: false;
      modelCallId: string;
      error: MainLoopRunnerError;
      events: readonly string[];
    };

export type MainLoopRunnerDecisionResult =
  | {
      ok: true;
      decisions: readonly ModelDecision[];
      events: readonly string[];
    }
  | {
      ok: false;
      error: MainLoopRunnerError;
      events: readonly string[];
    };

export type MainLoopRunnerActionResult =
  | {
      ok: true;
      continueLoop: boolean;
      events: readonly string[];
    }
  | {
      ok: false;
      error: MainLoopRunnerError;
      events: readonly string[];
    };

export type MainLoopRunnerFinalResult =
  | {
      ok: true;
      finalOutput: string;
      events: readonly string[];
    }
  | {
      ok: false;
      error: MainLoopRunnerError;
      events: readonly string[];
    };

export type MainLoopRunnerNoFinalReason =
  | "model_turn_limit"
  | "tool_call_limit"
  | "no_continuation";

export type MainLoopRunnerNoFinalContext = {
  reason: MainLoopRunnerNoFinalReason;
  modelTurns: number;
  toolCalls: number;
  turnToolCalls: number;
  maxModelTurns: number;
  maxToolCalls: number;
};

export type MainLoopRunnerRequest<TPrompt, TRaw> = {
  maxModelTurns: number;
  /** Maximum tool calls accepted inside one model turn. */
  maxToolCalls: number;
  prepareTurn: (turnIndex: number) => Promise<MainLoopRunnerTurnPackage<TPrompt> | { ok: false; error: MainLoopRunnerError; events: readonly string[] }>;
  invokeModel: (turnIndex: number, prompt: TPrompt) => Promise<MainLoopRunnerModelResult<TRaw>>;
  interpretDecision: (turnIndex: number, model: Extract<MainLoopRunnerModelResult<TRaw>, { ok: true }>, prompt: TPrompt) => Promise<MainLoopRunnerDecisionResult>;
  acceptFinalOutput: (input: { turnIndex: number; decisionIndex: number; decision: ModelDecision; prompt: TPrompt }) => Promise<MainLoopRunnerFinalResult>;
  handleContinue: (input: { turnIndex: number; decisionIndex: number; decision: ModelDecision; prompt: TPrompt }) => Promise<MainLoopRunnerActionResult>;
  handleFailure: (input: { turnIndex: number; decisionIndex: number; decision: ModelDecision; prompt: TPrompt }) => Promise<MainLoopRunnerActionResult>;
  handleApproval: (input: { turnIndex: number; decisionIndex: number; decision: ModelDecision; prompt: TPrompt }) => Promise<MainLoopRunnerActionResult>;
  handleToolCall: (input: { turnIndex: number; decisionIndex: number; decision: ModelDecision; prompt: TPrompt }) => Promise<MainLoopRunnerActionResult>;
  handleEphemeralProcedure: (input: { turnIndex: number; decisionIndex: number; decision: ModelDecision; prompt: TPrompt }) => Promise<MainLoopRunnerActionResult>;
  onModelDryRun?: (input: { turnIndex: number; prompt: TPrompt; model: Extract<MainLoopRunnerModelResult<TRaw>, { ok: true }> }) => Promise<MainLoopRunnerFinalResult>;
  onNoFinalOutput?: (input: MainLoopRunnerNoFinalContext) => Promise<MainLoopRunnerFinalResult>;
};

export type MainLoopRunnerResult =
  | {
      ok: true;
      finalOutput: string;
      modelTurns: number;
      toolCalls: number;
      events: readonly string[];
    }
  | {
      ok: false;
      error: MainLoopRunnerError;
      modelTurns: number;
      toolCalls: number;
      events: readonly string[];
    };

export type MainLoopActionPrimitive =
  | "receiveInput"
  | "prepareTurn"
  | "sandboxPrepare"
  | "advanceState"
  | "planMainLoopTick"
  | "assemblePromptPack"
  | "buildCachePlan"
  | "handoffPromptPack"
  | "lowerPrompt"
  | "handoffModelInvocation"
  | "invokeModel"
  | "interpretModelDecision"
  | "adjudicateDecision"
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
  | "updateSummaryStateEvent"
  | "decideContinueBreak"
  | "requestTapCapability"
  | "exposeOutput"
  | "fail";

export const MAIN_LOOP_ACTION_PRIMITIVES = [
  "receiveInput",
  "prepareTurn",
  "sandboxPrepare",
  "advanceState",
  "planMainLoopTick",
  "assemblePromptPack",
  "buildCachePlan",
  "handoffPromptPack",
  "lowerPrompt",
  "handoffModelInvocation",
  "invokeModel",
  "interpretModelDecision",
  "adjudicateDecision",
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
  "updateSummaryStateEvent",
  "decideContinueBreak",
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

export type RuntimeAdjudicationKind =
  | "allowed"
  | "requiresApproval"
  | "blockedByPolicy"
  | "blockedBySandbox"
  | "resourceExceeded"
  | "invalidDecision"
  | "finalAllowed"
  | "continueAllowed";

export type RuntimeAdjudication = {
  kind: RuntimeAdjudicationKind;
  accepted: boolean;
  decisionId?: string;
  reason: string;
  requestedScopes: readonly string[];
  riskLevel?: "safe" | "risky" | "dangerous" | (string & {});
  metadata: Readonly<Record<string, unknown>>;
  publicSafe: true;
};

export type MainLoopContinuationDecisionKind =
  | "continue"
  | "break"
  | "waitApproval"
  | "interrupt"
  | "fail";

export type MainLoopContinuationDecision = {
  kind: MainLoopContinuationDecisionKind;
  accepted: boolean;
  reason: string;
  source: "model" | "developerStrategy" | "runtimeFallback";
  nextAction?: MainLoopActionPrimitive;
  metadata: Readonly<Record<string, unknown>>;
  publicSafe: true;
};

export type MainLoopBreakDecisionKind =
  | "finalAccepted"
  | "pendingApproval"
  | "unresolvedProcedure"
  | "fatalFailure"
  | "stateBlocked"
  | "budgetBlocked"
  | "runtimeRejected";

export type MainLoopBreakDecision = {
  kind: MainLoopBreakDecisionKind;
  canBreak: boolean;
  reason: string;
  finalOutput?: string;
  blockingRefs: readonly string[];
  metadata: Readonly<Record<string, unknown>>;
  publicSafe: true;
};

export type MainLoopBehaviorRefDecision = {
  behaviorRef: string;
  priority: number;
  decision: MainLoopContinuationDecision;
  conflicts: readonly string[];
  metadata: Readonly<Record<string, unknown>>;
};

export type MainLoopFinalAcceptanceRequest = {
  finalOutput?: string;
  pendingApprovalRefs?: readonly string[];
  unresolvedProcedureRefs?: readonly string[];
  fatalFailureRefs?: readonly string[];
  unrecordedEventRefs?: readonly string[];
  budget?: MainLoopStepGateResult;
  statePlane?: MainLoopStepGateResult;
  runtime?: MainLoopStepGateResult;
};

export type MainLoopBudgetSpec = {
  maxToolCallsPerLoopTick: number;
  maxToolCallsPerEphemeralProcedure: number;
  maxModelTurns: number;
  maxWallTimeMs: number;
  maxTokens?: number;
  maxCost?: number;
  maxShellSeconds: number;
  maxFileWrites?: number;
  maxNetworkCalls?: number;
};

export type RuntimeBudgetSpec = MainLoopBudgetSpec & {
  budgetId: string;
  source: "default" | "developer" | "runtime";
  metadata: Readonly<Record<string, unknown>>;
};

export type MainLoopBudgetExhaustionAction =
  | "fail"
  | "partialFinal"
  | "requestApproval"
  | "summarizeCurrentState"
  | "writeResumeCheckpoint";

export type MainLoopBudgetExhaustionDecision = {
  action: MainLoopBudgetExhaustionAction;
  reason: string;
  checkpoint?: MainLoopCheckpoint;
  approval?: MainLoopApprovalEnvelope;
  nextAction: MainLoopActionPrimitive;
  metadata: Readonly<Record<string, unknown>>;
  publicSafe: true;
};

export type MainLoopRetryPolicy = {
  maxAttempts: number;
  retryTarget: "model" | "sameTool" | "procedure";
  retryableBoundaries: readonly MainLoopPublicSafeFailure["boundary"][];
};

export type MainLoopFallbackPolicy = {
  enabled: boolean;
  fallbackTargets: readonly ("alternateTool" | "alternateProcedure" | "modelReplan" | "userIntervention")[];
};

export type MainLoopFailureRecoveryPolicy = {
  retry: MainLoopRetryPolicy;
  fallback: MainLoopFallbackPolicy;
  finalActions: readonly ("fail" | "interruptUser" | "runtimeFallback" | "modelAnalyze")[];
};

export type MainLoopFailureRecoveryDecision = {
  kind: "retry" | "fallback" | "fail" | "interruptUser";
  attempt: number;
  reason: string;
  nextAction?: MainLoopActionPrimitive;
  metadata: Readonly<Record<string, unknown>>;
  publicSafe: true;
};

export type MainLoopModelCapabilityRole =
  | "reasoning"
  | "image-generation"
  | "background"
  | "batch"
  | "realtime"
  | "text"
  | (string & {});

export type MainLoopModelCandidate = {
  modelRef: string;
  capabilityRoles: readonly MainLoopModelCapabilityRole[];
  available: boolean;
  metadata: Readonly<Record<string, unknown>>;
};

export type MainLoopModelSelectionRequest = {
  defaultModelRef?: string;
  userModelRef?: string;
  chooseModelRef?: string;
  requiredCapability?: MainLoopModelCapabilityRole;
  candidates?: readonly MainLoopModelCandidate[];
};

export type MainLoopModelSelectionDecision = {
  selectedModelRef: string;
  source: "user" | "chooseModelRef" | "capabilityFallback" | "default";
  requiredCapability?: MainLoopModelCapabilityRole;
  reason: string;
  metadata: Readonly<Record<string, unknown>>;
  publicSafe: true;
};

export type MainLoopStateExposure = {
  phase: MainLoopRunStatus | UserTurnStatus | LoopTickStatus;
  currentTurn?: number;
  currentTick?: number;
  currentStep?: number;
  pendingApprovals: readonly string[];
  activeToolCalls: readonly string[];
  lastObservation?: string;
  lastError?: string;
  budgets?: RuntimeBudgetSpec;
  cacheHealth?: Readonly<Record<string, unknown>>;
  selectedModel?: string;
  sandboxStatus?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type MainLoopControlPrimitive =
  | "pause"
  | "resume"
  | "interrupt"
  | "approve"
  | "deny"
  | "retry"
  | "rollback"
  | "inspect"
  | "repair"
  | "configure"
  | "rotateSecretRef"
  | "updatePolicy"
  | "updateBudget";

export const MAIN_LOOP_CONTROL_PRIMITIVES = [
  "pause",
  "resume",
  "interrupt",
  "approve",
  "deny",
  "retry",
  "rollback",
  "inspect",
  "repair",
  "configure",
  "rotateSecretRef",
  "updatePolicy",
  "updateBudget",
] as const satisfies readonly MainLoopControlPrimitive[];

export type MainLoopApprovalStatus = "pending" | "approved" | "denied";

export type MainLoopApprovalEnvelope = {
  approvalId: string;
  sessionId: string;
  status: "pending";
  reason: string;
  requestedScopes: readonly string[];
  riskLevel?: RuntimeAdjudication["riskLevel"];
  decisionRef?: string;
  proposedActionRef?: string;
  surfaceRef?: string;
  cancelToken?: string;
  createdAt: string;
  metadata: Readonly<Record<string, unknown>>;
  publicSafe: true;
};

export type MainLoopApprovalResolution = {
  approvalId: string;
  sessionId: string;
  status: Exclude<MainLoopApprovalStatus, "pending">;
  responderRef: string;
  resolvedAt: string;
  resumeAction: "resume";
  nextAction: MainLoopActionPrimitive;
  noteForModel?: string;
  canMutateToolInput: false;
  ignoredParameterPatch?: Readonly<Record<string, unknown>>;
  metadata: Readonly<Record<string, unknown>>;
  publicSafe: true;
};

export type MainLoopControlActionRecord = {
  actionId: string;
  sessionId: string;
  primitive: Extract<MainLoopControlPrimitive, "pause" | "resume" | "interrupt">;
  mainLoopStatus: MainLoopRunStatus | UserTurnStatus | LoopTickStatus;
  runtimeStatus: "running" | "paused" | "resuming" | "interrupted";
  reason: string;
  cancelToken?: string;
  trace: MainLoopStepTrace;
  createdAt: string;
  metadata: Readonly<Record<string, unknown>>;
  publicSafe: true;
};

export type MainLoopRollbackPoint = {
  rollbackPointId: string;
  sessionId: string;
  checkpoint: MainLoopCheckpoint;
  timelineRef: MainLoopTimelineRef;
  executor: "runtime-control-surface";
  executableByMainLoop: false;
  metadata: Readonly<Record<string, unknown>>;
  publicSafe: true;
};

export type MainLoopReplayPlanKind = "step" | "loopTick" | "userTurn";

export type MainLoopReplayPlan = {
  replayId: string;
  kind: MainLoopReplayPlanKind;
  sessionId: string;
  sourceTimelineRefs: readonly MainLoopTimelineRef[];
  stepRecords: readonly MainLoopStepRecord[];
  promptPackRefs: readonly string[];
  loweredPromptRefs: readonly string[];
  observationRefs: readonly string[];
  providerRawRefs: readonly string[];
  dryRun: true;
  unsafeSideEffects: false;
  metadata: Readonly<Record<string, unknown>>;
  publicSafe: true;
};

export type MainLoopBehaviorRefSource =
  | "application"
  | "raxProject"
  | "signedPackage"
  | "futureDsl"
  | "runtimeBuiltin";

export type MainLoopBehaviorRef = {
  behaviorRef: string;
  primitive: MainLoopActionPrimitive;
  source: MainLoopBehaviorRefSource;
  handlerRef: string;
  priority: number;
  timeoutMs: number;
  sandboxRef?: string;
  resourceRef?: string;
  conflictsWith: readonly string[];
  metadata: Readonly<Record<string, unknown>>;
};

export type MainLoopBehaviorRegistry = {
  registryId: string;
  behaviors: readonly MainLoopBehaviorRef[];
  metadata: Readonly<Record<string, unknown>>;
};

export type MainLoopBehaviorResolution =
  | {
      ok: true;
      behavior: MainLoopBehaviorRef;
      executable: true;
      executionContract: {
        handlerRef: string;
        timeoutMs: number;
        sandboxRef?: string;
        resourceRef?: string;
      };
      metadata: Readonly<Record<string, unknown>>;
      publicSafe: true;
    }
  | {
      ok: false;
      behaviorRef: string;
      code: "UNREGISTERED_BEHAVIOR" | "BEHAVIOR_CONFLICT" | "BEHAVIOR_GOVERNANCE_REJECTED";
      message: string;
      conflicts: readonly string[];
      publicSafe: true;
    };

export type MainLoopCacheHealth = {
  stablePrefixHash: string;
  capabilityHash?: string;
  sessionSummaryHash?: string;
  observationHash?: string;
  providerTelemetry?: PromptPackCacheTelemetry;
  cacheMissWarnings: readonly string[];
  dynamicSegmentKinds: readonly string[];
  capabilityRebuildRequired: boolean;
  metadata: Readonly<Record<string, unknown>>;
  publicSafe: true;
};

export type MainLoopToolChoiceMode =
  | "auto"
  | "none"
  | "required"
  | "forceTool"
  | "forceGroup"
  | "forceProcedure";

export type MainLoopToolChoicePolicy = {
  mode: MainLoopToolChoiceMode;
  toolId?: string;
  groupId?: string;
  procedureId?: string;
  evidenceRuleRefs: readonly string[];
  promptPackRuleOnly: boolean;
  reason: string;
  metadata: Readonly<Record<string, unknown>>;
  publicSafe: true;
};

export type MainLoopInputMaterialKind = "text" | "image" | "audio" | "video";

export type MainLoopInputMaterial = {
  inputId: string;
  kind: MainLoopInputMaterialKind;
  promptMaterial: PromptPackMaterialDraft;
  observationRef?: string;
  providerPayloadCreated: false;
  metadata: Readonly<Record<string, unknown>>;
  publicSafe: true;
};

export type MainLoopOutputEnvelopeKind =
  | "text"
  | "structured"
  | "artifactRef"
  | "multimodal"
  | "streamChunk"
  | "traceSummary";

export type MainLoopOutputEnvelope = {
  outputId: string;
  kind: MainLoopOutputEnvelopeKind;
  sessionId: string;
  payload: unknown;
  recordPolicy: "afterChunkCompleted" | "immediate";
  traceSummary?: string;
  artifactRefs: readonly string[];
  metadata: Readonly<Record<string, unknown>>;
  publicSafe: true;
};

export type MainLoopAgentInterfacePrimitive = {
  primitiveId: string;
  sessionId: string;
  kind: "agentInterfaceHandoff";
  targetAgentRef?: string;
  interfaceRef: string;
  directInvokeAgent: false;
  multiagentManaged: false;
  payloadRef?: string;
  metadata: Readonly<Record<string, unknown>>;
  publicSafe: true;
};

export type MainLoopStateProgressionAction =
  | "receiveInput"
  | "modelInvoked"
  | "toolRunning"
  | "approvalPending"
  | "observationIntegrated"
  | "finalOutput"
  | "failure"
  | "interrupt"
  | "resume";

export type MainLoopStateProgressionRecord = {
  action: MainLoopStateProgressionAction;
  stateBeforeRef?: string;
  stateAfterRef: string;
  stepRef?: string;
  eventRef: string;
  metadata: Readonly<Record<string, unknown>>;
  publicSafe: true;
};

export type MainLoopPromptPackRebuildTrigger =
  | "newUserInput"
  | "observationMaterialChange"
  | "memoryContextChange"
  | "capabilitySetChange"
  | "modelFamilySwitch"
  | "compressionSummaryCompletion"
  | "behaviorRefRequest";

export type MainLoopPromptPackRebuildDecision = {
  rebuild: boolean;
  triggers: readonly MainLoopPromptPackRebuildTrigger[];
  reason: string;
  cacheFriendly: boolean;
  metadata: Readonly<Record<string, unknown>>;
  publicSafe: true;
};

export const DEFAULT_MAIN_LOOP_BUDGET: MainLoopBudgetSpec = {
  maxToolCallsPerLoopTick: 1024,
  maxToolCallsPerEphemeralProcedure: 128,
  maxModelTurns: 8192,
  maxWallTimeMs: 180_000,
  maxShellSeconds: 180,
};

export const DEFAULT_MAIN_LOOP_FAILURE_RECOVERY_POLICY: MainLoopFailureRecoveryPolicy = {
  retry: {
    maxAttempts: 3,
    retryTarget: "model",
    retryableBoundaries: ["tool", "procedure", "model"],
  },
  fallback: {
    enabled: true,
    fallbackTargets: ["alternateTool", "modelReplan", "userIntervention"],
  },
  finalActions: ["runtimeFallback", "modelAnalyze", "interruptUser", "fail"],
};

export type RuntimeAdjudicationRequest = {
  decision?: ModelDecision;
  policy?: MainLoopStepGateResult;
  sandbox?: MainLoopStepGateResult;
  resource?: MainLoopStepGateResult;
  pendingApprovalRefs?: readonly string[];
  unresolvedProcedureRefs?: readonly string[];
};

export type MainLoopTurnPreparationRequest = {
  runtimeId?: string;
  sessionId?: string;
  turnIndex?: number;
  startStepIndex?: number;
  promptPackId?: string;
  targetModel?: string;
  loweringHint?: string;
  materials?: readonly PromptPackMaterialDraft[];
  now?: string;
};

export type MainLoopTurnRecord = {
  turnId: string;
  sessionId: string;
  turnIndex: number;
  lifecycle: "prepared";
  promptPackRef: string;
  cachePlanRef: string;
  segmentKinds: readonly string[];
  stepRecords: readonly MainLoopStepRecord[];
  metadata: Readonly<Record<string, unknown>>;
};

export type MainLoopTurnPreparationResult =
  | {
      ok: true;
      promptPackId: string;
      promptPack: StandardPromptPack;
      cachePlan: PromptPackCachePlan;
      turnRecord: MainLoopTurnRecord;
      events: readonly string[];
    }
  | {
      ok: false;
      error: MainLoopPublicSafeFailure;
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

function defaultTimestamp(): string {
  return new Date(0).toISOString();
}

function runtimeNow(runtime: MainLoopRuntimeContext): string {
  return runtime.now?.() ?? defaultTimestamp();
}

function cleanRefs(refs: readonly string[] | undefined): readonly string[] {
  return [...new Set((refs ?? []).map((ref) => ref.trim()).filter(Boolean))];
}

function cleanOptionalString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
}

function mainLoopRunFailure(
  code: AgentMainLoopErrorCode,
  message: string,
  boundary: AgentMainLoopBoundary,
): RunMainLoopResult {
  return {
    ok: false,
    error: { code, message, boundary, stateSafe: true },
    events: ["agentCore.execution.mainLoop.runRejected"],
    dryRun: true,
    unsafeSideEffects: false,
  };
}

function cleanIndex(value: number | undefined): number | undefined {
  return Number.isInteger(value) && value !== undefined && value >= 0 ? value : undefined;
}

export function createMainLoopTimelineRef(input: {
  kind: MainLoopTimelineRefKind;
  sessionId: string;
  userTurnIndex?: number;
  loopTickIndex?: number;
  stepIndex?: number;
  checkpointId?: string;
}): MainLoopTimelineRef {
  const sessionId = input.sessionId.trim();
  const userTurnIndex = cleanIndex(input.userTurnIndex);
  const loopTickIndex = cleanIndex(input.loopTickIndex);
  const stepIndex = cleanIndex(input.stepIndex);
  const checkpointId = input.checkpointId?.trim() || undefined;
  const parts = [
    sessionId,
    input.kind,
    userTurnIndex === undefined ? undefined : `turn:${userTurnIndex}`,
    loopTickIndex === undefined ? undefined : `tick:${loopTickIndex}`,
    stepIndex === undefined ? undefined : `step:${stepIndex}`,
    checkpointId === undefined ? undefined : `checkpoint:${checkpointId}`,
  ].filter((part): part is string => part !== undefined && part.length > 0);
  return {
    kind: input.kind,
    sessionId,
    ...(userTurnIndex === undefined ? {} : { userTurnIndex }),
    ...(loopTickIndex === undefined ? {} : { loopTickIndex }),
    ...(stepIndex === undefined ? {} : { stepIndex }),
    ...(checkpointId === undefined ? {} : { checkpointId }),
    ref: parts.join(":"),
  };
}

export function createMainLoopCheckpoint(input: {
  kind: MainLoopCheckpointKind;
  sessionId: string;
  userTurnIndex?: number;
  loopTickIndex?: number;
  stepIndex?: number;
  stateRef?: string;
  promptPackRef?: string;
  loweredPromptRef?: string;
  observationRefs?: readonly string[];
  now?: string;
  metadata?: Readonly<Record<string, unknown>>;
}): MainLoopCheckpoint {
  const sessionId = input.sessionId.trim();
  const userTurnIndex = input.userTurnIndex ?? 0;
  const loopTickIndex = input.loopTickIndex ?? 0;
  const stepIndex = cleanIndex(input.stepIndex);
  const checkpointId = `${sessionId}:turn:${userTurnIndex}:tick:${loopTickIndex}:checkpoint:${input.kind}${stepIndex === undefined ? "" : `:step:${stepIndex}`}`;
  return {
    checkpointId,
    kind: input.kind,
    sessionId,
    userTurnIndex,
    loopTickIndex,
    ...(stepIndex === undefined ? {} : { stepIndex }),
    ...(input.stateRef?.trim() ? { stateRef: input.stateRef.trim() } : {}),
    ...(input.promptPackRef?.trim() ? { promptPackRef: input.promptPackRef.trim() } : {}),
    ...(input.loweredPromptRef?.trim() ? { loweredPromptRef: input.loweredPromptRef.trim() } : {}),
    observationRefs: cleanRefs(input.observationRefs),
    createdAt: input.now ?? defaultTimestamp(),
    timelineRef: createMainLoopTimelineRef({
      kind: "checkpoint",
      sessionId,
      userTurnIndex,
      loopTickIndex,
      ...(stepIndex === undefined ? {} : { stepIndex }),
      checkpointId,
    }),
    metadata: input.metadata ?? {},
  };
}

export function createLoopTick(input: {
  sessionId: string;
  userTurnIndex?: number;
  loopTickIndex?: number;
  kind: MainLoopTickKind;
  status?: LoopTickStatus;
  stepRecords?: readonly MainLoopStepRecord[];
  checkpoints?: readonly MainLoopCheckpoint[];
  promptPackRef?: string;
  loweredPromptRef?: string;
  selectedModel?: string;
  cacheHealth?: Readonly<Record<string, unknown>>;
  budgetSnapshot?: Readonly<Record<string, unknown>>;
  stateRefs?: readonly string[];
  observationRefs?: readonly string[];
  metadata?: Readonly<Record<string, unknown>>;
}): LoopTick {
  const sessionId = input.sessionId.trim();
  const userTurnIndex = input.userTurnIndex ?? 0;
  const loopTickIndex = input.loopTickIndex ?? 0;
  const timelineRef = createMainLoopTimelineRef({ kind: "loopTick", sessionId, userTurnIndex, loopTickIndex });
  return {
    tickId: timelineRef.ref,
    sessionId,
    userTurnIndex,
    loopTickIndex,
    kind: input.kind,
    status: input.status ?? "planned",
    steps: (input.stepRecords ?? []).map((record) => ({
      timelineRef: createMainLoopTimelineRef({
        kind: "step",
        sessionId,
        userTurnIndex,
        loopTickIndex,
        stepIndex: record.stepIndex,
      }),
      record,
    })),
    checkpoints: input.checkpoints ?? [],
    ...(input.promptPackRef?.trim() ? { promptPackRef: input.promptPackRef.trim() } : {}),
    ...(input.loweredPromptRef?.trim() ? { loweredPromptRef: input.loweredPromptRef.trim() } : {}),
    ...(input.selectedModel?.trim() ? { selectedModel: input.selectedModel.trim() } : {}),
    ...(input.cacheHealth === undefined ? {} : { cacheHealth: input.cacheHealth }),
    ...(input.budgetSnapshot === undefined ? {} : { budgetSnapshot: input.budgetSnapshot }),
    stateRefs: cleanRefs(input.stateRefs),
    observationRefs: cleanRefs(input.observationRefs),
    timelineRef,
    metadata: input.metadata ?? {},
  };
}

export function createUserTurn(input: {
  sessionId: string;
  userTurnIndex?: number;
  status?: UserTurnStatus;
  inputRefs?: readonly string[];
  outputRefs?: readonly string[];
  ticks?: readonly LoopTick[];
  checkpoints?: readonly MainLoopCheckpoint[];
  startedAt?: string;
  completedAt?: string;
  metadata?: Readonly<Record<string, unknown>>;
}): UserTurn {
  const sessionId = input.sessionId.trim();
  const userTurnIndex = input.userTurnIndex ?? 0;
  const timelineRef = createMainLoopTimelineRef({ kind: "userTurn", sessionId, userTurnIndex });
  return {
    userTurnId: timelineRef.ref,
    sessionId,
    userTurnIndex,
    status: input.status ?? "open",
    inputRefs: cleanRefs(input.inputRefs),
    outputRefs: cleanRefs(input.outputRefs),
    ticks: input.ticks ?? [],
    checkpoints: input.checkpoints ?? [],
    startedAt: input.startedAt ?? defaultTimestamp(),
    ...(input.completedAt?.trim() ? { completedAt: input.completedAt.trim() } : {}),
    timelineRef,
    metadata: input.metadata ?? {},
  };
}

export function createMainLoopRun(input: {
  sessionId: string;
  runId?: string;
  status?: MainLoopRunStatus;
  userTurns?: readonly UserTurn[];
  checkpoints?: readonly MainLoopCheckpoint[];
  now?: string;
  metadata?: Readonly<Record<string, unknown>>;
}): MainLoopRun {
  const sessionId = input.sessionId.trim();
  const runId = input.runId?.trim() || `${sessionId}:run`;
  return {
    runId,
    sessionId,
    status: input.status ?? "created",
    userTurns: input.userTurns ?? [],
    checkpoints: input.checkpoints ?? [],
    createdAt: input.now ?? defaultTimestamp(),
    updatedAt: input.now ?? defaultTimestamp(),
    timelineRef: createMainLoopTimelineRef({ kind: "run", sessionId }),
    metadata: input.metadata ?? {},
  };
}

export function createMainLoopSessionTimeline(input: {
  sessionId: string;
  run?: MainLoopRun;
  metadata?: Readonly<Record<string, unknown>>;
}): MainLoopSessionTimeline {
  const sessionId = input.sessionId.trim();
  const run = input.run ?? createMainLoopRun({ sessionId });
  const userTurnRefs = run.userTurns.flatMap((turn) => [
    turn.timelineRef,
    ...turn.ticks.flatMap((tick) => [
      tick.timelineRef,
      ...tick.steps.map((step) => step.timelineRef),
      ...tick.checkpoints.map((checkpoint) => checkpoint.timelineRef),
    ]),
    ...turn.checkpoints.map((checkpoint) => checkpoint.timelineRef),
  ]);
  return {
    sessionId,
    run,
    timelineRefs: [run.timelineRef, ...userTurnRefs, ...run.checkpoints.map((checkpoint) => checkpoint.timelineRef)],
    checkpoints: [...run.checkpoints, ...run.userTurns.flatMap((turn) => [
      ...turn.checkpoints,
      ...turn.ticks.flatMap((tick) => tick.checkpoints),
    ])],
    metadata: input.metadata ?? {},
  };
}

export function runMainLoop(request: RunMainLoopRequest): RunMainLoopResult {
  const runtimeId = request.runtime.runtimeId.trim();
  const sessionId = request.runtime.sessionId.trim();
  if (runtimeId.length === 0) {
    return mainLoopRunFailure("MISSING_SESSION_ID", "runMainLoop requires a runtimeId in runtime context", "input");
  }
  if (sessionId.length === 0) {
    return mainLoopRunFailure("MISSING_SESSION_ID", "runMainLoop requires a sessionId in runtime context", "input");
  }
  if (request.input === undefined) {
    return mainLoopRunFailure("MISSING_INPUT", "runMainLoop requires user input before starting a user turn", "input");
  }
  if (request.maxLoopTicks !== undefined && request.maxLoopTicks < 1) {
    return mainLoopRunFailure("LOOP_LIMIT_EXCEEDED", "runMainLoop maxLoopTicks must allow at least one loop tick", "runtime-state");
  }
  if (request.contract?.accepted === false) {
    return mainLoopRunFailure("CONTRACT_REJECTED", request.contract.reason ?? "runMainLoop request was rejected by contract surface", "contract");
  }
  if (request.governance?.accepted === false) {
    return mainLoopRunFailure("GOVERNANCE_REJECTED", request.governance.reason ?? "runMainLoop request was rejected by governance", "governance");
  }

  const now = runtimeNow(request.runtime);
  const userTurnIndex = request.userTurnIndex ?? 0;
  const loopTickIndex = request.loopTickIndex ?? 0;
  const startStepIndex = request.startStepIndex ?? 0;
  const receiveStep = createMainLoopStepRecord({
    sessionId,
    turnIndex: userTurnIndex,
    stepIndex: startStepIndex,
    actionPrimitive: "receiveInput",
    status: "completed",
    inputRefs: request.inputRefs ?? ["runtime.input"],
    outputRefs: ["runtime.input.normalized"],
    now,
    trace: request.trace,
    governance: gateResult(request.governance),
    contract: gateResult(request.contract),
    metadata: {
      runtimeId,
      manifestRef: request.runtime.manifestRef,
      callerRef: request.runtime.callerRef,
    },
  });

  const turnPreparation = prepareMainLoopTurn({
    runtimeId,
    sessionId,
    turnIndex: userTurnIndex,
    startStepIndex: startStepIndex + 1,
    promptPackId: request.promptPackId,
    targetModel: request.targetModel,
    loweringHint: request.loweringHint,
    materials: request.materials,
    now,
  });

  const stepRecords = turnPreparation.ok
    ? [receiveStep, ...turnPreparation.turnRecord.stepRecords]
    : [receiveStep, createMainLoopStepRecord({
        sessionId,
        turnIndex: userTurnIndex,
        stepIndex: startStepIndex + 1,
        actionPrimitive: "prepareTurn",
        status: "failed",
        inputRefs: ["runtime.input.normalized"],
        error: turnPreparation.error,
        now,
        trace: request.trace,
      })];
  const tickStatus: LoopTickStatus = turnPreparation.ok ? "completed" : "failed";
  const cacheHealth = turnPreparation.ok ? analyzeMainLoopCacheHealth({ cachePlan: turnPreparation.cachePlan }) : undefined;
  const tick = createLoopTick({
    sessionId,
    userTurnIndex,
    loopTickIndex,
    kind: turnPreparation.ok ? "model-only" : "failure",
    status: tickStatus,
    stepRecords,
    promptPackRef: turnPreparation.ok ? turnPreparation.promptPackId : undefined,
    selectedModel: request.targetModel,
    cacheHealth,
    stateRefs: ["state:received"],
    observationRefs: [],
    metadata: {
      runtimeSurfaces: request.runtime.surfaces.map((surface) => ({
        surfaceId: surface.surfaceId,
        kind: surface.kind,
        ready: surface.ready,
      })),
    },
  });
  const checkpoint = createMainLoopCheckpoint({
    kind: turnPreparation.ok ? "observationIntegrated" : "failedStep",
    sessionId,
    userTurnIndex,
    loopTickIndex,
    stepIndex: stepRecords.length - 1,
    promptPackRef: turnPreparation.ok ? turnPreparation.promptPackId : undefined,
    now,
  });
  const userTurn = createUserTurn({
    sessionId,
    userTurnIndex,
    status: turnPreparation.ok ? "completed" : "failed",
    inputRefs: request.inputRefs ?? ["runtime.input"],
    outputRefs: turnPreparation.ok ? [turnPreparation.promptPackId] : [],
    ticks: [tick],
    checkpoints: [checkpoint],
    startedAt: now,
    completedAt: now,
    metadata: {
      maxLoopTicks: request.maxLoopTicks ?? 1,
    },
  });
  const run = createMainLoopRun({
    sessionId,
    status: turnPreparation.ok ? "completed" : "failed",
    userTurns: [userTurn],
    checkpoints: [checkpoint],
    now,
    metadata: {
      runtimeId,
      manifestRef: request.runtime.manifestRef,
    },
  });
  const timeline = createMainLoopSessionTimeline({ sessionId, run });
  if (!turnPreparation.ok) {
    return {
      ok: false,
      error: {
        code: "STATE_REJECTED",
        message: turnPreparation.error.message,
        boundary: turnPreparation.error.boundary === "prompt" ? "runtime-state" : "input",
        stateSafe: true,
      },
      events: turnPreparation.events,
      dryRun: true,
      unsafeSideEffects: false,
    };
  }

  return {
    ok: true,
    run,
    timeline,
    userTurn,
    loopTicks: [tick],
    stepRecords,
    turnPreparation,
    events: ["agentCore.execution.mainLoop.runStarted", ...turnPreparation.events, "agentCore.execution.mainLoop.runCompleted"],
    dryRun: true,
    unsafeSideEffects: false,
  };
}

function runnerFailure(
  error: MainLoopRunnerError,
  modelTurns: number,
  toolCalls: number,
  events: readonly string[],
): MainLoopRunnerResult {
  return { ok: false, error, modelTurns, toolCalls, events };
}

function fallbackRunnerFinal(input: MainLoopRunnerNoFinalContext): MainLoopRunnerFinalResult {
  const finalOutput = input.reason === "tool_call_limit"
    ? "PraxisRuntimeKernel reached the tool call limit before a final answer."
    : input.reason === "no_continuation"
      ? "PraxisRuntimeKernel stopped without a final answer."
      : "PraxisRuntimeKernel reached the model turn limit before a final answer.";
  return {
    ok: true,
    finalOutput,
    events: [`agentCore.execution.mainLoop.runner.fallbackFinal.${input.reason}`],
  };
}

export async function runMainLoopRunner<TPrompt, TRaw>(
  request: MainLoopRunnerRequest<TPrompt, TRaw>,
): Promise<MainLoopRunnerResult> {
  const events: string[] = ["agentCore.execution.mainLoop.runner.started"];
  let toolCalls = 0;
  let completedModelTurns = 0;
  let completedTurnToolCalls = 0;
  let noFinalReason: MainLoopRunnerNoFinalReason = "model_turn_limit";

  for (let turnIndex = 0; turnIndex < request.maxModelTurns; turnIndex += 1) {
    completedModelTurns = turnIndex + 1;
    let turnToolCalls = 0;
    const prepared = await request.prepareTurn(turnIndex);
    events.push(...prepared.events);
    if ("ok" in prepared && prepared.ok === false) {
      return runnerFailure(prepared.error, turnIndex + 1, toolCalls, events);
    }

    const prompt = (prepared as MainLoopRunnerTurnPackage<TPrompt>).prompt;
    const model = await request.invokeModel(turnIndex, prompt);
    events.push(...model.events);
    if (!model.ok) {
      return runnerFailure(model.error, turnIndex + 1, toolCalls, events);
    }

    if (model.raw === null) {
      const dryRunFinal = request.onModelDryRun === undefined
        ? {
            ok: true as const,
            finalOutput: "PraxisRuntimeKernel dry-run completed.",
            events: ["agentCore.execution.mainLoop.runner.dryRunFinal"],
          }
        : await request.onModelDryRun({ turnIndex, prompt, model });
      events.push(...dryRunFinal.events);
      return dryRunFinal.ok
        ? { ok: true, finalOutput: dryRunFinal.finalOutput, modelTurns: turnIndex + 1, toolCalls, events }
        : runnerFailure(dryRunFinal.error, turnIndex + 1, toolCalls, events);
    }

    const interpreted = await request.interpretDecision(turnIndex, model, prompt);
    events.push(...interpreted.events);
    if (!interpreted.ok) {
      return runnerFailure(interpreted.error, turnIndex + 1, toolCalls, events);
    }

    let continueLoop = false;
    for (const [decisionIndex, decision] of interpreted.decisions.entries()) {
      if (decision.kind === "finalOutput") {
        const final = await request.acceptFinalOutput({ turnIndex, decisionIndex, decision, prompt });
        events.push(...final.events);
        return final.ok
          ? { ok: true, finalOutput: final.finalOutput, modelTurns: turnIndex + 1, toolCalls, events }
          : runnerFailure(final.error, turnIndex + 1, toolCalls, events);
      }

      if (decision.kind === "continue") {
        const continued = await request.handleContinue({ turnIndex, decisionIndex, decision, prompt });
        events.push(...continued.events);
        if (!continued.ok) {
          return runnerFailure(continued.error, turnIndex + 1, toolCalls, events);
        }
        continueLoop = continueLoop || continued.continueLoop;
        continue;
      }

      if (decision.kind === "fail") {
        const failed = await request.handleFailure({ turnIndex, decisionIndex, decision, prompt });
        events.push(...failed.events);
        return failed.ok
          ? runnerFailure({
              code: decision.failure?.code ?? "MODEL_DECISION_FAILED",
              message: decision.failure?.message ?? "model decision requested failure",
              boundary: "model-decision",
              publicSafe: true,
            }, turnIndex + 1, toolCalls, events)
          : runnerFailure(failed.error, turnIndex + 1, toolCalls, events);
      }

      if (decision.kind === "requestApproval") {
        const approval = await request.handleApproval({ turnIndex, decisionIndex, decision, prompt });
        events.push(...approval.events);
        if (!approval.ok) {
          return runnerFailure(approval.error, turnIndex + 1, toolCalls, events);
        }
        continueLoop = continueLoop || approval.continueLoop;
        continue;
      }

      if (decision.kind === "toolCall") {
        if (turnToolCalls >= request.maxToolCalls) {
          noFinalReason = "tool_call_limit";
          events.push("agentCore.execution.mainLoop.runner.toolCallLimit");
          completedTurnToolCalls = turnToolCalls;
          continueLoop = false;
          break;
        }
        const tool = await request.handleToolCall({ turnIndex, decisionIndex, decision, prompt });
        events.push(...tool.events);
        if (!tool.ok) {
          return runnerFailure(tool.error, turnIndex + 1, toolCalls, events);
        }
        toolCalls += 1;
        turnToolCalls += 1;
        completedTurnToolCalls = turnToolCalls;
        continueLoop = continueLoop || tool.continueLoop;
        continue;
      }

      if (decision.kind === "ephemeralProcedurePlan") {
        const procedure = await request.handleEphemeralProcedure({ turnIndex, decisionIndex, decision, prompt });
        events.push(...procedure.events);
        if (!procedure.ok) {
          return runnerFailure(procedure.error, turnIndex + 1, toolCalls, events);
        }
        continueLoop = continueLoop || procedure.continueLoop;
      }
    }

    if (!continueLoop) {
      completedTurnToolCalls = turnToolCalls;
      if (noFinalReason !== "tool_call_limit") {
        noFinalReason = "no_continuation";
      }
      break;
    }
  }

  const noFinalContext: MainLoopRunnerNoFinalContext = {
    reason: noFinalReason,
    modelTurns: completedModelTurns,
    toolCalls,
    turnToolCalls: completedTurnToolCalls,
    maxModelTurns: request.maxModelTurns,
    maxToolCalls: request.maxToolCalls,
  };
  const fallback = request.onNoFinalOutput === undefined
    ? fallbackRunnerFinal(noFinalContext)
    : await request.onNoFinalOutput(noFinalContext);
  events.push(...fallback.events);
  return fallback.ok
    ? { ok: true, finalOutput: fallback.finalOutput, modelTurns: noFinalContext.modelTurns, toolCalls, events }
    : runnerFailure(fallback.error, noFinalContext.modelTurns, toolCalls, events);
}

function gateResult(gate: AgentExecutionStateGate | undefined): MainLoopStepGateResult {
  if (gate === undefined) {
    return { accepted: true };
  }
  return gate.reason === undefined
    ? { accepted: gate.accepted }
    : { accepted: gate.accepted, reason: gate.reason };
}

function publicSafeMainLoopFailure(
  code: string,
  message: string,
  boundary: MainLoopPublicSafeFailure["boundary"],
): MainLoopPublicSafeFailure {
  return { code, message, boundary, publicSafe: true };
}

function gateAccepted(gate: MainLoopStepGateResult | undefined): boolean {
  return gate?.accepted !== false;
}

function gateReason(gate: MainLoopStepGateResult | undefined, fallback: string): string {
  return gate?.reason ?? fallback;
}

export function adjudicateRuntimeDecision(request: RuntimeAdjudicationRequest): RuntimeAdjudication {
  const decision = request.decision;
  if (decision === undefined) {
    return {
      kind: "invalidDecision",
      accepted: false,
      reason: "runtime adjudication requires a ModelDecision",
      requestedScopes: [],
      metadata: {},
      publicSafe: true,
    };
  }

  if (!gateAccepted(request.resource)) {
    return {
      kind: "resourceExceeded",
      accepted: false,
      decisionId: decision.decisionId,
      reason: gateReason(request.resource, "runtime resource policy rejected the model decision"),
      requestedScopes: [],
      metadata: { decisionKind: decision.kind },
      publicSafe: true,
    };
  }

  if (!gateAccepted(request.sandbox)) {
    return {
      kind: "blockedBySandbox",
      accepted: false,
      decisionId: decision.decisionId,
      reason: gateReason(request.sandbox, "sandbox policy rejected the model decision"),
      requestedScopes: [],
      metadata: { decisionKind: decision.kind },
      publicSafe: true,
    };
  }

  if (!gateAccepted(request.policy)) {
    return {
      kind: "blockedByPolicy",
      accepted: false,
      decisionId: decision.decisionId,
      reason: gateReason(request.policy, "tool/runtime policy rejected the model decision"),
      requestedScopes: [],
      metadata: { decisionKind: decision.kind },
      publicSafe: true,
    };
  }

  if (decision.kind === "requestApproval") {
    return {
      kind: "requiresApproval",
      accepted: false,
      decisionId: decision.decisionId,
      reason: decision.approvalRequest?.reason ?? "model requested runtime approval",
      requestedScopes: decision.approvalRequest?.requestedScopes ?? [],
      riskLevel: decision.approvalRequest?.riskLevel,
      metadata: { decisionKind: decision.kind },
      publicSafe: true,
    };
  }

  if (decision.kind === "toolCall" && request.policy?.metadata?.requiresApproval === true) {
    return {
      kind: "requiresApproval",
      accepted: false,
      decisionId: decision.decisionId,
      reason: request.policy.reason ?? "tool call requires approval by runtime policy",
      requestedScopes: decision.toolCall === undefined ? [] : [`tool:${decision.toolCall.toolId}`],
      metadata: { decisionKind: decision.kind, toolId: decision.toolCall?.toolId },
      publicSafe: true,
    };
  }

  if ((request.pendingApprovalRefs ?? []).length > 0 && decision.kind === "finalOutput") {
    return {
      kind: "requiresApproval",
      accepted: false,
      decisionId: decision.decisionId,
      reason: "runtime cannot accept final output while approvals are pending",
      requestedScopes: request.pendingApprovalRefs ?? [],
      metadata: { decisionKind: decision.kind },
      publicSafe: true,
    };
  }

  if ((request.unresolvedProcedureRefs ?? []).length > 0 && decision.kind === "finalOutput") {
    return {
      kind: "blockedByPolicy",
      accepted: false,
      decisionId: decision.decisionId,
      reason: "runtime cannot accept final output while ephemeral procedures are unresolved",
      requestedScopes: request.unresolvedProcedureRefs ?? [],
      metadata: { decisionKind: decision.kind },
      publicSafe: true,
    };
  }

  return {
    kind: decision.kind === "finalOutput" ? "finalAllowed" : decision.kind === "continue" ? "continueAllowed" : "allowed",
    accepted: true,
    decisionId: decision.decisionId,
    reason: "runtime accepted the model decision under current governance",
    requestedScopes: [],
    metadata: { decisionKind: decision.kind },
    publicSafe: true,
  };
}

export function decideMainLoopFinalAcceptance(request: MainLoopFinalAcceptanceRequest): MainLoopBreakDecision {
  const pendingApprovalRefs = cleanRefs(request.pendingApprovalRefs);
  if (pendingApprovalRefs.length > 0) {
    return {
      kind: "pendingApproval",
      canBreak: false,
      reason: "MainLoop cannot accept final output while approvals are pending",
      blockingRefs: pendingApprovalRefs,
      metadata: {},
      publicSafe: true,
    };
  }

  const unresolvedProcedureRefs = cleanRefs(request.unresolvedProcedureRefs);
  if (unresolvedProcedureRefs.length > 0) {
    return {
      kind: "unresolvedProcedure",
      canBreak: false,
      reason: "MainLoop cannot accept final output while procedures are unresolved",
      blockingRefs: unresolvedProcedureRefs,
      metadata: {},
      publicSafe: true,
    };
  }

  const fatalFailureRefs = cleanRefs(request.fatalFailureRefs);
  if (fatalFailureRefs.length > 0) {
    return {
      kind: "fatalFailure",
      canBreak: false,
      reason: "MainLoop cannot accept final output after a fatal failure",
      blockingRefs: fatalFailureRefs,
      metadata: {},
      publicSafe: true,
    };
  }

  const unrecordedEventRefs = cleanRefs(request.unrecordedEventRefs);
  if (unrecordedEventRefs.length > 0) {
    return {
      kind: "runtimeRejected",
      canBreak: false,
      reason: "MainLoop cannot accept final output before required events and state are recorded",
      blockingRefs: unrecordedEventRefs,
      metadata: {},
      publicSafe: true,
    };
  }

  if (!gateAccepted(request.budget)) {
    return {
      kind: "budgetBlocked",
      canBreak: false,
      reason: gateReason(request.budget, "MainLoop budget policy blocked final output"),
      blockingRefs: [],
      metadata: request.budget?.metadata ?? {},
      publicSafe: true,
    };
  }

  if (!gateAccepted(request.statePlane)) {
    return {
      kind: "stateBlocked",
      canBreak: false,
      reason: gateReason(request.statePlane, "MainLoop statePlane blocked final output"),
      blockingRefs: [],
      metadata: request.statePlane?.metadata ?? {},
      publicSafe: true,
    };
  }

  if (!gateAccepted(request.runtime)) {
    return {
      kind: "runtimeRejected",
      canBreak: false,
      reason: gateReason(request.runtime, "Runtime rejected final output"),
      blockingRefs: [],
      metadata: request.runtime?.metadata ?? {},
      publicSafe: true,
    };
  }

  return {
    kind: "finalAccepted",
    canBreak: true,
    reason: "MainLoop accepted final output under current runtime gates",
    finalOutput: request.finalOutput?.trim() || undefined,
    blockingRefs: [],
    metadata: {},
    publicSafe: true,
  };
}

export function resolveMainLoopContinuation(input: {
  modelSuggestion: "continue" | "break";
  finalAcceptance?: MainLoopBreakDecision;
  behaviorDecision?: MainLoopBehaviorRefDecision;
  runtimeFallbackReason?: string;
}): MainLoopContinuationDecision {
  if (input.behaviorDecision !== undefined && input.behaviorDecision.conflicts.length === 0) {
    return input.behaviorDecision.decision;
  }
  if (input.modelSuggestion === "break") {
    const finalAcceptance = input.finalAcceptance;
    if (finalAcceptance?.canBreak === true) {
      return {
        kind: "break",
        accepted: true,
        reason: finalAcceptance.reason,
        source: "runtimeFallback",
        nextAction: "exposeOutput",
        metadata: { modelSuggestedBreak: true },
        publicSafe: true,
      };
    }
    return {
      kind: "continue",
      accepted: true,
      reason: finalAcceptance?.reason ?? "model suggested break, but runtime did not accept finalization yet",
      source: "runtimeFallback",
      nextAction: "decideContinueBreak",
      metadata: { modelSuggestedBreak: true },
      publicSafe: true,
    };
  }
  return {
    kind: "continue",
    accepted: true,
    reason: input.runtimeFallbackReason ?? "model suggested continue",
    source: "model",
    nextAction: "invokeModel",
    metadata: {},
    publicSafe: true,
  };
}

function positiveIntegerOrDefault(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && value !== undefined && value > 0 ? value : fallback;
}

function positiveNumberOrUndefined(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

export function resolveMainLoopBudget(input: {
  sessionId?: string;
  budget?: Partial<MainLoopBudgetSpec>;
  source?: RuntimeBudgetSpec["source"];
  metadata?: Readonly<Record<string, unknown>>;
} = {}): RuntimeBudgetSpec {
  const sessionId = input.sessionId?.trim() || "session";
  const budget = input.budget ?? {};
  const resolved: RuntimeBudgetSpec = {
    budgetId: `${sessionId}:budget:mainLoop`,
    source: input.source ?? (input.budget === undefined ? "default" : "developer"),
    maxToolCallsPerLoopTick: positiveIntegerOrDefault(
      budget.maxToolCallsPerLoopTick,
      DEFAULT_MAIN_LOOP_BUDGET.maxToolCallsPerLoopTick,
    ),
    maxToolCallsPerEphemeralProcedure: positiveIntegerOrDefault(
      budget.maxToolCallsPerEphemeralProcedure,
      DEFAULT_MAIN_LOOP_BUDGET.maxToolCallsPerEphemeralProcedure,
    ),
    maxModelTurns: positiveIntegerOrDefault(budget.maxModelTurns, DEFAULT_MAIN_LOOP_BUDGET.maxModelTurns),
    maxWallTimeMs: positiveIntegerOrDefault(budget.maxWallTimeMs, DEFAULT_MAIN_LOOP_BUDGET.maxWallTimeMs),
    maxShellSeconds: positiveIntegerOrDefault(budget.maxShellSeconds, DEFAULT_MAIN_LOOP_BUDGET.maxShellSeconds),
    ...(positiveNumberOrUndefined(budget.maxTokens) === undefined ? {} : { maxTokens: positiveNumberOrUndefined(budget.maxTokens) }),
    ...(positiveNumberOrUndefined(budget.maxCost) === undefined ? {} : { maxCost: positiveNumberOrUndefined(budget.maxCost) }),
    ...(positiveIntegerOrDefault(budget.maxFileWrites, 0) === 0 ? {} : { maxFileWrites: positiveIntegerOrDefault(budget.maxFileWrites, 0) }),
    ...(positiveIntegerOrDefault(budget.maxNetworkCalls, 0) === 0 ? {} : { maxNetworkCalls: positiveIntegerOrDefault(budget.maxNetworkCalls, 0) }),
    metadata: input.metadata ?? {},
  };
  return resolved;
}

export function resolveMainLoopBudgetExhaustion(input: {
  sessionId: string;
  action?: MainLoopBudgetExhaustionAction;
  reason?: string;
  userTurnIndex?: number;
  loopTickIndex?: number;
  stepIndex?: number;
  now?: string;
  metadata?: Readonly<Record<string, unknown>>;
}): MainLoopBudgetExhaustionDecision {
  const sessionId = input.sessionId.trim() || "session";
  const action = input.action ?? "fail";
  const reason = input.reason?.trim() || "MainLoop budget was exhausted";
  const checkpoint = action === "writeResumeCheckpoint"
    ? createMainLoopCheckpoint({
        kind: "failedStep",
        sessionId,
        userTurnIndex: input.userTurnIndex ?? 0,
        loopTickIndex: input.loopTickIndex ?? 0,
        stepIndex: input.stepIndex,
        now: input.now,
        metadata: { budgetExhausted: true },
      })
    : undefined;
  const approval = action === "requestApproval"
    ? createMainLoopApprovalEnvelope({
        sessionId,
        reason,
        requestedScopes: ["budget.extend"],
        riskLevel: "risky",
        decisionRef: "budget.exhausted",
        now: input.now,
      })
    : undefined;
  return {
    action,
    reason,
    ...(checkpoint === undefined ? {} : { checkpoint }),
    ...(approval === undefined ? {} : { approval }),
    nextAction:
      action === "partialFinal" ? "exposeOutput" :
        action === "requestApproval" ? "requestApproval" :
          action === "summarizeCurrentState" ? "updateSummaryStateEvent" :
            action === "writeResumeCheckpoint" ? "recordSessionEvent" :
              "fail",
    metadata: input.metadata ?? {},
    publicSafe: true,
  };
}

export function resolveMainLoopFailureRecovery(input: {
  policy?: Partial<MainLoopFailureRecoveryPolicy>;
  failure: MainLoopPublicSafeFailure;
  attempt?: number;
  fallbackAttempted?: boolean;
}): MainLoopFailureRecoveryDecision {
  const retry = {
    ...DEFAULT_MAIN_LOOP_FAILURE_RECOVERY_POLICY.retry,
    ...(input.policy?.retry ?? {}),
  };
  const fallback = {
    ...DEFAULT_MAIN_LOOP_FAILURE_RECOVERY_POLICY.fallback,
    ...(input.policy?.fallback ?? {}),
  };
  const attempt = input.attempt ?? 0;
  const retryable = retry.retryableBoundaries.includes(input.failure.boundary);
  if (retryable && attempt < retry.maxAttempts) {
    return {
      kind: "retry",
      attempt: attempt + 1,
      reason: `retry ${attempt + 1}/${retry.maxAttempts} after ${input.failure.boundary} failure`,
      nextAction: retry.retryTarget === "model" ? "invokeModel" : retry.retryTarget === "sameTool" ? "invokeBaseTool" : "executeEphemeralProcedure",
      metadata: { retryTarget: retry.retryTarget, failureCode: input.failure.code },
      publicSafe: true,
    };
  }

  if (fallback.enabled && input.fallbackAttempted !== true && fallback.fallbackTargets.length > 0) {
    return {
      kind: "fallback",
      attempt,
      reason: "retry budget exhausted; MainLoop should request an alternate plan",
      nextAction: fallback.fallbackTargets.includes("modelReplan") ? "invokeModel" : "adjudicateDecision",
      metadata: { fallbackTargets: fallback.fallbackTargets, failureCode: input.failure.code },
      publicSafe: true,
    };
  }

  const shouldInterrupt = (input.policy?.finalActions ?? DEFAULT_MAIN_LOOP_FAILURE_RECOVERY_POLICY.finalActions).includes("interruptUser");
  return {
    kind: shouldInterrupt ? "interruptUser" : "fail",
    attempt,
    reason: "MainLoop exhausted retry and fallback recovery options",
    nextAction: shouldInterrupt ? "interrupt" : "fail",
    metadata: { failureCode: input.failure.code },
    publicSafe: true,
  };
}

function candidateForCapability(
  candidates: readonly MainLoopModelCandidate[],
  capability: MainLoopModelCapabilityRole | undefined,
): MainLoopModelCandidate | undefined {
  if (capability === undefined) return candidates.find((candidate) => candidate.available);
  return candidates.find((candidate) => candidate.available && candidate.capabilityRoles.includes(capability));
}

export function selectMainLoopModel(request: MainLoopModelSelectionRequest): MainLoopModelSelectionDecision {
  const userModelRef = request.userModelRef?.trim();
  if (userModelRef !== undefined && userModelRef.length > 0) {
    return {
      selectedModelRef: userModelRef,
      source: "user",
      requiredCapability: request.requiredCapability,
      reason: "user-selected model takes priority",
      metadata: {},
      publicSafe: true,
    };
  }

  const chooseModelRef = request.chooseModelRef?.trim();
  if (chooseModelRef !== undefined && chooseModelRef.length > 0) {
    return {
      selectedModelRef: chooseModelRef,
      source: "chooseModelRef",
      requiredCapability: request.requiredCapability,
      reason: "developer chooseModelRef selected the model",
      metadata: {},
      publicSafe: true,
    };
  }

  const defaultModelRef = request.defaultModelRef?.trim();
  const candidates = request.candidates ?? [];
  const defaultCandidate = defaultModelRef === undefined
    ? undefined
    : candidates.find((candidate) => candidate.modelRef === defaultModelRef);
  const defaultHasCapability = request.requiredCapability === undefined ||
    defaultCandidate === undefined ||
    defaultCandidate.capabilityRoles.includes(request.requiredCapability);
  if (defaultModelRef !== undefined && defaultModelRef.length > 0 && defaultHasCapability && defaultCandidate?.available !== false) {
    return {
      selectedModelRef: defaultModelRef,
      source: "default",
      requiredCapability: request.requiredCapability,
      reason: "default model satisfies the requested capability",
      metadata: {},
      publicSafe: true,
    };
  }

  const fallback = candidateForCapability(candidates, request.requiredCapability);
  if (fallback !== undefined) {
    return {
      selectedModelRef: fallback.modelRef,
      source: "capabilityFallback",
      requiredCapability: request.requiredCapability,
      reason: "default model lacks the requested capability; ModelFleet selected an available candidate",
      metadata: { capabilityRoles: fallback.capabilityRoles },
      publicSafe: true,
    };
  }

  return {
    selectedModelRef: defaultModelRef ?? "model.unresolved",
    source: "default",
    requiredCapability: request.requiredCapability,
    reason: "no capability-specific model was available; falling back to default model reference",
    metadata: {},
    publicSafe: true,
  };
}

export function exposeMainLoopState(input: {
  run?: MainLoopRun;
  userTurn?: UserTurn;
  loopTick?: LoopTick;
  pendingApprovals?: readonly string[];
  activeToolCalls?: readonly string[];
  lastObservation?: string;
  lastError?: string;
  budgets?: RuntimeBudgetSpec;
  cacheHealth?: Readonly<Record<string, unknown>>;
  selectedModel?: string;
  sandboxStatus?: string;
  metadata?: Readonly<Record<string, unknown>>;
}): MainLoopStateExposure {
  return {
    phase: input.loopTick?.status ?? input.userTurn?.status ?? input.run?.status ?? "created",
    ...(input.userTurn === undefined ? {} : { currentTurn: input.userTurn.userTurnIndex }),
    ...(input.loopTick === undefined ? {} : { currentTick: input.loopTick.loopTickIndex }),
    ...(input.loopTick?.steps.at(-1) === undefined ? {} : { currentStep: input.loopTick.steps.at(-1)?.record.stepIndex }),
    pendingApprovals: cleanRefs(input.pendingApprovals),
    activeToolCalls: cleanRefs(input.activeToolCalls),
    ...(input.lastObservation?.trim() ? { lastObservation: input.lastObservation.trim() } : {}),
    ...(input.lastError?.trim() ? { lastError: input.lastError.trim() } : {}),
    ...(input.budgets === undefined ? {} : { budgets: input.budgets }),
    ...(input.cacheHealth === undefined ? {} : { cacheHealth: input.cacheHealth }),
    ...(input.selectedModel?.trim() ? { selectedModel: input.selectedModel.trim() } : {}),
    ...(input.sandboxStatus?.trim() ? { sandboxStatus: input.sandboxStatus.trim() } : {}),
    metadata: input.metadata ?? {},
  };
}

export function createMainLoopCancelToken(input: {
  sessionId: string;
  scope: "approval" | "tool" | "procedure" | "model" | "runtime";
  targetRef?: string;
  issuedAt?: string;
}): string {
  const sessionId = input.sessionId.trim() || "session";
  const targetRef = cleanOptionalString(input.targetRef) ?? "mainLoop";
  const issuedAt = input.issuedAt ?? defaultTimestamp();
  return `${sessionId}:cancel:${input.scope}:${targetRef}:${issuedAt}`;
}

export function createMainLoopApprovalEnvelope(input: {
  sessionId: string;
  reason: string;
  requestedScopes?: readonly string[];
  riskLevel?: RuntimeAdjudication["riskLevel"];
  decisionRef?: string;
  proposedActionRef?: string;
  surfaceRef?: string;
  cancelToken?: string;
  now?: string;
  metadata?: Readonly<Record<string, unknown>>;
}): MainLoopApprovalEnvelope {
  const sessionId = input.sessionId.trim();
  const now = input.now ?? defaultTimestamp();
  const decisionRef = cleanOptionalString(input.decisionRef);
  const approvalId = `${sessionId}:approval:${decisionRef ?? "runtime"}:${now}`;
  return {
    approvalId,
    sessionId,
    status: "pending",
    reason: input.reason.trim() || "runtime approval required",
    requestedScopes: cleanRefs(input.requestedScopes),
    ...(input.riskLevel === undefined ? {} : { riskLevel: input.riskLevel }),
    ...(decisionRef === undefined ? {} : { decisionRef }),
    ...(cleanOptionalString(input.proposedActionRef) === undefined ? {} : { proposedActionRef: cleanOptionalString(input.proposedActionRef) }),
    ...(cleanOptionalString(input.surfaceRef) === undefined ? {} : { surfaceRef: cleanOptionalString(input.surfaceRef) }),
    ...(cleanOptionalString(input.cancelToken) === undefined ? {} : { cancelToken: cleanOptionalString(input.cancelToken) }),
    createdAt: now,
    metadata: input.metadata ?? {},
    publicSafe: true,
  };
}

export function resolveMainLoopApproval(input: {
  envelope: MainLoopApprovalEnvelope;
  decision: "approve" | "deny";
  responderRef: string;
  noteForModel?: string;
  parameterPatch?: Readonly<Record<string, unknown>>;
  now?: string;
  metadata?: Readonly<Record<string, unknown>>;
}): MainLoopApprovalResolution {
  const responderRef = input.responderRef.trim() || "interface.unknown";
  const noteForModel = cleanOptionalString(input.noteForModel);
  return {
    approvalId: input.envelope.approvalId,
    sessionId: input.envelope.sessionId,
    status: input.decision === "approve" ? "approved" : "denied",
    responderRef,
    resolvedAt: input.now ?? defaultTimestamp(),
    resumeAction: "resume",
    nextAction: input.decision === "approve" ? "resume" : "invokeModel",
    ...(noteForModel === undefined ? {} : { noteForModel }),
    canMutateToolInput: false,
    ...(input.parameterPatch === undefined ? {} : { ignoredParameterPatch: input.parameterPatch }),
    metadata: input.metadata ?? {},
    publicSafe: true,
  };
}

export function createMainLoopControlAction(input: {
  sessionId: string;
  primitive: Extract<MainLoopControlPrimitive, "pause" | "resume" | "interrupt">;
  reason?: string;
  cancelToken?: string;
  trace?: MainLoopStepTrace;
  now?: string;
  metadata?: Readonly<Record<string, unknown>>;
}): MainLoopControlActionRecord {
  const sessionId = input.sessionId.trim();
  const primitive = input.primitive;
  const runtimeStatus =
    primitive === "pause" ? "paused" :
      primitive === "resume" ? "resuming" :
        "interrupted";
  const mainLoopStatus =
    primitive === "pause" ? "waitingApproval" :
      primitive === "resume" ? "running" :
        "interrupted";
  const now = input.now ?? defaultTimestamp();
  return {
    actionId: `${sessionId}:control:${primitive}:${now}`,
    sessionId,
    primitive,
    mainLoopStatus,
    runtimeStatus,
    reason: input.reason?.trim() || `${primitive} requested by runtime control surface`,
    ...(cleanOptionalString(input.cancelToken) === undefined ? {} : { cancelToken: cleanOptionalString(input.cancelToken) }),
    trace: input.trace ?? {},
    createdAt: now,
    metadata: input.metadata ?? {},
    publicSafe: true,
  };
}

export function createMainLoopRollbackPoint(input: {
  checkpoint: MainLoopCheckpoint;
  metadata?: Readonly<Record<string, unknown>>;
}): MainLoopRollbackPoint {
  return {
    rollbackPointId: `${input.checkpoint.checkpointId}:rollbackPoint`,
    sessionId: input.checkpoint.sessionId,
    checkpoint: input.checkpoint,
    timelineRef: input.checkpoint.timelineRef,
    executor: "runtime-control-surface",
    executableByMainLoop: false,
    metadata: input.metadata ?? {},
    publicSafe: true,
  };
}

function recordRefs(records: readonly MainLoopStepRecord[], selector: (record: MainLoopStepRecord) => string | undefined): readonly string[] {
  return cleanRefs(records.map(selector).filter((ref): ref is string => ref !== undefined));
}

function recordObservationRefs(records: readonly MainLoopStepRecord[]): readonly string[] {
  return cleanRefs(records.flatMap((record) => record.observationRefs));
}

function providerRawRefs(records: readonly MainLoopStepRecord[]): readonly string[] {
  return cleanRefs(records.flatMap((record) => {
    const rawRefs = record.metadata.providerRawRefs;
    return Array.isArray(rawRefs) ? rawRefs.filter((ref): ref is string => typeof ref === "string") : [];
  }));
}

function replayPlan(input: {
  kind: MainLoopReplayPlanKind;
  sessionId: string;
  sourceTimelineRefs: readonly MainLoopTimelineRef[];
  stepRecords: readonly MainLoopStepRecord[];
  metadata?: Readonly<Record<string, unknown>>;
}): MainLoopReplayPlan {
  const firstRef = input.sourceTimelineRefs[0]?.ref ?? "unknown";
  return {
    replayId: `${input.sessionId}:replay:${input.kind}:${firstRef}`,
    kind: input.kind,
    sessionId: input.sessionId,
    sourceTimelineRefs: input.sourceTimelineRefs,
    stepRecords: input.stepRecords,
    promptPackRefs: recordRefs(input.stepRecords, (record) => record.promptPackRef),
    loweredPromptRefs: recordRefs(input.stepRecords, (record) => record.loweredPromptRef),
    observationRefs: recordObservationRefs(input.stepRecords),
    providerRawRefs: providerRawRefs(input.stepRecords),
    dryRun: true,
    unsafeSideEffects: false,
    metadata: input.metadata ?? {},
    publicSafe: true,
  };
}

function simpleHash(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return `mainLoop:${Math.abs(hash).toString(16)}`;
}

function segmentHash(cachePlan: PromptPackCachePlan, segmentKind: string): string | undefined {
  return cachePlan.segments.find((segment) => segment.segmentKind === segmentKind)?.segmentHash;
}

export function analyzeMainLoopCacheHealth(input: {
  cachePlan: PromptPackCachePlan;
  previousCapabilityHash?: string;
  providerTelemetry?: PromptPackCacheTelemetry;
  metadata?: Readonly<Record<string, unknown>>;
}): MainLoopCacheHealth {
  const stablePrefixHashes = input.cachePlan.cacheablePrefixSegmentKinds
    .map((segmentKind) => segmentHash(input.cachePlan, segmentKind))
    .filter((hash): hash is string => hash !== undefined);
  const capabilityHash = segmentHash(input.cachePlan, "toolDeclarations");
  return {
    stablePrefixHash: simpleHash(stablePrefixHashes.join("|")),
    ...(capabilityHash === undefined ? {} : { capabilityHash }),
    ...(segmentHash(input.cachePlan, "sessionSummary") === undefined ? {} : { sessionSummaryHash: segmentHash(input.cachePlan, "sessionSummary") }),
    ...(segmentHash(input.cachePlan, "observations") === undefined ? {} : { observationHash: segmentHash(input.cachePlan, "observations") }),
    ...(input.providerTelemetry === undefined ? {} : { providerTelemetry: input.providerTelemetry }),
    cacheMissWarnings: input.cachePlan.cacheRiskWarnings,
    dynamicSegmentKinds: input.cachePlan.dynamicSegmentKinds,
    capabilityRebuildRequired: input.previousCapabilityHash !== undefined && capabilityHash !== undefined
      ? input.previousCapabilityHash !== capabilityHash
      : false,
    metadata: input.metadata ?? {},
    publicSafe: true,
  };
}

export function resolveMainLoopToolChoice(input: {
  mode?: MainLoopToolChoiceMode;
  toolId?: string;
  groupId?: string;
  procedureId?: string;
  evidenceRuleRefs?: readonly string[];
  reason?: string;
  metadata?: Readonly<Record<string, unknown>>;
} = {}): MainLoopToolChoicePolicy {
  const mode = input.mode ?? "auto";
  return {
    mode,
    ...(cleanOptionalString(input.toolId) === undefined ? {} : { toolId: cleanOptionalString(input.toolId) }),
    ...(cleanOptionalString(input.groupId) === undefined ? {} : { groupId: cleanOptionalString(input.groupId) }),
    ...(cleanOptionalString(input.procedureId) === undefined ? {} : { procedureId: cleanOptionalString(input.procedureId) }),
    evidenceRuleRefs: cleanRefs(input.evidenceRuleRefs),
    promptPackRuleOnly: true,
    reason: input.reason?.trim() || (mode === "auto" ? "model may freely choose whether to call tools" : `tool choice mode is ${mode}`),
    metadata: input.metadata ?? {},
    publicSafe: true,
  };
}

export function createMainLoopInputMaterial(input: {
  sessionId: string;
  inputId: string;
  kind: MainLoopInputMaterialKind;
  text?: string;
  uri?: string;
  mimeType?: string;
  observationRef?: string;
  metadata?: Readonly<Record<string, unknown>>;
}): MainLoopInputMaterial {
  const inputId = input.inputId.trim() || `${input.sessionId.trim()}:input`;
  const text = input.text?.trim() || (input.uri === undefined ? "" : `[${input.kind}:${input.uri.trim()}]`);
  return {
    inputId,
    kind: input.kind,
    promptMaterial: {
      id: inputId,
      kind: input.kind === "text" ? "user" : "file",
      text,
      source: input.uri?.trim() || "user",
      promptSegmentKind: "userTurn",
      metadata: {
        inputKind: input.kind,
        ...(input.mimeType?.trim() ? { mimeType: input.mimeType.trim() } : {}),
        ...(input.uri?.trim() ? { uri: input.uri.trim() } : {}),
      },
    },
    ...(cleanOptionalString(input.observationRef) === undefined ? {} : { observationRef: cleanOptionalString(input.observationRef) }),
    providerPayloadCreated: false,
    metadata: input.metadata ?? {},
    publicSafe: true,
  };
}

export function createMainLoopOutputEnvelope(input: {
  sessionId: string;
  outputId?: string;
  kind: MainLoopOutputEnvelopeKind;
  payload: unknown;
  artifactRefs?: readonly string[];
  traceSummary?: string;
  streamChunkCompleted?: boolean;
  metadata?: Readonly<Record<string, unknown>>;
}): MainLoopOutputEnvelope {
  const sessionId = input.sessionId.trim();
  const outputId = input.outputId?.trim() || `${sessionId}:output:${input.kind}`;
  return {
    outputId,
    kind: input.kind,
    sessionId,
    payload: input.payload,
    recordPolicy: input.kind === "streamChunk" && input.streamChunkCompleted !== true ? "afterChunkCompleted" : "immediate",
    ...(cleanOptionalString(input.traceSummary) === undefined ? {} : { traceSummary: cleanOptionalString(input.traceSummary) }),
    artifactRefs: cleanRefs(input.artifactRefs),
    metadata: input.metadata ?? {},
    publicSafe: true,
  };
}

export function createMainLoopAgentInterfacePrimitive(input: {
  sessionId: string;
  interfaceRef: string;
  targetAgentRef?: string;
  payloadRef?: string;
  metadata?: Readonly<Record<string, unknown>>;
}): MainLoopAgentInterfacePrimitive {
  const sessionId = input.sessionId.trim();
  const interfaceRef = input.interfaceRef.trim() || "agent.interface";
  return {
    primitiveId: `${sessionId}:agentInterface:${interfaceRef}`,
    sessionId,
    kind: "agentInterfaceHandoff",
    ...(cleanOptionalString(input.targetAgentRef) === undefined ? {} : { targetAgentRef: cleanOptionalString(input.targetAgentRef) }),
    interfaceRef,
    directInvokeAgent: false,
    multiagentManaged: false,
    ...(cleanOptionalString(input.payloadRef) === undefined ? {} : { payloadRef: cleanOptionalString(input.payloadRef) }),
    metadata: input.metadata ?? {},
    publicSafe: true,
  };
}

export function createMainLoopStateProgressionRecord(input: {
  sessionId: string;
  action: MainLoopStateProgressionAction;
  stateBeforeRef?: string;
  stateAfterRef?: string;
  stepRef?: string;
  eventRef?: string;
  metadata?: Readonly<Record<string, unknown>>;
}): MainLoopStateProgressionRecord {
  const sessionId = input.sessionId.trim() || "session";
  const action = input.action;
  const stateAfterRef = input.stateAfterRef?.trim() || `${sessionId}:state:${action}`;
  return {
    action,
    ...(cleanOptionalString(input.stateBeforeRef) === undefined ? {} : { stateBeforeRef: cleanOptionalString(input.stateBeforeRef) }),
    stateAfterRef,
    ...(cleanOptionalString(input.stepRef) === undefined ? {} : { stepRef: cleanOptionalString(input.stepRef) }),
    eventRef: input.eventRef?.trim() || `${sessionId}:event:${action}`,
    metadata: input.metadata ?? {},
    publicSafe: true,
  };
}

export function decideMainLoopPromptPackRebuild(input: {
  triggers?: readonly MainLoopPromptPackRebuildTrigger[];
  previousPromptPackRef?: string;
  metadata?: Readonly<Record<string, unknown>>;
} = {}): MainLoopPromptPackRebuildDecision {
  const triggers = [...new Set(input.triggers ?? [])];
  const hasPrevious = cleanOptionalString(input.previousPromptPackRef) !== undefined;
  const rebuild = !hasPrevious || triggers.length > 0;
  return {
    rebuild,
    triggers,
    reason: rebuild
      ? hasPrevious
        ? `PromptPack rebuild required by ${triggers.join(", ")}`
        : "PromptPack rebuild required because no previous PromptPack ref exists"
      : "PromptPack can be reused; no rebuild trigger was observed",
    cacheFriendly: !triggers.includes("capabilitySetChange") && !triggers.includes("modelFamilySwitch"),
    metadata: input.metadata ?? {},
    publicSafe: true,
  };
}

export function replayMainLoopStep(step: MainLoopStep): MainLoopReplayPlan {
  return replayPlan({
    kind: "step",
    sessionId: step.record.sessionId,
    sourceTimelineRefs: [step.timelineRef],
    stepRecords: [step.record],
    metadata: { actionPrimitive: step.record.actionPrimitive },
  });
}

export function replayMainLoopTick(tick: LoopTick): MainLoopReplayPlan {
  return replayPlan({
    kind: "loopTick",
    sessionId: tick.sessionId,
    sourceTimelineRefs: [tick.timelineRef, ...tick.steps.map((step) => step.timelineRef)],
    stepRecords: tick.steps.map((step) => step.record),
    metadata: { tickKind: tick.kind, tickStatus: tick.status },
  });
}

export function replayUserTurn(turn: UserTurn): MainLoopReplayPlan {
  const steps = turn.ticks.flatMap((tick) => tick.steps);
  return replayPlan({
    kind: "userTurn",
    sessionId: turn.sessionId,
    sourceTimelineRefs: [turn.timelineRef, ...turn.ticks.flatMap((tick) => [
      tick.timelineRef,
      ...tick.steps.map((step) => step.timelineRef),
    ])],
    stepRecords: steps.map((step) => step.record),
    metadata: { userTurnIndex: turn.userTurnIndex, userTurnStatus: turn.status },
  });
}

export function createMainLoopBehaviorRegistry(input: {
  registryId?: string;
  behaviors?: readonly MainLoopBehaviorRef[];
  metadata?: Readonly<Record<string, unknown>>;
} = {}): MainLoopBehaviorRegistry {
  const seen = new Set<string>();
  const behaviors: MainLoopBehaviorRef[] = [];
  for (const behavior of input.behaviors ?? []) {
    const behaviorRef = behavior.behaviorRef.trim();
    const handlerRef = behavior.handlerRef.trim();
    if (behaviorRef.length === 0 || handlerRef.length === 0 || seen.has(behaviorRef)) {
      continue;
    }
    seen.add(behaviorRef);
    behaviors.push({
      ...behavior,
      behaviorRef,
      handlerRef,
      priority: Number.isFinite(behavior.priority) ? behavior.priority : 0,
      timeoutMs: Number.isFinite(behavior.timeoutMs) && behavior.timeoutMs > 0 ? behavior.timeoutMs : 30_000,
      conflictsWith: cleanRefs(behavior.conflictsWith),
      metadata: behavior.metadata ?? {},
    });
  }
  return {
    registryId: input.registryId?.trim() || "mainLoop.behaviorRegistry",
    behaviors: behaviors.sort((left, right) => right.priority - left.priority || left.behaviorRef.localeCompare(right.behaviorRef)),
    metadata: input.metadata ?? {},
  };
}

export function resolveMainLoopBehaviorRef(input: {
  registry: MainLoopBehaviorRegistry;
  behaviorRef: string;
  activeBehaviorRefs?: readonly string[];
  settingConflictRefs?: readonly string[];
  governance?: MainLoopStepGateResult;
}): MainLoopBehaviorResolution {
  const behaviorRef = input.behaviorRef.trim();
  const behavior = input.registry.behaviors.find((candidate) => candidate.behaviorRef === behaviorRef);
  if (behavior === undefined) {
    return {
      ok: false,
      behaviorRef,
      code: "UNREGISTERED_BEHAVIOR",
      message: "MainLoop behavior ref is not registered in the active registry",
      conflicts: [],
      publicSafe: true,
    };
  }

  const activeBehaviorRefs = cleanRefs(input.activeBehaviorRefs);
  const settingConflictRefs = cleanRefs(input.settingConflictRefs);
  const conflicts = cleanRefs([
    ...behavior.conflictsWith.filter((conflict) => activeBehaviorRefs.includes(conflict)),
    ...settingConflictRefs,
  ]);
  if (conflicts.length > 0) {
    return {
      ok: false,
      behaviorRef,
      code: "BEHAVIOR_CONFLICT",
      message: "MainLoop behavior conflicts with active behavior refs or agent settings",
      conflicts,
      publicSafe: true,
    };
  }

  if (!gateAccepted(input.governance)) {
    return {
      ok: false,
      behaviorRef,
      code: "BEHAVIOR_GOVERNANCE_REJECTED",
      message: gateReason(input.governance, "MainLoop behavior was rejected by governance"),
      conflicts: [],
      publicSafe: true,
    };
  }

  return {
    ok: true,
    behavior,
    executable: true,
    executionContract: {
      handlerRef: behavior.handlerRef,
      timeoutMs: behavior.timeoutMs,
      ...(behavior.sandboxRef === undefined ? {} : { sandboxRef: behavior.sandboxRef }),
      ...(behavior.resourceRef === undefined ? {} : { resourceRef: behavior.resourceRef }),
    },
    metadata: { source: behavior.source, primitive: behavior.primitive },
    publicSafe: true,
  };
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
    return ["prepareTurn", "assemblePromptPack", "buildCachePlan", "handoffPromptPack", "lowerPrompt", "handoffModelInvocation", "interpretModelDecision", "adjudicateDecision", "handoffModelDecision"];
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

export function prepareMainLoopTurn(request: MainLoopTurnPreparationRequest): MainLoopTurnPreparationResult {
  const runtimeId = request.runtimeId?.trim();
  const sessionId = request.sessionId?.trim();
  if (runtimeId === undefined || runtimeId.length === 0) {
    return {
      ok: false,
      error: publicSafeMainLoopFailure("MISSING_RUNTIME_ID", "mainLoop turn preparation requires a runtimeId", "input"),
      events: ["agentCore.execution.mainLoop.turnPreparation.rejected"],
    };
  }
  if (sessionId === undefined || sessionId.length === 0) {
    return {
      ok: false,
      error: publicSafeMainLoopFailure("MISSING_SESSION_ID", "mainLoop turn preparation requires a sessionId", "input"),
      events: ["agentCore.execution.mainLoop.turnPreparation.rejected"],
    };
  }
  const turnIndex = request.turnIndex ?? 0;
  const startStepIndex = request.startStepIndex ?? 0;
  const promptPackId = request.promptPackId?.trim() || `${sessionId}:promptPack:${turnIndex + 1}`;
  const defined = definePromptPack({
    runtimeId,
    sessionId,
    targetModel: request.targetModel,
    loweringHint: request.loweringHint,
    materials: request.materials,
    requestedScopes: ["promptPack.define"],
    allowedScopes: ["promptPack.define"],
    runtimeReady: true,
    contract: { accepted: true },
    governance: { accepted: true },
  });
  if (!defined.ok) {
    return {
      ok: false,
      error: publicSafeMainLoopFailure(defined.error.code, defined.error.message, "prompt"),
      events: defined.events,
    };
  }

  const assembled = assemblePromptPack({
    runtimeId,
    sessionId,
    targetModel: request.targetModel,
    materials: defined.definition.materials,
    ordering: "priority-desc",
  });
  if (!assembled.ok) {
    return {
      ok: false,
      error: publicSafeMainLoopFailure(assembled.error.code, assembled.error.message, "prompt"),
      events: [...defined.events, ...assembled.events],
    };
  }

  const stepRecords = [
    createMainLoopStepRecord({
      sessionId,
      turnIndex,
      stepIndex: startStepIndex,
      actionPrimitive: "prepareTurn",
      status: "completed",
      outputRefs: [promptPackId],
      promptPackRef: promptPackId,
      now: request.now,
    }),
    createMainLoopStepRecord({
      sessionId,
      turnIndex,
      stepIndex: startStepIndex + 1,
      actionPrimitive: "assemblePromptPack",
      status: "completed",
      outputRefs: assembled.promptPack.materials.map((material) => material.id),
      promptPackRef: promptPackId,
      now: request.now,
    }),
    createMainLoopStepRecord({
      sessionId,
      turnIndex,
      stepIndex: startStepIndex + 2,
      actionPrimitive: "buildCachePlan",
      status: "completed",
      inputRefs: assembled.promptPack.materials.map((material) => material.id),
      outputRefs: assembled.promptPack.cachePlan.segments.map((segment) => segment.segmentId),
      promptPackRef: promptPackId,
      now: request.now,
      metadata: {
        cacheablePrefixSegmentKinds: assembled.promptPack.cachePlan.cacheablePrefixSegmentKinds,
        cacheRiskWarnings: assembled.promptPack.cachePlan.cacheRiskWarnings,
      },
    }),
  ];

  return {
    ok: true,
    promptPackId,
    promptPack: assembled.promptPack,
    cachePlan: assembled.promptPack.cachePlan,
    turnRecord: {
      turnId: `${sessionId}:turn:${turnIndex}`,
      sessionId,
      turnIndex,
      lifecycle: "prepared",
      promptPackRef: promptPackId,
      cachePlanRef: `${promptPackId}:cachePlan`,
      segmentKinds: assembled.promptPack.cachePlan.segments.map((segment) => segment.segmentKind),
      stepRecords,
      metadata: {
        cacheRiskWarnings: assembled.promptPack.cachePlan.cacheRiskWarnings,
      },
    },
    events: [...defined.events, ...assembled.events, "agentCore.execution.mainLoop.turnPrepared"],
  };
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
