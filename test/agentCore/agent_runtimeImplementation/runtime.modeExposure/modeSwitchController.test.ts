import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { buildExecutionModeRegistry } from "../../../../src/runtimeImplementation/runtime.modeExposure/executionModeRegistry.js";
import {
  modeSwitchControllerCapability,
  planRuntimeModeSwitch,
} from "../../../../src/runtimeImplementation/runtime.modeExposure/modeSwitchController.js";

defineAgentCoreContractTest({
  sourcePath: "src/runtimeImplementation/runtime.modeExposure/modeSwitchController.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.modeExposure/modeSwitchController.md",
  testFileUrl: import.meta.url,
});

test("modeSwitchController plans a dry-run mode switch through the registry", () => {
  const registryResult = buildExecutionModeRegistry({
    runtimeId: "runtime:alpha",
    modes: [
      { modeId: "normal", default: true },
      { modeId: "debug", scopes: ["mode:debug"] },
    ],
  });

  assert.equal(registryResult.ok, true);
  if (!registryResult.ok) {
    assert.fail("expected registry to build");
  }

  const result = planRuntimeModeSwitch({
    runtimeId: "runtime:alpha",
    registry: registryResult.registry,
    toModeId: "debug",
    requestedScopes: ["mode:debug"],
    reason: "investigate runtime behavior",
  });

  assert.equal(modeSwitchControllerCapability.unsafeSideEffects, false);
  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("expected switch plan to succeed");
  }

  assert.equal(result.plan.fromModeId, "normal");
  assert.equal(result.plan.toModeId, "debug");
  assert.equal(result.plan.status, "planned");
  assert.equal(result.plan.dryRun, true);
  assert.equal(result.plan.unsafeSideEffects, false);
});

test("modeSwitchController rejects missing scopes and unavailable targets", () => {
  const registryResult = buildExecutionModeRegistry({
    runtimeId: "runtime:alpha",
    modes: [
      { modeId: "normal", default: true },
      { modeId: "maintenance", scopes: ["mode:maintenance"], available: false },
      { modeId: "safe", scopes: ["mode:safe"] },
    ],
  });

  assert.equal(registryResult.ok, true);
  if (!registryResult.ok) {
    assert.fail("expected registry to build");
  }

  const denied = planRuntimeModeSwitch({
    runtimeId: "runtime:alpha",
    registry: registryResult.registry,
    toModeId: "safe",
    requestedScopes: ["mode:debug"],
  });

  assert.equal(denied.ok, false);
  if (denied.ok) {
    assert.fail("missing mode scope should be rejected");
  }
  assert.equal(denied.error.code, "MODE_SCOPE_DENIED");
  assert.equal(denied.error.boundary, "scope");

  const unavailable = planRuntimeModeSwitch({
    runtimeId: "runtime:alpha",
    registry: registryResult.registry,
    toModeId: "maintenance",
    requestedScopes: ["mode:maintenance"],
  });

  assert.equal(unavailable.ok, false);
  if (unavailable.ok) {
    assert.fail("unavailable mode should be rejected");
  }
  assert.equal(unavailable.error.code, "MODE_NOT_AVAILABLE");
  assert.equal(unavailable.error.internalDetailExposed, false);
});
