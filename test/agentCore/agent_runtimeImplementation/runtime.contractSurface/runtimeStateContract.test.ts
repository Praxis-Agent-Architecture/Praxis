import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import { defineRuntimeStateContract } from "../../../../src/runtimeImplementation/runtime.contractSurface/runtimeStateContract.js";

defineAgentCoreContractTest({
  sourcePath: "src/runtimeImplementation/runtime.contractSurface/runtimeStateContract.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.contractSurface/runtimeStateContract.md",
  testFileUrl: import.meta.url,
});

test("runtimeStateContract returns an immutable runtime state snapshot", () => {
  const result = defineRuntimeStateContract({
    runtimeId: " runtime-1 ",
    phase: "ready",
    revision: 3,
    expectedRevision: 3,
    observedBy: { kind: "runtime-surface", id: " inspection " },
  });

  assert.equal(result.ok, true);
  assert.equal(result.state.runtimeId, "runtime-1");
  assert.equal(result.state.phase, "ready");
  assert.equal(result.state.revision, 3);
  assert.equal(result.state.observedBy?.id, "inspection");
  assert.equal(result.state.mutable, false);
  assert.equal(result.state.unsafeSideEffects, false);
});

test("runtimeStateContract rejects unknown phases", () => {
  const result = defineRuntimeStateContract({
    runtimeId: "runtime-1",
    phase: "provider-direct",
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "INVALID_STATE_PHASE");
  assert.equal(result.error.boundary, "input");
  assert.equal(result.error.stateSafe, true);
});

test("runtimeStateContract rejects stale state revisions", () => {
  const result = defineRuntimeStateContract({
    runtimeId: "runtime-1",
    phase: "invoking",
    revision: 2,
    expectedRevision: 3,
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "STALE_STATE_REVISION");
  assert.equal(result.error.boundary, "runtime-state");
});
