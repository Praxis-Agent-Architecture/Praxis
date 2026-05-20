import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import {
  receiveVideoInput,
  videoInputReceiverDescriptor,
} from "../../../../../src/agentCore_executionEngine/IOTransceiver/inputReceiver/videoReceiver.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_executionEngine/IOTransceiver/inputReceiver/videoReceiver.ts",
  docPath: "docs/agentCore/agent_executionEngine/IOTransceiver/inputReceiver/videoReceiver.md",
  testFileUrl: import.meta.url,
});

test("receiveVideoInput accepts referenced video as a dry-run processing envelope", () => {
  const result = receiveVideoInput({
    runtimeId: " runtime:alpha ",
    sessionId: " session:video ",
    source: "application",
    payload: {
      kind: "video-reference",
      uri: " file://clips/demo.mp4 ",
      format: " mp4 ",
      durationMs: 10_000,
      timeRange: { startMs: 1000, endMs: 4000 },
    },
    frameSelection: { strategy: "interval", intervalMs: 500 },
    processingNeeds: ["understanding", "transcription", "understanding"],
    requestedScopes: ["video-input"],
    allowedScopes: ["video-input"],
  });

  assert.equal(videoInputReceiverDescriptor.videoAlgorithmExecuted, false);
  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected video input to be accepted");
  }

  assert.equal(result.input.kind, "video");
  assert.equal(result.input.runtimeId, "runtime:alpha");
  assert.equal(result.input.payloadKind, "video-reference");
  assert.equal(result.input.media.uri, "file://clips/demo.mp4");
  assert.equal(result.input.media.format, "mp4");
  assert.deepEqual(result.input.media.timeRange, { startMs: 1000, endMs: 4000 });
  assert.deepEqual(result.input.processingNeeds, ["understanding", "transcription"]);
  assert.equal(result.input.processingPlan, "dry-run-envelope");
  assert.equal(result.input.videoAlgorithmExecuted, false);
  assert.equal(result.input.providerPayloadCreated, false);
  assert.deepEqual(result.events, ["input.video.received"]);
});

test("receiveVideoInput preserves raw video byte metadata without running algorithms", () => {
  const result = receiveVideoInput({
    runtimeId: "runtime",
    sessionId: "session",
    payload: { kind: "raw-video", bytes: new Uint8Array([1, 2, 3]), format: "webm" },
    frameSelection: { strategy: "timestamps", timestampsMs: [0, 1000] },
    processingNeeds: ["frame-selection"],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected raw video input");
  }

  assert.equal(result.input.media.byteLength, 3);
  assert.equal(result.input.frameSelection?.strategy, "timestamps");
  assert.equal(result.input.videoAlgorithmExecuted, false);
});

test("receiveVideoInput rejects missing payload, invalid time ranges, and invalid frame hints", () => {
  const missing = receiveVideoInput({ runtimeId: "runtime", sessionId: "session" });
  assert.equal(missing.ok, false);
  if (missing.ok) {
    throw new Error("expected missing video payload rejection");
  }
  assert.equal(missing.error.code, "MISSING_VIDEO_PAYLOAD");
  assert.equal(missing.error.boundary, "input");
  assert.equal(missing.error.safeForRuntimeInspection, true);

  const invalidRange = receiveVideoInput({
    runtimeId: "runtime",
    sessionId: "session",
    payload: {
      kind: "video-reference",
      uri: "file://clip.mp4",
      timeRange: { startMs: 5000, endMs: 1000 },
    },
  });
  assert.equal(invalidRange.ok, false);
  if (invalidRange.ok) {
    throw new Error("expected invalid range rejection");
  }
  assert.equal(invalidRange.error.code, "INVALID_TIME_RANGE");

  const invalidFrameHint = receiveVideoInput({
    runtimeId: "runtime",
    sessionId: "session",
    payload: { kind: "video-reference", uri: "file://clip.mp4" },
    frameSelection: { strategy: "interval", intervalMs: 0 },
  });
  assert.equal(invalidFrameHint.ok, false);
  if (invalidFrameHint.ok) {
    throw new Error("expected invalid frame selection rejection");
  }
  assert.equal(invalidFrameHint.error.code, "INVALID_VIDEO_PAYLOAD");
});
