import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { classifyRuntimeFault } from "../../../../src/agentCore_runtimeImplementation/runtime.selfRepair/faultClassifier.js";
import {
  buildRuntimeRepairPlan,
  type RuntimeRepairPlan,
} from "../../../../src/agentCore_runtimeImplementation/runtime.selfRepair/repairPlanBuilder.js";
import {
  guardRepairRollback,
  runtimeRepairRollbackGuardDescriptor,
} from "../../../../src/agentCore_runtimeImplementation/runtime.selfRepair/repairRollbackGuard.js";
import { runRepairSandbox } from "../../../../src/agentCore_runtimeImplementation/runtime.selfRepair/repairSandboxRunner.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_runtimeImplementation/runtime.selfRepair/repairRollbackGuard.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.selfRepair/repairRollbackGuard.md",
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

test("guardRepairRollback allows declared rollback points without executing rollback", () => {
  const plan = buildRestartPlan();
  const rollbackPoint = plan.rollbackPoints[0];
  assert.equal(typeof rollbackPoint, "string");

  const result = guardRepairRollback({
    runtimeId: " runtime-1 ",
    plan,
    rollbackPoint,
    trigger: "repair-failed",
    allowedRollbackPoints: [rollbackPoint],
  });

  assert.equal(runtimeRepairRollbackGuardDescriptor.unsafeSideEffects, false);
  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("expected rollback guard to allow the point");
  }

  assert.equal(result.decision.status, "allow");
  assert.equal(result.decision.runtimeId, "runtime-1");
  assert.equal(result.decision.rollbackPoint, rollbackPoint);
  assert.equal(result.decision.rollbackPrepared, true);
  assert.equal(result.decision.rollbackExecuted, false);
  assert.equal(result.decision.audit.unsafeSideEffects, false);
});

test("guardRepairRollback can derive rollback point from sandbox run and require approval", () => {
  const plan = buildRestartPlan();
  const step = plan.steps[0];
  assert.ok(step);
  const sandbox = runRepairSandbox({
    runtimeId: "runtime-1",
    plan,
    stepId: step.stepId,
  });

  assert.equal(sandbox.ok, true);
  if (!sandbox.ok) {
    assert.fail("expected sandbox run to succeed");
  }

  const approvalPlan: RuntimeRepairPlan = {
    ...plan,
    risk: "high",
    approvalRequired: true,
  };

  const gated = guardRepairRollback({
    runtimeId: "runtime-1",
    plan: approvalPlan,
    sandboxRun: sandbox.run,
  });

  assert.equal(gated.ok, true);
  if (!gated.ok) {
    assert.fail("expected rollback guard to return an approval decision");
  }
  assert.equal(gated.decision.status, "requires-approval");
  assert.equal(gated.decision.trigger, "sandbox-failed");

  const approved = guardRepairRollback({
    runtimeId: "runtime-1",
    plan: approvalPlan,
    sandboxRun: sandbox.run,
    approvedRollbackPoints: [sandbox.run.rollbackPoint],
  });

  assert.equal(approved.ok, true);
  if (!approved.ok) {
    assert.fail("expected approved rollback guard to allow the point");
  }
  assert.equal(approved.decision.status, "allow");
});

test("guardRepairRollback rejects invalid rollback points and scope violations", () => {
  const missing = guardRepairRollback();

  assert.equal(missing.ok, false);
  if (missing.ok) {
    assert.fail("empty rollback guard input must be rejected");
  }
  assert.equal(missing.error.code, "MISSING_RUNTIME_ID");

  const plan = buildRestartPlan();
  const unknown = guardRepairRollback({
    runtimeId: "runtime-1",
    plan,
    rollbackPoint: "unknown-point",
  });

  assert.equal(unknown.ok, false);
  if (unknown.ok) {
    assert.fail("unknown rollback point must be rejected");
  }
  assert.equal(unknown.error.code, "ROLLBACK_POINT_NOT_FOUND");

  const scoped = guardRepairRollback({
    runtimeId: "runtime-1",
    plan,
    rollbackPoint: plan.rollbackPoints[0],
    allowedRollbackPoints: ["other-point"],
  });

  assert.equal(scoped.ok, false);
  if (scoped.ok) {
    assert.fail("rollback scope violation must be rejected");
  }
  assert.equal(scoped.error.code, "ROLLBACK_SCOPE_DENIED");
  assert.equal(scoped.error.boundary, "scope");
});
