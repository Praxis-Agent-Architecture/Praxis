import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import {
  createOpenAIAudioTranscriptionInvocation,
  openAIAudioTranscriptionsDescriptor,
} from "../../../../../src/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_audio_transcriptions.js";
import { createApiKeyAuthEnvelope } from "../../../../../src/agentCore/agent_modelAdapter/authProfileLayer/authEnvelope.js";
import { createCredentialRef } from "../../../../../src/agentCore/agent_modelAdapter/authProfileLayer/credentialRef.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_audio_transcriptions.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_audio_transcriptions.md",
  testFileUrl: import.meta.url,
});

function testAuthEnvelope() {
  const ref = createCredentialRef({
    id: "audio-test",
    provider: "openai",
    credentialType: "openai_api_key",
    source: { kind: "test", label: "unit" },
  });
  assert.equal(ref.ok, true);
  if (!ref.ok) {
    throw new Error("expected ref");
  }
  return createApiKeyAuthEnvelope({ credentialRef: ref.credentialRef, apiKey: "sk-test-secret-audio" }).envelope;
}

test("createOpenAIAudioTranscriptionInvocation builds a dry-run provider envelope", async () => {
  const result = await createOpenAIAudioTranscriptionInvocation({
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
  assert.equal(result.request.runtime.providerCallPlanned, false);
  assert.deepEqual(result.request.runtime.requestedScopes, ["audio.transcribe"]);
  assert.equal(result.request.runtime.dryRun, true);
  assert.equal(result.request.runtime.unsafeSideEffects, false);
  assert.equal(result.request.auth.materialPresent, true);
  assert.equal(result.response, undefined);
  assert.deepEqual(result.events, ["modelAdapter.openai.audio.transcriptions.enveloped"]);
});

test("createOpenAIAudioTranscriptionInvocation wraps mock provider responses without promoting raw shape", async () => {
  const result = await createOpenAIAudioTranscriptionInvocation({
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

test("createOpenAIAudioTranscriptionInvocation classifies input, scope, and provider errors", async () => {
  const missing = await createOpenAIAudioTranscriptionInvocation();
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.error.code, "MISSING_MODEL");
    assert.equal(missing.error.boundary, "input");
    assert.equal(missing.error.safeForRuntimeInspection, true);
  }

  const scopeDenied = await createOpenAIAudioTranscriptionInvocation({
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

  const missingGovernance = await createOpenAIAudioTranscriptionInvocation({
    model: "whisper-1",
    file: { sourceRef: "artifact://audio/input.wav" },
    dryRun: false,
    auth: testAuthEnvelope(),
  });
  assert.equal(missingGovernance.ok, false);
  if (!missingGovernance.ok) {
    assert.equal(missingGovernance.error.code, "GOVERNANCE_REJECTED");
    assert.equal(missingGovernance.error.boundary, "governance");
  }

  const rateLimited = await createOpenAIAudioTranscriptionInvocation({
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

test("createOpenAIAudioTranscriptionInvocation can use the unified caller path in live mode", async () => {
  const result = await createOpenAIAudioTranscriptionInvocation({
    model: "gpt-4o-transcribe",
    file: { sourceRef: "artifact://audio/input.wav" },
    body: { response_format: "json" },
    dryRun: false,
    governance: { accepted: true },
    auth: testAuthEnvelope(),
    expectResponseObject: true,
    caller: (envelope) => {
      assert.equal(envelope.runtime.providerCallPlanned, true);
      assert.equal(envelope.headers.authorization, "[redacted:27]");
      return { text: "praxis audio ok" };
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected live caller path");
  }
  assert.equal(result.response?.received, true);
  assert.deepEqual(result.response?.raw, { text: "praxis audio ok" });
});

test("createOpenAIAudioTranscriptionInvocation requires auth and caller for live mode", async () => {
  const missingAuth = await createOpenAIAudioTranscriptionInvocation({
    model: "whisper-1",
    file: { sourceRef: "artifact://audio/input.wav" },
    dryRun: false,
    governance: { accepted: true },
  });
  assert.equal(missingAuth.ok, false);
  if (!missingAuth.ok) {
    assert.equal(missingAuth.error.code, "AUTH_REJECTED");
  }

  const missingCaller = await createOpenAIAudioTranscriptionInvocation({
    model: "whisper-1",
    file: { sourceRef: "artifact://audio/input.wav" },
    dryRun: false,
    governance: { accepted: true },
    auth: testAuthEnvelope(),
  });
  assert.equal(missingCaller.ok, false);
  if (!missingCaller.ok) {
    assert.equal(missingCaller.error.code, "CALLER_REQUIRED");
  }
});
