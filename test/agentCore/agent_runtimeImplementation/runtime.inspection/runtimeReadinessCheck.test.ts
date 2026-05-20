import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  checkRuntimeReadiness,
  runtimeReadinessCheckDescriptor,
} from "../../../../src/runtimeImplementation/runtime.inspection/runtimeReadinessCheck.js";

defineAgentCoreContractTest({
  sourcePath: "src/runtimeImplementation/runtime.inspection/runtimeReadinessCheck.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.inspection/runtimeReadinessCheck.md",
  testFileUrl: import.meta.url,
});

test("checkRuntimeReadiness aggregates surface, module, and invariant signals", () => {
  const result = checkRuntimeReadiness({
    runtimeId: " runtime-1 ",
    surfaces: [{ signalId: "applicationSurface", ready: true }],
    modules: [{ signalId: "tap", ready: true }],
    invariants: [{ signalId: "state.contract", ready: true }],
    requestedScopes: ["inspection:read"],
    allowedScopes: ["inspection:read"],
  });

  assert.equal(runtimeReadinessCheckDescriptor.unsafeSideEffects, false);
  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("expected readiness check to succeed");
  }

  assert.equal(result.readiness.runtimeId, "runtime-1");
  assert.equal(result.readiness.status, "ready");
  assert.equal(result.readiness.ready, true);
  assert.deepEqual(result.readiness.requiredSignals, ["applicationSurface", "tap", "state.contract"]);
  assert.deepEqual(result.readiness.blockingIssues, []);
  assert.equal(result.readiness.unsafeSideEffects, false);
});

test("checkRuntimeReadiness separates blocking and degraded readiness issues", () => {
  const result = checkRuntimeReadiness({
    runtimeId: "runtime-1",
    surfaces: [{ signalId: "officialModuleSurface", ready: false, reason: "surface missing" }],
    modules: [{ signalId: "debug", ready: false, required: false, reason: "debug degraded" }],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("expected blocked readiness check to return a snapshot");
  }

  assert.equal(result.readiness.status, "blocked");
  assert.equal(result.readiness.ready, false);
  assert.deepEqual(result.readiness.blockingIssues.map((issue) => issue.signalId), ["officialModuleSurface"]);
  assert.deepEqual(result.readiness.degradedIssues.map((issue) => issue.signalId), ["debug"]);
});

test("checkRuntimeReadiness rejects empty input and governance failures", () => {
  const empty = checkRuntimeReadiness({ runtimeId: "runtime-1" });

  assert.equal(empty.ok, false);
  if (empty.ok) {
    assert.fail("empty readiness input must be rejected");
  }
  assert.equal(empty.error.code, "EMPTY_READINESS_INPUT");

  const rejected = checkRuntimeReadiness({
    runtimeId: "runtime-1",
    surfaces: [{ signalId: "applicationSurface", ready: true }],
    governance: { accepted: false, reason: "inspection blocked" },
  });

  assert.equal(rejected.ok, false);
  if (rejected.ok) {
    assert.fail("governance rejection must be returned");
  }
  assert.equal(rejected.error.code, "GOVERNANCE_REJECTED");
  assert.equal(rejected.error.message, "inspection blocked");

  const denied = checkRuntimeReadiness({
    runtimeId: "runtime-1",
    surfaces: [{ signalId: "applicationSurface", ready: true }],
    requestedScopes: ["inspection:private"],
    allowedScopes: ["inspection:read"],
  });

  assert.equal(denied.ok, false);
  if (denied.ok) {
    assert.fail("scope denial must be rejected");
  }
  assert.equal(denied.error.code, "SCOPE_DENIED");
});
