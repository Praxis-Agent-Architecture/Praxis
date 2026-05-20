import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import {
  OPENAI_V1_REALTIME_TRANSCRIPTION_SESSIONS_ENDPOINT,
  invokeOpenAIV1RealtimeTranscriptionSessions,
} from "../../../../../src/agentCore_modelAdapter/actualInvocationLayer/openai/v1_realtime_transcription_sessions.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_modelAdapter/actualInvocationLayer/openai/v1_realtime_transcription_sessions.ts",
  docPath: "docs/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_realtime_transcription_sessions.md",
  testFileUrl: import.meta.url,
});

test("openai v1 realtime transcription sessions builds a dry-run provider envelope", async () => {
  const result = await invokeOpenAIV1RealtimeTranscriptionSessions({
    requestBody: { input_audio_format: "pcm16" },
    runtime: { runtimeId: "runtime-1", callerId: "model-adapter" },
    mockResponse: { id: "transcription_sess_1" },
  });

  assert.ok(result.ok);
  assert.equal(result.request.endpoint, OPENAI_V1_REALTIME_TRANSCRIPTION_SESSIONS_ENDPOINT);
  assert.equal(result.request.url, "https://api.openai.com/v1/realtime/transcription_sessions");
  assert.deepEqual(result.response.raw, { id: "transcription_sess_1" });
  assert.equal(result.capability.rawShape, "mock");
});

test("openai v1 realtime transcription sessions reports response drift from caller", async () => {
  const result = await invokeOpenAIV1RealtimeTranscriptionSessions({
    requestBody: { input_audio_format: "pcm16" },
    runtime: { runtimeId: "runtime-1" },
    dryRun: false,
    caller: () => "not-an-object",
    expectResponseObject: true,
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "RESPONSE_FORMAT_DRIFT");
  assert.equal(result.error.boundary, "response");
});

test("openai v1 realtime transcription sessions rejects missing request body", async () => {
  const result = await invokeOpenAIV1RealtimeTranscriptionSessions();

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "MISSING_REQUEST_BODY");
  assert.equal(result.error.boundary, "input");
});
