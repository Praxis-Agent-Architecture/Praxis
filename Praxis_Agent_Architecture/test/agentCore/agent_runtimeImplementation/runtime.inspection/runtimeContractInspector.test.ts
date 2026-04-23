import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { inspectRuntimeContracts } from "../../../../src/agentCore/agent_runtimeImplementation/runtime.inspection/runtimeContractInspector.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_runtimeImplementation/runtime.inspection/runtimeContractInspector.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_runtimeImplementation/runtime.inspection/runtimeContractInspector.md",
  testFileUrl: import.meta.url,
});

test("runtimeContractInspector reports satisfied, missing, and rejected contract states", () => {
  const result = inspectRuntimeContracts({
    runtimeId: " runtime:alpha ",
    requiredContracts: [
      { contractId: "runtime.public" },
      { contractId: "runtime.governance" },
      { contractId: "runtime.debug" },
    ],
    observedContracts: [
      { contractId: "runtime.public", accepted: true },
      { contractId: "runtime.governance", accepted: false, reason: "governance contract not accepted" },
    ],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.inspection.runtimeId, "runtime:alpha");
  assert.equal(result.inspection.status, "rejected");
  assert.deepEqual(result.inspection.missingContracts, ["runtime.debug"]);
  assert.deepEqual(result.inspection.rejectedContracts, ["runtime.governance"]);
  assert.equal(result.inspection.unsafeSideEffects, false);
  assert.match(result.inspection.findings.map((finding) => finding.message).join("\n"), /not accepted|not present/);
});

test("runtimeContractInspector rejects invalid input and runtime-state boundaries", () => {
  const missingRuntime = inspectRuntimeContracts();
  assert.equal(missingRuntime.ok, false);
  if (!missingRuntime.ok) {
    assert.equal(missingRuntime.error.code, "MISSING_RUNTIME_ID");
    assert.equal(missingRuntime.error.boundary, "input");
  }

  const invalidContract = inspectRuntimeContracts({
    runtimeId: "runtime:alpha",
    requiredContracts: [{ contractId: " " }],
  });
  assert.equal(invalidContract.ok, false);
  if (!invalidContract.ok) {
    assert.equal(invalidContract.error.code, "MISSING_CONTRACT_ID");
    assert.equal(invalidContract.error.boundary, "input");
  }

  const notReady = inspectRuntimeContracts({ runtimeId: "runtime:alpha", runtimeReady: false });
  assert.equal(notReady.ok, false);
  if (!notReady.ok) {
    assert.equal(notReady.error.code, "RUNTIME_NOT_READY");
    assert.equal(notReady.error.boundary, "runtime-state");
  }
});
