import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { classifyRuntimeFault } from "../../../../src/runtimeImplementation/runtime.selfRepair/faultClassifier.js";
import {
  gateRuntimeRepairAction,
  runtimeRepairActionGateDescriptor,
} from "../../../../src/runtimeImplementation/runtime.selfRepair/repairActionGate.js";
import {
  buildRuntimeRepairPlan,
  type RuntimeRepairPlan,
} from "../../../../src/runtimeImplementation/runtime.selfRepair/repairPlanBuilder.js";

defineAgentCoreContractTest({
  sourcePath: "src/runtimeImplementation/runtime.selfRepair/repairActionGate.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.selfRepair/repairActionGate.md",
  testFileUrl: import.meta.url,
});

function buildRestartPlan(): RuntimeRepairPlan {
  const classification = classifyRuntimeFault({
    runtimeId: "runtime-1",
    signal: {
      faultId: "fault-1",
      kind: "runtime-state.stale-session",
      runtimeReady: false,
      retryable: true,
    },
  });

  assert.equal(classification.ok, true);
  if (!classification.ok) {
    assert.fail("expected runtime fault classification to succeed");
  }

  const plan = buildRuntimeRepairPlan({
    runtimeId: "runtime-1",
    classification: classification.classification,
  });

  assert.equal(plan.ok, true);
  if (!plan.ok) {
    assert.fail("expected repair plan building to succeed");
  }

  return plan.plan;
}

test("gateRuntimeRepairAction allows scoped dry-run repair steps without executing them", () => {
  const plan = buildRestartPlan();
  const stepId = plan.steps[0]?.stepId;
  assert.equal(typeof stepId, "string");

  const result = gateRuntimeRepairAction({
    runtimeId: " runtime-1 ",
    plan,
    stepId,
    allowedStepKinds: ["restart-surface"],
  });

  assert.equal(runtimeRepairActionGateDescriptor.unsafeSideEffects, false);
  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("expected repair action gate to allow the step");
  }

  assert.equal(result.decision.status, "allow");
  assert.equal(result.decision.executionPlanned, false);
  assert.equal(result.decision.dryRunOnly, true);
  assert.equal(result.decision.stepKind, "restart-surface");
  assert.equal(result.decision.audit.unsafeSideEffects, false);
});

test("gateRuntimeRepairAction returns approval decisions for gated steps", () => {
  const plan = buildRestartPlan();
  const step = plan.steps[0];
  assert.ok(step);

  const approvalPlan: RuntimeRepairPlan = {
    ...plan,
    risk: "medium",
    approvalRequired: true,
    steps: [{ ...step, requiresApproval: true }],
  };

  const result = gateRuntimeRepairAction({
    runtimeId: "runtime-1",
    plan: approvalPlan,
    stepId: step.stepId,
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("expected repair action gate to return an approval decision");
  }

  assert.equal(result.decision.status, "requires-approval");
  assert.equal(result.decision.approvalRequired, true);
  assert.equal(result.decision.executionPlanned, false);

  const approved = gateRuntimeRepairAction({
    runtimeId: "runtime-1",
    plan: approvalPlan,
    stepId: step.stepId,
    approvedStepIds: [step.stepId],
  });

  assert.equal(approved.ok, true);
  if (!approved.ok) {
    assert.fail("expected approved repair action gate to allow the step");
  }
  assert.equal(approved.decision.status, "allow");
});

test("gateRuntimeRepairAction rejects invalid input, scope denial, and high-risk repair", () => {
  const missing = gateRuntimeRepairAction();

  assert.equal(missing.ok, false);
  if (missing.ok) {
    assert.fail("empty repair gate input must be rejected");
  }
  assert.equal(missing.error.code, "MISSING_RUNTIME_ID");
  assert.equal(missing.error.boundary, "input");

  const plan = buildRestartPlan();
  const step = plan.steps[0];
  assert.ok(step);

  const scoped = gateRuntimeRepairAction({
    runtimeId: "runtime-1",
    plan,
    stepId: step.stepId,
    allowedStepKinds: ["observe"],
  });

  assert.equal(scoped.ok, false);
  if (scoped.ok) {
    assert.fail("repair gate scope violation must be rejected");
  }
  assert.equal(scoped.error.code, "REPAIR_SCOPE_DENIED");

  const highRisk: RuntimeRepairPlan = {
    ...plan,
    risk: "high",
  };

  const denied = gateRuntimeRepairAction({
    runtimeId: "runtime-1",
    plan: highRisk,
    stepId: step.stepId,
  });

  assert.equal(denied.ok, false);
  if (denied.ok) {
    assert.fail("high-risk repair must require explicit permission");
  }
  assert.equal(denied.error.code, "HIGH_RISK_REPAIR_DENIED");
  assert.equal(denied.error.boundary, "approval");
});
