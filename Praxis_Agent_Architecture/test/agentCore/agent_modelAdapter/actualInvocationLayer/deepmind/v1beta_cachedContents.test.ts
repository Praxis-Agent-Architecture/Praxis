import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import {
  DEEPMIND_V1BETA_CACHED_CONTENTS_ENDPOINT,
  classifyDeepmindV1BetaCachedContentsProviderError,
  invokeDeepmindV1BetaCachedContents,
} from "../../../../../src/agentCore/agent_modelAdapter/actualInvocationLayer/deepmind/v1beta_cachedContents.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_modelAdapter/actualInvocationLayer/deepmind/v1beta_cachedContents.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_modelAdapter/actualInvocationLayer/deepmind/v1beta_cachedContents.md",
  testFileUrl: import.meta.url,
});

test("DeepMind/Gemini v1beta cachedContents builds a dry-run provider envelope", async () => {
  const result = await invokeDeepmindV1BetaCachedContents({
    operation: "create",
    method: "POST",
    runtime: { runtimeId: "runtime-1" },
    pathSuffix: " cachedContents/cache-1 ",
    headers: { "x-goog-user-project": " praxis ", empty: " " },
    body: { model: "models/gemini-test" },
    mockResponse: { name: "cachedContents/cache-1" },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.request.endpoint, DEEPMIND_V1BETA_CACHED_CONTENTS_ENDPOINT);
  assert.equal(result.request.method, "POST");
  assert.equal(result.request.urlPath, "/v1beta/cachedContents/cachedContents/cache-1");
  assert.equal(result.request.headers["x-goog-user-project"], "praxis");
  assert.deepEqual(result.request.body, { model: "models/gemini-test" });
  assert.deepEqual(result.response.raw, { name: "cachedContents/cache-1" });
  assert.equal(result.response.providerFieldsOpaque, true);
});

test("DeepMind/Gemini v1beta cachedContents rejects empty input before provider access", async () => {
  const result = await invokeDeepmindV1BetaCachedContents();

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.equal(result.error.code, "MISSING_OPERATION");
  assert.equal(result.error.boundary, "input");
});

test("DeepMind/Gemini v1beta cachedContents classifies retryable provider failures", async () => {
  assert.equal(classifyDeepmindV1BetaCachedContentsProviderError({ name: "TimeoutError" }), "PROVIDER_TIMEOUT");

  const result = await invokeDeepmindV1BetaCachedContents({
    operation: "get",
    runtime: { runtimeId: "runtime-1" },
    dryRun: false,
    caller: () => {
      throw { name: "TimeoutError" };
    },
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.equal(result.error.code, "PROVIDER_TIMEOUT");
  assert.equal(result.error.retryable, true);
});
