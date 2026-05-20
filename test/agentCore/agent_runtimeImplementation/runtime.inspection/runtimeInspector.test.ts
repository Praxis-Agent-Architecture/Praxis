import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { inspectRuntime } from "../../../../src/agentCore/agent_runtimeImplementation/runtime.inspection/runtimeInspector.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_runtimeImplementation/runtime.inspection/runtimeInspector.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.inspection/runtimeInspector.md",
  testFileUrl: import.meta.url,
});

test("runtimeInspector produces a stable inspection snapshot without unsafe side effects", () => {
  const result = inspectRuntime({
    runtimeId: " runtime:alpha ",
    audience: "inspection",
    surfaces: {
      "runtime.contractSurface": true,
      "runtime.governancePlane": true,
    },
    modules: [{ signalId: "cmp", boundary: "module", ready: true }],
    invariants: [
      {
        signalId: "runtime-governed",
        boundary: "invariant",
        ready: false,
      },
    ],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.snapshot.runtimeId, "runtime:alpha");
  assert.equal(result.snapshot.status, "blocked");
  assert.equal(result.snapshot.unsafeSideEffects, false);
  assert.deepEqual(result.snapshot.checkedSurfaces, ["runtime.contractSurface", "runtime.governancePlane"]);
  assert.deepEqual(result.snapshot.checkedModules, ["cmp"]);
  assert.deepEqual(result.snapshot.checkedInvariants, ["runtime-governed"]);
  assert.equal(result.snapshot.findings[0]?.boundary, "invariant");
});

test("runtimeInspector rejects missing runtime, not-ready runtime, and governance denial", () => {
  const missing = inspectRuntime();
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.error.code, "MISSING_RUNTIME_ID");
    assert.equal(missing.error.boundary, "input");
  }

  const notReady = inspectRuntime({ runtimeId: "runtime:alpha", runtimeReady: false });
  assert.equal(notReady.ok, false);
  if (!notReady.ok) {
    assert.equal(notReady.error.code, "RUNTIME_NOT_READY");
    assert.equal(notReady.error.boundary, "runtime-state");
  }

  const denied = inspectRuntime({
    runtimeId: "runtime:alpha",
    governance: { accepted: false, reason: "inspection scope denied" },
  });
  assert.equal(denied.ok, false);
  if (!denied.ok) {
    assert.equal(denied.error.code, "GOVERNANCE_REJECTED");
    assert.equal(denied.error.boundary, "governance");
    assert.equal(denied.error.internalDetailExposed, false);
  }
});
