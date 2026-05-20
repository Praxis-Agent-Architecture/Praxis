import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import {
  createOpenAIAudioTranslationInvocation,
  openAIAudioTranslationsDescriptor,
} from "../../../../../src/agentCore_modelAdapter/actualInvocationLayer/openai/v1_audio_translations.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_modelAdapter/actualInvocationLayer/openai/v1_audio_translations.ts",
  docPath: "docs/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_audio_translations.md",
  testFileUrl: import.meta.url,
});

test("createOpenAIAudioTranslationInvocation builds a dry-run provider envelope", () => {
  const result = createOpenAIAudioTranslationInvocation({
    requestId: " translation-1 ",
    model: " whisper-1 ",
    file: { name: " source.mp3 ", mimeType: "audio/mpeg", byteLength: 4096 },
    body: { response_format: "verbose_json", prompt: "Technical meeting notes" },
    requestedScopes: ["audio.translate"],
    allowedScopes: ["audio.translate", "model.invoke"],
    trace: { runtimeId: " runtime-1 " },
  });

  assert.equal(openAIAudioTranslationsDescriptor.endpoint, "/v1/audio/translations");
  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected translation envelope");
  }

  assert.equal(result.request.endpoint, "/v1/audio/translations");
  assert.equal(result.request.model, "whisper-1");
  assert.equal(result.request.requestShape, "multipart-form-data");
  assert.equal(result.request.runtime.dryRun, true);
  assert.equal(result.request.runtime.unsafeSideEffects, false);
  assert.deepEqual(result.request.trace, { runtimeId: "runtime-1" });
  assert.equal(result.capability.providerRawShapePromoted, false);
});

test("createOpenAIAudioTranslationInvocation wraps text or object mock responses as provider raw", () => {
  const textResult = createOpenAIAudioTranslationInvocation({
    model: "whisper-1",
    file: { sourceRef: "artifact://audio/spanish.wav" },
    providerResponse: "translated text",
  });

  assert.equal(textResult.ok, true);
  if (!textResult.ok) {
    throw new Error("expected text translation response");
  }
  assert.equal(textResult.response?.raw, "translated text");
  assert.equal(textResult.response?.providerRawShapePromoted, false);

  const objectResult = createOpenAIAudioTranslationInvocation({
    model: "whisper-1",
    file: { sourceRef: "artifact://audio/spanish.wav" },
    providerResponse: { text: "translated text", language: "english" },
  });
  assert.equal(objectResult.ok, true);
  if (!objectResult.ok) {
    throw new Error("expected object translation response");
  }
  assert.deepEqual(objectResult.response?.raw, { text: "translated text", language: "english" });
});

test("createOpenAIAudioTranslationInvocation rejects invalid boundaries and classifies provider failures", () => {
  const missingFile = createOpenAIAudioTranslationInvocation({ model: "whisper-1" });
  assert.equal(missingFile.ok, false);
  if (!missingFile.ok) {
    assert.equal(missingFile.error.code, "MISSING_AUDIO_FILE");
    assert.equal(missingFile.error.boundary, "input");
  }

  const governanceRejected = createOpenAIAudioTranslationInvocation({
    model: "whisper-1",
    file: { sourceRef: "artifact://audio/input.wav" },
    governance: { accepted: false, reason: "audio translation blocked" },
  });
  assert.equal(governanceRejected.ok, false);
  if (!governanceRejected.ok) {
    assert.equal(governanceRejected.error.code, "GOVERNANCE_REJECTED");
    assert.equal(governanceRejected.error.message, "audio translation blocked");
  }

  const timedOut = createOpenAIAudioTranslationInvocation({
    model: "whisper-1",
    file: { sourceRef: "artifact://audio/input.wav" },
    providerError: { timedOut: true },
  });
  assert.equal(timedOut.ok, false);
  if (!timedOut.ok) {
    assert.equal(timedOut.error.code, "PROVIDER_TIMEOUT");
    assert.equal(timedOut.error.boundary, "provider");
  }
});
