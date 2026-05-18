import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyRuntimeFault,
  runtimeFaultClassifierDescriptor,
} from "../../../../src/agentCore/agent_runtimeImplementation/runtime.selfRepair/faultClassifier.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_runtimeImplementation/runtime.selfRepair/faultClassifier.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.selfRepair/faultClassifier.md",
  testFileUrl: import.meta.url,
});

test("classifyRuntimeFault classifies repairable runtime faults without side effects", () => {
  const result = classifyRuntimeFault({
    runtimeId: " runtime-1 ",
    signal: {
      kind: "runtime-state.stale-session",
      source: "runtime.inspection",
      message: "session state is stale",
      runtimeReady: false,
      retryable: true,
      tags: [" inspection ", "self-repair"],
    },
    observedAt: "2026-04-23T01:30:00.000Z",
  });

  assert.equal(runtimeFaultClassifierDescriptor.unsafeSideEffects, false);
  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("expected runtime fault classification to succeed");
  }

  assert.equal(result.classification.runtimeId, "runtime-1");
  assert.equal(result.classification.category, "runtime-state");
  assert.equal(result.classification.repairability, "auto-repairable");
  assert.equal(result.classification.recommendedNextStep, "build-plan");
  assert.deepEqual(result.classification.evidenceTags, ["inspection", "self-repair"]);
  assert.equal(result.classification.unsafeSideEffects, false);
});

test("classifyRuntimeFault marks governance and unsafe faults as non-auto repairable", () => {
  const governance = classifyRuntimeFault({
    runtimeId: "runtime-1",
    signal: {
      kind: "governance.denied",
      governanceRejected: true,
    },
  });

  assert.equal(governance.ok, true);
  if (!governance.ok) {
    assert.fail("expected governance fault classification to succeed");
  }
  assert.equal(governance.classification.category, "governance");
  assert.equal(governance.classification.repairability, "requires-escalation");
  assert.equal(governance.classification.recommendedNextStep, "escalate");

  const unknown = classifyRuntimeFault({
    runtimeId: "runtime-1",
    signal: {
      kind: "unmapped-signal",
      retryable: false,
    },
  });

  assert.equal(unknown.ok, true);
  if (!unknown.ok) {
    assert.fail("expected unknown fault classification to succeed");
  }
  assert.equal(unknown.classification.category, "unknown");
  assert.equal(unknown.classification.repairability, "not-repairable");
  assert.equal(unknown.classification.recoverable, false);
});

test("classifyRuntimeFault rejects invalid input and scope violations", () => {
  const missing = classifyRuntimeFault();

  assert.equal(missing.ok, false);
  if (missing.ok) {
    assert.fail("empty classification input must be rejected");
  }
  assert.equal(missing.error.code, "MISSING_RUNTIME_ID");
  assert.equal(missing.error.boundary, "input");
  assert.equal(missing.error.internalDetailExposed, false);

  const scoped = classifyRuntimeFault({
    runtimeId: "runtime-1",
    signal: { kind: "provider.timeout" },
    allowedFaultKinds: ["runtime-state.stale-session"],
  });

  assert.equal(scoped.ok, false);
  if (scoped.ok) {
    assert.fail("fault scope violation must be rejected");
  }
  assert.equal(scoped.error.code, "FAULT_SCOPE_DENIED");
  assert.equal(scoped.error.boundary, "scope");
});
