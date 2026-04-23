import { defineAgentCoreContractTest } from "../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  checkRuntimeHealth,
  runtimeHealthCheckDescriptor,
} from "../../../src/agentCore/agent_runtimeImplementation/runtimeHealthCheck.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_runtimeImplementation/runtimeHealthCheck.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_runtimeImplementation/runtimeHealthCheck.md",
  testFileUrl: import.meta.url,
});

test("runtimeHealthCheck aggregates readonly runtime health signals", () => {
  const result = checkRuntimeHealth({
    runtimeId: " runtime:alpha ",
    surfaces: [{ signalId: " applicationSurface ", healthy: true }],
    modules: [{ signalId: "tap", healthy: true }],
    dependencies: [{ signalId: "governancePlane", healthy: true }],
    requestedScopes: ["health:read"],
    allowedScopes: ["health:read"],
    checkedAt: "2026-04-23T00:00:00.000Z",
  });

  assert.equal(runtimeHealthCheckDescriptor.unsafeSideEffects, false);
  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("expected health check to succeed");
  }

  assert.equal(result.health.runtimeId, "runtime:alpha");
  assert.equal(result.health.status, "healthy");
  assert.equal(result.health.healthy, true);
  assert.deepEqual(result.health.checkedSurfaces, ["applicationSurface"]);
  assert.deepEqual(result.health.checkedModules, ["tap"]);
  assert.deepEqual(result.health.checkedDependencies, ["governancePlane"]);
  assert.deepEqual(result.health.acceptedScopes, ["health:read"]);
  assert.equal(result.health.dryRun, true);
  assert.equal(result.health.auditOnly, true);
  assert.equal(result.health.unsafeSideEffects, false);
});

test("runtimeHealthCheck classifies degraded and unhealthy signals", () => {
  const degraded = checkRuntimeHealth({
    runtimeId: "runtime:alpha",
    surfaces: [{ signalId: "debug", healthy: false, required: false, message: "debug probe delayed" }],
  });

  assert.equal(degraded.ok, true);
  if (!degraded.ok) {
    assert.fail("expected degraded health snapshot");
  }
  assert.equal(degraded.health.status, "degraded");
  assert.equal(degraded.health.healthy, false);
  assert.equal(degraded.health.issues[0]?.severity, "warning");
  assert.equal(degraded.health.issues[0]?.message, "debug probe delayed");

  const unhealthy = checkRuntimeHealth({
    runtimeId: "runtime:alpha",
    modules: [{ signalId: "officialModuleSurface", healthy: false }],
  });

  assert.equal(unhealthy.ok, true);
  if (!unhealthy.ok) {
    assert.fail("expected unhealthy health snapshot");
  }
  assert.equal(unhealthy.health.status, "unhealthy");
  assert.equal(unhealthy.health.issues[0]?.severity, "critical");
  assert.equal(unhealthy.health.issues[0]?.required, true);
});

test("runtimeHealthCheck rejects unsafe, empty, governance, and scope failures", () => {
  const missingRuntime = checkRuntimeHealth();
  assert.equal(missingRuntime.ok, false);
  if (!missingRuntime.ok) {
    assert.equal(missingRuntime.error.code, "MISSING_RUNTIME_ID");
    assert.equal(missingRuntime.error.boundary, "input");
  }

  const unsafe = checkRuntimeHealth({
    runtimeId: "runtime:alpha",
    dryRun: false,
    surfaces: [{ signalId: "applicationSurface", healthy: true }],
  });
  assert.equal(unsafe.ok, false);
  if (!unsafe.ok) {
    assert.equal(unsafe.error.code, "UNSAFE_HEALTH_CHECK_REJECTED");
    assert.equal(unsafe.error.internalDetailExposed, false);
  }

  const empty = checkRuntimeHealth({ runtimeId: "runtime:alpha" });
  assert.equal(empty.ok, false);
  if (!empty.ok) {
    assert.equal(empty.error.code, "EMPTY_HEALTH_INPUT");
  }

  const governanceDenied = checkRuntimeHealth({
    runtimeId: "runtime:alpha",
    surfaces: [{ signalId: "applicationSurface", healthy: true }],
    governance: { accepted: false, reason: "health scope denied" },
  });
  assert.equal(governanceDenied.ok, false);
  if (!governanceDenied.ok) {
    assert.equal(governanceDenied.error.code, "GOVERNANCE_REJECTED");
    assert.equal(governanceDenied.error.message, "health scope denied");
  }

  const scopeDenied = checkRuntimeHealth({
    runtimeId: "runtime:alpha",
    surfaces: [{ signalId: "applicationSurface", healthy: true }],
    requestedScopes: ["health:private"],
    allowedScopes: ["health:read"],
  });
  assert.equal(scopeDenied.ok, false);
  if (!scopeDenied.ok) {
    assert.equal(scopeDenied.error.code, "SCOPE_DENIED");
    assert.equal(scopeDenied.error.boundary, "scope");
  }
});
