import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import { planRuntimeMutation } from "../../../../src/agentCore_runtimeImplementation/runtime.managementPlane/runtimeMutationPlanner.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_runtimeImplementation/runtime.managementPlane/runtimeMutationPlanner.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.managementPlane/runtimeMutationPlanner.md",
  testFileUrl: import.meta.url,
});

test("runtimeMutationPlanner builds a dry-run mutation plan with rollback guardrails", () => {
  const result = planRuntimeMutation({
    runtimeId: " runtime-alpha ",
    caller: { kind: "operator", id: " operator-1 " },
    requestedScopes: ["runtime.mutate"],
    allowedScopes: ["runtime.mutate", "runtime.audit"],
    mutations: [
      {
        mutationId: " bind-resource-governor ",
        targetSurface: "resourceGovernor",
        operation: "bind",
        risk: "medium",
        requestedScopes: [" runtime.audit "],
        requiresRollback: true,
      },
    ],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.plan.runtimeId, "runtime-alpha");
  assert.equal(result.plan.route, "runtime.managementPlane.mutationPlanner");
  assert.deepEqual(result.plan.mutationIds, ["bind-resource-governor"]);
  assert.deepEqual(result.plan.targetSurfaces, ["resourceGovernor"]);
  assert.deepEqual(result.plan.grantedScopes, ["runtime.mutate", "runtime.audit"]);
  assert.equal(result.plan.rollbackRequired, true);
  assert.equal(result.plan.mockableEnvelope, true);
  assert.equal(result.plan.dryRun, true);
  assert.equal(result.plan.unsafeSideEffects, false);
  assert.equal(result.plan.steps[0]?.dryRunOnly, true);
});

test("runtimeMutationPlanner rejects missing data, denied scopes, and unreviewed high risk", () => {
  const missing = planRuntimeMutation({
    runtimeId: "runtime-alpha",
    caller: { kind: "operator", id: "operator-1" },
  });

  assert.equal(missing.ok, false);
  if (missing.ok) {
    return;
  }

  assert.equal(missing.error.code, "MISSING_MUTATIONS");
  assert.equal(missing.error.boundary, "input");

  const denied = planRuntimeMutation({
    runtimeId: "runtime-alpha",
    caller: { kind: "operator", id: "operator-1" },
    allowedScopes: ["runtime.audit"],
    mutations: [
      {
        mutationId: "configure-console",
        targetSurface: "operatorConsole",
        operation: "configure",
        requestedScopes: ["runtime.mutate"],
      },
    ],
  });

  assert.equal(denied.ok, false);
  if (denied.ok) {
    return;
  }

  assert.equal(denied.error.code, "SCOPE_DENIED");
  assert.equal(denied.error.boundary, "scope");

  const invalidHighRisk = planRuntimeMutation({
    runtimeId: "runtime-alpha",
    caller: { kind: "operator", id: "operator-1" },
    mutations: [
      {
        mutationId: "replace-policy-gate",
        targetSurface: "policyGate",
        risk: "high",
      },
    ],
  });

  assert.equal(invalidHighRisk.ok, false);
  if (invalidHighRisk.ok) {
    return;
  }

  assert.equal(invalidHighRisk.error.code, "MISSING_OPERATION");
  assert.equal(invalidHighRisk.error.boundary, "input");

  const risk = planRuntimeMutation({
    runtimeId: "runtime-alpha",
    caller: { kind: "operator", id: "operator-1" },
    mutations: [
      {
        mutationId: "replace-policy-gate",
        targetSurface: "policyGate",
        operation: "configure",
        risk: "high",
      },
    ],
  });

  assert.equal(risk.ok, false);
  if (risk.ok) {
    return;
  }

  assert.equal(risk.error.code, "RISK_REVIEW_REQUIRED");
  assert.equal(risk.error.boundary, "governance");
  assert.equal(risk.error.internalDetailExposed, false);
});
