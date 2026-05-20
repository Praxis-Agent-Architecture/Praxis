import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  createRepairStrategyRegistry,
  runtimeRepairStrategyRegistryDescriptor,
} from "../../../../src/runtimeImplementation/runtime.selfRepair/repairStrategyRegistry.js";

defineAgentCoreContractTest({
  sourcePath: "src/runtimeImplementation/runtime.selfRepair/repairStrategyRegistry.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.selfRepair/repairStrategyRegistry.md",
  testFileUrl: import.meta.url,
});

test("createRepairStrategyRegistry registers and queries dry-run repair strategies", () => {
  const result = createRepairStrategyRegistry({
    runtimeId: " runtime-1 ",
    strategies: [
      {
        strategyId: " restart-runtime ",
        kind: "restart-surface",
        summary: "restart a stale runtime surface",
        supportedFaultCategories: ["runtime-state"],
        tags: [" stale ", "session"],
      },
      {
        strategyId: "fallback-provider",
        kind: "fallback-adapter",
        supportedFaultCategories: ["provider-adapter"],
        risk: "medium",
      },
    ],
    query: { faultCategory: "runtime-state", tags: ["stale"] },
    allowedStrategyKinds: ["restart-surface", "fallback-adapter"],
  });

  assert.equal(runtimeRepairStrategyRegistryDescriptor.unsafeSideEffects, false);
  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("expected repair strategy registry creation to succeed");
  }

  assert.equal(result.registry.runtimeId, "runtime-1");
  assert.equal(result.registry.strategyCount, 2);
  assert.equal(result.registry.matchedCount, 1);
  assert.equal(result.registry.matchedStrategies[0]?.strategyId, "restart-runtime");
  assert.equal(result.registry.matchedStrategies[0]?.dryRunOnly, true);
  assert.equal(result.registry.audit.unsafeSideEffects, false);
});

test("createRepairStrategyRegistry marks high-risk strategies as approval-gated by default", () => {
  const result = createRepairStrategyRegistry({
    runtimeId: "runtime-1",
    strategies: [
      {
        strategyId: "escalate-governance",
        kind: "escalate",
        supportedFaultCategories: ["governance"],
        risk: "high",
      },
    ],
    query: { kind: "escalate" },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("expected high-risk strategy registry creation to succeed");
  }

  assert.equal(result.registry.matchedStrategies[0]?.requiresApproval, true);
  assert.equal(result.registry.matchedStrategies[0]?.unsafeSideEffects, false);
});

test("createRepairStrategyRegistry rejects invalid input, duplicates, and scope violations", () => {
  const missing = createRepairStrategyRegistry();

  assert.equal(missing.ok, false);
  if (missing.ok) {
    assert.fail("empty strategy registry input must be rejected");
  }
  assert.equal(missing.error.code, "MISSING_RUNTIME_ID");
  assert.equal(missing.error.boundary, "input");

  const duplicate = createRepairStrategyRegistry({
    runtimeId: "runtime-1",
    strategies: [
      { strategyId: "same", kind: "observe" },
      { strategyId: "same", kind: "restart-surface" },
    ],
  });

  assert.equal(duplicate.ok, false);
  if (duplicate.ok) {
    assert.fail("duplicate strategies must be rejected");
  }
  assert.equal(duplicate.error.code, "DUPLICATE_STRATEGY_ID");

  const scoped = createRepairStrategyRegistry({
    runtimeId: "runtime-1",
    strategies: [{ strategyId: "fallback-provider", kind: "fallback-adapter" }],
    allowedStrategyKinds: ["restart-surface"],
  });

  assert.equal(scoped.ok, false);
  if (scoped.ok) {
    assert.fail("strategy scope violation must be rejected");
  }
  assert.equal(scoped.error.code, "STRATEGY_SCOPE_DENIED");
  assert.equal(scoped.error.boundary, "scope");
});
