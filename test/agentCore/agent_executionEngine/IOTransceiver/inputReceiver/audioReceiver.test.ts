import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import {
  audioInputReceiverDescriptor,
  receiveAudioInput,
} from "../../../../../src/agentCore/agent_executionEngine/IOTransceiver/inputReceiver/audioReceiver.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_executionEngine/IOTransceiver/inputReceiver/audioReceiver.ts",
  docPath: "docs/agentCore/agent_executionEngine/IOTransceiver/inputReceiver/audioReceiver.md",
  testFileUrl: import.meta.url,
});

test("receiveAudioInput accepts referenced audio without reading external media", () => {
  const result = receiveAudioInput({
    runtimeId: " runtime:alpha ",
    sessionId: " session:audio ",
    source: "application",
    payload: {
      kind: "audio-reference",
      uri: " file://recordings/request.wav ",
      format: " wav ",
      durationMs: 1200,
    },
    transcriptRequested: true,
    requestedScopes: ["audio-input"],
    allowedScopes: ["audio-input", "runtime"],
  });

  assert.equal(audioInputReceiverDescriptor.unsafeSideEffects, false);
  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected audio input to be accepted");
  }

  assert.equal(result.input.kind, "audio");
  assert.equal(result.input.runtimeId, "runtime:alpha");
  assert.equal(result.input.sessionId, "session:audio");
  assert.equal(result.input.payloadKind, "audio-reference");
  assert.equal(result.input.media.uri, "file://recordings/request.wav");
  assert.equal(result.input.media.format, "wav");
  assert.equal(result.input.media.durationMs, 1200);
  assert.equal(result.input.samplingState, "referenced");
  assert.equal(result.input.transcriptRequested, true);
  assert.equal(result.input.providerPayloadCreated, false);
  assert.deepEqual(result.events, ["input.audio.received"]);
});

test("receiveAudioInput preserves raw and sampled audio metadata", () => {
  const raw = receiveAudioInput({
    runtimeId: "runtime",
    sessionId: "session",
    payload: { kind: "raw-audio", bytes: new Uint8Array([1, 2, 3]), format: "pcm" },
  });
  assert.equal(raw.ok, true);
  if (!raw.ok) {
    throw new Error("expected raw audio input");
  }
  assert.equal(raw.input.media.byteLength, 3);
  assert.equal(raw.input.samplingState, "raw");

  const sampled = receiveAudioInput({
    runtimeId: "runtime",
    sessionId: "session",
    payload: { kind: "sampled-audio", samples: [0.1, -0.1], sampleRateHz: 16000 },
  });
  assert.equal(sampled.ok, true);
  if (!sampled.ok) {
    throw new Error("expected sampled audio input");
  }
  assert.equal(sampled.input.media.sampleCount, 2);
  assert.equal(sampled.input.media.sampleRateHz, 16000);
  assert.equal(sampled.input.samplingState, "sampled");
});

test("receiveAudioInput rejects missing payload, invalid duration, and denied scopes", () => {
  const missing = receiveAudioInput({ runtimeId: "runtime", sessionId: "session" });
  assert.equal(missing.ok, false);
  if (missing.ok) {
    throw new Error("expected missing audio payload rejection");
  }
  assert.equal(missing.error.code, "MISSING_AUDIO_PAYLOAD");
  assert.equal(missing.error.boundary, "input");
  assert.equal(missing.error.safeForRuntimeInspection, true);

  const invalidDuration = receiveAudioInput({
    runtimeId: "runtime",
    sessionId: "session",
    payload: { kind: "audio-reference", uri: "file://audio.wav", durationMs: -1 },
  });
  assert.equal(invalidDuration.ok, false);
  if (invalidDuration.ok) {
    throw new Error("expected invalid duration rejection");
  }
  assert.equal(invalidDuration.error.code, "INVALID_AUDIO_DURATION");

  const scopeRejected = receiveAudioInput({
    runtimeId: "runtime",
    sessionId: "session",
    payload: { kind: "audio-reference", uri: "file://audio.wav" },
    requestedScopes: ["microphone"],
    allowedScopes: ["input"],
  });
  assert.equal(scopeRejected.ok, false);
  if (scopeRejected.ok) {
    throw new Error("expected scope rejection");
  }
  assert.equal(scopeRejected.error.code, "SCOPE_DENIED");
  assert.equal(scopeRejected.error.boundary, "scope");
});
