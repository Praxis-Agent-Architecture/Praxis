import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  probeRuntimeInvariants,
  runtimeInvariantProbeDescriptor,
} from "../../../../src/agentCore/agent_runtimeImplementation/runtime.inspection/runtimeInvariantProbe.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_runtimeImplementation/runtime.inspection/runtimeInvariantProbe.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.inspection/runtimeInvariantProbe.md",
  testFileUrl: import.meta.url,
});

test("probeRuntimeInvariants classifies passed and warning invariant observations", () => {
  const result = probeRuntimeInvariants({
    runtimeId: " runtime-1 ",
    probeId: "probe-1",
    observations: [
      { invariantId: "state.contract", description: "state contract is visible", passed: true },
      {
        invariantId: "surface.debug",
        description: "debug surface is degraded but observable",
        passed: false,
        severity: "warning",
        evidenceRef: "trace:debug",
      },
    ],
    requestedScopes: ["inspection:read"],
    allowedScopes: ["inspection:read"],
    observedAt: "2026-04-23T00:00:00.000Z",
  });

  assert.equal(runtimeInvariantProbeDescriptor.unsafeSideEffects, false);
  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("expected invariant probe to succeed");
  }

  assert.equal(result.snapshot.runtimeId, "runtime-1");
  assert.equal(result.snapshot.status, "warning");
  assert.deepEqual(result.snapshot.failedInvariantIds, []);
  assert.deepEqual(result.snapshot.warningInvariantIds, ["surface.debug"]);
  assert.equal(result.snapshot.findings[1]?.evidenceRef, "trace:debug");
  assert.equal(result.snapshot.unsafeSideEffects, false);
});

test("probeRuntimeInvariants rejects missing input, empty observations, and denied scopes", () => {
  const missing = probeRuntimeInvariants();

  assert.equal(missing.ok, false);
  if (missing.ok) {
    assert.fail("missing runtimeId must be rejected");
  }
  assert.equal(missing.error.code, "MISSING_RUNTIME_ID");
  assert.equal(missing.error.boundary, "input");

  const empty = probeRuntimeInvariants({
    runtimeId: "runtime-1",
    observations: [],
  });

  assert.equal(empty.ok, false);
  if (empty.ok) {
    assert.fail("empty invariant set must be rejected");
  }
  assert.equal(empty.error.code, "EMPTY_INVARIANT_SET");

  const denied = probeRuntimeInvariants({
    runtimeId: "runtime-1",
    observations: [{ invariantId: "state", passed: true }],
    requestedScopes: ["inspection:private"],
    allowedScopes: ["inspection:read"],
  });

  assert.equal(denied.ok, false);
  if (denied.ok) {
    assert.fail("scope denial must be rejected");
  }
  assert.equal(denied.error.code, "SCOPE_DENIED");
  assert.equal(denied.error.safeForRuntimeInspection, true);
});
