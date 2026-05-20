import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import { compileGovernancePolicySet } from "../../../../src/runtimeImplementation/runtime.governancePlane/governancePolicyCompiler.js";

defineAgentCoreContractTest({
  sourcePath: "src/runtimeImplementation/runtime.governancePlane/governancePolicyCompiler.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.governancePlane/governancePolicyCompiler.md",
  testFileUrl: import.meta.url,
});

test("governancePolicyCompiler compiles prioritized runtime rules with defaults", () => {
  const result = compileGovernancePolicySet({
    runtimeId: " runtime-1 ",
    defaults: {
      effect: "deny",
      scopes: ["runtime.public"],
    },
    policies: [
      {
        policyId: " allow-agent ",
        source: "application-config",
        priority: 10,
        effect: "allow",
        subjects: ["app-1"],
        actions: ["agent.invoke"],
      },
      {
        policyId: " needs-approval ",
        source: "official-module",
        priority: 20,
        effect: "approval-required",
        subjects: ["tap"],
        actions: ["tool.shell.write"],
        scopes: ["runtime.tool"],
      },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.policySet.runtimeId, "runtime-1");
  assert.equal(result.policySet.defaultEffect, "deny");
  assert.deepEqual(
    result.policySet.rules.map((rule) => rule.policyId),
    ["needs-approval", "allow-agent"],
  );
  assert.deepEqual(result.policySet.rules[1].scopes, ["runtime.public"]);
  assert.equal(result.policySet.readyForRuntimeEvaluation, true);
  assert.equal(result.policySet.unsafeSideEffects, false);
  assert.deepEqual(result.events, ["runtime.governance.policyCompiler.compiled"]);
});

test("governancePolicyCompiler handles disabled and overridden policies", () => {
  const result = compileGovernancePolicySet({
    runtimeId: "runtime-1",
    policies: [
      {
        policyId: "old-rule",
        source: "dsl",
        priority: 1,
        effect: "allow",
      },
      {
        policyId: "new-rule",
        source: "management-plane",
        priority: 2,
        effect: "deny",
        overrides: ["old-rule"],
      },
      {
        policyId: "disabled-rule",
        source: "official-module",
        disabled: true,
      },
    ],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(
    result.policySet.rules.map((rule) => rule.policyId),
    ["new-rule"],
  );
  assert.deepEqual(result.policySet.disabledPolicyIds, ["disabled-rule"]);
  assert.deepEqual(result.policySet.overriddenPolicyIds, ["old-rule"]);
});

test("governancePolicyCompiler returns classified compile failures", () => {
  const missing = compileGovernancePolicySet();
  assert.equal(missing.ok, false);
  assert.equal(missing.error.code, "MISSING_RUNTIME_ID");
  assert.equal(missing.error.boundary, "input");

  const rejected = compileGovernancePolicySet({
    runtimeId: "runtime-1",
    governance: { accepted: false, reason: "compiler disabled" },
  });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.error.code, "GOVERNANCE_REJECTED");
  assert.equal(rejected.error.boundary, "governance");

  const invalidPriority = compileGovernancePolicySet({
    runtimeId: "runtime-1",
    policies: [{ policyId: "policy-1", source: "dsl", priority: 1.5 }],
  });
  assert.equal(invalidPriority.ok, false);
  assert.equal(invalidPriority.error.code, "INVALID_POLICY_PRIORITY");
});
