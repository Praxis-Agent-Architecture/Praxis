import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  planViewVideo,
  viewVideoDescriptor,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/omniBase/videoTransformer/omni.viewVideo.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/omniBase/videoTransformer/omni.viewVideo.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/omniBase/videoTransformer/omni.viewVideo.md",
  testFileUrl: import.meta.url,
});

test("planViewVideo creates a dry-run video inspection envelope", () => {
  const result = planViewVideo({
    context: {
      runtimeId: "runtime-1",
      invocationId: "view-video-1",
      requestedScopes: ["tool:omni:video"],
      allowedScopes: ["tool:omni:video"],
    },
    sourceVideoUri: "file:///workspace/demo.mp4",
    mode: "frame-sample",
    startMs: 1_000,
    endMs: 5_000,
    frameSampleCount: 8,
  });

  assert.equal(result.ok, true);
  assert.equal(viewVideoDescriptor.defaultDispatch, "dry-run");
  if (!result.ok) {
    return;
  }

  assert.equal(result.plan.toolId, "omni.viewVideo");
  assert.equal(result.plan.mode, "frame-sample");
  assert.deepEqual(result.plan.timeRangeMs, { start: 1_000, end: 5_000 });
  assert.equal(result.plan.frameSampleCount, 8);
  assert.equal(result.plan.previewEnvelope.metadataRead, false);
  assert.equal(result.plan.previewEnvelope.framesDecoded, 0);
  assert.equal(result.plan.unsafeSideEffects, false);
  assert.deepEqual(result.plan.acceptedScopes, ["tool:omni:video"]);
});

test("planViewVideo rejects missing context, invalid ranges, and real execution", () => {
  const missing = planViewVideo();
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.error.code, "MISSING_RUNTIME_ID");
    assert.equal(missing.error.boundary, "input");
  }

  const invalidRange = planViewVideo({
    context: { runtimeId: "runtime-1" },
    sourceVideoUri: "file:///workspace/demo.mp4",
    startMs: 5_000,
    endMs: 1_000,
  });
  assert.equal(invalidRange.ok, false);
  if (!invalidRange.ok) {
    assert.equal(invalidRange.error.code, "INVALID_TIME_RANGE");
  }

  const real = planViewVideo({
    context: { runtimeId: "runtime-1", dryRun: false },
    sourceVideoUri: "file:///workspace/demo.mp4",
  });
  assert.equal(real.ok, false);
  if (!real.ok) {
    assert.equal(real.error.code, "REAL_SIDE_EFFECT_NOT_ALLOWED");
    assert.equal(real.error.boundary, "contract");
  }
});
