import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  adaptationFeedbackLoopDescriptor,
  runAdaptationFeedbackLoop,
} from "../../../../src/agentCore/agent_runtimeImplementation/runtime.adaptiveRuntime/adaptationFeedbackLoop.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_runtimeImplementation/runtime.adaptiveRuntime/adaptationFeedbackLoop.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.adaptiveRuntime/adaptationFeedbackLoop.md",
  testFileUrl: import.meta.url,
});

test("runAdaptationFeedbackLoop records dry-run feedback for an adaptation decision", () => {
  const result = runAdaptationFeedbackLoop({
    runtimeId: " runtime-1 ",
    loopId: " loop-1 ",
    decisionId: " decision-1 ",
    caller: { kind: "runtime-surface", id: " adaptiveRuntime " },
    feedback: [
      {
        feedbackId: " feedback-1 ",
        outcome: "observed",
        signalRefs: ["latency-1", "latency-1", "health-1"],
        note: " no mutation yet ",
      },
    ],
  });

  assert.equal(adaptationFeedbackLoopDescriptor.unsafeSideEffects, false);
  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("adaptation feedback loop should accept valid input");
  }

  assert.equal(result.loop.runtimeId, "runtime-1");
  assert.equal(result.loop.loopId, "loop-1");
  assert.equal(result.loop.decisionId, "decision-1");
  assert.equal(result.loop.route, "runtime.adaptiveRuntime.adaptationFeedbackLoop");
  assert.equal(result.loop.feedback[0]?.feedbackId, "feedback-1");
  assert.equal(result.loop.feedback[0]?.decisionId, "decision-1");
  assert.equal(result.loop.feedback[0]?.note, "no mutation yet");
  assert.deepEqual(result.loop.nextSignalRefs, ["latency-1", "health-1"]);
  assert.equal(result.loop.audit.dryRun, true);
  assert.equal(result.loop.audit.unsafeSideEffects, false);
});

test("runAdaptationFeedbackLoop classifies missing input and runtime readiness failures", () => {
  const missing = runAdaptationFeedbackLoop();
  assert.equal(missing.ok, false);
  if (missing.ok) {
    assert.fail("empty input must be rejected");
  }

  assert.equal(missing.error.code, "MISSING_RUNTIME_ID");
  assert.equal(missing.error.boundary, "input");
  assert.equal(missing.error.safeForRuntimeInspection, true);

  const notReady = runAdaptationFeedbackLoop({
    runtimeId: "runtime-1",
    loopId: "loop-1",
    decisionId: "decision-1",
    caller: { kind: "application", id: "app-1" },
    feedback: [{ feedbackId: "feedback-1", outcome: "observed" }],
    runtimeReady: false,
  });

  assert.equal(notReady.ok, false);
  if (notReady.ok) {
    assert.fail("runtimeReady=false must be rejected");
  }

  assert.equal(notReady.error.code, "RUNTIME_NOT_READY");
  assert.equal(notReady.error.boundary, "runtime-state");
});

test("runAdaptationFeedbackLoop rejects malformed feedback before updating loop state", () => {
  const result = runAdaptationFeedbackLoop({
    runtimeId: "runtime-1",
    loopId: "loop-1",
    decisionId: "decision-1",
    caller: { kind: "official-module", id: "tap" },
    feedback: [{ feedbackId: "feedback-1" }],
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("missing feedback outcome must be rejected");
  }

  assert.equal(result.error.code, "MISSING_FEEDBACK_OUTCOME");
  assert.equal(result.error.boundary, "feedback");
  assert.deepEqual(result.events, ["runtime.adaptiveRuntime.feedbackLoop.rejected"]);
});
