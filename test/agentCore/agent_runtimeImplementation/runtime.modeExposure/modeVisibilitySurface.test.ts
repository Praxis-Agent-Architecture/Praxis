import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { buildExecutionModeRegistry } from "../../../../src/agentCore_runtimeImplementation/runtime.modeExposure/executionModeRegistry.js";
import {
  exposeRuntimeModeVisibility,
  modeVisibilitySurfaceCapability,
} from "../../../../src/agentCore_runtimeImplementation/runtime.modeExposure/modeVisibilitySurface.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_runtimeImplementation/runtime.modeExposure/modeVisibilitySurface.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.modeExposure/modeVisibilitySurface.md",
  testFileUrl: import.meta.url,
});

test("modeVisibilitySurface exposes only audience and scope visible modes", () => {
  const registryResult = buildExecutionModeRegistry({
    runtimeId: "runtime:alpha",
    activeModeId: "debug",
    modes: [
      { modeId: "normal", default: true, audiences: ["application", "official-module"] },
      { modeId: "debug", audiences: ["debug"], scopes: ["mode:debug"] },
      { modeId: "maintenance", audiences: ["management"], available: false },
    ],
  });

  assert.equal(registryResult.ok, true);
  if (!registryResult.ok) {
    assert.fail("expected registry to build");
  }

  const result = exposeRuntimeModeVisibility({
    runtimeId: "runtime:alpha",
    registry: registryResult.registry,
    audience: "debug",
    callerScopes: ["mode:debug"],
  });

  assert.equal(modeVisibilitySurfaceCapability.unsafeSideEffects, false);
  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("expected visibility to succeed");
  }

  assert.equal(result.visibility.runtimeId, "runtime:alpha");
  assert.equal(result.visibility.visibilitySurface, "runtime.modeExposure.modeVisibilitySurface");
  assert.equal(result.visibility.unsafeSideEffects, false);
  assert.deepEqual(
    result.visibility.modes.map((mode) => mode.modeId),
    ["debug"],
  );
  assert.equal(result.visibility.modes[0]?.active, true);
});

test("modeVisibilitySurface rejects missing registry and runtime mismatch", () => {
  const missing = exposeRuntimeModeVisibility({ runtimeId: "runtime:alpha" });

  assert.equal(missing.ok, false);
  if (missing.ok) {
    assert.fail("missing registry should be rejected");
  }
  assert.equal(missing.error.code, "MISSING_MODE_REGISTRY");
  assert.equal(missing.error.boundary, "input");

  const registryResult = buildExecutionModeRegistry({
    runtimeId: "runtime:alpha",
    modes: [{ modeId: "normal", default: true }],
  });

  assert.equal(registryResult.ok, true);
  if (!registryResult.ok) {
    assert.fail("expected registry to build");
  }

  const mismatch = exposeRuntimeModeVisibility({
    runtimeId: "runtime:beta",
    registry: registryResult.registry,
  });

  assert.equal(mismatch.ok, false);
  if (mismatch.ok) {
    assert.fail("runtime mismatch should be rejected");
  }
  assert.equal(mismatch.error.code, "REGISTRY_RUNTIME_MISMATCH");
  assert.equal(mismatch.error.internalDetailExposed, false);
});
