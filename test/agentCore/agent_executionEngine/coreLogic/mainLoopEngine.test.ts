import assert from "node:assert/strict";
import test from "node:test";

import { runMainLoopEngine } from "../../../../src/executionEngine/coreLogic/mainLoopEngine.js";
import {
  createMainLoopTurnState,
  enqueueMainLoopPendingInput,
  registerMainLoopApprovalWait,
} from "../../../../src/executionEngine/coreLogic/turnState.js";

test("runMainLoopEngine records turn state, model events, tool events, and final output", async () => {
  const result = await runMainLoopEngine({
    sessionId: "session-1",
    maxModelTurns: 2,
    maxToolCalls: 2,
    prepareTurn: async (turnIndex) => ({
      prompt: { promptPackId: `prompt-${turnIndex}` },
      events: [`prepare:${turnIndex}`],
    }),
    invokeModel: async (turnIndex) => ({
      ok: true,
      modelCallId: `model-${turnIndex}`,
      raw: turnIndex === 0
        ? { tool: true, usage: { input_tokens: 10, output_tokens: 3, total_tokens: 13 } }
        : { final: true, usage: { input_tokens: 4, output_tokens: 2, total_tokens: 6 } },
      events: [`model:${turnIndex}`],
    }),
    interpretDecision: async (turnIndex) => ({
      ok: true,
      decisions: turnIndex === 0
        ? [{
            decisionId: "decision.tool",
            kind: "toolCall",
            toolCall: { callId: "call-1", toolId: "file.read", arguments: { path: "a.txt" } },
            observationRefs: ["observation-1"],
            metadata: {},
          }]
        : [{
            decisionId: "decision.final",
            kind: "finalOutput",
            finalOutput: "done",
            observationRefs: [],
            metadata: {},
          }],
      events: [`decision:${turnIndex}`],
    }),
    acceptFinalOutput: async ({ decision }) => ({ ok: true, finalOutput: decision.finalOutput ?? "", events: ["final"] }),
    handleContinue: async () => ({ ok: true, continueLoop: true, events: ["continue"] }),
    handleFailure: async () => assert.fail("failure handler should not run"),
    handleApproval: async () => assert.fail("approval handler should not run"),
    handleToolCall: async () => ({ ok: true, continueLoop: true, events: ["tool"] }),
    handleEphemeralProcedure: async () => assert.fail("procedure handler should not run"),
  });

  assert.equal(result.ok, true);
  assert.equal(result.turnState?.phase, "completed");
  assert.equal(result.turnState?.budgetUsage.modelTurns, 2);
  assert.equal(result.turnState?.budgetUsage.toolCalls, 1);
  assert.equal(result.turnState?.budgetUsage.totalTokens, 19);
  assert.equal(result.recorderSnapshot?.events.some((event) => event.name === "tool.completed"), true);
  assert.equal(result.recorderSnapshot?.events.some((event) => event.name === "final.accepted"), true);
});

test("runMainLoopEngine estimates cost from injected usage pricing when provider omits cost", async () => {
  const result = await runMainLoopEngine({
    sessionId: "session-budget-cost",
    maxModelTurns: 1,
    maxToolCalls: 1,
    usagePricing: {
      inputUsdPerMillionTokens: 2,
      outputUsdPerMillionTokens: 10,
      modelRef: "test-model",
    },
    prepareTurn: async () => ({ prompt: { promptPackId: "prompt-budget-cost" }, events: [] }),
    invokeModel: async () => ({
      ok: true,
      modelCallId: "model-budget-cost",
      raw: { final: true },
      usage: { inputTokens: 1_000, outputTokens: 2_000, totalTokens: 3_000 },
      events: [],
    }),
    interpretDecision: async () => ({
      ok: true,
      decisions: [{
        decisionId: "decision.final",
        kind: "finalOutput",
        finalOutput: "priced",
        observationRefs: [],
        metadata: {},
      }],
      events: [],
    }),
    acceptFinalOutput: async ({ decision }) => ({ ok: true, finalOutput: decision.finalOutput ?? "", events: [] }),
    handleContinue: async () => assert.fail("continue should not run"),
    handleFailure: async () => assert.fail("failure should not run"),
    handleApproval: async () => assert.fail("approval should not run"),
    handleToolCall: async () => assert.fail("tool should not run"),
    handleEphemeralProcedure: async () => assert.fail("procedure should not run"),
  });

  assert.equal(result.ok, true);
  assert.equal(result.turnState?.budgetUsage.totalTokens, 3_000);
  assert.equal(result.turnState?.budgetUsage.estimatedCostUsd, 0.022);
});

