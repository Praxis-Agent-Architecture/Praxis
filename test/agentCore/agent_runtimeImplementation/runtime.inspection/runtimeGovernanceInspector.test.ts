import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { inspectRuntimeGovernance } from "../../../../src/agentCore_runtimeImplementation/runtime.inspection/runtimeGovernanceInspector.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_runtimeImplementation/runtime.inspection/runtimeGovernanceInspector.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.inspection/runtimeGovernanceInspector.md",
  testFileUrl: import.meta.url,
});

test("runtimeGovernanceInspector reports enforced governance with active policies and scopes", () => {
  const result = inspectRuntimeGovernance({
    runtimeId: " runtime:alpha ",
    requiredPolicyIds: ["runtime-scope-guard"],
    requestedScopes: ["runtime.invoke", "runtime.inspect"],
    policies: [
      {
        policyId: " runtime-scope-guard ",
        scopes: ["runtime.invoke", "runtime.inspect"],
        surfaceIds: ["runtime.governancePlane"],
      },
    ],
    evaluations: [{ policyId: "runtime-scope-guard", accepted: true }],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.inspection.runtimeId, "runtime:alpha");
  assert.equal(result.inspection.status, "enforced");
  assert.deepEqual(result.inspection.activePolicies, ["runtime-scope-guard"]);
  assert.deepEqual(result.inspection.deniedScopes, []);
  assert.equal(result.inspection.unsafeSideEffects, false);
});

test("runtimeGovernanceInspector reports weak and rejected governance without exposing internals", () => {
  const weak = inspectRuntimeGovernance({
    runtimeId: "runtime:alpha",
    requiredPolicyIds: ["runtime-scope-guard"],
    requestedScopes: ["runtime.inspect"],
    policies: [{ policyId: "runtime-scope-guard", enabled: false, scopes: ["runtime.inspect"] }],
  });

  assert.equal(weak.ok, true);
  if (!weak.ok) {
    return;
  }

  assert.equal(weak.inspection.status, "weak");
  assert.deepEqual(weak.inspection.missingPolicies, ["runtime-scope-guard"]);
  assert.deepEqual(weak.inspection.deniedScopes, ["runtime.inspect"]);

  const rejected = inspectRuntimeGovernance({
    runtimeId: "runtime:alpha",
    policies: [{ policyId: "runtime-scope-guard" }],
    evaluations: [{ policyId: "runtime-scope-guard", accepted: false, reason: "policy compiled to deny" }],
  });

  assert.equal(rejected.ok, true);
  if (!rejected.ok) {
    return;
  }

  assert.equal(rejected.inspection.status, "rejected");
  assert.deepEqual(rejected.inspection.deniedEvaluations, ["runtime-scope-guard"]);
  assert.equal(rejected.inspection.findings[0]?.boundary, "governance");
});

test("runtimeGovernanceInspector rejects missing policy identifiers and governance gate denial", () => {
  const invalidPolicy = inspectRuntimeGovernance({
    runtimeId: "runtime:alpha",
    policies: [{ policyId: " " }],
  });

  assert.equal(invalidPolicy.ok, false);
  if (!invalidPolicy.ok) {
    assert.equal(invalidPolicy.error.code, "MISSING_POLICY_ID");
    assert.equal(invalidPolicy.error.boundary, "input");
  }

  const denied = inspectRuntimeGovernance({
    runtimeId: "runtime:alpha",
    governance: { accepted: false, reason: "inspection denied" },
  });

  assert.equal(denied.ok, false);
  if (!denied.ok) {
    assert.equal(denied.error.code, "GOVERNANCE_REJECTED");
    assert.equal(denied.error.boundary, "governance");
    assert.equal(denied.error.internalDetailExposed, false);
  }
});
