import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import { planAgentMainLoopTick } from "../../../../src/agentCore/agent_executionEngine/coreLogic/mainLoop.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/coreLogic/mainLoop.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/coreLogic/mainLoop.md",
  testFileUrl: import.meta.url,
});

test("planAgentMainLoopTick creates one dry-run execution tick and next-hop handoff", () => {
  const result = planAgentMainLoopTick({
    sessionId: " session-1 ",
    input: { text: "hello" },
    requestedNextHop: "prompt-pack",
    trace: { correlationId: "corr-1" },
  });

  assert.equal(result.ok, true);
  assert.equal(result.tick.sessionId, "session-1");
  assert.equal(result.tick.state.phase, "running");
  assert.equal(result.tick.state.revision, 1);
  assert.equal(result.tick.nextHop, "prompt-pack");
  assert.deepEqual(result.tick.plannedSteps, ["receive-input", "advance-state", "handoff:prompt-pack"]);
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
