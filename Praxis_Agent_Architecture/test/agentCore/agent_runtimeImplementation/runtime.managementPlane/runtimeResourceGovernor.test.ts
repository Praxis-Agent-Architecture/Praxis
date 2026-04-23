import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import { governRuntimeResources } from "../../../../src/agentCore/agent_runtimeImplementation/runtime.managementPlane/runtimeResourceGovernor.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_runtimeImplementation/runtime.managementPlane/runtimeResourceGovernor.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_runtimeImplementation/runtime.managementPlane/runtimeResourceGovernor.md",
  testFileUrl: import.meta.url,
});

test("runtimeResourceGovernor evaluates resource demands against dry-run budgets", () => {
  const result = governRuntimeResources({
    runtimeId: " runtime-alpha ",
    caller: { kind: "runtime-surface", id: " management-plane " },
    requestedScopes: ["runtime.resource"],
    allowedScopes: ["runtime.resource", "runtime.audit"],
    budgets: [
      { resource: "token", limit: 1000, used: 300, unit: "tokens", window: "turn", hard: true },
      { resource: "concurrency", limit: 4, used: 3, unit: "slots", hard: false },
    ],
    demands: [
      { resource: "token", amount: 250, requestedScopes: ["runtime.audit"], reason: "operator inspection" },
      { resource: "concurrency", amount: 2 },
    ],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.governor.runtimeId, "runtime-alpha");
  assert.equal(result.governor.route, "runtime.managementPlane.resourceGovernor");
  assert.deepEqual(result.governor.grantedScopes, ["runtime.resource", "runtime.audit"]);
  assert.equal(result.governor.decisions[0]?.status, "granted");
  assert.equal(result.governor.decisions[0]?.remainingAfterGrant, 450);
  assert.equal(result.governor.decisions[1]?.status, "capped");
  assert.equal(result.governor.decisions[1]?.grantedAmount, 1);
  assert.equal(result.governor.dryRun, true);
  assert.equal(result.governor.unsafeSideEffects, false);
});

test("runtimeResourceGovernor rejects invalid input, denied scopes, and hard budget overages", () => {
  const missing = governRuntimeResources({
    runtimeId: "runtime-alpha",
    caller: { kind: "operator", id: "operator-1" },
  });

  assert.equal(missing.ok, false);
  if (missing.ok) {
    return;
  }

  assert.equal(missing.error.code, "MISSING_RESOURCE_DEMANDS");
  assert.equal(missing.error.boundary, "input");

  const invalidAmount = governRuntimeResources({
    runtimeId: "runtime-alpha",
    caller: { kind: "operator", id: "operator-1" },
    demands: [{ resource: "token", amount: 0 }],
  });

  assert.equal(invalidAmount.ok, false);
  if (invalidAmount.ok) {
    return;
  }

  assert.equal(invalidAmount.error.code, "INVALID_RESOURCE_AMOUNT");
  assert.equal(invalidAmount.error.boundary, "input");

  const overBudget = governRuntimeResources({
    runtimeId: "runtime-alpha",
    caller: { kind: "operator", id: "operator-1" },
    budgets: [{ resource: "token", limit: 10, used: 8, hard: true }],
    demands: [{ resource: "token", amount: 3 }],
  });

  assert.equal(overBudget.ok, false);
  if (overBudget.ok) {
    return;
  }

  assert.equal(overBudget.error.code, "RESOURCE_LIMIT_EXCEEDED");
  assert.equal(overBudget.error.boundary, "governance");
  assert.equal(overBudget.error.internalDetailExposed, false);
});
