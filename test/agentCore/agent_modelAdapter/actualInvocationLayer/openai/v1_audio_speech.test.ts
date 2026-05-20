import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  OPENAI_V1_AUDIO_SPEECH_ENDPOINT,
  classifyOpenAIV1AudioSpeechProviderError,
  invokeOpenAIV1AudioSpeech,
} from "../../../../../src/agentCore_modelAdapter/actualInvocationLayer/openai/v1_audio_speech.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_modelAdapter/actualInvocationLayer/openai/v1_audio_speech.ts",
  docPath: "docs/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_audio_speech.md",
  testFileUrl: import.meta.url,
});

test("OpenAI v1 audio speech builds a dry-run speech envelope", async () => {
  const result = await invokeOpenAIV1AudioSpeech({
    body: { model: "tts-1", input: "hello", voice: "alloy" },
    runtime: { runtimeId: "runtime-1", traceId: "trace-1" },
    mockResponse: new Uint8Array([1, 2, 3]),
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.request.endpoint, OPENAI_V1_AUDIO_SPEECH_ENDPOINT);
  assert.equal(result.request.operation, "create-speech");
  assert.equal(result.request.providerFieldsOpaque, true);
  assert.equal(result.response.mode, "mock");
  assert.equal(result.capability.rawShape, "mock");
});

test("OpenAI v1 audio speech rejects missing body as an input boundary error", async () => {
  const result = await invokeOpenAIV1AudioSpeech({ runtime: { runtimeId: "runtime-1" } });

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }
  assert.equal(result.error.code, "MISSING_BODY");
  assert.equal(result.error.boundary, "input");
});

test("OpenAI v1 audio speech invokes injected caller and validates binary-like responses", async () => {
  const result = await invokeOpenAIV1AudioSpeech({
    body: { model: "tts-1", input: "hello", voice: "alloy" },
    runtime: { runtimeId: "runtime-1" },
    dryRun: false,
    expectBinaryLikeResponse: true,
    caller: (envelope) => {
      assert.equal(envelope.providerCallPlanned, true);
      assert.equal(envelope.unsafeSideEffects, false);
      return new Uint8Array([4, 5, 6]);
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  assert.equal(result.response.mode, "caller");
  assert.equal(result.capability.rawShape, "audio-bytes");
});

test("OpenAI v1 audio speech classifies provider unavailability", () => {
  assert.equal(classifyOpenAIV1AudioSpeechProviderError({ status: 503 }), "PROVIDER_UNAVAILABLE");
});
