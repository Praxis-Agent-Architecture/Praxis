import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  adaptationSignalCollectorDescriptor,
  collectAdaptationSignals,
} from "../../../../src/agentCore_runtimeImplementation/runtime.adaptiveRuntime/adaptationSignalCollector.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_runtimeImplementation/runtime.adaptiveRuntime/adaptationSignalCollector.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.adaptiveRuntime/adaptationSignalCollector.md",
  testFileUrl: import.meta.url,
});

test("collectAdaptationSignals builds a dry-run runtime signal snapshot", () => {
  const result = collectAdaptationSignals({
    runtimeId: " runtime-1 ",
    caller: { kind: "official-module", id: " tap ", moduleId: "tap" },
    signals: [
      {
        kind: "latency",
        source: "modelInvocationRuntime",
        value: 820,
        weight: 2,
        tags: [" model ", "model"],
      },
      {
        signalId: "quality-1",
        kind: "quality",
        source: "inspection",
        value: "degraded",
      },
    ],
    allowedSignalKinds: ["latency", "quality"],
  });

  assert.equal(adaptationSignalCollectorDescriptor.unsafeSideEffects, false);
  if (!result.ok) {
    assert.fail("expected adaptation signal collection to succeed");
  }

  assert.equal(result.ok, true);
  assert.equal(result.snapshot.runtimeId, "runtime-1");
  assert.equal(result.snapshot.route, "runtime.adaptiveRuntime.adaptationSignalCollector");
  assert.deepEqual(result.snapshot.signalKinds, ["latency", "quality"]);
  assert.deepEqual(result.snapshot.signalSources, ["modelInvocationRuntime", "inspection"]);
  assert.deepEqual(result.snapshot.signals[0]?.tags, ["model"]);
  assert.equal(result.snapshot.audit.dryRun, true);
  assert.equal(result.snapshot.audit.unsafeSideEffects, false);
});

test("collectAdaptationSignals classifies missing input and governance failures", () => {
  const missing = collectAdaptationSignals();
  assert.equal(missing.ok, false);
  if (missing.ok) {
    assert.fail("empty input must be rejected");
  }

  assert.equal(missing.error.code, "MISSING_RUNTIME_ID");
  assert.equal(missing.error.boundary, "input");
  assert.equal(missing.error.safeForRuntimeInspection, true);

  const rejected = collectAdaptationSignals({
    runtimeId: "runtime-1",
    caller: { kind: "runtime-surface", id: "adaptiveRuntime" },
    signals: [{ kind: "latency", source: "inspection" }],
    governance: { accepted: false, reason: "scope pending" },
  });

  assert.equal(rejected.ok, false);
  if (rejected.ok) {
    assert.fail("governance rejection must be returned as an error");
  }

  assert.equal(rejected.error.code, "GOVERNANCE_REJECTED");
  assert.equal(rejected.error.boundary, "governance");
  assert.equal(rejected.error.message, "scope pending");
});

test("collectAdaptationSignals rejects signals outside the allowed runtime scope", () => {
  const result = collectAdaptationSignals({
    runtimeId: "runtime-1",
    caller: { kind: "application", id: "app-1" },
    signals: [{ kind: "provider-health", source: "modelAdapter" }],
    allowedSignalKinds: ["latency"],
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("signal kind scope escape must be rejected");
  }

  assert.equal(result.error.code, "SIGNAL_SCOPE_DENIED");
  assert.equal(result.error.boundary, "scope");
  assert.deepEqual(result.events, ["runtime.adaptiveRuntime.signalCollector.rejected"]);
});
