import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import { registerGovernancePolicies } from "../../../../src/agentCore_runtimeImplementation/runtime.governancePlane/governancePolicyRegistry.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_runtimeImplementation/runtime.governancePlane/governancePolicyRegistry.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.governancePlane/governancePolicyRegistry.md",
  testFileUrl: import.meta.url,
});

test("governancePolicyRegistry registers queryable runtime policies from supported sources", () => {
  const result = registerGovernancePolicies({
    runtimeId: " runtime-1 ",
    registeredAt: "2026-04-22T13:46:56.379Z",
    policies: [
      {
        policyId: " app-policy ",
        source: "application-config",
        priority: 1,
        effect: "allow",
        subjects: ["app-1"],
        actions: ["agent.invoke"],
      },
      {
        policyId: " tap-policy ",
        source: "official-module",
        effect: "approval-required",
        actions: ["tool.shell.write"],
      },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.registry.runtimeId, "runtime-1");
  assert.deepEqual(result.registeredPolicyIds, ["app-policy", "tap-policy"]);
  assert.deepEqual(result.registry.sources, ["application-config", "official-module"]);
  assert.equal(result.registry.queryableByRuntime, true);
  assert.equal(result.registry.unsafeSideEffects, false);
  assert.equal(result.registry.entries[0].policyId, "app-policy");
  assert.equal(result.registry.entries[0].revision, 1);
  assert.equal(result.registry.entries[0].enabled, true);
  assert.deepEqual(result.events, ["runtime.governance.policyRegistry.registered"]);
});

test("governancePolicyRegistry can replace an existing policy with a new revision", () => {
  const first = registerGovernancePolicies({
    runtimeId: "runtime-1",
    policies: [{ policyId: "policy-1", source: "dsl", effect: "allow" }],
  });
  assert.equal(first.ok, true);

  const replaced = registerGovernancePolicies({
    runtimeId: "runtime-1",
    existingEntries: first.registry.entries,
    replace: true,
    policies: [{ policyId: "policy-1", source: "management-plane", effect: "deny" }],
  });

  assert.equal(replaced.ok, true);
  assert.equal(replaced.registry.entries.length, 1);
  assert.equal(replaced.registry.entries[0].source, "management-plane");
  assert.equal(replaced.registry.entries[0].revision, 2);
});

test("governancePolicyRegistry rejects empty, duplicate, and governance-blocked registrations", () => {
  const missing = registerGovernancePolicies();
  assert.equal(missing.ok, false);
  assert.equal(missing.error.code, "MISSING_RUNTIME_ID");

  const noPolicy = registerGovernancePolicies({ runtimeId: "runtime-1", policies: [] });
  assert.equal(noPolicy.ok, false);
  assert.equal(noPolicy.error.code, "MISSING_POLICY");

  const duplicate = registerGovernancePolicies({
    runtimeId: "runtime-1",
    policies: [
      { policyId: "policy-1", source: "dsl" },
      { policyId: " policy-1 ", source: "official-module" },
    ],
  });
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.error.code, "DUPLICATE_POLICY");

  const rejected = registerGovernancePolicies({
    runtimeId: "runtime-1",
    governance: { accepted: false, reason: "registration locked" },
    policies: [{ policyId: "policy-1", source: "dsl" }],
  });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.error.code, "GOVERNANCE_REJECTED");
  assert.equal(rejected.error.boundary, "governance");
});
