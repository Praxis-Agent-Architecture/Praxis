import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import {
  OPENAI_V1_VECTOR_STORES_ENDPOINT,
  classifyOpenAIV1VectorStoresProviderError,
  invokeOpenAIV1VectorStores,
} from "../../../../../src/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_vector_stores.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_vector_stores.ts",
  docPath: "docs/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_vector_stores.md",
  testFileUrl: import.meta.url,
});

test("OpenAI v1 vector stores builds a dry-run provider envelope", async () => {
  const result = await invokeOpenAIV1VectorStores({
    operation: "list",
    runtime: { runtimeId: "runtime-1", callerId: "adapter-test" },
    headers: { "openai-organization": "org_1", empty: " " },
    pathSuffix: "vs_1",
    mockResponse: { id: "vs_1", object: "vector_store" },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.request.endpoint, OPENAI_V1_VECTOR_STORES_ENDPOINT);
  assert.equal(result.request.urlPath, "/v1/vector_stores/vs_1");
  assert.equal(result.request.unsafeSideEffects, false);
  assert.equal(result.request.providerFieldsOpaque, true);
  assert.equal(result.request.headers["openai-organization"], "org_1");
  assert.equal(result.request.headers.empty, undefined);
  assert.deepEqual(result.response.raw, { id: "vs_1", object: "vector_store" });
  assert.equal(result.response.mode, "mock");
});

test("OpenAI v1 vector stores rejects empty input before provider access", async () => {
  const result = await invokeOpenAIV1VectorStores();

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.equal(result.error.code, "MISSING_OPERATION");
  assert.equal(result.error.boundary, "input");
});

test("OpenAI v1 vector stores classifies retryable provider failures", async () => {
  assert.equal(classifyOpenAIV1VectorStoresProviderError({ status: 429 }), "PROVIDER_RATE_LIMITED");

  const result = await invokeOpenAIV1VectorStores({
    operation: "retrieve",
    runtime: { runtimeId: "runtime-1" },
    dryRun: false,
    caller: () => {
      throw { status: 429 };
    },
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.equal(result.error.code, "PROVIDER_RATE_LIMITED");
  assert.equal(result.error.retryable, true);
});
