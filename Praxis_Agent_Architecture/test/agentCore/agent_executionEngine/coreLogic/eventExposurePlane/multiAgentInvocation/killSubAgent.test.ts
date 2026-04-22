import assert from "node:assert/strict";
import test from "node:test";

import { exposeKillSubAgentEvent } from "../../../../../../src/agentCore/agent_executionEngine/coreLogic/eventExposurePlane/multiAgentInvocation/killSubAgent.js";
import { defineAgentCoreContractTest } from "../../../../agentCoreContractTestHelper.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/coreLogic/eventExposurePlane/multiAgentInvocation/killSubAgent.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/coreLogic/eventExposurePlane/multiAgentInvocation/killSubAgent.md",
  testFileUrl: import.meta.url,
});

test("killSubAgent exposes a dry-run termination event without killing the child agent", () => {
  const result = exposeKillSubAgentEvent({
    runtimeId: " runtime:alpha ",
    sessionId: " session:1 ",
    parentAgentId: " parent:agent ",
    subAgentId: " child:agent ",
    invocationId: " invoke:kill ",
    eventSource: "stateEngine",
    killReason: " no longer needed ",
    terminationPolicy: "timeout",
    governanceContext: [" multiagent.terminate ", "multiagent.terminate"],
    requestedSubscribers: ["runtime.behaviorExposure"],
    allowedSubscribers: ["runtime.behaviorExposure", "debug.panel"],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected kill event exposure");
  }

  assert.equal(result.event.type, "multiAgent.subAgent.kill.requested");
  assert.equal(result.event.source, "stateEngine");
  assert.equal(result.event.subject.subAgentId, "child:agent");
  assert.equal(result.event.payload.action, "kill");
  assert.equal(result.event.payload.killReason, "no longer needed");
  assert.equal(result.event.payload.terminationPolicy, "timeout");
  assert.deepEqual(result.event.payload.governanceContext, ["multiagent.terminate"]);
  assert.equal(result.event.dryRun, true);
  assert.equal(result.event.unsafeSideEffects, false);
  assert.equal(result.dispatch.actualTerminationStarted, false);
  assert.deepEqual(result.dispatch.deliverableSubscribers, ["runtime.behaviorExposure"]);
});

test("killSubAgent reports classified input, governance, and scope failures", () => {
  const missing = exposeKillSubAgentEvent({ runtimeId: "runtime" });

  assert.equal(missing.ok, false);
  if (missing.ok) {
    throw new Error("expected missing session rejection");
  }

  assert.equal(missing.error.code, "MISSING_SESSION_ID");
  assert.equal(missing.error.boundary, "input");

  const governanceRejected = exposeKillSubAgentEvent({
    runtimeId: "runtime",
    sessionId: "session",
    parentAgentId: "parent",
    subAgentId: "child",
    invocationId: "invocation",
    governance: { accepted: false, reason: "termination denied" },
  });

  assert.equal(governanceRejected.ok, false);
  if (governanceRejected.ok) {
    throw new Error("expected governance rejection");
  }

  assert.equal(governanceRejected.error.code, "GOVERNANCE_REJECTED");
  assert.equal(governanceRejected.error.boundary, "governance");

  const scopeRejected = exposeKillSubAgentEvent({
    runtimeId: "runtime",
    sessionId: "session",
    parentAgentId: "parent",
    subAgentId: "child",
    invocationId: "invocation",
    requestedSubscribers: ["private.panel"],
    allowedSubscribers: ["runtime.behaviorExposure"],
  });

  assert.equal(scopeRejected.ok, false);
  if (scopeRejected.ok) {
    throw new Error("expected scope rejection");
  }

  assert.equal(scopeRejected.error.code, "SUBSCRIBER_SCOPE_DENIED");
  assert.equal(scopeRejected.error.boundary, "scope");
});
