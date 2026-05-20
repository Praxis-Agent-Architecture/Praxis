import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import { planAdaptiveModuleRebalance } from "../../../../src/agentCore_runtimeImplementation/runtime.adaptiveRuntime/adaptiveModuleRebalance.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_runtimeImplementation/runtime.adaptiveRuntime/adaptiveModuleRebalance.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.adaptiveRuntime/adaptiveModuleRebalance.md",
  testFileUrl: import.meta.url,
});

test("adaptiveModuleRebalance creates a dry-run module weight plan", () => {
  const result = planAdaptiveModuleRebalance({
    runtimeId: " runtime-1 ",
    caller: { kind: "runtime-surface", id: " adaptive-runtime " },
    strategy: "shed-load",
    allowedScopes: ["module.rebalance"],
    modules: [
      {
        moduleId: "cmp",
        kind: "CMP",
        currentWeight: 0.8,
        loadRatio: 0.9,
        errorRate: 0.2,
        scopes: ["module.rebalance"],
      },
      {
        moduleId: "tap",
        kind: "TAP",
        currentWeight: 0.5,
        loadRatio: 0.2,
        errorRate: 0,
        scopes: ["module.rebalance"],
      },
      {
        moduleId: "multiagent",
        kind: "multiagent",
        ready: false,
        currentWeight: 0.4,
      },
    ],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.plan.planId, "runtime-1:adaptiveModuleRebalance");
  assert.equal(result.plan.route, "runtime.adaptiveRuntime.adaptiveModuleRebalance");
  assert.deepEqual(result.plan.activeModuleIds, ["cmp", "tap"]);
  assert.deepEqual(result.plan.isolatedModuleIds, ["multiagent"]);
  assert.deepEqual(
    result.plan.adjustments.map((adjustment) => adjustment.reason),
    ["overloaded", "underused", "unready"],
  );
  assert.equal(result.plan.dryRun, true);
  assert.equal(result.plan.unsafeSideEffects, false);
});

test("adaptiveModuleRebalance rejects stable no-op and governance scope violations", () => {
  const stable = planAdaptiveModuleRebalance({
    runtimeId: "runtime-1",
    caller: { kind: "test", id: "test" },
    modules: [{ moduleId: "cmp", currentWeight: 0.5, targetWeight: 0.5, loadRatio: 0.5 }],
  });

  assert.equal(stable.ok, false);
  if (!stable.ok) {
    assert.equal(stable.error.code, "NO_REBALANCE_TARGETS");
    assert.equal(stable.error.boundary, "module");
  }

  const denied = planAdaptiveModuleRebalance({
    runtimeId: "runtime-1",
    caller: { kind: "official-module", id: "tap" },
    allowedScopes: ["module.read"],
    modules: [{ moduleId: "cmp", currentWeight: 0.9, loadRatio: 1, scopes: ["module.rebalance"] }],
  });

  assert.equal(denied.ok, false);
  if (!denied.ok) {
    assert.equal(denied.error.code, "SCOPE_DENIED");
    assert.equal(denied.error.boundary, "scope");
  }
});
