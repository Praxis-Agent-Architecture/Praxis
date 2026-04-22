import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import { advanceAgentExecutionState } from "../../../../src/agentCore/agent_executionEngine/coreLogic/stateEngine.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/coreLogic/stateEngine.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/coreLogic/stateEngine.md",
  testFileUrl: import.meta.url,
});

test("advanceAgentExecutionState applies a valid state-machine transition", () => {
  const result = advanceAgentExecutionState({
    sessionId: " session-1 ",
    transition: "start",
    reason: " user input accepted ",
    trace: { correlationId: "corr-1", callerId: "mainLoop" },
  });

  assert.equal(result.ok, true);
  assert.equal(result.previousPhase, "idle");
  assert.equal(result.transition, "start");
  assert.equal(result.state.sessionId, "session-1");
  assert.equal(result.state.phase, "running");
  assert.equal(result.state.revision, 1);
  assert.equal(result.state.reason, "user input accepted");
  assert.equal(result.state.mutable, false);
  assert.equal(result.state.unsafeSideEffects, false);
});

test("advanceAgentExecutionState rejects invalid transitions and governance failures", () => {
  const sessionMismatch = advanceAgentExecutionState({
    sessionId: "session-1",
    current: {
      sessionId: "session-2",
      phase: "running",
      revision: 1,
      trace: {},
      mutable: false,
      unsafeSideEffects: false,
    },
    transition: "wait",
  });
  assert.equal(sessionMismatch.ok, false);
  assert.equal(sessionMismatch.error.code, "SESSION_MISMATCH");
  assert.equal(sessionMismatch.error.boundary, "input");

  const invalid = advanceAgentExecutionState({
    sessionId: "session-1",
    current: {
      sessionId: "session-1",
      phase: "completed",
      revision: 2,
      trace: {},
      mutable: false,
      unsafeSideEffects: false,
    },
    transition: "reply",
  });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.error.code, "INVALID_TRANSITION");
  assert.equal(invalid.error.boundary, "state-machine");
  assert.equal(invalid.error.stateSafe, true);

  const rejected = advanceAgentExecutionState({
    sessionId: "session-1",
    transition: "start",
    governance: { accepted: false, reason: "runtime is locked" },
  });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.error.code, "GOVERNANCE_REJECTED");
  assert.equal(rejected.error.boundary, "governance");
});
