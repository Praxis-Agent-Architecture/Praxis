import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  runSelfRepairRuntime,
  selfRepairRuntimeDescriptor,
} from "../../../../src/agentCore_runtimeImplementation/runtime.selfRepair/selfRepairRuntime.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_runtimeImplementation/runtime.selfRepair/selfRepairRuntime.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.selfRepair/selfRepairRuntime.md",
  testFileUrl: import.meta.url,
});

test("runSelfRepairRuntime produces a dry-run repair plan through the governed runtime surface", () => {
  const result = runSelfRepairRuntime({
    runtimeId: " runtime-1 ",
    runtimeReady: true,
    signal: {
      faultId: "fault-runtime",
      kind: "runtime-state.stale-session",
      source: "runtime.inspection",
      runtimeReady: false,
      retryable: true,
    },
    allowedStepKinds: ["restart-surface"],
  });

  assert.equal(selfRepairRuntimeDescriptor.unsafeSideEffects, false);
  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("expected self repair runtime to produce a dry-run plan");
  }

  assert.equal(result.outcome.runtimeId, "runtime-1");
  assert.equal(result.outcome.status, "plan-ready");
  assert.equal(result.outcome.classification.category, "runtime-state");
  assert.equal(result.outcome.plan?.steps[0]?.dryRunOnly, true);
  assert.equal(result.outcome.actionDecision?.status, "allow");
  assert.equal(result.outcome.actionDecision?.executionPlanned, false);
  assert.equal(result.outcome.audit.unsafeSideEffects, false);
  assert.deepEqual(result.outcome.audit.stages, ["fault-classified", "repair-plan-built", "action-gated"]);
});

test("runSelfRepairRuntime holds approval-required repair steps without executing them", () => {
  const result = runSelfRepairRuntime({
    runtimeId: "runtime-1",
    runtimeReady: true,
    signal: {
      faultId: "fault-contract",
      kind: "contract.result-shape",
      contractRejected: true,
      severity: "degraded",
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("expected approval-required self repair path");
  }

  assert.equal(result.outcome.status, "approval-required");
  assert.equal(result.outcome.nextStep, "hold-for-approval");
  assert.equal(result.outcome.actionDecision?.status, "requires-approval");
  assert.equal(result.outcome.actionDecision?.dryRunOnly, true);
  assert.equal(result.outcome.escalation, undefined);
});

test("runSelfRepairRuntime escalates non-repairable or high-risk faults as public-safe envelopes", () => {
  const nonRepairable = runSelfRepairRuntime({
    runtimeId: "runtime-1",
    runtimeReady: true,
    signal: {
      faultId: "fault-unknown",
      kind: "unknown.signal",
      retryable: false,
    },
  });

  assert.equal(nonRepairable.ok, true);
  if (!nonRepairable.ok) {
    assert.fail("expected non-repairable fault to become an escalation envelope");
  }

  assert.equal(nonRepairable.outcome.status, "escalated");
  assert.equal(nonRepairable.outcome.escalation?.reason, "not-repairable");
  assert.equal(nonRepairable.outcome.escalation?.audit.notificationSent, false);
  assert.equal(nonRepairable.outcome.plan, undefined);

  const highRisk = runSelfRepairRuntime({
    runtimeId: "runtime-1",
    runtimeReady: true,
    signal: {
      faultId: "fault-provider",
      kind: "provider-adapter.misroute",
      providerAdapter: "custom",
      externalSideEffect: true,
    },
  });

  assert.equal(highRisk.ok, true);
  if (!highRisk.ok) {
    assert.fail("expected high-risk fault to be escalated");
  }

  assert.equal(highRisk.outcome.status, "escalated");
  assert.equal(highRisk.outcome.escalation?.reason, "high-risk");
  assert.equal(highRisk.outcome.plan?.risk, "high");
  assert.equal(highRisk.outcome.audit.unsafeSideEffects, false);
});

test("runSelfRepairRuntime rejects invalid input and governance failures with stable boundaries", () => {
  const missing = runSelfRepairRuntime();

  assert.equal(missing.ok, false);
  if (missing.ok) {
    assert.fail("empty self repair request must be rejected");
  }
  assert.equal(missing.error.code, "MISSING_RUNTIME_ID");
  assert.equal(missing.error.boundary, "input");
  assert.equal(missing.error.internalDetailExposed, false);

  const governance = runSelfRepairRuntime({
    runtimeId: "runtime-1",
    signal: { kind: "runtime-state.stale-session", retryable: true },
    governance: { accepted: false, reason: "self repair is disabled for this runtime" },
  });

  assert.equal(governance.ok, false);
  if (governance.ok) {
    assert.fail("governance rejection must stop self repair runtime");
  }
  assert.equal(governance.error.code, "GOVERNANCE_REJECTED");
  assert.equal(governance.error.boundary, "governance");
  assert.equal(governance.error.message, "self repair is disabled for this runtime");
});
