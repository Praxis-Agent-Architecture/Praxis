import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { classifyRuntimeFault } from "../../../../src/agentCore_runtimeImplementation/runtime.selfRepair/faultClassifier.js";
import {
  createRepairEscalation,
  runtimeRepairEscalationPortDescriptor,
} from "../../../../src/agentCore_runtimeImplementation/runtime.selfRepair/repairEscalationPort.js";
import { buildRuntimeRepairPlan } from "../../../../src/agentCore_runtimeImplementation/runtime.selfRepair/repairPlanBuilder.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_runtimeImplementation/runtime.selfRepair/repairEscalationPort.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.selfRepair/repairEscalationPort.md",
  testFileUrl: import.meta.url,
});

test("createRepairEscalation exposes dry-run escalation envelopes", () => {
  const classification = classifyRuntimeFault({
    runtimeId: "runtime-1",
    signal: {
      faultId: "fault-1",
      kind: "provider-adapter.misroute",
      providerAdapter: "custom",
      externalSideEffect: true,
    },
  });

  assert.equal(classification.ok, true);
  if (!classification.ok) {
    assert.fail("expected unsafe fault classification to succeed");
  }

  const plan = buildRuntimeRepairPlan({
    runtimeId: "runtime-1",
    classification: classification.classification,
  });

  assert.equal(plan.ok, true);
  if (!plan.ok) {
    assert.fail("expected repair plan building to succeed");
  }

  const result = createRepairEscalation({
    runtimeId: " runtime-1 ",
    classification: classification.classification,
    plan: plan.plan,
    reason: "high-risk",
    caller: { kind: "official-module", id: " tap ", moduleId: " tap " },
    targetLevel: "operator-review",
    allowedLevels: ["operator-review"],
  });

  assert.equal(runtimeRepairEscalationPortDescriptor.unsafeSideEffects, false);
  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("expected repair escalation creation to succeed");
  }

  assert.equal(result.escalation.runtimeId, "runtime-1");
  assert.equal(result.escalation.faultId, "fault-1");
  assert.equal(result.escalation.planId, plan.plan.planId);
  assert.equal(result.escalation.reason, "high-risk");
  assert.equal(result.escalation.targetLevel, "operator-review");
  assert.equal(result.escalation.recommendedAction, "manual-review");
  assert.equal(result.escalation.caller?.id, "tap");
  assert.equal(result.escalation.audit.notificationSent, false);
  assert.equal(result.escalation.audit.unsafeSideEffects, false);
});

test("createRepairEscalation picks governance and non-repairable defaults", () => {
  const classification = classifyRuntimeFault({
    runtimeId: "runtime-1",
    signal: {
      faultId: "fault-governance",
      kind: "governance.denied",
      governanceRejected: true,
    },
  });

  assert.equal(classification.ok, true);
  if (!classification.ok) {
    assert.fail("expected governance fault classification to succeed");
  }

  const governance = createRepairEscalation({
    runtimeId: "runtime-1",
    classification: classification.classification,
    reason: "governance-rejected",
  });

  assert.equal(governance.ok, true);
  if (!governance.ok) {
    assert.fail("expected governance escalation creation to succeed");
  }
  assert.equal(governance.escalation.targetLevel, "governance-board");
  assert.equal(governance.escalation.recommendedAction, "open-governance-case");

  const observeOnly = createRepairEscalation({
    runtimeId: "runtime-1",
    classification: classification.classification,
    reason: "not-repairable",
  });

  assert.equal(observeOnly.ok, true);
  if (!observeOnly.ok) {
    assert.fail("expected observe-only escalation creation to succeed");
  }
  assert.equal(observeOnly.escalation.targetLevel, "module-owner");
  assert.equal(observeOnly.escalation.recommendedAction, "reject-and-observe");
});

test("createRepairEscalation rejects invalid input and escalation scope violations", () => {
  const missing = createRepairEscalation();

  assert.equal(missing.ok, false);
  if (missing.ok) {
    assert.fail("empty escalation input must be rejected");
  }
  assert.equal(missing.error.code, "MISSING_RUNTIME_ID");

  const classification = classifyRuntimeFault({
    runtimeId: "runtime-1",
    signal: { faultId: "fault-1", kind: "runtime-state.stale-session", runtimeReady: false },
  });

  assert.equal(classification.ok, true);
  if (!classification.ok) {
    assert.fail("expected runtime fault classification to succeed");
  }

  const scoped = createRepairEscalation({
    runtimeId: "runtime-1",
    classification: classification.classification,
    reason: "approval-required",
    targetLevel: "operator-review",
    allowedLevels: ["module-owner"],
  });

  assert.equal(scoped.ok, false);
  if (scoped.ok) {
    assert.fail("escalation scope violation must be rejected");
  }
  assert.equal(scoped.error.code, "ESCALATION_SCOPE_DENIED");
  assert.equal(scoped.error.boundary, "scope");
});
