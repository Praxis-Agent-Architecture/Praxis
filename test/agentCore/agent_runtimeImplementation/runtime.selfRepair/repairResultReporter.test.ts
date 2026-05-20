import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { classifyRuntimeFault } from "../../../../src/agentCore_runtimeImplementation/runtime.selfRepair/faultClassifier.js";
import { buildRuntimeRepairPlan } from "../../../../src/agentCore_runtimeImplementation/runtime.selfRepair/repairPlanBuilder.js";
import {
  reportRepairResult,
  runtimeRepairResultReporterDescriptor,
} from "../../../../src/agentCore_runtimeImplementation/runtime.selfRepair/repairResultReporter.js";
import { guardRepairRollback } from "../../../../src/agentCore_runtimeImplementation/runtime.selfRepair/repairRollbackGuard.js";
import { runRepairSandbox } from "../../../../src/agentCore_runtimeImplementation/runtime.selfRepair/repairSandboxRunner.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_runtimeImplementation/runtime.selfRepair/repairResultReporter.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.selfRepair/repairResultReporter.md",
  testFileUrl: import.meta.url,
});

test("reportRepairResult reports successful dry-run repair outcomes", () => {
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

  const step = plan.plan.steps[0];
  assert.ok(step);
  const sandbox = runRepairSandbox({
    runtimeId: "runtime-1",
    plan: plan.plan,
    stepId: step.stepId,
  });

  assert.equal(sandbox.ok, true);
  if (!sandbox.ok) {
    assert.fail("expected sandbox run to succeed");
  }

  const result = reportRepairResult({
    runtimeId: " runtime-1 ",
    outcome: "succeeded",
    classification: classification.classification,
    plan: plan.plan,
    sandboxRun: sandbox.run,
    reportedAt: "2026-04-23T01:40:00.000Z",
  });

  assert.equal(runtimeRepairResultReporterDescriptor.unsafeSideEffects, false);
  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("expected repair result report to succeed");
  }

  assert.equal(result.report.runtimeId, "runtime-1");
  assert.equal(result.report.outcome, "succeeded");
  assert.equal(result.report.severity, "info");
  assert.equal(result.report.planId, plan.plan.planId);
  assert.equal(result.report.sandboxRunId, sandbox.run.runId);
  assert.deepEqual(result.report.recommendations, ["record repair evidence", "continue runtime observation"]);
  assert.equal(result.report.audit.notificationSent, false);
});

test("reportRepairResult reports failed repair with rollback context and public-safe recommendations", () => {
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

  const rollback = guardRepairRollback({
    runtimeId: "runtime-1",
    plan: plan.plan,
    rollbackPoint: plan.plan.rollbackPoints[0],
    trigger: "repair-failed",
  });

  assert.equal(rollback.ok, true);
  if (!rollback.ok) {
    assert.fail("expected rollback guard to succeed");
  }

  const result = reportRepairResult({
    runtimeId: "runtime-1",
    outcome: "failed",
    classification: classification.classification,
    plan: plan.plan,
    rollbackDecision: rollback.decision,
    failureReason: "sandbox signal did not match expected runtime event",
    recommendations: [" keep rollback point ", "request operator review"],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("expected failed repair result report to succeed");
  }

  assert.equal(result.report.severity, "error");
  assert.equal(result.report.failureReason, "sandbox signal did not match expected runtime event");
  assert.equal(result.report.rollbackPoint, plan.plan.rollbackPoints[0]);
  assert.deepEqual(result.report.recommendations, ["keep rollback point", "request operator review"]);
});

test("reportRepairResult rejects invalid input and missing failure reasons", () => {
  const missing = reportRepairResult();

  assert.equal(missing.ok, false);
  if (missing.ok) {
    assert.fail("empty repair report input must be rejected");
  }
  assert.equal(missing.error.code, "MISSING_RUNTIME_ID");

  const noFault = reportRepairResult({
    runtimeId: "runtime-1",
    outcome: "succeeded",
  });

  assert.equal(noFault.ok, false);
  if (noFault.ok) {
    assert.fail("repair report without fault context must be rejected");
  }
  assert.equal(noFault.error.code, "MISSING_FAULT_CONTEXT");

  const failedWithoutReason = reportRepairResult({
    runtimeId: "runtime-1",
    outcome: "failed",
    faultId: "fault-1",
  });

  assert.equal(failedWithoutReason.ok, false);
  if (failedWithoutReason.ok) {
    assert.fail("failed reports must include a failure reason");
  }
  assert.equal(failedWithoutReason.error.code, "MISSING_FAILURE_REASON");
  assert.equal(failedWithoutReason.error.boundary, "report");
});
