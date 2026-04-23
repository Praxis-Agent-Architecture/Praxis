import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  adaptationDecisionSurfaceDescriptor,
  decideAdaptationSurface,
} from "../../../../src/agentCore/agent_runtimeImplementation/runtime.adaptiveRuntime/adaptationDecisionSurface.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_runtimeImplementation/runtime.adaptiveRuntime/adaptationDecisionSurface.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_runtimeImplementation/runtime.adaptiveRuntime/adaptationDecisionSurface.md",
  testFileUrl: import.meta.url,
});

test("decideAdaptationSurface chooses the highest-priority enabled policy from collected signals", () => {
  const result = decideAdaptationSurface({
    runtimeId: " runtime-1 ",
    decisionId: " decision-1 ",
    caller: { kind: "runtime-surface", id: "adaptiveRuntime" },
    policies: [
      { policyId: "observe-latency", action: "observe", priority: 1 },
      { policyId: "fallback-provider", action: "provider-fallback", priority: 4 },
      { policyId: "disabled-rebalance", action: "module-rebalance", priority: 9, enabled: false },
    ],
    signals: [
      { signalId: "latency-1", kind: "latency", weight: 2 },
      { signalId: "health-1", kind: "provider-health", weight: 3 },
    ],
  });

  assert.equal(adaptationDecisionSurfaceDescriptor.unsafeSideEffects, false);
  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("adaptation decision surface should accept valid input");
  }

  assert.equal(result.decision.runtimeId, "runtime-1");
  assert.equal(result.decision.decisionId, "decision-1");
  assert.equal(result.decision.route, "runtime.adaptiveRuntime.adaptationDecisionSurface");
  assert.equal(result.decision.selectedPolicyId, "fallback-provider");
  assert.equal(result.decision.action, "provider-fallback");
  assert.deepEqual(result.decision.consideredPolicyIds, ["observe-latency", "fallback-provider", "disabled-rebalance"]);
  assert.deepEqual(result.decision.signalIds, ["latency-1", "health-1"]);
  assert.equal(result.decision.mode, "dry-run-decision");
  assert.equal(result.decision.unsafeSideEffects, false);
});

test("decideAdaptationSurface keeps missing input and contract rejection classified", () => {
  const missing = decideAdaptationSurface();
  assert.equal(missing.ok, false);
  if (missing.ok) {
    assert.fail("empty input must be rejected");
  }

  assert.equal(missing.error.code, "MISSING_RUNTIME_ID");
  assert.equal(missing.error.boundary, "input");
  assert.equal(missing.error.safeForRuntimeInspection, true);

  const rejected = decideAdaptationSurface({
    runtimeId: "runtime-1",
    decisionId: "decision-1",
    caller: { kind: "application", id: "app-1" },
    policies: [{ policyId: "observe", action: "observe" }],
    signals: [{ signalId: "latency-1" }],
    contract: { accepted: false, reason: "policy contract missing" },
  });

  assert.equal(rejected.ok, false);
  if (rejected.ok) {
    assert.fail("contract rejection must be returned as an error");
  }

  assert.equal(rejected.error.code, "CONTRACT_REJECTED");
  assert.equal(rejected.error.boundary, "contract");
  assert.equal(rejected.error.message, "policy contract missing");
});

test("decideAdaptationSurface rejects policy and signal gaps before exposing a decision", () => {
  const noPolicy = decideAdaptationSurface({
    runtimeId: "runtime-1",
    decisionId: "decision-1",
    caller: { kind: "test", id: "test" },
    policies: [{ policyId: "disabled", action: "observe", enabled: false }],
    signals: [{ signalId: "latency-1" }],
  });

  assert.equal(noPolicy.ok, false);
  if (noPolicy.ok) {
    assert.fail("disabled-only policies must be rejected");
  }

  assert.equal(noPolicy.error.code, "NO_ENABLED_POLICY");
  assert.equal(noPolicy.error.boundary, "policy");

  const missingSignalId = decideAdaptationSurface({
    runtimeId: "runtime-1",
    decisionId: "decision-1",
    caller: { kind: "test", id: "test" },
    policies: [{ policyId: "observe", action: "observe" }],
    signals: [{ kind: "latency" }],
  });

  assert.equal(missingSignalId.ok, false);
  if (missingSignalId.ok) {
    assert.fail("missing signal ids must be rejected");
  }

  assert.equal(missingSignalId.error.code, "MISSING_SIGNAL_ID");
  assert.equal(missingSignalId.error.boundary, "signal");
});