test("runMainLoopEngine can call an injected summarizer before no-final fallback", async () => {
  const result = await runMainLoopEngine({
    sessionId: "session-1",
    maxModelTurns: 1,
    maxToolCalls: 1,
    summaryMaterialRefs: ["observation-large"],
    summarizer: {
      async summarize(request) {
        assert.deepEqual(request.materialRefs, ["observation-large"]);
        return {
          ok: true,
          summaryText: "short summary",
          artifactRef: "artifact-summary",
          events: ["summary"],
          metadata: {},
        };
      },
    },
    prepareTurn: async () => ({ prompt: { promptPackId: "prompt-1" }, events: [] }),
    invokeModel: async () => ({
      ok: true,
      modelCallId: "model-1",
      raw: { continue: true },
      events: [],
    }),
    interpretDecision: async () => ({
      ok: true,
      decisions: [{
        decisionId: "decision.continue",
        kind: "continue",
        observationRefs: [],
        metadata: {},
      }],
      events: [],
    }),
    acceptFinalOutput: async () => assert.fail("final handler should not run"),
    handleContinue: async () => ({ ok: true, continueLoop: false, events: ["continue"] }),
    handleFailure: async () => assert.fail("failure handler should not run"),
    handleApproval: async () => assert.fail("approval handler should not run"),
    handleToolCall: async () => assert.fail("tool handler should not run"),
    handleEphemeralProcedure: async () => assert.fail("procedure handler should not run"),
  });

  assert.equal(result.ok, true);
  assert.equal(result.events.includes("summary"), true);
  assert.ok(result.events.indexOf("summary") < result.events.findIndex((event) => event.includes("fallbackFinal") || event.includes("noFinal")));
  assert.equal(result.recorderSnapshot?.events.some((event) => event.name === "summary.started"), true);
  assert.equal(result.recorderSnapshot?.events.some((event) => event.name === "summary.completed"), true);
});

test("runMainLoopEngine accumulates provider-neutral model stream events", async () => {
  const result = await runMainLoopEngine({
    sessionId: "session-stream",
    maxModelTurns: 1,
    maxToolCalls: 1,
    prepareTurn: async () => ({ prompt: { promptPackId: "prompt-stream" }, events: [] }),
    invokeModel: async () => assert.fail("streaming invocation should be used"),
    invokeModelStream: async (_turnIndex, _prompt, onStreamEvent) => {
      await onStreamEvent({ kind: "model.started", providerRef: "provider-stream" });
      await onStreamEvent({ kind: "model.delta", textDelta: "hel" });
      await onStreamEvent({ kind: "model.delta", textDelta: "lo" });
      await onStreamEvent({ kind: "model.completed", usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 } });
      return {
        ok: true,
        modelCallId: "model-stream",
        raw: { final: true },
        events: ["stream-model"],
      };
    },
    interpretDecision: async () => ({
      ok: true,
      decisions: [{
        decisionId: "decision.final",
        kind: "finalOutput",
        finalOutput: "hello",
        observationRefs: [],
        metadata: {},
      }],
      events: [],
    }),
    acceptFinalOutput: async ({ decision }) => ({ ok: true, finalOutput: decision.finalOutput ?? "", events: [] }),
    handleContinue: async () => assert.fail("continue handler should not run"),
    handleFailure: async () => assert.fail("failure handler should not run"),
    handleApproval: async () => assert.fail("approval handler should not run"),
    handleToolCall: async () => assert.fail("tool handler should not run"),
    handleEphemeralProcedure: async () => assert.fail("procedure handler should not run"),
  });

  assert.equal(result.ok, true);
  const deltas = result.recorderSnapshot?.events.filter((event) => event.name === "model.delta") ?? [];
  assert.equal(deltas.length, 2);
  assert.equal((deltas[1]?.payload.stream as { text?: string } | undefined)?.text, "hello");
  assert.equal(result.turnState?.budgetUsage.totalTokens, 5);
});

