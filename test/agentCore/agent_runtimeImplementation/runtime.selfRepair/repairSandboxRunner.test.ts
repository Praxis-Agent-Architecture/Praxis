import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { classifyRuntimeFault } from "../../../../src/agentCore/agent_runtimeImplementation/runtime.selfRepair/faultClassifier.js";
import { gateRuntimeRepairAction } from "../../../../src/agentCore/agent_runtimeImplementation/runtime.selfRepair/repairActionGate.js";
import {
  buildRuntimeRepairPlan,
  type RuntimeRepairPlan,
} from "../../../../src/agentCore/agent_runtimeImplementation/runtime.selfRepair/repairPlanBuilder.js";
import {
  runRepairSandbox,
  runtimeRepairSandboxRunnerDescriptor,
} from "../../../../src/agentCore/agent_runtimeImplementation/runtime.selfRepair/repairSandboxRunner.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_runtimeImplementation/runtime.selfRepair/repairSandboxRunner.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.selfRepair/repairSandboxRunner.md",
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

test("runRepairSandbox simulates allowed repair steps without real execution", () => {
  const plan = buildRestartPlan();
  const step = plan.steps[0];
  assert.ok(step);

  const gate = gateRuntimeRepairAction({
    runtimeId: "runtime-1",
    plan,
    stepId: step.stepId,
  });

  assert.equal(gate.ok, true);
  if (!gate.ok) {
    assert.fail("expected repair action gate to allow the step");
  }

  const result = runRepairSandbox({
    runtimeId: " runtime-1 ",
    plan,
    stepId: step.stepId,
    gateDecision: gate.decision,
    sandbox: {
      sandboxId: " sandbox-1 ",
      isolation: "mock",
      allowedStepKinds: ["restart-surface"],
      expectedSignals: [" preflight-ok ", "no-side-effects"],
    },
  });

  assert.equal(runtimeRepairSandboxRunnerDescriptor.unsafeSideEffects, false);
  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("expected repair sandbox run to succeed");
  }

  assert.equal(result.run.runtimeId, "runtime-1");
  assert.equal(result.run.stepKind, "restart-surface");
  assert.equal(result.run.sandboxId, "sandbox-1");
  assert.equal(result.run.status, "passed");
  assert.equal(result.run.audit.executedRealAction, false);
  assert.deepEqual(result.run.observedSignals, ["preflight-ok", "no-side-effects"]);
});

test("runRepairSandbox rejects non-allow gate decisions", () => {
  const plan = buildRestartPlan();
  const step = plan.steps[0];
  assert.ok(step);

  const result = runRepairSandbox({
    runtimeId: "runtime-1",
    plan,
    stepId: step.stepId,
    gateDecision: {
      status: "requires-approval",
      runtimeId: "runtime-1",
      planId: plan.planId,
      stepId: step.stepId,
      stepKind: step.kind,
      risk: plan.risk,
      reason: "approval required",
      dryRunOnly: true,
      executionPlanned: false,
      approvalRequired: true,
      rollbackPoint: step.rollbackPoint,
      audit: {
        unsafeSideEffects: false,
        gate: "runtime.selfRepair.repairActionGate",
        contractChecked: true,
        governanceChecked: true,
      },
    },
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("sandbox must reject non-allow gate decisions");
  }
  assert.equal(result.error.code, "REPAIR_NOT_ALLOWED");
  assert.equal(result.error.boundary, "governance");
});

test("runRepairSandbox rejects invalid input and sandbox scope violations", () => {
  const missing = runRepairSandbox();

  assert.equal(missing.ok, false);
  if (missing.ok) {
    assert.fail("empty sandbox input must be rejected");
  }
  assert.equal(missing.error.code, "MISSING_RUNTIME_ID");

  const plan = buildRestartPlan();
  const step = plan.steps[0];
  assert.ok(step);

  const scoped = runRepairSandbox({
    runtimeId: "runtime-1",
    plan,
    stepId: step.stepId,
    sandbox: { allowedStepKinds: ["observe"] },
  });

  assert.equal(scoped.ok, false);
  if (scoped.ok) {
    assert.fail("sandbox scope violation must be rejected");
  }
  assert.equal(scoped.error.code, "SANDBOX_SCOPE_DENIED");
  assert.equal(scoped.error.boundary, "scope");
});
