import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import { planDebugReplayHook } from "../../../../src/agentCore_runtimeImplementation/runtime.debug/debugReplayHook.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_runtimeImplementation/runtime.debug/debugReplayHook.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.debug/debugReplayHook.md",
  testFileUrl: import.meta.url,
});

test("debugReplayHook creates a guarded dry-run replay plan", () => {
  const result = planDebugReplayHook({
    runtimeId: " runtime:alpha ",
    caller: { kind: "debug", id: " debugger " },
    replayId: " replay-1 ",
    frames: [
      {
        frameId: " frame-1 ",
        eventType: " runtime.input.received ",
        payloadSummary: "user asked for a debug snapshot",
      },
      {
        frameId: "frame-2",
        eventType: "runtime.output.exposed",
        dependsOnFrameIds: [" frame-1 "],
      },
    ],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.plan.runtimeId, "runtime:alpha");
  assert.equal(result.plan.replayId, "replay-1");
  assert.equal(result.plan.dispatch, "dry-run");
  assert.equal(result.plan.sideEffectPolicy, "blocked");
  assert.equal(result.plan.frames[0]?.frameId, "frame-1");
  assert.deepEqual(result.plan.frames[1]?.dependsOnFrameIds, ["frame-1"]);
  assert.equal(result.plan.unsafeSideEffects, false);
});

test("debugReplayHook rejects unsafe replay execution requests", () => {
  const result = planDebugReplayHook({
    runtimeId: "runtime:alpha",
    caller: { kind: "application", id: "app" },
    replayId: "replay-1",
    mode: "execute",
    frames: [{ frameId: "frame-1", eventType: "runtime.input.received" }],
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.equal(result.error.code, "UNSAFE_REPLAY_MODE");
  assert.equal(result.error.boundary, "replay");
});

test("debugReplayHook rejects incomplete replay frames", () => {
  const result = planDebugReplayHook({
    runtimeId: "runtime:alpha",
    caller: { kind: "inspection", id: "inspector" },
    replayId: "replay-1",
    frames: [{ frameId: " ", eventType: "runtime.input.received" }],
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.equal(result.error.code, "REPLAY_FRAME_INVALID");
  assert.equal(result.error.publicSafe, true);
});
