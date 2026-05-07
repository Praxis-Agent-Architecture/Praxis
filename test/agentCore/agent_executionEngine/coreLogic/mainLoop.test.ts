import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  MAIN_LOOP_ACTION_PRIMITIVES,
  adjudicateRuntimeDecision,
  planAgentMainLoopTick,
  planFrameworkMainLoopHandoff,
  prepareMainLoopTurn,
} from "../../../../src/agentCore/agent_executionEngine/coreLogic/mainLoop.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_executionEngine/coreLogic/mainLoop.ts",
  docPath: "docs/agentCore/agent_executionEngine/coreLogic/mainLoop.md",
  testFileUrl: import.meta.url,
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
