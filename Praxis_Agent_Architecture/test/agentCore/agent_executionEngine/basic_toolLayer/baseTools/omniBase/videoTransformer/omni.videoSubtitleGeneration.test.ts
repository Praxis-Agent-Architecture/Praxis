import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  planVideoSubtitleGeneration,
  videoSubtitleGenerationDescriptor,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/omniBase/videoTransformer/omni.videoSubtitleGeneration.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/omniBase/videoTransformer/omni.videoSubtitleGeneration.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/omniBase/videoTransformer/omni.videoSubtitleGeneration.md",
  testFileUrl: import.meta.url,
});

test("planVideoSubtitleGeneration creates a governed dry-run subtitle plan", () => {
  const result = planVideoSubtitleGeneration({
    context: {
      runtimeId: "runtime-1",
      invocationId: "subtitle-1",
      requestedScopes: ["tool:omni:video"],
      allowedScopes: ["tool:omni:video"],
    },
    sourceVideoUri: "file:///workspace/demo.mp4",
    subtitleTrackId: "main-track",
    language: "en-US",
    outputFormat: "srt",
    maxSegments: 120,
  });

  assert.equal(result.ok, true);
  assert.equal(videoSubtitleGenerationDescriptor.defaultDispatch, "dry-run");
  if (!result.ok) {
    return;
  }

  assert.equal(result.plan.toolId, "omni.videoSubtitleGeneration");
  assert.equal(result.plan.dispatch, "dry-run");
  assert.equal(result.plan.sourceVideoUri, "file:///workspace/demo.mp4");
  assert.equal(result.plan.subtitleTrackId, "main-track");
  assert.equal(result.plan.language, "en-US");
  assert.equal(result.plan.outputFormat, "srt");
  assert.equal(result.plan.wouldGenerateSubtitleTrack, true);
  assert.equal(result.plan.unsafeSideEffects, false);
  assert.deepEqual(result.plan.acceptedScopes, ["tool:omni:video"]);
  assert.deepEqual(result.events, ["basicTool.omni.videoSubtitleGeneration.planned"]);
});

test("planVideoSubtitleGeneration classifies missing input and blocked real execution", () => {
  const missing = planVideoSubtitleGeneration();
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.error.code, "MISSING_RUNTIME_ID");
    assert.equal(missing.error.boundary, "input");
  }

  const noVideo = planVideoSubtitleGeneration({ context: { runtimeId: "runtime-1" } });
  assert.equal(noVideo.ok, false);
  if (!noVideo.ok) {
    assert.equal(noVideo.error.code, "MISSING_VIDEO_URI");
    assert.equal(noVideo.error.boundary, "input");
  }

  const real = planVideoSubtitleGeneration({
    context: { runtimeId: "runtime-1", dryRun: false },
    sourceVideoUri: "file:///workspace/demo.mp4",
  });
  assert.equal(real.ok, false);
  if (!real.ok) {
    assert.equal(real.error.code, "REAL_SIDE_EFFECT_NOT_ALLOWED");
    assert.equal(real.error.boundary, "contract");
  }
});
