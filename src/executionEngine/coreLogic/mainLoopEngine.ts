/*
 * 文件定位：Agent 执行引擎 / MainLoopEngine。
 * 核心目的：作为 coreLogic 的正式执行入口，统一 turn state、事件记录、模型决策和工具循环。
 * 边界：保持 provider-neutral；真实模型、审批、工具执行均由 runtime ports/callbacks 注入。
 */

import {
  createMainLoopCoreEvent,
  createMainLoopRecorder,
  type MainLoopRecorderSnapshot,
} from "./mainLoopRecorder.js";
import {
  createMainLoopStreamAccumulator,
  noopMainLoopSummarizer,
  type MainLoopModelStreamEvent,
  type MainLoopRecorderPort,
  type MainLoopSummarizerPort,
  type MainLoopUsageReport,
  type MainLoopUsagePricing,
} from "./mainLoopPorts.js";
import {
  addMainLoopBudgetUsage,
  addMainLoopObservationRefs,
  clearMainLoopOneShotToolContextSelection,
  consumeMainLoopPendingInputs,
  createMainLoopTurnState,
  interruptMainLoopTurnState,
  registerMainLoopApprovalWait,
  resumeMainLoopTurnState,
  transitionMainLoopTurnState,
  type MainLoopResumeToken,
  type MainLoopTurnState,
} from "./turnState.js";
import {
  runToolExecutionUnits,
  toolExecutionUnitFromToolCall,
} from "./toolScheduler.js";
import type {
  MainLoopRunnerError,
  MainLoopRunnerFinalResult,
  MainLoopRunnerNoFinalContext,
  MainLoopRunnerNoFinalReason,
  MainLoopRunnerRequest,
  MainLoopRunnerResult,
} from "./mainLoop.js";

export type MainLoopEngineRequest<TPrompt, TRaw> = MainLoopRunnerRequest<TPrompt, TRaw> & {
  sessionId?: string;
  turnIdPrefix?: string;
  initialTurnState?: MainLoopTurnState;
  recorder?: MainLoopRecorderPort;
  summarizer?: MainLoopSummarizerPort;
  summaryMaterialRefs?: readonly string[];
  maxSummaryOutputTokens?: number;
  interruptSignal?: AbortSignal;
  resumeToken?: MainLoopResumeToken;
  usagePricing?: MainLoopUsagePricing | ((input: {
    turnIndex: number;
    modelCallId: string;
    usage: MainLoopUsageReport;
  }) => MainLoopUsagePricing | undefined);
  invokeModelStream?: (
    turnIndex: number,
    prompt: TPrompt,
    onStreamEvent: (event: MainLoopModelStreamEvent<TRaw>) => void | Promise<void>,
  ) => ReturnType<MainLoopRunnerRequest<TPrompt, TRaw>["invokeModel"]>;
  now?: () => string;
};

export type MainLoopEngineResult = MainLoopRunnerResult & {
  turnState?: MainLoopTurnState;
  recorderSnapshot?: MainLoopRecorderSnapshot;
};

