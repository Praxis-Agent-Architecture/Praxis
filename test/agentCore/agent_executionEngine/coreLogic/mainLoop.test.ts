import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  MAIN_LOOP_ACTION_PRIMITIVES,
  analyzeMainLoopCacheHealth,
  adjudicateRuntimeDecision,
  createLoopTick,
  createMainLoopCheckpoint,
  createMainLoopRun,
  createMainLoopSessionTimeline,
  createMainLoopStepRecord,
  createMainLoopTimelineRef,
  createMainLoopApprovalEnvelope,
  createMainLoopCancelToken,
  createMainLoopControlAction,
  createMainLoopBehaviorRegistry,
  createMainLoopAgentInterfacePrimitive,
  createMainLoopInputMaterial,
  createMainLoopOutputEnvelope,
  createMainLoopStateProgressionRecord,
  createUserTurn,
  createMainLoopRollbackPoint,
  decideMainLoopFinalAcceptance,
  decideMainLoopPromptPackRebuild,
  exposeMainLoopState,
  MAIN_LOOP_CONTROL_PRIMITIVES,
  planAgentMainLoopTick,
  planFrameworkMainLoopHandoff,
  prepareMainLoopTurn,
  resolveMainLoopFailureRecovery,
  resolveMainLoopApproval,
  resolveMainLoopBudgetExhaustion,
  resolveMainLoopBudget,
  resolveMainLoopToolChoice,
  resolveMainLoopContinuation,
  replayMainLoopStep,
  replayMainLoopTick,
  replayUserTurn,
  resolveMainLoopBehaviorRef,
  runMainLoop,
  runMainLoopRunner,
  selectMainLoopModel,
} from "../../../../src/agentCore/agent_executionEngine/coreLogic/mainLoop.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_executionEngine/coreLogic/mainLoop.ts",
  docPath: "docs/agentCore/agent_executionEngine/coreLogic/mainLoop.md",
  testFileUrl: import.meta.url,
});

test("MainLoop domain model creates run, turn, tick, step, checkpoint, and timeline refs", () => {
  const stepRecord = createMainLoopStepRecord({
    sessionId: "session-1",
    turnIndex: 0,
    stepIndex: 0,
    actionPrimitive: "receiveInput",
    status: "completed",
    now: "2026-05-08T00:00:00.000Z",
  });
  const checkpoint = createMainLoopCheckpoint({
    kind: "observationIntegrated",
    sessionId: " session-1 ",
    userTurnIndex: 0,
    loopTickIndex: 0,
    stepIndex: 0,
    observationRefs: [" observation-1 ", "observation-1"],
    now: "2026-05-08T00:00:00.000Z",
  });
  const tick = createLoopTick({
    sessionId: "session-1",
    userTurnIndex: 0,
    loopTickIndex: 0,
    kind: "model-only",
    status: "completed",
    stepRecords: [stepRecord],
    checkpoints: [checkpoint],
    promptPackRef: " prompt-1 ",
    selectedModel: " gpt-test ",
    cacheHealth: { stablePrefixHash: "hash-1" },
    budgetSnapshot: { maxModelTurns: 8192 },
    stateRefs: ["state-1"],
    observationRefs: ["observation-1"],
  });
  const turn = createUserTurn({
    sessionId: "session-1",
    userTurnIndex: 0,
    status: "completed",
    inputRefs: ["input-1"],
    outputRefs: ["output-1"],
    ticks: [tick],
    checkpoints: [checkpoint],
    startedAt: "2026-05-08T00:00:00.000Z",
    completedAt: "2026-05-08T00:00:01.000Z",
  });
  const run = createMainLoopRun({
    sessionId: "session-1",
    status: "completed",
    userTurns: [turn],
    checkpoints: [checkpoint],
    now: "2026-05-08T00:00:00.000Z",
  });
  const timeline = createMainLoopSessionTimeline({ sessionId: "session-1", run });

  assert.equal(createMainLoopTimelineRef({ kind: "step", sessionId: "session-1", userTurnIndex: 0, loopTickIndex: 0, stepIndex: 0 }).ref, "session-1:step:turn:0:tick:0:step:0");
  assert.equal(checkpoint.timelineRef.kind, "checkpoint");
  assert.deepEqual(checkpoint.observationRefs, ["observation-1"]);
  assert.equal(tick.tickId, "session-1:loopTick:turn:0:tick:0");
  assert.equal(tick.steps[0]?.timelineRef.ref, "session-1:step:turn:0:tick:0:step:0");
  assert.equal(tick.cacheHealth?.stablePrefixHash, "hash-1");
  assert.equal(tick.budgetSnapshot?.maxModelTurns, 8192);
  assert.equal(turn.userTurnId, "session-1:userTurn:turn:0");
  assert.equal(run.timelineRef.ref, "session-1:run");
  assert.equal(timeline.timelineRefs.some((ref) => ref.ref === checkpoint.timelineRef.ref), true);
  assert.equal(timeline.checkpoints.length, 3);
});

test("runMainLoop creates a formal dry-run run, user turn, loop tick, and timeline", () => {
  const result = runMainLoop({
    runtime: {
      runtimeId: "runtime-1",
      sessionId: "session-1",
      manifestRef: "manifest-1",
      surfaces: [
        { surfaceId: "model", kind: "modelAdapter", ready: true },
        { surfaceId: "store", kind: "stateEventStore", ready: true },
      ],
      now: () => "2026-05-08T00:00:00.000Z",
      metadata: {},
    },
    input: { text: "Inspect the repo." },
    inputRefs: ["input-1"],
    targetModel: "gpt-test",
    promptPackId: "prompt-1",
    materials: [
      {
        id: "agent-base",
        kind: "system",
        text: "You are a repo inspector.",
        source: "agent.prompt",
        trusted: true,
        promptSegmentKind: "declaredRuntimeContext",
      },
      {
        id: "task",
        kind: "user",
        text: "Inspect the repo.",
        source: "user",
        promptSegmentKind: "userTurn",
      },
    ],
  });

  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("expected mainLoop run");
  assert.equal(result.run.status, "completed");
  assert.equal(result.userTurn.status, "completed");
  assert.equal(result.loopTicks[0]?.status, "completed");
  assert.equal(result.loopTicks[0]?.selectedModel, "gpt-test");
  assert.notEqual(result.turnPreparation, undefined);
  const turnPreparation = result.turnPreparation;
  if (turnPreparation === undefined) throw new Error("expected turn preparation");
  assert.equal(turnPreparation.promptPackId, "prompt-1");
  assert.equal(result.stepRecords[0]?.actionPrimitive, "receiveInput");
  assert.deepEqual(
    result.stepRecords.slice(1).map((record) => record.actionPrimitive),
    ["prepareTurn", "assemblePromptPack", "buildCachePlan"],
  );
  assert.equal(result.timeline.timelineRefs.some((ref) => ref.kind === "loopTick"), true);
  assert.equal(result.dryRun, true);
  assert.equal(result.unsafeSideEffects, false);
});

