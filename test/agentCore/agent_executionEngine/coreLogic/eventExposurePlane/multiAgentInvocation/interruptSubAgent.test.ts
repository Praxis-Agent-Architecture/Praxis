import { defineAgentCoreContractTest } from "../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { exposeInterruptSubAgentEvent } from "../../../../../../src/executionEngine/coreLogic/eventExposurePlane/multiAgentInvocation/interruptSubAgent.js";

defineAgentCoreContractTest({
  sourcePath: "src/executionEngine/coreLogic/eventExposurePlane/multiAgentInvocation/interruptSubAgent.ts",
  docPath: "docs/agentCore/agent_executionEngine/coreLogic/eventExposurePlane/multiAgentInvocation/interruptSubAgent.md",
  testFileUrl: import.meta.url,
});

test("exposeInterruptSubAgentEvent exposes a dry-run sub-agent interrupt event", () => {
  const result = exposeInterruptSubAgentEvent({
    runtimeId: "runtime-1",
    parentAgentId: "parent-agent",
    subAgentId: "sub-agent",
    invocationId: "interrupt-sub-1",
    reason: "parent task changed",
    mode: "handoff",
    requestedScopes: ["multiagent.interrupt"],
    allowedScopes: ["multiagent.interrupt"],
    trace: { correlationId: "corr-sub" },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.event.kind, "multiAgent.subAgent.interrupt");
  assert.equal(result.event.parentAgentId, "parent-agent");
  assert.equal(result.event.subAgentId, "sub-agent");
  assert.equal(result.event.mode, "handoff");
  assert.equal(result.event.dryRun, true);
  assert.equal(result.event.subAgentInterrupted, false);
  assert.equal(result.event.unsafeSideEffects, false);
});

test("exposeInterruptSubAgentEvent reports missing sub-agent and governance failures", () => {
  const missingSubAgent = exposeInterruptSubAgentEvent({
    runtimeId: "runtime-1",
    parentAgentId: "parent-agent",
    subAgentId: "",
    invocationId: "interrupt-sub-1",
    reason: "pause child work",
  });

  assert.equal(missingSubAgent.ok, false);
  assert.equal(missingSubAgent.error.code, "MISSING_SUB_AGENT_ID");
  assert.equal(missingSubAgent.error.boundary, "input");

  const rejected = exposeInterruptSubAgentEvent({
    runtimeId: "runtime-1",
    parentAgentId: "parent-agent",
    subAgentId: "sub-agent",
    invocationId: "interrupt-sub-2",
    reason: "pause child work",
    governance: { accepted: false, reason: "sub-agent interrupt blocked" },
  });

  assert.equal(rejected.ok, false);
  assert.equal(rejected.error.code, "GOVERNANCE_REJECTED");
  assert.equal(rejected.error.boundary, "governance");
});
