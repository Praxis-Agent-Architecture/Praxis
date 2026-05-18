import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import {
  createOpenAIAudioVoiceInvocation,
  openAIAudioVoicesDescriptor,
} from "../../../../../src/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_audio_voices.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_audio_voices.ts",
  docPath: "docs/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_audio_voices.md",
  testFileUrl: import.meta.url,
});

test("createOpenAIAudioVoiceInvocation builds a dry-run custom voice envelope", () => {
  const result = createOpenAIAudioVoiceInvocation({
    requestId: " voice-1 ",
    name: " Support Voice ",
    consentId: " cons_1234 ",
    audioSample: { name: "sample.wav", mimeType: "audio/wav", byteLength: 9000 },
    requestedScopes: ["audio.voice.create"],
    allowedScopes: ["audio.voice.create", "audio.voice.read"],
    trace: { invocationId: " invocation-1 " },
  });

  assert.equal(openAIAudioVoicesDescriptor.endpoint, "/v1/audio/voices");
  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected voice envelope");
  }

  assert.equal(result.request.endpoint, "/v1/audio/voices");
  assert.equal(result.request.requestId, "voice-1");
  assert.equal(result.request.providerFields.name, "Support Voice");
  assert.equal(result.request.providerFields.consent, "cons_1234");
  assert.equal(result.request.providerFields.audio_sample.name, "sample.wav");
  assert.deepEqual(result.request.trace, { invocationId: "invocation-1" });
  assert.equal(result.request.runtime.dryRun, true);
  assert.equal(result.request.runtime.unsafeSideEffects, false);
});

test("createOpenAIAudioVoiceInvocation keeps created voice metadata in provider raw envelope", () => {
  const result = createOpenAIAudioVoiceInvocation({
    name: "Support Voice",
    consentId: "cons_1234",
    audioSample: { sourceRef: "artifact://audio/sample.wav" },
    providerResponse: { id: "voice_1234", created_at: 1, name: "Support Voice", object: "audio.voice" },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected voice response");
  }

  assert.equal(result.response?.endpoint, "/v1/audio/voices");
  assert.equal(result.response?.providerRawShapePromoted, false);
  assert.deepEqual(result.response?.raw, {
    id: "voice_1234",
    created_at: 1,
    name: "Support Voice",
    object: "audio.voice",
  });
});

test("createOpenAIAudioVoiceInvocation rejects invalid voice requests and provider endpoint failures", () => {
  const missingConsent = createOpenAIAudioVoiceInvocation({
    name: "Support Voice",
    audioSample: { sourceRef: "artifact://audio/sample.wav" },
  });
  assert.equal(missingConsent.ok, false);
  if (!missingConsent.ok) {
    assert.equal(missingConsent.error.code, "MISSING_CONSENT");
    assert.equal(missingConsent.error.boundary, "input");
  }

  const scopeDenied = createOpenAIAudioVoiceInvocation({
    name: "Support Voice",
    consentId: "cons_1234",
    audioSample: { sourceRef: "artifact://audio/sample.wav" },
    requestedScopes: ["audio.voice.admin"],
    allowedScopes: ["audio.voice.create"],
  });
  assert.equal(scopeDenied.ok, false);
  if (!scopeDenied.ok) {
    assert.equal(scopeDenied.error.code, "SCOPE_DENIED");
  }

  const endpointMissing = createOpenAIAudioVoiceInvocation({
    name: "Support Voice",
    consentId: "cons_1234",
    audioSample: { sourceRef: "artifact://audio/sample.wav" },
    providerError: { endpointAvailable: false },
  });
  assert.equal(endpointMissing.ok, false);
  if (!endpointMissing.ok) {
    assert.equal(endpointMissing.error.code, "PROVIDER_ENDPOINT_UNAVAILABLE");
    assert.equal(endpointMissing.error.boundary, "provider");
  }
});
