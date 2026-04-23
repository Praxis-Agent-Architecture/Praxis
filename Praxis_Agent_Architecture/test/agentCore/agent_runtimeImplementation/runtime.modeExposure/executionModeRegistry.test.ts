import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  buildExecutionModeRegistry,
  executionModeRegistryCapability,
} from "../../../../src/agentCore/agent_runtimeImplementation/runtime.modeExposure/executionModeRegistry.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_runtimeImplementation/runtime.modeExposure/executionModeRegistry.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_runtimeImplementation/runtime.modeExposure/executionModeRegistry.md",
  testFileUrl: import.meta.url,
});

test("executionModeRegistry builds a readonly registry with default and active modes", () => {
  const result = buildExecutionModeRegistry({
    runtimeId: " runtime:alpha ",
    activeModeId: "debug",
    modes: [
      { modeId: "normal", label: "Normal", default: true },
      { modeId: " debug ", label: "Debug", scopes: ["mode:debug"] },
    ],
  });

  assert.equal(executionModeRegistryCapability.unsafeSideEffects, false);
  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("expected registry to succeed");
  }

  assert.equal(result.registry.runtimeId, "runtime:alpha");
  assert.equal(result.registry.defaultModeId, "normal");
  assert.equal(result.registry.activeModeId, "debug");
  assert.equal(result.registry.registrySurface, "runtime.modeExposure.executionModeRegistry");
  assert.equal(result.registry.unsafeSideEffects, false);
  assert.deepEqual(
    result.registry.modes.map((mode) => mode.modeId),
    ["normal", "debug"],
  );
});

test("executionModeRegistry rejects duplicate and missing default mode boundaries", () => {
  const duplicate = buildExecutionModeRegistry({
    runtimeId: "runtime:alpha",
    modes: [{ modeId: "safe" }, { modeId: " safe " }],
  });

  assert.equal(duplicate.ok, false);
  if (duplicate.ok) {
    assert.fail("duplicate mode id should be rejected");
  }
  assert.equal(duplicate.error.code, "DUPLICATE_MODE_ID");
  assert.equal(duplicate.error.boundary, "registry");

  const missingDefault = buildExecutionModeRegistry({
    runtimeId: "runtime:alpha",
    defaultModeId: "maintenance",
    modes: [{ modeId: "normal" }],
  });

  assert.equal(missingDefault.ok, false);
  if (missingDefault.ok) {
    assert.fail("unknown default mode should be rejected");
  }
  assert.equal(missingDefault.error.code, "DEFAULT_MODE_NOT_REGISTERED");
  assert.equal(missingDefault.error.internalDetailExposed, false);
});
