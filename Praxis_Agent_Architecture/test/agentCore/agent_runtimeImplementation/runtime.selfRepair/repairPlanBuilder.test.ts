import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { classifyRuntimeFault } from "../../../../src/agentCore/agent_runtimeImplementation/runtime.selfRepair/faultClassifier.js";
import {
  buildRuntimeRepairPlan,
  runtimeRepairPlanBuilderDescriptor,
} from "../../../../src/agentCore/agent_runtimeImplementation/runtime.selfRepair/repairPlanBuilder.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_runtimeImplementation/runtime.selfRepair/repairPlanBuilder.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_runtimeImplementation/runtime.selfRepair/repairPlanBuilder.md",
  testFileUrl: import.meta.url,
});

test("buildRuntimeRepairPlan creates a dry-run plan with rollback points", () => {
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

  const result = buildRuntimeRepairPlan({
    runtimeId: " runtime-1 ",
    classification: classification.classification,
    allowedStepKinds: ["restart-surface"],
  });

  assert.equal(runtimeRepairPlanBuilderDescriptor.unsafeSideEffects, false);
  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("expected repair plan building to succeed");
  }

  assert.equal(result.plan.runtimeId, "runtime-1");
  assert.equal(result.plan.faultId, "fault-1");
  assert.equal(result.plan.risk, "medium");
  assert.equal(result.plan.steps[0]?.kind, "restart-surface");
  assert.equal(result.plan.steps[0]?.dryRunOnly, true);
  assert.deepEqual(result.plan.rollbackPoints, ["fault-1:before:restart-surface"]);
  assert.equal(result.plan.audit.unsafeSideEffects, false);
});

test("buildRuntimeRepairPlan marks escalation plans as high risk", () => {
  const classification = classifyRuntimeFault({
    runtimeId: "runtime-1",
    signal: {
      faultId: "fault-unsafe",
      kind: "provider-adapter.misroute",
      providerAdapter: "custom",
      externalSideEffect: true,
    },
  });

  assert.equal(classification.ok, true);
  if (!classification.ok) {
    assert.fail("expected unsafe fault classification to succeed");
  }

  const result = buildRuntimeRepairPlan({
    runtimeId: "runtime-1",
    classification: classification.classification,
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("expected escalation plan building to succeed");
  }

  assert.equal(result.plan.risk, "high");
  assert.equal(result.plan.escalationRequired, true);
  assert.equal(result.plan.approvalRequired, true);
  assert.equal(result.plan.steps[0]?.kind, "escalate");
});

test("buildRuntimeRepairPlan rejects non-repairable and out-of-scope plans", () => {
  const classification = classifyRuntimeFault({
    runtimeId: "runtime-1",
    signal: {
      faultId: "fault-unknown",
      kind: "unmapped",
      retryable: false,
    },
  });

  assert.equal(classification.ok, true);
  if (!classification.ok) {
    assert.fail("expected non-repairable fault classification to succeed");
  }

  const notRepairable = buildRuntimeRepairPlan({
    runtimeId: "runtime-1",
    classification: classification.classification,
  });

  assert.equal(notRepairable.ok, false);
  if (notRepairable.ok) {
    assert.fail("non-repairable faults must not produce plans");
  }
  assert.equal(notRepairable.error.code, "FAULT_NOT_REPAIRABLE");

  const repairable = classifyRuntimeFault({
    runtimeId: "runtime-1",
    signal: { faultId: "fault-module", kind: "module.detached", moduleMounted: false },
  });

  assert.equal(repairable.ok, true);
  if (!repairable.ok) {
    assert.fail("expected repairable module fault classification to succeed");
  }

  const outOfScope = buildRuntimeRepairPlan({
    runtimeId: "runtime-1",
    classification: repairable.classification,
    allowedStepKinds: ["restart-surface"],
  });

  assert.equal(outOfScope.ok, false);
  if (outOfScope.ok) {
    assert.fail("repair step scope violation must be rejected");
  }
  assert.equal(outOfScope.error.code, "REPAIR_SCOPE_DENIED");
  assert.equal(outOfScope.error.boundary, "scope");
});
