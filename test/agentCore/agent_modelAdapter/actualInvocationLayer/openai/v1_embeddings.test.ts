import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  OPENAI_V1_EMBEDDINGS_ENDPOINT,
  classifyOpenAIV1EmbeddingsProviderError,
  invokeOpenAIV1Embeddings,
} from "../../../../../src/modelAdapter/actualInvocationLayer/openai/v1_embeddings.js";

defineAgentCoreContractTest({
  sourcePath: "src/modelAdapter/actualInvocationLayer/openai/v1_embeddings.ts",
  docPath: "docs/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_embeddings.md",
  testFileUrl: import.meta.url,
});

test("OpenAI v1 embeddings builds a dry-run provider envelope", async () => {
  const result = await invokeOpenAIV1Embeddings({
    body: { model: "text-embedding-3-small", input: "hello" },
    runtime: { runtimeId: "runtime-1", traceId: "trace-1" },
    mockResponse: { object: "list", data: [{ embedding: [0.1, 0.2] }] },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.request.endpoint, OPENAI_V1_EMBEDDINGS_ENDPOINT);
  assert.equal(result.request.operation, "create-embedding");
  assert.equal(result.request.providerFieldsOpaque, true);
  assert.equal(result.response.mode, "mock");
  assert.equal(result.capability.rawShape, "mock");
});

test("OpenAI v1 embeddings rejects missing runtime as an input boundary error", async () => {
  const result = await invokeOpenAIV1Embeddings({ body: { model: "text-embedding-3-small", input: "hello" } });

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.equal(result.error.code, "MISSING_RUNTIME_ID");
  assert.equal(result.error.boundary, "input");
});

test("OpenAI v1 embeddings invokes only an injected caller in live mode", async () => {
  const result = await invokeOpenAIV1Embeddings({
    body: { model: "text-embedding-3-small", input: "hello" },
    runtime: { runtimeId: "runtime-1" },
    dryRun: false,
    expectResponseObject: true,
    caller: (envelope) => {
      assert.equal(envelope.providerCallPlanned, true);
      assert.equal(envelope.unsafeSideEffects, false);
      return { object: "list", data: [{ embedding: [0.1, 0.2] }] };
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.response.mode, "caller");
  assert.equal(result.capability.rawShape, "embedding-list");
});

test("OpenAI v1 embeddings classifies provider response drift", () => {
  assert.equal(classifyOpenAIV1EmbeddingsProviderError({ code: "SchemaParseError" }), "RESPONSE_FORMAT_DRIFT");
});
