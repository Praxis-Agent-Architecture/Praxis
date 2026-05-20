import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import {
  createOpenAIAudioVoiceConsentInvocation,
  openAIAudioVoiceConsentsDescriptor,
} from "../../../../../src/modelAdapter/actualInvocationLayer/openai/v1_audio_voice_consents.js";

defineAgentCoreContractTest({
  sourcePath: "src/modelAdapter/actualInvocationLayer/openai/v1_audio_voice_consents.ts",
  docPath: "docs/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_audio_voice_consents.md",
  testFileUrl: import.meta.url,
});

test("createOpenAIAudioVoiceConsentInvocation builds a dry-run voice consent envelope", () => {
  const result = createOpenAIAudioVoiceConsentInvocation({
    requestId: " consent-1 ",
    name: " Jane Consent ",
    language: " en-US ",
    recording: { name: "consent.wav", mimeType: "audio/wav", byteLength: 8192 },
    requestedScopes: ["audio.voice_consent.create"],
    allowedScopes: ["audio.voice_consent.create"],
    apiKeyRef: "secret://openai/custom-voices",
  });

  assert.equal(openAIAudioVoiceConsentsDescriptor.endpoint, "/v1/audio/voice_consents");
  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected voice consent envelope");
  }

  assert.equal(result.request.endpoint, "/v1/audio/voice_consents");
  assert.equal(result.request.requestId, "consent-1");
  assert.equal(result.request.providerFields.name, "Jane Consent");
  assert.equal(result.request.providerFields.language, "en-US");
  assert.equal(result.request.providerFields.recording.name, "consent.wav");
  assert.equal(result.request.runtime.dryRun, true);
  assert.equal(result.request.runtime.unsafeSideEffects, false);
  assert.equal(result.request.auth.materialPresent, true);
  assert.equal(result.capability.providerRawShapePromoted, false);
});

test("createOpenAIAudioVoiceConsentInvocation wraps provider metadata without exposing raw as public contract", () => {
  const result = createOpenAIAudioVoiceConsentInvocation({
    name: "Jane Consent",
    language: "en-US",
    recording: { sourceRef: "artifact://audio/consent.wav" },
    providerResponse: {
      id: "cons_1234",
      object: "audio.voice_consent",
      created_at: 1,
      name: "Jane Consent",
      language: "en-US",
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected voice consent response");
  }

  assert.equal(result.response?.endpoint, "/v1/audio/voice_consents");
  assert.equal(result.response?.received, true);
  assert.equal(result.response?.providerRawShapePromoted, false);
  assert.deepEqual(result.response?.raw, {
    id: "cons_1234",
    object: "audio.voice_consent",
    created_at: 1,
    name: "Jane Consent",
    language: "en-US",
  });
});

test("createOpenAIAudioVoiceConsentInvocation rejects missing data and provider auth failures", () => {
  const missingLanguage = createOpenAIAudioVoiceConsentInvocation({
    name: "Jane Consent",
    recording: { sourceRef: "artifact://audio/consent.wav" },
  });
  assert.equal(missingLanguage.ok, false);
  if (!missingLanguage.ok) {
    assert.equal(missingLanguage.error.code, "MISSING_LANGUAGE");
    assert.equal(missingLanguage.error.boundary, "input");
  }

  const realCallBlocked = createOpenAIAudioVoiceConsentInvocation({
    name: "Jane Consent",
    language: "en-US",
    recording: { sourceRef: "artifact://audio/consent.wav" },
    dryRun: false,
  });
  assert.equal(realCallBlocked.ok, false);
  if (!realCallBlocked.ok) {
    assert.equal(realCallBlocked.error.code, "REAL_PROVIDER_CALL_NOT_ALLOWED");
  }

  const authFailed = createOpenAIAudioVoiceConsentInvocation({
    name: "Jane Consent",
    language: "en-US",
    recording: { sourceRef: "artifact://audio/consent.wav" },
    providerError: { status: 401 },
  });
  assert.equal(authFailed.ok, false);
  if (!authFailed.ok) {
    assert.equal(authFailed.error.code, "PROVIDER_AUTH_FAILED");
    assert.equal(authFailed.error.providerRawDetailExposed, false);
  }
});
