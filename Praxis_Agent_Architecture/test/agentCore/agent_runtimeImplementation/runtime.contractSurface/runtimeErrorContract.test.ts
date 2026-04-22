import assert from "node:assert/strict";
import test from "node:test";
import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import { defineRuntimeErrorContract } from "../../../../src/agentCore/agent_runtimeImplementation/runtime.contractSurface/runtimeErrorContract.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_runtimeImplementation/runtime.contractSurface/runtimeErrorContract.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_runtimeImplementation/runtime.contractSurface/runtimeErrorContract.md",
  testFileUrl: import.meta.url,
});

test("runtimeErrorContract normalizes runtime errors without exposing internal detail", () => {
  const result = defineRuntimeErrorContract({
    runtimeId: " runtime:alpha ",
    contractId: " contract:error ",
    errorCode: "PROVIDER_TIMEOUT",
    message: " Provider timed out ",
    boundary: "runtime-state",
    severity: "recoverable",
    internalDetail: { rawProviderPayload: "hidden" },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.deepEqual(result.errorContract, {
    code: "PROVIDER_TIMEOUT",
    message: "Provider timed out",
    boundary: "runtime-state",
    severity: "recoverable",
    runtimeId: "runtime:alpha",
    contractId: "contract:error",
    safeForApplication: true,
    internalDetailExposed: false,
  });
  assert.deepEqual(result.events, ["runtime.error.contract.defined"]);
});

test("runtimeErrorContract returns classified errors for missing input and governance rejection", () => {
  const missing = defineRuntimeErrorContract({
    runtimeId: "runtime:alpha",
    contractId: "",
    errorCode: "RUNTIME_NOT_READY",
  });

  assert.equal(missing.ok, false);
  if (missing.ok) {
    return;
  }

  assert.equal(missing.error.code, "MISSING_CONTRACT_ID");
  assert.equal(missing.error.boundary, "input");

  const rejected = defineRuntimeErrorContract({
    runtimeId: "runtime:alpha",
    contractId: "contract:error",
    errorCode: "SCOPE_DENIED",
    governance: { accepted: false, reason: "debug scope denied" },
  });

  assert.equal(rejected.ok, false);
  if (rejected.ok) {
    return;
  }

  assert.equal(rejected.error.code, "GOVERNANCE_REJECTED");
  assert.equal(rejected.error.message, "debug scope denied");
  assert.equal(rejected.error.boundary, "governance");
});
