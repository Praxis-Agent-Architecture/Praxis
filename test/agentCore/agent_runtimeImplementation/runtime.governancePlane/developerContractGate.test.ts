import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import { evaluateDeveloperContractGate } from "../../../../src/agentCore/agent_runtimeImplementation/runtime.governancePlane/developerContractGate.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_runtimeImplementation/runtime.governancePlane/developerContractGate.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.governancePlane/developerContractGate.md",
  testFileUrl: import.meta.url,
});

test("developerContractGate allows a public dry-run runtime call without exposing internals", () => {
  const result = evaluateDeveloperContractGate({
    runtimeId: " runtime-1 ",
    caller: { kind: "application", id: " app-1 " },
    invocationMode: "agent",
    targetCapabilityId: " agent.invoke ",
    requestedExposure: "public",
    allowedCapabilityIds: ["agent.invoke"],
    trace: { correlationId: "corr-1" },
  });

  assert.equal(result.ok, true);
  assert.equal(result.decision, "allow");
  assert.equal(result.gate.runtimeId, "runtime-1");
  assert.equal(result.gate.caller.id, "app-1");
  assert.equal(result.gate.capabilityId, "agent.invoke");
  assert.equal(result.gate.visibleInternalDetails, false);
  assert.equal(result.gate.dryRun, true);
  assert.equal(result.gate.unsafeSideEffects, false);
  assert.deepEqual(result.events, ["runtime.governance.developerContractGate.allowed"]);
});

test("developerContractGate returns classified denial for missing input and governance rejection", () => {
  const missing = evaluateDeveloperContractGate();
  assert.equal(missing.ok, false);
  assert.equal(missing.decision, "deny");
  assert.equal(missing.error.code, "MISSING_RUNTIME_ID");
  assert.equal(missing.error.boundary, "input");
  assert.equal(missing.error.internalDetailExposed, false);

  const rejected = evaluateDeveloperContractGate({
    runtimeId: "runtime-1",
    caller: { kind: "official-module", id: "tap" },
    invocationMode: "tool",
    targetCapabilityId: "shell.base",
    governance: { accepted: false, reason: "scope denied" },
  });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.error.code, "GOVERNANCE_REJECTED");
  assert.equal(rejected.error.boundary, "governance");
  assert.equal(rejected.error.message, "scope denied");
});

test("developerContractGate supports approval and degrade decisions without executing capabilities", () => {
  const approval = evaluateDeveloperContractGate({
    runtimeId: "runtime-1",
    caller: { kind: "runtime-surface", id: "invocationMethod" },
    invocationMode: "tool",
    targetCapabilityId: "tool.shell.write",
    approvalRequired: true,
    approvalReason: "tool writes need TAP approval",
  });
  assert.equal(approval.ok, true);
  assert.equal(approval.decision, "approval-required");
  assert.equal(approval.gate.approvalReason, "tool writes need TAP approval");

  const degraded = evaluateDeveloperContractGate({
    runtimeId: "runtime-1",
    caller: { kind: "application", id: "app-1" },
    invocationMode: "model",
    targetCapabilityId: "model.full",
    allowedCapabilityIds: ["model.safe"],
    degradeToCapabilityId: "model.safe",
  });
  assert.equal(degraded.ok, true);
  assert.equal(degraded.decision, "degrade");
  assert.equal(degraded.gate.capabilityId, "model.safe");
  assert.equal(degraded.gate.degradedFromCapabilityId, "model.full");
  assert.equal(degraded.gate.unsafeSideEffects, false);
});
