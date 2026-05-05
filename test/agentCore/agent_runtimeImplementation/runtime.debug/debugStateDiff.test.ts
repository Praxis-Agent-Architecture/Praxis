import assert from "node:assert/strict";
import test from "node:test";

import {
  debugStateDiffDescriptor,
  diffDebugState,
} from "../../../../src/agentCore/agent_runtimeImplementation/runtime.debug/debugStateDiff.js";
import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_runtimeImplementation/runtime.debug/debugStateDiff.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.debug/debugStateDiff.md",
  testFileUrl: import.meta.url,
});

test("diffDebugState computes shallow public-safe runtime state changes", () => {
  const result = diffDebugState({
    runtimeId: " runtime-1 ",
    diffId: " diff-1 ",
    caller: { kind: "inspection", id: " inspector " },
    beforeState: {
      phase: "running",
      mountedSurfaces: ["runtime.debug"],
      oldOnly: true,
    },
    afterState: {
      phase: "ready",
      mountedSurfaces: ["runtime.debug"],
      newOnly: true,
    },
  });

  if (!result.ok) {
    assert.fail(result.error.message);
  }

  assert.equal(debugStateDiffDescriptor.unsafeSideEffects, false);
  assert.equal(result.diff.runtimeId, "runtime-1");
  assert.equal(result.diff.route, "runtime.debug.debugStateDiff");
  assert.equal(result.diff.status, "changed");
  assert.equal(result.diff.summary.changed, 1);
  assert.equal(result.diff.summary.added, 1);
  assert.equal(result.diff.summary.removed, 1);
  assert.equal(result.diff.changes.find((change) => change.path === "phase")?.kind, "changed");
  assert.equal(result.diff.changes.find((change) => change.path === "mountedSurfaces")?.kind, "unchanged");
  assert.equal(result.diff.audit.rawStateValuesExposed, false);
});

test("diffDebugState rejects empty input and raw state value exposure", () => {
  const missing = diffDebugState();

  assert.equal(missing.ok, false);
  if (missing.ok) {
    assert.fail("empty state diff input must be rejected");
  }

  assert.equal(missing.error.code, "MISSING_RUNTIME_ID");
  assert.equal(missing.error.boundary, "input");

  const raw = diffDebugState({
    runtimeId: "runtime-1",
    caller: { kind: "test", id: "test" },
    beforeState: { secret: "before" },
    afterState: { secret: "after" },
    exposeValues: true,
  });

  assert.equal(raw.ok, false);
  if (raw.ok) {
    assert.fail("raw state exposure must be blocked");
  }

  assert.equal(raw.error.code, "RAW_STATE_EXPOSURE_BLOCKED");
  assert.equal(raw.error.boundary, "governance");
  assert.equal(raw.error.internalDetailExposed, false);
});