test("runMainLoopEngine turns an aborted signal into interrupt checkpoint state", async () => {
  const controller = new AbortController();
  controller.abort();
  const result = await runMainLoopEngine({
    sessionId: "session-interrupt",
    maxModelTurns: 1,
    maxToolCalls: 1,
    interruptSignal: controller.signal,
    prepareTurn: async () => assert.fail("prepare should not run after interrupt"),
    invokeModel: async () => assert.fail("model should not run after interrupt"),
    interpretDecision: async () => assert.fail("decision should not run after interrupt"),
    acceptFinalOutput: async () => assert.fail("final should not run after interrupt"),
    handleContinue: async () => assert.fail("continue should not run after interrupt"),
    handleFailure: async () => assert.fail("failure should not run after interrupt"),
    handleApproval: async () => assert.fail("approval should not run after interrupt"),
    handleToolCall: async () => assert.fail("tool should not run after interrupt"),
    handleEphemeralProcedure: async () => assert.fail("procedure should not run after interrupt"),
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.code, "MAIN_LOOP_INTERRUPTED");
  assert.equal(result.turnState?.phase, "interrupted");
  assert.equal(result.turnState?.interruptCheckpoint?.cancelTokenId.includes(":cancel:interrupt"), true);
});

test("runMainLoopEngine treats tool scheduler cancellation as interrupted", async () => {
  const controller = new AbortController();
  const result = await runMainLoopEngine({
    sessionId: "session-tool-cancel",
    maxModelTurns: 1,
    maxToolCalls: 1,
    interruptSignal: controller.signal,
    prepareTurn: async () => ({ prompt: { promptPackId: "prompt-tool-cancel" }, events: [] }),
    invokeModel: async () => ({
      ok: true,
      modelCallId: "model-tool-cancel",
      raw: { tool: true },
      events: [],
    }),
    interpretDecision: async () => {
      controller.abort();
      return {
        ok: true,
        decisions: [{
          decisionId: "decision.tool.cancel",
          kind: "toolCall",
          toolCall: { callId: "call-cancel", toolId: "file.read", arguments: { path: "a.txt" } },
          observationRefs: [],
          metadata: {},
        }],
        events: [],
      };
    },
    acceptFinalOutput: async () => assert.fail("final should not run"),
    handleContinue: async () => assert.fail("continue should not run"),
    handleFailure: async () => assert.fail("failure should not run"),
    handleApproval: async () => assert.fail("approval should not run"),
    handleToolCall: async () => assert.fail("tool should not execute after scheduler cancellation"),
    handleEphemeralProcedure: async () => assert.fail("procedure should not run"),
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.code, "MAIN_LOOP_INTERRUPTED");
  assert.equal(result.turnState?.phase, "interrupted");
});

test("runMainLoopEngine resumes from an approval resume token before continuing the loop", async () => {
  const waitingState = registerMainLoopApprovalWait(
    createMainLoopTurnState({
      sessionId: "session-resume",
      turnIndex: 0,
      now: "2026-05-26T00:00:00.000Z",
    }),
    {
      approvalId: "approval-1",
      checkpointRef: "checkpoint-1",
      pendingActionRef: "tool-1",
      now: "2026-05-26T00:00:01.000Z",
    },
  );
  assert.notEqual(waitingState.resumeToken, undefined);
  const token = waitingState.resumeToken;
  if (token === undefined) return;

  const result = await runMainLoopEngine({
    sessionId: "session-resume",
    initialTurnState: waitingState,
    resumeToken: token,
    maxModelTurns: 1,
    maxToolCalls: 1,
    prepareTurn: async () => ({ prompt: { promptPackId: "prompt-resume" }, events: [] }),
    invokeModel: async () => ({
      ok: true,
      modelCallId: "model-resume",
      raw: { final: true },
      events: [],
    }),
    interpretDecision: async () => ({
      ok: true,
      decisions: [{
        decisionId: "decision.final",
        kind: "finalOutput",
        finalOutput: "resumed",
        observationRefs: [],
        metadata: {},
      }],
      events: [],
    }),
    acceptFinalOutput: async ({ decision }) => ({ ok: true, finalOutput: decision.finalOutput ?? "", events: [] }),
    handleContinue: async () => assert.fail("continue handler should not run"),
    handleFailure: async () => assert.fail("failure handler should not run"),
    handleApproval: async () => assert.fail("approval handler should not run"),
    handleToolCall: async () => assert.fail("tool handler should not run"),
    handleEphemeralProcedure: async () => assert.fail("procedure handler should not run"),
  });

  assert.equal(result.ok, true);
  assert.equal(result.turnState?.resumeToken, undefined);
  assert.equal(result.recorderSnapshot?.turnStates.some((state) => state.transitions.some((transition) => transition.reason === "resume from approval wait")), true);
});

test("runMainLoopEngine consumes pending input dispositions for steer, append, and next-turn queue", async () => {
  let state = createMainLoopTurnState({ sessionId: "session-pending", turnIndex: 0 });
  state = enqueueMainLoopPendingInput(state, {
    inputId: "append-1",
    text: "add this context",
    disposition: "appendContextForCurrentTurn",
  });
  state = enqueueMainLoopPendingInput(state, {
    inputId: "next-1",
    text: "later",
    disposition: "nextTurn",
  });
  const appended = await runMainLoopEngine({
    sessionId: "session-pending",
    initialTurnState: state,
    maxModelTurns: 1,
    maxToolCalls: 1,
    prepareTurn: async () => ({ prompt: { promptPackId: "prompt-pending" }, events: [] }),
    invokeModel: async () => ({ ok: true, modelCallId: "model-pending", raw: { final: true }, events: [] }),
    interpretDecision: async () => ({
      ok: true,
      decisions: [{
        decisionId: "decision.final",
        kind: "finalOutput",
        finalOutput: "done",
        observationRefs: [],
        metadata: {},
      }],
      events: [],
    }),
    acceptFinalOutput: async ({ decision }) => ({ ok: true, finalOutput: decision.finalOutput ?? "", events: [] }),
    handleContinue: async () => assert.fail("continue should not run"),
    handleFailure: async () => assert.fail("failure should not run"),
    handleApproval: async () => assert.fail("approval should not run"),
    handleToolCall: async () => assert.fail("tool should not run"),
    handleEphemeralProcedure: async () => assert.fail("procedure should not run"),
  });

  assert.equal(appended.ok, true);
  assert.equal(appended.turnState?.pendingInputQueue.map((input) => input.inputId).join(","), "next-1");
  assert.equal(appended.recorderSnapshot?.events.some((event) => event.name === "observation.added"), true);

  const steeredState = enqueueMainLoopPendingInput(createMainLoopTurnState({ sessionId: "session-steer", turnIndex: 0 }), {
    inputId: "steer-1",
    text: "stop and restart",
    disposition: "interruptAndRestart",
  });
  const steered = await runMainLoopEngine({
    sessionId: "session-steer",
    initialTurnState: steeredState,
    maxModelTurns: 1,
    maxToolCalls: 1,
    prepareTurn: async () => assert.fail("prepare should not run after steer interrupt"),
    invokeModel: async () => assert.fail("model should not run after steer interrupt"),
    interpretDecision: async () => assert.fail("decision should not run after steer interrupt"),
    acceptFinalOutput: async () => assert.fail("final should not run after steer interrupt"),
    handleContinue: async () => assert.fail("continue should not run after steer interrupt"),
    handleFailure: async () => assert.fail("failure should not run after steer interrupt"),
    handleApproval: async () => assert.fail("approval should not run after steer interrupt"),
    handleToolCall: async () => assert.fail("tool should not run after steer interrupt"),
    handleEphemeralProcedure: async () => assert.fail("procedure should not run after steer interrupt"),
  });

  assert.equal(steered.ok, false);
  assert.equal(steered.turnState?.phase, "interrupted");
});
