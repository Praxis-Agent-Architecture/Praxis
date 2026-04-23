import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  describeRuntimeMode,
  runtimeModeDescriptorCapability,
} from "../../../../src/agentCore/agent_runtimeImplementation/runtime.modeExposure/modeDescriptor.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_runtimeImplementation/runtime.modeExposure/modeDescriptor.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_runtimeImplementation/runtime.modeExposure/modeDescriptor.md",
  testFileUrl: import.meta.url,
});

test("modeDescriptor normalizes a runtime mode without side effects", () => {
  const result = describeRuntimeMode({
    runtimeId: " runtime:alpha ",
    mode: {
      modeId: " debug ",
      label: " Debug ",
      summary: " inspection-heavy mode ",
      scopes: [" mode:debug ", "mode:debug"],
      audiences: ["application", "debug"],
      contract: {
        contractId: " mode.contract.debug ",
        inputBoundary: ["governanceContext"],
        outputBoundary: ["modeDescriptor"],
      },
    },
  });

  assert.equal(runtimeModeDescriptorCapability.unsafeSideEffects, false);
  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("expected mode descriptor to succeed");
  }

  assert.equal(result.runtimeId, "runtime:alpha");
  assert.equal(result.descriptor.modeId, "debug");
  assert.deepEqual(result.descriptor.scopes, ["mode:debug"]);
  assert.equal(result.descriptor.contract?.contractId, "mode.contract.debug");
  assert.equal(result.descriptor.unsafeSideEffects, false);
});

test("modeDescriptor classifies missing input and governance failures", () => {
  const missingRuntime = describeRuntimeMode();

  assert.equal(missingRuntime.ok, false);
  if (missingRuntime.ok) {
    assert.fail("missing runtime should be rejected");
  }
  assert.equal(missingRuntime.error.code, "MISSING_RUNTIME_ID");
  assert.equal(missingRuntime.error.boundary, "input");

  const missingMode = describeRuntimeMode({ runtimeId: "runtime:alpha" });

  assert.equal(missingMode.ok, false);
  if (missingMode.ok) {
    assert.fail("missing mode should be rejected");
  }
  assert.equal(missingMode.error.code, "MISSING_MODE_ID");

  const rejected = describeRuntimeMode({
    runtimeId: "runtime:alpha",
    mode: { modeId: "safe" },
    governance: { accepted: false, reason: "mode exposure blocked" },
  });

  assert.equal(rejected.ok, false);
  if (rejected.ok) {
    assert.fail("governance rejection should be returned");
  }
  assert.equal(rejected.error.code, "GOVERNANCE_REJECTED");
  assert.equal(rejected.error.message, "mode exposure blocked");
  assert.equal(rejected.error.internalDetailExposed, false);
});
