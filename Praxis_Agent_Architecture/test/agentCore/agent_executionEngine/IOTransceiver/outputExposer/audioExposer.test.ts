import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { exposeAudioOutput } from "../../../../../src/agentCore/agent_executionEngine/IOTransceiver/outputExposer/audioExposer.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/IOTransceiver/outputExposer/audioExposer.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/IOTransceiver/outputExposer/audioExposer.md",
  testFileUrl: import.meta.url,
});

test("exposeAudioOutput creates a dry-run audio envelope with media metadata", () => {
  const result = exposeAudioOutput({
    outputId: " audio-1 ",
    sessionId: " session-1 ",
    kind: "speech",
    mimeType: " audio/wav ",
    reference: " artifact://audio/reply.wav ",
    durationMs: 1200,
    sampleRateHz: 24000,
    requestedScopes: ["output.read"],
    allowedScopes: ["output.read"],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.exposed.modality, "audio");
  assert.equal(result.exposed.outputId, "audio-1");
  assert.equal(result.exposed.payload.kind, "speech");
  assert.equal(result.exposed.payload.mimeType, "audio/wav");
  assert.equal(result.exposed.payload.reference, "artifact://audio/reply.wav");
  assert.equal(result.exposed.payload.durationMs, 1200);
  assert.equal(result.exposed.dispatch, "dry-run");
  assert.equal(result.exposed.providerRawShapeExposed, false);
});

test("exposeAudioOutput supports transcript-only audio results", () => {
  const result = exposeAudioOutput({
    outputId: "audio-transcript",
    sessionId: "session-1",
    transcript: "transcribed answer",
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.exposed.payload.kind, "transcript");
  assert.equal(result.exposed.payload.transcript, "transcribed answer");
});

test("exposeAudioOutput rejects missing payload and invalid media metadata", () => {
  const missing = exposeAudioOutput({ outputId: "audio-1", sessionId: "session-1" });
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.error.code, "MISSING_PAYLOAD");
    assert.equal(missing.error.boundary, "input");
  }

  const invalid = exposeAudioOutput({
    outputId: "audio-1",
    sessionId: "session-1",
    reference: "artifact://audio/reply.wav",
    durationMs: -1,
  });
  assert.equal(invalid.ok, false);
  if (!invalid.ok) {
    assert.equal(invalid.error.code, "INVALID_PAYLOAD");
  }
});
