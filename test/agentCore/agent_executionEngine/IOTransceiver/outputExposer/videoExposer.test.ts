import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { exposeVideoOutput } from "../../../../../src/agentCore/agent_executionEngine/IOTransceiver/outputExposer/videoExposer.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_executionEngine/IOTransceiver/outputExposer/videoExposer.ts",
  docPath: "docs/agentCore/agent_executionEngine/IOTransceiver/outputExposer/videoExposer.md",
  testFileUrl: import.meta.url,
});

test("exposeVideoOutput creates a dry-run video envelope with display metadata", () => {
  const result = exposeVideoOutput({
    outputId: " video-1 ",
    sessionId: " session-1 ",
    kind: "video-reference",
    mimeType: " video/mp4 ",
    displayRef: " artifact://video/result.mp4 ",
    durationMs: 4500,
    width: 1280,
    height: 720,
    summary: "short generated clip",
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.exposed.modality, "video");
  assert.equal(result.exposed.outputId, "video-1");
  assert.equal(result.exposed.payload.mimeType, "video/mp4");
  assert.equal(result.exposed.payload.displayRef, "artifact://video/result.mp4");
  assert.equal(result.exposed.payload.durationMs, 4500);
  assert.equal(result.exposed.payload.width, 1280);
  assert.equal(result.exposed.payload.height, 720);
  assert.equal(result.exposed.dispatch, "dry-run");
  assert.equal(result.exposed.providerRawShapeExposed, false);
});

test("exposeVideoOutput supports video understanding summaries", () => {
  const result = exposeVideoOutput({
    outputId: "video-summary",
    sessionId: "session-1",
    summary: "the clip shows a failed upload flow",
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.exposed.payload.kind, "video-understanding");
  assert.equal(result.exposed.payload.summary, "the clip shows a failed upload flow");
});

test("exposeVideoOutput rejects missing payload and invalid metadata", () => {
  const missing = exposeVideoOutput({ outputId: "video-1", sessionId: "session-1" });
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.error.code, "MISSING_PAYLOAD");
  }

  const invalid = exposeVideoOutput({
    outputId: "video-1",
    sessionId: "session-1",
    displayRef: "artifact://video/result.mp4",
    durationMs: Number.NaN,
  });
  assert.equal(invalid.ok, false);
  if (!invalid.ok) {
    assert.equal(invalid.error.code, "INVALID_PAYLOAD");
    assert.equal(invalid.error.boundary, "input");
  }
});
