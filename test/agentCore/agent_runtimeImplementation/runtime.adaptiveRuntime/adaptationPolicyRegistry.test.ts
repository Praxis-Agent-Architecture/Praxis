import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  adaptationPolicyRegistryDescriptor,
  registerAdaptationPolicies,
} from "../../../../src/agentCore/agent_runtimeImplementation/runtime.adaptiveRuntime/adaptationPolicyRegistry.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_runtimeImplementation/runtime.adaptiveRuntime/adaptationPolicyRegistry.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.adaptiveRuntime/adaptationPolicyRegistry.md",
  testFileUrl: import.meta.url,
});

test("registerAdaptationPolicies records enabled dry-run policy descriptors", () => {
  const result = registerAdaptationPolicies({
    runtimeId: " runtime-1 ",
    caller: { kind: "runtime-surface", id: " adaptiveRuntime " },
    policies: [
      {
        policyId: "observe-latency",
        action: "observe",
        priority: 1,
        signalKinds: ["latency", "latency"],
        description: " observe latency only ",
      },
      {
        policyId: "fallback-on-health",
        action: "provider-fallback",
        priority: 5,
        signalKinds: ["provider-health"],
      },
    ],
    allowedActions: ["observe", "provider-fallback"],
  });

  assert.equal(adaptationPolicyRegistryDescriptor.unsafeSideEffects, false);
  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("adaptation policy registry should accept valid input");
  }

  assert.equal(result.registry.runtimeId, "runtime-1");
  assert.equal(result.registry.route, "runtime.adaptiveRuntime.adaptationPolicyRegistry");
  assert.deepEqual(result.registry.enabledPolicyIds, ["fallback-on-health", "observe-latency"]);
  assert.deepEqual(result.registry.actions, ["provider-fallback", "observe"]);
  assert.equal(result.registry.policies[0]?.policyId, "fallback-on-health");
  assert.deepEqual(result.registry.policies[1]?.signalKinds, ["latency"]);
  assert.equal(result.registry.audit.dryRun, true);
  assert.equal(result.registry.audit.unsafeSideEffects, false);
});

test("registerAdaptationPolicies returns classified input and duplicate errors", () => {
  const missing = registerAdaptationPolicies();
  assert.equal(missing.ok, false);
  if (missing.ok) {
    assert.fail("empty input must be rejected");
  }

  assert.equal(missing.error.code, "MISSING_RUNTIME_ID");
  assert.equal(missing.error.boundary, "input");
  assert.equal(missing.error.safeForRuntimeInspection, true);

  const duplicate = registerAdaptationPolicies({
    runtimeId: "runtime-1",
    caller: { kind: "test", id: "test" },
    policies: [
      { policyId: "same", action: "observe" },
      { policyId: "same", action: "provider-fallback" },
    ],
  });

  assert.equal(duplicate.ok, false);
  if (duplicate.ok) {
    assert.fail("duplicate policy ids must be rejected");
  }

  assert.equal(duplicate.error.code, "DUPLICATE_POLICY_ID");
  assert.equal(duplicate.error.boundary, "input");
});

test("registerAdaptationPolicies rejects actions outside runtime governance", () => {
  const result = registerAdaptationPolicies({
    runtimeId: "runtime-1",
    caller: { kind: "official-module", id: "tap" },
    policies: [{ policyId: "rebalance", action: "module-rebalance" }],
    allowedActions: ["observe"],
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("policy action scope escape must be rejected");
  }

  assert.equal(result.error.code, "ACTION_SCOPE_DENIED");
  assert.equal(result.error.boundary, "scope");
  assert.deepEqual(result.events, ["runtime.adaptiveRuntime.policyRegistry.rejected"]);
});
