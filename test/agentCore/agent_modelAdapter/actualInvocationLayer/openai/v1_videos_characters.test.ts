import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import {
  OPENAI_V1_VIDEOS_CHARACTERS_ENDPOINT,
  classifyOpenAIV1VideosCharactersProviderError,
  invokeOpenAIV1VideosCharacters,
} from "../../../../../src/agentCore_modelAdapter/actualInvocationLayer/openai/v1_videos_characters.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_modelAdapter/actualInvocationLayer/openai/v1_videos_characters.ts",
  docPath: "docs/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_videos_characters.md",
  testFileUrl: import.meta.url,
});

test("OpenAI v1 videos characters builds a dry-run provider envelope", async () => {
  const result = await invokeOpenAIV1VideosCharacters({
    operation: "create",
    method: "POST",
    runtime: { runtimeId: "runtime-1", correlationId: "trace-1" },
    query: { limit: 20, after: undefined },
    mockResponse: { data: [{ id: "char_1", object: "video_character" }] },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.request.endpoint, OPENAI_V1_VIDEOS_CHARACTERS_ENDPOINT);
  assert.equal(result.request.urlPath, "/v1/videos/characters");
  assert.equal(result.request.method, "POST");
  assert.deepEqual(result.request.query, { limit: "20" });
  assert.equal(result.request.runtime.correlationId, "trace-1");
  assert.equal(result.request.unsafeSideEffects, false);
  assert.equal(result.request.providerFieldsOpaque, true);
  assert.deepEqual(result.response.raw, { data: [{ id: "char_1", object: "video_character" }] });
});

test("OpenAI v1 videos characters rejects auth and missing runtime boundaries", async () => {
  const missingRuntime = await invokeOpenAIV1VideosCharacters({ operation: "create" });

  assert.equal(missingRuntime.ok, false);
  if (!missingRuntime.ok) {
    assert.equal(missingRuntime.error.code, "MISSING_RUNTIME_ID");
    assert.equal(missingRuntime.error.boundary, "input");
  }

  const authRejected = await invokeOpenAIV1VideosCharacters({
    operation: "retrieve",
    runtime: { runtimeId: "runtime-1" },
    auth: { kind: "api-key", present: false },
  });

  assert.equal(authRejected.ok, false);
  if (!authRejected.ok) {
    assert.equal(authRejected.error.code, "AUTH_REJECTED");
    assert.equal(authRejected.error.boundary, "auth");
  }
});

test("OpenAI v1 videos characters classifies response drift", async () => {
  assert.equal(classifyOpenAIV1VideosCharactersProviderError({ code: "schema_mismatch" }), "RESPONSE_FORMAT_DRIFT");

  const result = await invokeOpenAIV1VideosCharacters({
    operation: "retrieve",
    runtime: { runtimeId: "runtime-1" },
    dryRun: false,
    expectResponseObject: true,
    caller: () => "not-an-object",
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.equal(result.error.code, "RESPONSE_FORMAT_DRIFT");
  assert.equal(result.error.boundary, "provider");
});