export async function runMainLoopEngine<TPrompt, TRaw>(
  request: MainLoopEngineRequest<TPrompt, TRaw>,
): Promise<MainLoopEngineResult> {
  const sessionId = request.sessionId ?? request.initialTurnState?.sessionId ?? "mainLoop.session";
  const now = request.now ?? (() => new Date().toISOString());
  const recorder = request.recorder ?? createMainLoopRecorder();
  const summarizer = request.summarizer ?? noopMainLoopSummarizer;
  const recorderWithSnapshot = "snapshot" in recorder && typeof recorder.snapshot === "function"
    ? recorder as MainLoopRecorderPort & { snapshot: () => MainLoopRecorderSnapshot }
    : undefined;
  const events: string[] = ["agentCore.execution.mainLoop.engine.started"];
  let toolCalls = 0;
  let completedModelTurns = 0;
  let completedTurnToolCalls = 0;
  let noFinalReason: MainLoopRunnerNoFinalReason = "model_turn_limit";
  let state = request.initialTurnState ?? createMainLoopTurnState({
    sessionId,
    turnIndex: 0,
    turnId: `${request.turnIdPrefix ?? sessionId}:turn:0`,
    now: now(),
  });
  if (request.resumeToken !== undefined) {
    state = resumeMainLoopTurnState(state, {
      resumeToken: request.resumeToken,
      now: now(),
      metadata: { source: "engine.request" },
    });
  }

  await recordEvent("turn.started", state, { maxModelTurns: request.maxModelTurns, maxToolCalls: request.maxToolCalls });
  await recorder.recordTurnState(state);

  for (let turnIndex = 0; turnIndex < request.maxModelTurns; turnIndex += 1) {
    if (request.interruptSignal?.aborted === true) {
      return await interruptResult("interrupted before model turn", completedModelTurns, toolCalls);
    }
    const steering = consumeMainLoopPendingInputs(state, "interruptAndRestart");
    state = steering.state;
    if (steering.inputs.length > 0) {
      await recordState(state);
      await recordEvent("turn.interrupted", state, { pendingInputs: steering.inputs, disposition: "interruptAndRestart" });
      return await interruptResult("interrupted by pending steer input", completedModelTurns, toolCalls);
    }
    const appended = consumeMainLoopPendingInputs(state, "appendContextForCurrentTurn");
    state = appended.state;
    if (appended.inputs.length > 0) {
      await recordState(state);
      await recordEvent("observation.added", state, { pendingInputs: appended.inputs, disposition: "appendContextForCurrentTurn" });
    }
    completedModelTurns = turnIndex + 1;
    let turnToolCalls = 0;
    state = transitionMainLoopTurnState(state, { to: "preparing", reason: `prepare model turn ${turnIndex}`, now: now() });
    await recordState(state);

    const prepared = await request.prepareTurn(turnIndex);
    events.push(...prepared.events);
    if ("ok" in prepared && prepared.ok === false) {
      state = transitionMainLoopTurnState(state, { to: "failed", reason: prepared.error.message, now: now() });
      await recordState(state);
      await recordEvent("turn.failed", state, { error: prepared.error });
      return withEngineMetadata(runnerFailure(prepared.error, turnIndex + 1, toolCalls, events));
    }

    state = clearMainLoopOneShotToolContextSelection(state);
    state = transitionMainLoopTurnState(state, { to: "modelInvoking", reason: "invoke model", now: now() });
    await recordState(state);
    await recordEvent("model.started", state, {});
    const prompt = (prepared as { prompt: TPrompt }).prompt;
    const streamAccumulator = createMainLoopStreamAccumulator<TRaw>();
    const model = request.invokeModelStream === undefined
      ? await request.invokeModel(turnIndex, prompt)
      : await request.invokeModelStream(turnIndex, prompt, async (streamEvent) => {
          const streamState = streamAccumulator.push(streamEvent);
          await recordEvent(streamEvent.kind === "model.delta" ? "model.delta" : streamEvent.kind === "model.completed" ? "model.completed" : "model.started", state, {
            stream: streamState,
          });
    });
    events.push(...model.events);
    if (!model.ok) {
      if (model.error.code === "MAIN_LOOP_INTERRUPTED") {
        return await interruptResult(model.error.message, turnIndex + 1, toolCalls);
      }
      state = transitionMainLoopTurnState(state, { to: "failed", reason: model.error.message, now: now() });
      await recordState(state);
      await recordEvent("model.failed", state, { error: model.error });
      return withEngineMetadata(runnerFailure(model.error, turnIndex + 1, toolCalls, events));
    }
    const modelUsage = usageFromModel(model, streamAccumulator.snapshot().usage);
    const usagePricing = typeof request.usagePricing === "function"
      ? request.usagePricing({ turnIndex, modelCallId: model.modelCallId, usage: modelUsage })
      : request.usagePricing;
    state = addMainLoopBudgetUsage(state, usageForModelTurn(modelUsage, usagePricing));
    await recordState(state);
    await recordEvent("model.completed", state, {
      modelCallId: model.modelCallId,
      stream: streamAccumulator.snapshot(),
    });

    if (model.raw === null) {
      const dryRunFinal = request.onModelDryRun === undefined
        ? {
            ok: true as const,
            finalOutput: "PraxisRuntimeKernel dry-run completed.",
            events: ["agentCore.execution.mainLoop.runner.dryRunFinal"],
          }
        : await request.onModelDryRun({ turnIndex, prompt, model });
      events.push(...dryRunFinal.events);
      if (dryRunFinal.ok) {
        state = transitionMainLoopTurnState(state, { to: "completed", reason: "dry run final", now: now() });
        await recordState(state);
        await recordEvent("turn.completed", state, { finalOutput: dryRunFinal.finalOutput });
        return withEngineMetadata({ ok: true, finalOutput: dryRunFinal.finalOutput, modelTurns: turnIndex + 1, toolCalls, events });
      }
      return withEngineMetadata(runnerFailure(dryRunFinal.error, turnIndex + 1, toolCalls, events));
    }

    state = transitionMainLoopTurnState(state, { to: "decisionInterpreting", reason: "interpret model decision", now: now() });
    await recordState(state);
    const interpreted = await request.interpretDecision(turnIndex, model, prompt);
    events.push(...interpreted.events);
    if (!interpreted.ok) {
      state = transitionMainLoopTurnState(state, { to: "failed", reason: interpreted.error.message, now: now() });
      await recordState(state);
      await recordEvent("turn.failed", state, { error: interpreted.error });
      return withEngineMetadata(runnerFailure(interpreted.error, turnIndex + 1, toolCalls, events));
    }

    let continueLoop = false;
    for (const [decisionIndex, decision] of interpreted.decisions.entries()) {
      state = addMainLoopObservationRefs(state, decision.observationRefs);
      await recordState(state);
      if (decision.kind === "finalOutput") {
        state = transitionMainLoopTurnState(state, { to: "finalizing", reason: "candidate final output", now: now() });
        await recordState(state);
        const final = await request.acceptFinalOutput({ turnIndex, decisionIndex, decision, prompt });
        events.push(...final.events);
        if (final.ok) {
          state = transitionMainLoopTurnState(state, { to: "completed", reason: "final accepted", now: now() });
          await recordState(state);
          await recordEvent("final.accepted", state, { decisionId: decision.decisionId });
          await recordEvent("turn.completed", state, { finalOutput: final.finalOutput });
          return withEngineMetadata({ ok: true, finalOutput: final.finalOutput, modelTurns: turnIndex + 1, toolCalls, events });
        }
        return withEngineMetadata(runnerFailure(final.error, turnIndex + 1, toolCalls, events));
      }

      if (decision.kind === "continue") {
        const continued = await request.handleContinue({ turnIndex, decisionIndex, decision, prompt });
        events.push(...continued.events);
        if (!continued.ok) {
          return withEngineMetadata(runnerFailure(continued.error, turnIndex + 1, toolCalls, events));
        }
        continueLoop = continueLoop || continued.continueLoop;
        continue;
      }

      if (decision.kind === "fail") {
        const failed = await request.handleFailure({ turnIndex, decisionIndex, decision, prompt });
        events.push(...failed.events);
        return failed.ok
          ? withEngineMetadata(runnerFailure({
              code: decision.failure?.code ?? "MODEL_DECISION_FAILED",
              message: decision.failure?.message ?? "model decision requested failure",
              boundary: "model-decision",
              publicSafe: true,
            }, turnIndex + 1, toolCalls, events))
          : withEngineMetadata(runnerFailure(failed.error, turnIndex + 1, toolCalls, events));
      }

      if (decision.kind === "requestApproval") {
        const approvalId = decision.approvalRequest?.requestedScopes.join(",") || decision.decisionId;
        state = registerMainLoopApprovalWait(state, {
          approvalId,
          checkpointRef: `${state.turnId}:checkpoint:approval:${decisionIndex}`,
          pendingActionRef: decision.decisionId,
          now: now(),
          metadata: { decisionId: decision.decisionId },
        });
        await recordState(state);
        await recordEvent("approval.requested", state, { approvalId, decisionId: decision.decisionId });
        const approval = await request.handleApproval({ turnIndex, decisionIndex, decision, prompt });
        events.push(...approval.events);
        if (!approval.ok) {
          return withEngineMetadata(runnerFailure(approval.error, turnIndex + 1, toolCalls, events));
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
        state = transitionMainLoopTurnState(state, { to: "toolScheduling", reason: "tool call", now: now() });
        await recordState(state);
        await recordEvent("tool.queued", state, { toolCall: decision.toolCall });
        const unit = decision.toolCall === undefined ? undefined : toolExecutionUnitFromToolCall(decision.toolCall);
        if (unit === undefined) {
          return withEngineMetadata(runnerFailure({
            code: "MISSING_TOOL_CALL",
            message: "toolCall decision did not include a tool call",
            boundary: "tool",
            publicSafe: true,
          }, turnIndex + 1, toolCalls, events));
        }
        let continueAfterTool = false;
        const scheduled = await runToolExecutionUnits([unit], async () => {
          await recordEvent("tool.started", state, { toolCall: decision.toolCall });
          const tool = await request.handleToolCall({ turnIndex, decisionIndex, decision, prompt });
          events.push(...tool.events);
          if (!tool.ok) {
            return {
              ok: false,
              error: tool.error,
              metadata: { continueLoop: false },
            };
          }
          continueAfterTool = continueAfterTool || tool.continueLoop;
          return { ok: true, result: tool, metadata: { continueLoop: tool.continueLoop } };
        }, { executionMode: "serial", now, signal: request.interruptSignal });
        events.push(...scheduled.events);
        if (!scheduled.ok) {
          const cancelled = scheduled.records.find((record) => record.status === "cancelled");
          const interrupted = scheduled.records.find((record) => record.error?.code === "MAIN_LOOP_INTERRUPTED");
          if (cancelled !== undefined || interrupted !== undefined) {
            return await interruptResult(cancelled?.error?.message ?? interrupted?.error?.message ?? "interrupted during tool call", turnIndex + 1, toolCalls);
          }
          const failed = scheduled.records.find((record) => record.status === "failed");
          await recordEvent("tool.failed", state, { toolCall: decision.toolCall, error: failed?.error });
          return withEngineMetadata(runnerFailure({
            code: failed?.error?.code ?? "TOOL_CALL_FAILED",
            message: failed?.error?.message ?? "tool call failed",
            boundary: "tool",
            publicSafe: true,
          }, turnIndex + 1, toolCalls, events));
        }
        toolCalls += 1;
        turnToolCalls += 1;
        completedTurnToolCalls = turnToolCalls;
        state = addMainLoopBudgetUsage(state, { toolCalls: 1 });
        await recordState(state);
        await recordEvent("tool.completed", state, { toolCall: decision.toolCall });
        continueLoop = continueLoop || continueAfterTool;
        continue;
      }

      if (decision.kind === "ephemeralProcedurePlan") {
        if (Boolean(request.interruptSignal?.aborted)) {
          return await interruptResult("interrupted before ephemeral procedure", turnIndex + 1, toolCalls);
        }
        state = transitionMainLoopTurnState(state, { to: "toolScheduling", reason: "ephemeral procedure", now: now() });
        await recordState(state);
        await recordEvent("tool.queued", state, { procedureId: decision.ephemeralProcedurePlan?.procedureId });
        const procedure = await request.handleEphemeralProcedure({ turnIndex, decisionIndex, decision, prompt });
        events.push(...procedure.events);
        if (!procedure.ok) {
          if (procedure.error.code === "MAIN_LOOP_INTERRUPTED") {
            return await interruptResult(procedure.error.message, turnIndex + 1, toolCalls);
          }
          return withEngineMetadata(runnerFailure(procedure.error, turnIndex + 1, toolCalls, events));
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
  if ((request.summaryMaterialRefs?.length ?? 0) > 0) {
    state = transitionMainLoopTurnState(state, { to: "summarizing", reason: "no final summary", now: now() });
    await recordState(state);
    await recordEvent("summary.started", state, { materialRefs: request.summaryMaterialRefs ?? [] });
    const summary = await summarizer.summarize({
      sessionId,
      turnId: state.turnId,
      materialRefs: request.summaryMaterialRefs ?? [],
      maxOutputTokens: request.maxSummaryOutputTokens,
      metadata: { reason: noFinalReason },
    });
    events.push(...summary.events);
    await recordEvent("summary.completed", state, summary.ok
      ? { artifactRef: summary.artifactRef, summaryText: summary.summaryText }
      : { error: summary.error });
  }
  const fallback = request.onNoFinalOutput === undefined
    ? fallbackRunnerFinal(noFinalContext)
    : await request.onNoFinalOutput(noFinalContext);
  events.push(...fallback.events);
  if (fallback.ok) {
    state = transitionMainLoopTurnState(state, { to: "completed", reason: `fallback final: ${noFinalReason}`, now: now() });
    await recordState(state);
    await recordEvent("turn.completed", state, { reason: noFinalReason, finalOutput: fallback.finalOutput });
    return withEngineMetadata({ ok: true, finalOutput: fallback.finalOutput, modelTurns: noFinalContext.modelTurns, toolCalls, events });
  }
  state = transitionMainLoopTurnState(state, { to: "failed", reason: fallback.error.message, now: now() });
  await recordState(state);
  return withEngineMetadata(runnerFailure(fallback.error, noFinalContext.modelTurns, toolCalls, events));

  async function recordState(next: MainLoopTurnState): Promise<void> {
    await recorder.recordTurnState(next);
    await recordEvent("turn.state.changed", next, { phase: next.phase, revision: next.revision });
  }

  async function recordEvent(
    name: Parameters<typeof createMainLoopCoreEvent>[0]["name"],
    next: MainLoopTurnState,
    payload: Readonly<Record<string, unknown>>,
  ): Promise<void> {
    await recorder.recordEvent(createMainLoopCoreEvent({
      name,
      sessionId,
      turnId: next.turnId,
      turnIndex: next.turnIndex,
      now: now(),
      payload,
    }));
  }

  function withEngineMetadata(result: MainLoopRunnerResult): MainLoopEngineResult {
    return {
      ...result,
      turnState: state,
      recorderSnapshot: recorderWithSnapshot?.snapshot(),
    };
  }

  async function interruptResult(reason: string, modelTurns: number, currentToolCalls: number): Promise<MainLoopEngineResult> {
    state = interruptMainLoopTurnState(state, {
      controlActionId: `${state.turnId}:control:interrupt`,
      cancelTokenId: `${state.turnId}:cancel:interrupt`,
      rollbackPointRef: `${state.turnId}:rollback:interrupt`,
      replayPlanRef: `${state.turnId}:replay:interrupt`,
      reason,
      now: now(),
      metadata: { signalAborted: request.interruptSignal?.aborted === true },
    });
    await recordState(state);
    await recordEvent("turn.interrupted", state, { reason });
    return withEngineMetadata(runnerFailure({
      code: "MAIN_LOOP_INTERRUPTED",
      message: reason,
      boundary: "model",
      publicSafe: true,
    }, modelTurns, currentToolCalls, events));
  }
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

function usageForModelTurn(
  usage: MainLoopUsageReport,
  pricing: MainLoopUsagePricing | undefined,
): Partial<MainLoopUsageReport> & { modelTurns: number } {
  return {
    ...usage,
    estimatedCostUsd: usage.estimatedCostUsd ?? estimateUsageCost(usage, pricing),
    modelTurns: 1,
  };
}

function usageFromModel(
  model: { usage?: MainLoopUsageReport; raw?: unknown },
  streamUsage?: MainLoopUsageReport,
): MainLoopUsageReport {
  if (model.usage !== undefined) {
    return model.usage;
  }
  if (typeof model.raw === "object" && model.raw !== null && "usage" in model.raw) {
    const rawUsage = (model.raw as { usage?: unknown }).usage;
    if (typeof rawUsage === "object" && rawUsage !== null) {
      const usage = rawUsage as Record<string, unknown>;
      return {
        inputTokens: numberFromUnknown(usage.inputTokens ?? usage.prompt_tokens ?? usage.input_tokens),
        outputTokens: numberFromUnknown(usage.outputTokens ?? usage.completion_tokens ?? usage.output_tokens),
        totalTokens: numberFromUnknown(usage.totalTokens ?? usage.total_tokens),
        providerRaw: rawUsage,
      };
    }
  }
  return streamUsage ?? {};
}

function estimateUsageCost(usage: MainLoopUsageReport, pricing: MainLoopUsagePricing | undefined): number | undefined {
  if (pricing === undefined) {
    return undefined;
  }
  const inputTokens = positiveNumber(usage.inputTokens);
  const outputTokens = positiveNumber(usage.outputTokens);
  const inputCost = inputTokens === undefined || pricing.inputUsdPerMillionTokens === undefined
    ? 0
    : inputTokens * pricing.inputUsdPerMillionTokens / 1_000_000;
  const outputCost = outputTokens === undefined || pricing.outputUsdPerMillionTokens === undefined
    ? 0
    : outputTokens * pricing.outputUsdPerMillionTokens / 1_000_000;
  const total = inputCost + outputCost;
  return total > 0 ? total : undefined;
}

function numberFromUnknown(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function positiveNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}
