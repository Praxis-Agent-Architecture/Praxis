import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import { bridgeExecEngineState } from "../../../../src/agentCore_runtimeImplementation/runtime.execEngine/execEngineStateBridge.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_runtimeImplementation/runtime.execEngine/execEngineStateBridge.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.execEngine/execEngineStateBridge.md",
  testFileUrl: import.meta.url,
});

test("execEngineStateBridge exposes readonly execution state snapshots", () => {
  const result = bridgeExecEngineState({
    runtimeId: " runtime-1 ",
    caller: { kind: "runtime-surface", id: "inspection" },
    state: {
      stateId: " exec-state-1 ",
      phase: "running",
      cursor: " cursor:42 ",
      revision: 7,
      updatedAt: "2026-04-22T15:00:00.000Z",
      metadata: { checkpointRef: "checkpoint:1" },
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.snapshot.bridgeId, "runtime-1:state:exec-state-1");
  assert.equal(result.snapshot.route, "runtime.execEngine.stateBridge");
  assert.equal(result.snapshot.phase, "running");
  assert.equal(result.snapshot.cursor, "cursor:42");
  assert.equal(result.snapshot.revision, 7);
  assert.equal(result.snapshot.readonly, true);
  assert.equal(result.snapshot.unsafeSideEffects, false);
});

test("execEngineStateBridge keeps unknown state phases classified", () => {
  const result = bridgeExecEngineState({
    runtimeId: "runtime-1",
    caller: { kind: "runtime-surface", id: "debug" },
    state: {
      stateId: "exec-state-1",
      phase: "provider-payload-ready",
    },
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.equal(result.error.code, "UNKNOWN_PHASE");
  assert.equal(result.error.boundary, "state");
  assert.equal(result.error.publicSafe, true);
});
