import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import { tuneAdaptiveResources } from "../../../../src/agentCore_runtimeImplementation/runtime.adaptiveRuntime/adaptiveResourceTuner.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_runtimeImplementation/runtime.adaptiveRuntime/adaptiveResourceTuner.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.adaptiveRuntime/adaptiveResourceTuner.md",
  testFileUrl: import.meta.url,
});

test("adaptiveResourceTuner returns dry-run resource recommendations", () => {
  const result = tuneAdaptiveResources({
    runtimeId: " runtime-1 ",
    caller: { kind: "runtime-surface", id: " adaptive-runtime " },
    mode: "balanced",
    signals: { loadRatio: 0.9, errorRate: 0.3, budgetPressure: 0.3, latencyMs: 1200 },
    allowedScopes: ["resource.tune"],
    resources: [
      { name: "concurrency", current: 8, min: 1, max: 16, step: 2, scopes: ["resource.tune"] },
      { name: "tokenBudget", current: 20000, min: 4000, max: 32000, step: 4000, scopes: ["resource.tune"] },
    ],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.plan.planId, "runtime-1:adaptiveResourceTuner");
  assert.equal(result.plan.route, "runtime.adaptiveRuntime.adaptiveResourceTuner");
  assert.deepEqual(
    result.plan.recommendations.map((recommendation) => recommendation.reason),
    ["pressure-high", "pressure-high"],
  );
  assert.deepEqual(
    result.plan.recommendations.map((recommendation) => recommendation.recommended),
    [6, 16000],
  );
  assert.equal(result.plan.dryRun, true);
  assert.equal(result.plan.unsafeSideEffects, false);
});

test("adaptiveResourceTuner rejects invalid ranges and denied scopes", () => {
  const invalid = tuneAdaptiveResources({
    runtimeId: "runtime-1",
    caller: { kind: "test", id: "test" },
    resources: [{ name: "concurrency", current: 2, min: 10, max: 1 }],
  });

  assert.equal(invalid.ok, false);
  if (!invalid.ok) {
    assert.equal(invalid.error.code, "INVALID_RESOURCE_RANGE");
    assert.equal(invalid.error.boundary, "resource");
  }

  const denied = tuneAdaptiveResources({
    runtimeId: "runtime-1",
    caller: { kind: "official-module", id: "cmp" },
    allowedScopes: ["resource.read"],
    resources: [{ name: "memoryMb", current: 1024, min: 256, max: 4096, scopes: ["resource.tune"] }],
  });

  assert.equal(denied.ok, false);
  if (!denied.ok) {
    assert.equal(denied.error.code, "SCOPE_DENIED");
    assert.equal(denied.error.boundary, "scope");
  }
});