test("runMainLoopRunner owns model decision and tool loop control through runtime callbacks", async () => {
  const calls: string[] = [];
  const result = await runMainLoopRunner({
    maxModelTurns: 3,
    maxToolCalls: 4,
    prepareTurn: async (turnIndex) => {
      calls.push(`prepare:${turnIndex}`);
      return { prompt: { promptPackId: `prompt-${turnIndex}` }, events: [`prepare:${turnIndex}`] };
    },
    invokeModel: async (turnIndex) => {
      calls.push(`model:${turnIndex}`);
      return {
        ok: true,
        modelCallId: `model-${turnIndex}`,
        raw: { turnIndex },
        events: [`model:${turnIndex}`],
      };
    },
    interpretDecision: async (turnIndex) => {
      calls.push(`decision:${turnIndex}`);
      return {
        ok: true,
        decisions: turnIndex === 0
          ? [{
              decisionId: "decision.tool",
              kind: "toolCall",
              toolCall: { callId: "call-1", toolId: "code.read", arguments: {} },
              observationRefs: [],
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
      };
    },
    acceptFinalOutput: async ({ decision }) => {
      calls.push("final");
      return { ok: true, finalOutput: decision.finalOutput ?? "", events: ["final"] };
    },
    handleContinue: async () => ({ ok: true, continueLoop: true, events: ["continue"] }),
    handleFailure: async () => assert.fail("failure handler should not run"),
    handleApproval: async () => assert.fail("approval handler should not run"),
    handleToolCall: async ({ decision }) => {
      calls.push(`tool:${decision.toolCall?.toolId}`);
      return { ok: true, continueLoop: true, events: ["tool"] };
    },
    handleEphemeralProcedure: async () => assert.fail("procedure handler should not run"),
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.finalOutput, "done");
  assert.equal(result.modelTurns, 2);
  assert.equal(result.toolCalls, 1);
  assert.deepEqual(calls, [
    "prepare:0",
    "model:0",
    "decision:0",
    "tool:code.read",
    "prepare:1",
    "model:1",
    "decision:1",
    "final",
  ]);
});

test("runMainLoopRunner applies tool budget per model turn instead of globally", async () => {
  const toolCalls: string[] = [];
  const result = await runMainLoopRunner({
    maxModelTurns: 3,
    maxToolCalls: 1,
    prepareTurn: async (turnIndex) => ({
      prompt: { promptPackId: `prompt-${turnIndex}` },
      events: [`prepare:${turnIndex}`],
    }),
    invokeModel: async (turnIndex) => ({
      ok: true,
      modelCallId: `model-${turnIndex}`,
      raw: { turnIndex },
      events: [`model:${turnIndex}`],
    }),
    interpretDecision: async (turnIndex) => ({
      ok: true,
      decisions: turnIndex < 2
        ? [{
            decisionId: `decision.tool.${turnIndex}`,
            kind: "toolCall",
            toolCall: { callId: `call-${turnIndex}`, toolId: "code.read", arguments: {} },
            observationRefs: [],
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
    handleContinue: async () => assert.fail("continue handler should not run"),
    handleFailure: async () => assert.fail("failure handler should not run"),
    handleApproval: async () => assert.fail("approval handler should not run"),
    handleToolCall: async ({ decision }) => {
      toolCalls.push(decision.toolCall?.callId ?? "");
      return { ok: true, continueLoop: true, events: ["tool"] };
    },
    handleEphemeralProcedure: async () => assert.fail("procedure handler should not run"),
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.finalOutput, "done");
  assert.equal(result.modelTurns, 3);
  assert.equal(result.toolCalls, 2);
  assert.deepEqual(toolCalls, ["call-0", "call-1"]);
});

test("runMainLoopRunner reports tool call limit when one model turn exhausts its tool budget", async () => {
  let noFinalReason = "";
  const result = await runMainLoopRunner({
    maxModelTurns: 10,
    maxToolCalls: 1,
    prepareTurn: async (turnIndex) => ({
      prompt: { promptPackId: `prompt-${turnIndex}` },
      events: [`prepare:${turnIndex}`],
    }),
    invokeModel: async (turnIndex) => ({
      ok: true,
      modelCallId: `model-${turnIndex}`,
      raw: { turnIndex },
      events: [`model:${turnIndex}`],
    }),
    interpretDecision: async (turnIndex) => ({
      ok: true,
      decisions: [
        {
          decisionId: `decision.tool.${turnIndex}.first`,
          kind: "toolCall",
          toolCall: { callId: "call-first", toolId: "code.read", arguments: {} },
          observationRefs: [],
          metadata: {},
        },
        {
          decisionId: `decision.tool.${turnIndex}.second`,
          kind: "toolCall",
          toolCall: { callId: "call-second", toolId: "code.scan", arguments: {} },
          observationRefs: [],
          metadata: {},
        },
      ],
      events: [`decision:${turnIndex}`],
    }),
    acceptFinalOutput: async () => assert.fail("final handler should not run"),
    handleContinue: async () => assert.fail("continue handler should not run"),
    handleFailure: async () => assert.fail("failure handler should not run"),
    handleApproval: async () => assert.fail("approval handler should not run"),
    handleToolCall: async () => ({ ok: true, continueLoop: true, events: ["tool"] }),
    handleEphemeralProcedure: async () => assert.fail("procedure handler should not run"),
    onNoFinalOutput: async (input) => {
      noFinalReason = input.reason;
      assert.equal(input.modelTurns, 1);
      assert.equal(input.toolCalls, 1);
      assert.equal(input.turnToolCalls, 1);
      assert.equal(input.maxToolCalls, 1);
      return { ok: true, finalOutput: "tool-limit", events: ["no-final"] };
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.finalOutput, "tool-limit");
  assert.equal(result.modelTurns, 1);
  assert.equal(result.toolCalls, 1);
  assert.equal(noFinalReason, "tool_call_limit");
  assert.equal(result.events.includes("agentCore.execution.mainLoop.runner.toolCallLimit"), true);
});

test("runMainLoop rejects missing input and denied governance before starting a turn", () => {
  const runtime = {
    runtimeId: "runtime-1",
    sessionId: "session-1",
    surfaces: [],
    metadata: {},
  };
  const missing = runMainLoop({ runtime, input: undefined });
  assert.equal(missing.ok, false);
  assert.equal(missing.error.code, "MISSING_INPUT");

  const denied = runMainLoop({
    runtime,
    input: "hello",
    governance: { accepted: false, reason: "paused" },
  });
  assert.equal(denied.ok, false);
  assert.equal(denied.error.code, "GOVERNANCE_REJECTED");
});

test("planAgentMainLoopTick creates one dry-run execution tick and next-hop handoff", () => {
  const result = planAgentMainLoopTick({
    sessionId: " session-1 ",
    input: { text: "hello" },
    requestedNextHop: "prompt-pack",
    trace: { correlationId: "corr-1" },
    now: "2026-05-04T00:00:00.000Z",
  });

  assert.equal(result.ok, true);
  assert.equal(result.tick.sessionId, "session-1");
  assert.equal(result.tick.state.phase, "running");
  assert.equal(result.tick.state.revision, 1);
  assert.equal(result.tick.nextHop, "prompt-pack");
  assert.deepEqual(result.tick.plannedSteps, ["receive-input", "advance-state", "handoff:prompt-pack"]);
  assert.equal(result.tick.stepRecords.length, 2);
  assert.equal(result.tick.stepRecords[0]?.actionPrimitive, "receiveInput");
  assert.equal(result.tick.stepRecords[0]?.status, "completed");
  assert.equal(result.tick.stepRecords[0]?.timestamps.completedAt, "2026-05-04T00:00:00.000Z");
  assert.equal(result.tick.stepRecords[1]?.actionPrimitive, "assemblePromptPack");
  assert.equal(result.tick.stepRecords[1]?.status, "planned");
  assert.equal(result.tick.dryRun, true);
  assert.equal(result.tick.unsafeSideEffects, false);
});

test("planAgentMainLoopTick rejects empty input, governance denial, and invalid loop limits", () => {
  const missingInput = planAgentMainLoopTick({
    sessionId: "session-1",
  });
  assert.equal(missingInput.ok, false);
  assert.equal(missingInput.error.code, "MISSING_INPUT");
  assert.equal(missingInput.error.boundary, "input");

  const rejected = planAgentMainLoopTick({
    sessionId: "session-1",
    input: "hello",
    governance: { accepted: false, reason: "not allowed" },
  });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.error.code, "GOVERNANCE_REJECTED");
  assert.equal(rejected.error.boundary, "governance");

  const noSteps = planAgentMainLoopTick({
    sessionId: "session-1",
    input: "hello",
    maxSteps: 0,
  });
  assert.equal(noSteps.ok, false);
  assert.equal(noSteps.error.code, "LOOP_LIMIT_EXCEEDED");
  assert.equal(noSteps.error.boundary, "runtime-state");
});

test("planFrameworkMainLoopHandoff records model, tool, procedure, approval, and failure ticks", () => {
  assert.equal(MAIN_LOOP_ACTION_PRIMITIVES.includes("handoffModelDecision"), true);
  assert.equal(MAIN_LOOP_ACTION_PRIMITIVES.includes("recordSessionEvent"), true);

  const model = planFrameworkMainLoopHandoff({
    sessionId: "session-1",
    tickKind: "model-only",
    promptPackRef: "prompt-1",
    loweredPromptRef: "lowered-1",
    modelCallId: "model-call-1",
    now: "2026-05-04T00:00:00.000Z",
  });
  assert.equal(model.ok, true);
  if (!model.ok) return;
  assert.deepEqual(
    model.plan.stepRecords.map((record) => record.actionPrimitive),
    [
      "prepareTurn",
      "assemblePromptPack",
      "buildCachePlan",
      "handoffPromptPack",
      "lowerPrompt",
      "handoffModelInvocation",
      "interpretModelDecision",
      "adjudicateDecision",
      "handoffModelDecision",
    ],
  );
  assert.equal(model.plan.stepRecords[0]?.promptPackRef, "prompt-1");
  assert.equal(model.plan.stepRecords[4]?.loweredPromptRef, "lowered-1");
  assert.equal(model.plan.stepRecords[5]?.modelCallId, "model-call-1");
  assert.equal(model.plan.stepRecords[0]?.timestamps.plannedAt, "2026-05-04T00:00:00.000Z");

  const tool = planFrameworkMainLoopHandoff({
    sessionId: "session-1",
    tickKind: "tool-call",
    toolCallId: "tool-call-1",
    observationRefs: ["observation-1"],
  });
  assert.equal(tool.ok, true);
  if (!tool.ok) return;
  assert.deepEqual(
    tool.plan.stepRecords.map((record) => record.actionPrimitive),
    ["handoffToolCall", "invokeBaseTool", "integrateObservation", "recordSessionEvent"],
  );
  assert.equal(tool.plan.stepRecords[1]?.toolCallId, "tool-call-1");
  assert.deepEqual(tool.plan.stepRecords[2]?.observationRefs, ["observation-1"]);

  const procedure = planFrameworkMainLoopHandoff({
    sessionId: "session-1",
    tickKind: "ephemeral-procedure",
    procedureId: "procedure-1",
  });
  assert.equal(procedure.ok, true);
  if (!procedure.ok) return;
  assert.equal(procedure.plan.stepRecords[0]?.actionPrimitive, "handoffEphemeralProcedure");
  assert.equal(procedure.plan.stepRecords[1]?.procedureId, "procedure-1");

  const approval = planFrameworkMainLoopHandoff({
    sessionId: "session-1",
    tickKind: "approval-wait",
  });
  assert.equal(approval.ok, true);
  if (!approval.ok) return;
  assert.equal(approval.plan.stepRecords[1]?.actionPrimitive, "waitApproval");
  assert.equal(approval.plan.stepRecords[1]?.status, "waitingApproval");

  const failed = planFrameworkMainLoopHandoff({
    sessionId: "session-1",
    tickKind: "failure",
    error: { code: "MODEL_FAILED", message: "provider failed", boundary: "model", publicSafe: true },
  });
  assert.equal(failed.ok, true);
  if (!failed.ok) return;
  assert.equal(failed.plan.stepRecords[0]?.actionPrimitive, "fail");
  assert.equal(failed.plan.stepRecords[0]?.status, "failed");
  assert.equal(failed.plan.stepRecords[0]?.error?.code, "MODEL_FAILED");
});

test("prepareMainLoopTurn assembles PromptPack and cache plan for a formal turn", () => {
  const result = prepareMainLoopTurn({
    runtimeId: "runtime",
    sessionId: "session",
    promptPackId: "prompt-1",
    turnIndex: 2,
    targetModel: "gpt-test",
    now: "2026-05-04T00:00:00.000Z",
    materials: [
      {
        id: "agent-base",
        kind: "system",
        text: "You are a repo inspector.",
        source: "agent.prompt",
        trusted: true,
        promptSegmentKind: "declaredRuntimeContext",
      },
      {
        id: "task",
        kind: "user",
        text: "Read package.json",
        source: "user",
        promptSegmentKind: "userTurn",
      },
    ],
  });

  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("expected turn preparation");
  assert.equal(result.promptPackId, "prompt-1");
  assert.deepEqual(
    result.cachePlan.segments.map((segment) => segment.segmentKind),
    [
      "stableSystemCore",
      "declaredRuntimeContext",
      "toolDeclarations",
      "projectContext",
      "sessionSummary",
      "memoryContext",
      "retrievedContext",
      "observations",
      "userTurn",
      "assistantScratchpadPlan",
    ],
  );
  assert.deepEqual(
    result.turnRecord.stepRecords.map((record) => record.actionPrimitive),
    ["prepareTurn", "assemblePromptPack", "buildCachePlan"],
  );
});

test("decideMainLoopPromptPackRebuild rebuilds only when triggers require it", () => {
  const first = decideMainLoopPromptPackRebuild();
  assert.equal(first.rebuild, true);
  assert.equal(first.cacheFriendly, true);

  const reuse = decideMainLoopPromptPackRebuild({
    previousPromptPackRef: "prompt-1",
  });
  assert.equal(reuse.rebuild, false);

  const observation = decideMainLoopPromptPackRebuild({
    previousPromptPackRef: "prompt-1",
    triggers: ["observationMaterialChange", "compressionSummaryCompletion"],
  });
  assert.equal(observation.rebuild, true);
  assert.equal(observation.cacheFriendly, true);

  const capability = decideMainLoopPromptPackRebuild({
    previousPromptPackRef: "prompt-1",
    triggers: ["capabilitySetChange", "modelFamilySwitch"],
  });
  assert.equal(capability.rebuild, true);
  assert.equal(capability.cacheFriendly, false);
});

test("analyzeMainLoopCacheHealth explains stable prefix and capability rebuilds", () => {
  const first = prepareMainLoopTurn({
    runtimeId: "runtime",
    sessionId: "session",
    materials: [
      {
        id: "tool-code-read",
        kind: "tool",
        text: "code.read",
        source: "tool",
        promptSegmentKind: "toolDeclarations",
      },
      {
        id: "task",
        kind: "user",
        text: "Read package.json",
        source: "user",
        promptSegmentKind: "userTurn",
      },
    ],
  });
  assert.equal(first.ok, true);
  if (!first.ok) return;
  const firstHealth = analyzeMainLoopCacheHealth({
    cachePlan: first.cachePlan,
    providerTelemetry: {
      segmentHashes: {},
      cacheMissReasons: [],
      inputTokens: 100,
      cachedInputTokens: 90,
      cacheHitRate: 0.9,
    },
  });
  assert.equal(firstHealth.capabilityHash, first.cachePlan.segments.find((segment) => segment.segmentKind === "toolDeclarations")?.segmentHash);
  assert.equal(firstHealth.providerTelemetry?.cacheHitRate, 0.9);
  assert.equal(firstHealth.capabilityRebuildRequired, false);
  assert.equal(firstHealth.dynamicSegmentKinds.includes("userTurn"), true);

  const second = prepareMainLoopTurn({
    runtimeId: "runtime",
    sessionId: "session",
    materials: [
      {
        id: "tool-shell",
        kind: "tool",
        text: "shell.commandExecution",
        source: "tool",
        promptSegmentKind: "toolDeclarations",
      },
    ],
  });
  assert.equal(second.ok, true);
  if (!second.ok) return;
  const secondHealth = analyzeMainLoopCacheHealth({
    cachePlan: second.cachePlan,
    previousCapabilityHash: firstHealth.capabilityHash,
  });
  assert.equal(secondHealth.capabilityRebuildRequired, true);
});

test("resolveMainLoopToolChoice supports auto, forced tool, group, and procedure modes without owning evidence rules", () => {
  const auto = resolveMainLoopToolChoice();
  assert.equal(auto.mode, "auto");
  assert.equal(auto.promptPackRuleOnly, true);

  const forceTool = resolveMainLoopToolChoice({
    mode: "forceTool",
    toolId: " code.read ",
    evidenceRuleRefs: ["prompt.rules.repoEvidence"],
  });
  assert.equal(forceTool.toolId, "code.read");
  assert.deepEqual(forceTool.evidenceRuleRefs, ["prompt.rules.repoEvidence"]);
  assert.equal(forceTool.promptPackRuleOnly, true);

  assert.equal(resolveMainLoopToolChoice({
    mode: "forceGroup",
    groupId: "gitBase.inspection",
  }).groupId, "gitBase.inspection");

  assert.equal(resolveMainLoopToolChoice({
    mode: "forceProcedure",
    procedureId: "procedure.scan",
  }).procedureId, "procedure.scan");
});

test("MainLoop input materials and output envelopes stay provider-neutral", () => {
  const textInput = createMainLoopInputMaterial({
    sessionId: "session-1",
    inputId: "input-text",
    kind: "text",
    text: "Inspect the repository",
  });
  assert.equal(textInput.promptMaterial.kind, "user");
  assert.equal(textInput.promptMaterial.promptSegmentKind, "userTurn");
  assert.equal(textInput.providerPayloadCreated, false);

  const imageInput = createMainLoopInputMaterial({
    sessionId: "session-1",
    inputId: "input-image",
    kind: "image",
    uri: "artifact://image-1",
    mimeType: "image/png",
    observationRef: "observation-image-1",
  });
  assert.equal(imageInput.promptMaterial.kind, "file");
  assert.equal(imageInput.observationRef, "observation-image-1");
  assert.equal(imageInput.providerPayloadCreated, false);

  const stream = createMainLoopOutputEnvelope({
    sessionId: "session-1",
    kind: "streamChunk",
    payload: { delta: "hello" },
  });
  assert.equal(stream.recordPolicy, "afterChunkCompleted");

  const completedStream = createMainLoopOutputEnvelope({
    sessionId: "session-1",
    kind: "streamChunk",
    payload: { text: "hello" },
    streamChunkCompleted: true,
  });
  assert.equal(completedStream.recordPolicy, "immediate");

  const artifact = createMainLoopOutputEnvelope({
    sessionId: "session-1",
    kind: "artifactRef",
    payload: { uri: "artifact://large-output" },
    artifactRefs: ["artifact://large-output"],
    traceSummary: "tool output stored as artifact",
  });
  assert.deepEqual(artifact.artifactRefs, ["artifact://large-output"]);
  assert.equal(artifact.traceSummary, "tool output stored as artifact");
});

test("agent handoff is an interface primitive, not direct nested agent invocation", () => {
  const primitive = createMainLoopAgentInterfacePrimitive({
    sessionId: "session-1",
    interfaceRef: "agent.interface.collaboration",
    targetAgentRef: "agent.reviewer",
    payloadRef: "payload-1",
  });
  assert.equal(primitive.kind, "agentInterfaceHandoff");
  assert.equal(primitive.directInvokeAgent, false);
  assert.equal(primitive.multiagentManaged, false);
  assert.equal(primitive.targetAgentRef, "agent.reviewer");
  assert.equal(primitive.payloadRef, "payload-1");
});

test("state progression records cover critical MainLoop actions", () => {
  const actions = [
    "receiveInput",
    "modelInvoked",
    "toolRunning",
    "approvalPending",
    "observationIntegrated",
    "finalOutput",
    "failure",
    "interrupt",
    "resume",
  ] as const;
  const records = actions.map((action, index) => createMainLoopStateProgressionRecord({
    sessionId: "session-1",
    action,
    stateBeforeRef: index === 0 ? undefined : `state-${index - 1}`,
    stateAfterRef: `state-${index}`,
    stepRef: `step-${index}`,
  }));
  assert.deepEqual(records.map((record) => record.action), [...actions]);
  assert.equal(records[0]?.stateAfterRef, "state-0");
  assert.equal(records[3]?.eventRef, "session-1:event:approvalPending");
  assert.equal(records.every((record) => record.publicSafe), true);
});

test("adjudicateRuntimeDecision lets runtime overrule model proposals", () => {
  const finalBlocked = adjudicateRuntimeDecision({
    decision: {
      decisionId: "decision-final",
      kind: "finalOutput",
      finalOutput: "done",
      observationRefs: [],
      metadata: {},
    },
    pendingApprovalRefs: ["approval-1"],
  });
  assert.equal(finalBlocked.kind, "requiresApproval");
  assert.equal(finalBlocked.accepted, false);

  const policyBlocked = adjudicateRuntimeDecision({
    decision: {
      decisionId: "decision-tool",
      kind: "toolCall",
      toolCall: { callId: "call-1", toolId: "shell.commandExecution", arguments: {} },
      observationRefs: [],
      metadata: {},
    },
    policy: { accepted: false, reason: "shell is restricted" },
  });
  assert.equal(policyBlocked.kind, "blockedByPolicy");
  assert.equal(policyBlocked.accepted, false);

  const sandboxBlocked = adjudicateRuntimeDecision({
    decision: {
      decisionId: "decision-shell",
      kind: "toolCall",
      toolCall: { callId: "call-2", toolId: "shell.commandExecution", arguments: {} },
      observationRefs: [],
      metadata: {},
    },
    sandbox: { accepted: false, reason: "workspace-only sandbox blocked shell write" },
  });
  assert.equal(sandboxBlocked.kind, "blockedBySandbox");
  assert.equal(sandboxBlocked.accepted, false);

  const resourceBlocked = adjudicateRuntimeDecision({
    decision: {
      decisionId: "decision-tool-budget",
      kind: "toolCall",
      toolCall: { callId: "call-3", toolId: "code.read", arguments: {} },
      observationRefs: [],
      metadata: {},
    },
    resource: { accepted: false, reason: "tool budget exhausted" },
  });
  assert.equal(resourceBlocked.kind, "resourceExceeded");
  assert.equal(resourceBlocked.accepted, false);

  const allowed = adjudicateRuntimeDecision({
    decision: {
      decisionId: "decision-continue",
      kind: "continue",
      observationRefs: [],
      metadata: {},
    },
  });
  assert.equal(allowed.kind, "continueAllowed");
  assert.equal(allowed.accepted, true);
});

test("decideMainLoopFinalAcceptance blocks final output until runtime gates are clear", () => {
  assert.equal(decideMainLoopFinalAcceptance({
    finalOutput: "done",
    pendingApprovalRefs: ["approval-1"],
  }).kind, "pendingApproval");

  assert.equal(decideMainLoopFinalAcceptance({
    finalOutput: "done",
    unresolvedProcedureRefs: ["procedure-1"],
  }).kind, "unresolvedProcedure");

  assert.equal(decideMainLoopFinalAcceptance({
    finalOutput: "done",
    fatalFailureRefs: ["error-1"],
  }).kind, "fatalFailure");

  assert.equal(decideMainLoopFinalAcceptance({
    finalOutput: "done",
    unrecordedEventRefs: ["event-1"],
  }).kind, "runtimeRejected");

  assert.equal(decideMainLoopFinalAcceptance({
    finalOutput: "done",
    budget: { accepted: false, reason: "budget exhausted" },
  }).kind, "budgetBlocked");

  assert.equal(decideMainLoopFinalAcceptance({
    finalOutput: "done",
    statePlane: { accepted: false, reason: "state blocked" },
  }).kind, "stateBlocked");

  const accepted = decideMainLoopFinalAcceptance({
    finalOutput: " done ",
    budget: { accepted: true },
    statePlane: { accepted: true },
    runtime: { accepted: true },
  });
  assert.equal(accepted.kind, "finalAccepted");
  assert.equal(accepted.canBreak, true);
  assert.equal(accepted.finalOutput, "done");
});

test("resolveMainLoopContinuation treats model break as advice until runtime accepts finalization", () => {
  const blocked = resolveMainLoopContinuation({
    modelSuggestion: "break",
    finalAcceptance: decideMainLoopFinalAcceptance({
      finalOutput: "done",
      pendingApprovalRefs: ["approval-1"],
    }),
  });
  assert.equal(blocked.kind, "continue");
  assert.equal(blocked.accepted, true);
  assert.equal(blocked.source, "runtimeFallback");

  const accepted = resolveMainLoopContinuation({
    modelSuggestion: "break",
    finalAcceptance: decideMainLoopFinalAcceptance({ finalOutput: "done" }),
  });
  assert.equal(accepted.kind, "break");
  assert.equal(accepted.nextAction, "exposeOutput");

  const keepGoing = resolveMainLoopContinuation({
    modelSuggestion: "continue",
  });
  assert.equal(keepGoing.kind, "continue");
  assert.equal(keepGoing.source, "model");
});

test("resolveMainLoopBudget applies Praxis defaults and developer overrides", () => {
  const defaults = resolveMainLoopBudget({ sessionId: "session-1" });
  assert.equal(defaults.source, "default");
  assert.equal(defaults.maxToolCallsPerLoopTick, 1024);
  assert.equal(defaults.maxToolCallsPerEphemeralProcedure, 128);
  assert.equal(defaults.maxModelTurns, 8192);
  assert.equal(defaults.maxWallTimeMs, 180_000);
  assert.equal(defaults.maxShellSeconds, 180);
  assert.equal(defaults.maxCost, undefined);
  assert.equal(defaults.maxFileWrites, undefined);

  const custom = resolveMainLoopBudget({
    sessionId: "session-1",
    budget: {
      maxToolCallsPerLoopTick: 12,
      maxToolCallsPerEphemeralProcedure: 8,
      maxModelTurns: 20,
      maxWallTimeMs: 60_000,
      maxTokens: 100_000,
      maxCost: 5,
      maxShellSeconds: 30,
      maxFileWrites: 10,
      maxNetworkCalls: 11,
    },
  });
  assert.equal(custom.source, "developer");
  assert.equal(custom.maxToolCallsPerLoopTick, 12);
  assert.equal(custom.maxToolCallsPerEphemeralProcedure, 8);
  assert.equal(custom.maxModelTurns, 20);
  assert.equal(custom.maxWallTimeMs, 60_000);
  assert.equal(custom.maxTokens, 100_000);
  assert.equal(custom.maxCost, 5);
  assert.equal(custom.maxShellSeconds, 30);
  assert.equal(custom.maxFileWrites, 10);
  assert.equal(custom.maxNetworkCalls, 11);

  const sanitized = resolveMainLoopBudget({
    sessionId: "session-1",
    budget: {
      maxToolCallsPerLoopTick: 0,
      maxToolCallsPerEphemeralProcedure: -1,
      maxModelTurns: 0,
      maxWallTimeMs: Number.NaN,
      maxShellSeconds: 0,
    },
  });
  assert.equal(sanitized.maxToolCallsPerLoopTick, 1024);
  assert.equal(sanitized.maxToolCallsPerEphemeralProcedure, 128);
  assert.equal(sanitized.maxModelTurns, 8192);
  assert.equal(sanitized.maxWallTimeMs, 180_000);
  assert.equal(sanitized.maxShellSeconds, 180);
});

test("resolveMainLoopBudgetExhaustion supports fail, partial final, approval, summary, and checkpoint actions", () => {
  assert.equal(resolveMainLoopBudgetExhaustion({
    sessionId: "session-1",
    action: "fail",
  }).nextAction, "fail");
  assert.equal(resolveMainLoopBudgetExhaustion({
    sessionId: "session-1",
    action: "partialFinal",
  }).nextAction, "exposeOutput");
  const approval = resolveMainLoopBudgetExhaustion({
    sessionId: "session-1",
    action: "requestApproval",
    reason: "need more model turns",
    now: "2026-05-08T00:00:00.000Z",
  });
  assert.equal(approval.nextAction, "requestApproval");
  assert.equal(approval.approval?.status, "pending");
  assert.deepEqual(approval.approval?.requestedScopes, ["budget.extend"]);

  assert.equal(resolveMainLoopBudgetExhaustion({
    sessionId: "session-1",
    action: "summarizeCurrentState",
  }).nextAction, "updateSummaryStateEvent");

  const checkpoint = resolveMainLoopBudgetExhaustion({
    sessionId: "session-1",
    action: "writeResumeCheckpoint",
    userTurnIndex: 2,
    loopTickIndex: 3,
    stepIndex: 4,
  });
  assert.equal(checkpoint.nextAction, "recordSessionEvent");
  assert.equal(checkpoint.checkpoint?.stepIndex, 4);
});

test("resolveMainLoopFailureRecovery retries three times, falls back, then interrupts", () => {
  const failure = {
    code: "TOOL_FAILED",
    message: "tool failed",
    boundary: "tool" as const,
    publicSafe: true as const,
  };

  const first = resolveMainLoopFailureRecovery({ failure, attempt: 0 });
  assert.equal(first.kind, "retry");
  assert.equal(first.attempt, 1);
  assert.equal(first.nextAction, "invokeModel");

  const third = resolveMainLoopFailureRecovery({ failure, attempt: 2 });
  assert.equal(third.kind, "retry");
  assert.equal(third.attempt, 3);

  const fallback = resolveMainLoopFailureRecovery({ failure, attempt: 3 });
  assert.equal(fallback.kind, "fallback");
  assert.equal(fallback.nextAction, "invokeModel");

  const interrupted = resolveMainLoopFailureRecovery({ failure, attempt: 3, fallbackAttempted: true });
  assert.equal(interrupted.kind, "interruptUser");
  assert.equal(interrupted.nextAction, "interrupt");

  const notRetryable = resolveMainLoopFailureRecovery({
    failure: { ...failure, boundary: "input" },
    attempt: 0,
    policy: {
      fallback: { enabled: false, fallbackTargets: [] },
      finalActions: ["fail"],
    },
  });
  assert.equal(notRetryable.kind, "fail");
  assert.equal(notRetryable.nextAction, "fail");
});

test("selectMainLoopModel prioritizes user, chooseModelRef, and ModelFleet capability fallback", () => {
  const candidates = [
    { modelRef: "model.reasoning", capabilityRoles: ["reasoning" as const, "text" as const], available: true, metadata: {} },
    { modelRef: "model.image", capabilityRoles: ["image-generation" as const], available: true, metadata: {} },
  ];

  assert.equal(selectMainLoopModel({
    defaultModelRef: "model.reasoning",
    userModelRef: "model.user",
    requiredCapability: "image-generation",
    candidates,
  }).source, "user");

  assert.deepEqual(selectMainLoopModel({
    defaultModelRef: "model.reasoning",
    chooseModelRef: "model.strategy",
    requiredCapability: "image-generation",
    candidates,
  }), {
    selectedModelRef: "model.strategy",
    source: "chooseModelRef",
    requiredCapability: "image-generation",
    reason: "developer chooseModelRef selected the model",
    metadata: {},
    publicSafe: true,
  });

  const fallback = selectMainLoopModel({
    defaultModelRef: "model.reasoning",
    requiredCapability: "image-generation",
    candidates,
  });
  assert.equal(fallback.source, "capabilityFallback");
  assert.equal(fallback.selectedModelRef, "model.image");

  const defaultDecision = selectMainLoopModel({
    defaultModelRef: "model.reasoning",
    requiredCapability: "text",
    candidates,
  });
  assert.equal(defaultDecision.source, "default");
  assert.equal(defaultDecision.selectedModelRef, "model.reasoning");
});

test("exposeMainLoopState publishes runtime-control friendly state and control primitives", () => {
  const stepRecord = createMainLoopStepRecord({
    sessionId: "session-1",
    turnIndex: 2,
    stepIndex: 7,
    actionPrimitive: "invokeBaseTool",
  });
  const tick = createLoopTick({
    sessionId: "session-1",
    userTurnIndex: 2,
    loopTickIndex: 3,
    kind: "tool-call",
    status: "running",
    stepRecords: [stepRecord],
  });
  const turn = createUserTurn({
    sessionId: "session-1",
    userTurnIndex: 2,
    status: "running",
    ticks: [tick],
  });
  const state = exposeMainLoopState({
    userTurn: turn,
    loopTick: tick,
    pendingApprovals: ["approval-1"],
    activeToolCalls: ["tool-call-1"],
    lastObservation: " observation-1 ",
    lastError: " error-1 ",
    budgets: resolveMainLoopBudget({ sessionId: "session-1" }),
    cacheHealth: { stablePrefix: "ok" },
    selectedModel: " model.reasoning ",
    sandboxStatus: "host-observed",
  });

  assert.equal(state.phase, "running");
  assert.equal(state.currentTurn, 2);
  assert.equal(state.currentTick, 3);
  assert.equal(state.currentStep, 7);
  assert.deepEqual(state.pendingApprovals, ["approval-1"]);
  assert.deepEqual(state.activeToolCalls, ["tool-call-1"]);
  assert.equal(state.lastObservation, "observation-1");
  assert.equal(state.lastError, "error-1");
  assert.equal(state.selectedModel, "model.reasoning");
  assert.equal(state.sandboxStatus, "host-observed");

  assert.deepEqual(MAIN_LOOP_CONTROL_PRIMITIVES, [
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
  ]);
});

test("approval envelopes resolve through external surfaces and resume safely", () => {
  const cancelToken = createMainLoopCancelToken({
    sessionId: "session-1",
    scope: "tool",
    targetRef: "tool-call-1",
    issuedAt: "2026-05-08T00:00:00.000Z",
  });
  assert.equal(cancelToken, "session-1:cancel:tool:tool-call-1:2026-05-08T00:00:00.000Z");

  const envelope = createMainLoopApprovalEnvelope({
    sessionId: "session-1",
    reason: "shell write requires approval",
    requestedScopes: [" tool:shell.commandExecution ", "tool:shell.commandExecution"],
    riskLevel: "dangerous",
    decisionRef: "decision-1",
    proposedActionRef: "tool-call-1",
    surfaceRef: "cli",
    cancelToken,
    now: "2026-05-08T00:00:00.000Z",
  });
  assert.equal(envelope.status, "pending");
  assert.equal(envelope.approvalId, "session-1:approval:decision-1:2026-05-08T00:00:00.000Z");
  assert.deepEqual(envelope.requestedScopes, ["tool:shell.commandExecution"]);
  assert.equal(envelope.surfaceRef, "cli");

  const approved = resolveMainLoopApproval({
    envelope,
    decision: "approve",
    responderRef: "interface.cli",
    parameterPatch: { command: "mutated" },
    now: "2026-05-08T00:00:01.000Z",
  });
  assert.equal(approved.status, "approved");
  assert.equal(approved.resumeAction, "resume");
  assert.equal(approved.nextAction, "resume");
  assert.equal(approved.canMutateToolInput, false);
  assert.deepEqual(approved.ignoredParameterPatch, { command: "mutated" });

  const denied = resolveMainLoopApproval({
    envelope,
    decision: "deny",
    responderRef: "interface.cli",
    noteForModel: "Use a read-only command instead.",
    now: "2026-05-08T00:00:02.000Z",
  });
  assert.equal(denied.status, "denied");
  assert.equal(denied.nextAction, "invokeModel");
  assert.equal(denied.noteForModel, "Use a read-only command instead.");
});

test("pause, resume, and interrupt controls are traceable runtime actions", () => {
  const paused = createMainLoopControlAction({
    sessionId: "session-1",
    primitive: "pause",
    reason: "waiting for approval",
    trace: { correlationId: "corr-1" },
    now: "2026-05-08T00:00:00.000Z",
  });
  assert.equal(paused.runtimeStatus, "paused");
  assert.equal(paused.mainLoopStatus, "waitingApproval");
  assert.equal(paused.trace.correlationId, "corr-1");

  const resumed = createMainLoopControlAction({
    sessionId: "session-1",
    primitive: "resume",
    now: "2026-05-08T00:00:01.000Z",
  });
  assert.equal(resumed.runtimeStatus, "resuming");
  assert.equal(resumed.mainLoopStatus, "running");

  const interrupted = createMainLoopControlAction({
    sessionId: "session-1",
    primitive: "interrupt",
    cancelToken: "cancel-1",
    now: "2026-05-08T00:00:02.000Z",
  });
  assert.equal(interrupted.runtimeStatus, "interrupted");
  assert.equal(interrupted.mainLoopStatus, "interrupted");
  assert.equal(interrupted.cancelToken, "cancel-1");
});

test("rollback points and replay plans reuse timeline, prompt, observation, and provider refs", () => {
  const record = createMainLoopStepRecord({
    sessionId: "session-1",
    turnIndex: 1,
    stepIndex: 4,
    actionPrimitive: "invokeModel",
    status: "completed",
    promptPackRef: "prompt-1",
    loweredPromptRef: "lowered-1",
    observationRefs: ["observation-1"],
    metadata: { providerRawRefs: ["provider-response-1"] },
  });
  const tick = createLoopTick({
    sessionId: "session-1",
    userTurnIndex: 1,
    loopTickIndex: 2,
    kind: "model-only",
    status: "completed",
    stepRecords: [record],
  });
  const turn = createUserTurn({
    sessionId: "session-1",
    userTurnIndex: 1,
    status: "completed",
    ticks: [tick],
  });
  const checkpoint = createMainLoopCheckpoint({
    kind: "manual",
    sessionId: "session-1",
    userTurnIndex: 1,
    loopTickIndex: 2,
    stepIndex: 4,
  });
  const rollbackPoint = createMainLoopRollbackPoint({ checkpoint });
  assert.equal(rollbackPoint.executableByMainLoop, false);
  assert.equal(rollbackPoint.executor, "runtime-control-surface");
  assert.equal(rollbackPoint.timelineRef.ref, checkpoint.timelineRef.ref);

  const stepReplay = replayMainLoopStep(tick.steps[0]!);
  assert.equal(stepReplay.kind, "step");
  assert.deepEqual(stepReplay.promptPackRefs, ["prompt-1"]);
  assert.deepEqual(stepReplay.loweredPromptRefs, ["lowered-1"]);
  assert.deepEqual(stepReplay.observationRefs, ["observation-1"]);
  assert.deepEqual(stepReplay.providerRawRefs, ["provider-response-1"]);
  assert.equal(stepReplay.dryRun, true);

  const tickReplay = replayMainLoopTick(tick);
  assert.equal(tickReplay.kind, "loopTick");
  assert.equal(tickReplay.stepRecords.length, 1);
  assert.equal(tickReplay.sourceTimelineRefs[0]?.ref, tick.timelineRef.ref);

  const turnReplay = replayUserTurn(turn);
  assert.equal(turnReplay.kind, "userTurn");
  assert.equal(turnReplay.stepRecords.length, 1);
  assert.equal(turnReplay.sourceTimelineRefs.some((ref) => ref.ref === turn.timelineRef.ref), true);
});

test("behavior refs resolve only through registry with governance and conflict checks", () => {
  const registry = createMainLoopBehaviorRegistry({
    registryId: "project.behaviors",
    behaviors: [
      {
        behaviorRef: "behavior.afterTool.audit",
        primitive: "recordSessionEvent",
        source: "raxProject",
        handlerRef: "handlers.afterToolAudit",
        priority: 20,
        timeoutMs: 5_000,
        sandboxRef: "sandbox.hostObserved",
        resourceRef: "resource.audit",
        conflictsWith: ["behavior.afterTool.noAudit"],
        metadata: {},
      },
      {
        behaviorRef: "behavior.beforeTool.guard",
        primitive: "adjudicateDecision",
        source: "application",
        handlerRef: "handlers.beforeToolGuard",
        priority: 30,
        timeoutMs: 10_000,
        conflictsWith: [],
        metadata: {},
      },
    ],
  });

  assert.deepEqual(registry.behaviors.map((behavior) => behavior.behaviorRef), [
    "behavior.beforeTool.guard",
    "behavior.afterTool.audit",
  ]);

  const resolved = resolveMainLoopBehaviorRef({
    registry,
    behaviorRef: "behavior.afterTool.audit",
  });
  assert.equal(resolved.ok, true);
  if (!resolved.ok) return;
  assert.equal(resolved.executable, true);
  assert.equal(resolved.executionContract.handlerRef, "handlers.afterToolAudit");
  assert.equal(resolved.executionContract.timeoutMs, 5_000);
  assert.equal(resolved.executionContract.sandboxRef, "sandbox.hostObserved");

  const conflict = resolveMainLoopBehaviorRef({
    registry,
    behaviorRef: "behavior.afterTool.audit",
    activeBehaviorRefs: ["behavior.afterTool.noAudit"],
  });
  assert.equal(conflict.ok, false);
  if (conflict.ok) return;
  assert.equal(conflict.code, "BEHAVIOR_CONFLICT");
  assert.deepEqual(conflict.conflicts, ["behavior.afterTool.noAudit"]);

  const governance = resolveMainLoopBehaviorRef({
    registry,
    behaviorRef: "behavior.beforeTool.guard",
    governance: { accepted: false, reason: "handler is disabled" },
  });
  assert.equal(governance.ok, false);
  if (governance.ok) return;
  assert.equal(governance.code, "BEHAVIOR_GOVERNANCE_REJECTED");

  const missing = resolveMainLoopBehaviorRef({
    registry,
    behaviorRef: "behavior.unknown",
  });
  assert.equal(missing.ok, false);
  if (missing.ok) return;
  assert.equal(missing.code, "UNREGISTERED_BEHAVIOR");
});
