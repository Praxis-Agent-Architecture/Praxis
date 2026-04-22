import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import {
  createOpenAIAudioTranscriptionInvocation,
  openAIAudioTranscriptionsDescriptor,
} from "../../../../../src/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_audio_transcriptions.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_audio_transcriptions.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_audio_transcriptions.md",
  testFileUrl: import.meta.url,
});

test("createOpenAIAudioTranscriptionInvocation builds a dry-run provider envelope", () => {
  const result = createOpenAIAudioTranscriptionInvocation({
    requestId: " transcription-1 ",
    model: " gpt-4o-transcribe ",
    file: { name: " meeting.wav ", mimeType: "audio/wav", byteLength: 2048 },
    body: { response_format: "json" },
    apiKeyRef: " secret://openai/default ",
    requestedScopes: ["audio.transcribe", "audio.transcribe"],
    allowedScopes: ["audio.transcribe"],
    trace: { sessionId: " session-1 " },
  });

  assert.equal(openAIAudioTranscriptionsDescriptor.providerRawShapePromoted, false);
  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected transcription envelope");
  }

  assert.equal(result.request.endpoint, "/v1/audio/transcriptions");
  assert.equal(result.request.method, "POST");
  assert.equal(result.request.requestId, "transcription-1");
  assert.equal(result.request.model, "gpt-4o-transcribe");
  assert.equal(result.request.requestShape, "multipart-form-data");
  assert.deepEqual(result.request.runtime.requestedScopes, ["audio.transcribe"]);
  assert.equal(result.request.runtime.dryRun, true);
  assert.equal(result.request.runtime.unsafeSideEffects, false);
  assert.equal(result.request.auth.materialPresent, true);
  assert.equal(result.response, undefined);
  assert.deepEqual(result.events, ["modelAdapter.openai.audio.transcriptions.enveloped"]);
});

test("createOpenAIAudioTranscriptionInvocation wraps mock provider responses without promoting raw shape", () => {
  const result = createOpenAIAudioTranscriptionInvocation({
    model: "whisper-1",
    file: { sourceRef: "artifact://audio/input.webm" },
    providerResponse: { text: "hello world", provider_extra: { confidence: 0.9 } },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected mock transcription response");
  }

  assert.equal(result.response?.endpoint, "/v1/audio/transcriptions");
  assert.equal(result.response?.received, true);
  assert.equal(result.response?.providerRawShapePromoted, false);
  assert.deepEqual(result.response?.raw, { text: "hello world", provider_extra: { confidence: 0.9 } });
});

test("createOpenAIAudioTranscriptionInvocation classifies input, scope, and provider errors", () => {
  const missing = createOpenAIAudioTranscriptionInvocation();
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.error.code, "MISSING_MODEL");
    assert.equal(missing.error.boundary, "input");
    assert.equal(missing.error.safeForRuntimeInspection, true);
  }

  const scopeDenied = createOpenAIAudioTranscriptionInvocation({
    model: "whisper-1",
    file: { sourceRef: "artifact://audio/input.wav" },
    requestedScopes: ["private-audio"],
    allowedScopes: ["audio.transcribe"],
  });
  assert.equal(scopeDenied.ok, false);
  if (!scopeDenied.ok) {
    assert.equal(scopeDenied.error.code, "SCOPE_DENIED");
    assert.equal(scopeDenied.error.boundary, "scope");
  }

  const realCallBlocked = createOpenAIAudioTranscriptionInvocation({
    model: "whisper-1",
    file: { sourceRef: "artifact://audio/input.wav" },
    dryRun: false,
  });
  assert.equal(realCallBlocked.ok, false);
  if (!realCallBlocked.ok) {
    assert.equal(realCallBlocked.error.code, "REAL_PROVIDER_CALL_NOT_ALLOWED");
    assert.equal(realCallBlocked.error.boundary, "governance");
  }

  const rateLimited = createOpenAIAudioTranscriptionInvocation({
    model: "whisper-1",
    file: { sourceRef: "artifact://audio/input.wav" },
    providerError: { status: 429 },
  });
  assert.equal(rateLimited.ok, false);
  if (!rateLimited.ok) {
    assert.equal(rateLimited.error.code, "PROVIDER_RATE_LIMITED");
    assert.equal(rateLimited.error.providerRawDetailExposed, false);
  }
});
