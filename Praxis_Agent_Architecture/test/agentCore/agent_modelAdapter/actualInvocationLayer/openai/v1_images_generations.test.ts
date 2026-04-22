import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  OPENAI_V1_IMAGES_GENERATIONS_ENDPOINT,
  classifyOpenAIV1ImagesGenerationsProviderError,
  invokeOpenAIV1ImagesGenerations,
} from "../../../../../src/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_images_generations.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_images_generations.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_images_generations.md",
  testFileUrl: import.meta.url,
});

test("OpenAI v1 images generations builds a dry-run provider envelope", async () => {
  const result = await invokeOpenAIV1ImagesGenerations({
    body: { model: "gpt-image-1", prompt: "a compact workspace" },
    runtime: { runtimeId: "runtime-1", invocationId: "image-1" },
    mockResponse: { data: [{ b64_json: "abc" }] },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.request.endpoint, OPENAI_V1_IMAGES_GENERATIONS_ENDPOINT);
  assert.equal(result.request.operation, "create-image");
  assert.equal(result.request.providerFieldsOpaque, true);
  assert.equal(result.response.mode, "mock");
  assert.equal(result.capability.rawShape, "mock");
});

test("OpenAI v1 images generations rejects missing body as input error", async () => {
  const result = await invokeOpenAIV1ImagesGenerations({ runtime: { runtimeId: "runtime-1" } });

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }
  assert.equal(result.error.code, "MISSING_BODY");
  assert.equal(result.error.boundary, "input");
});

test("OpenAI v1 images generations invokes only an injected caller in live mode", async () => {
  const result = await invokeOpenAIV1ImagesGenerations({
    body: { model: "gpt-image-1", prompt: "a compact workspace" },
    runtime: { runtimeId: "runtime-1" },
    dryRun: false,
    expectImageListResponse: true,
    caller: (envelope) => {
      assert.equal(envelope.providerCallPlanned, true);
      assert.equal(envelope.unsafeSideEffects, false);
      return { data: [{ url: "https://example.test/image.png" }] };
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  assert.equal(result.response.mode, "caller");
  assert.equal(result.capability.rawShape, "image-list");
});

test("OpenAI v1 images generations classifies provider timeout", () => {
  assert.equal(classifyOpenAIV1ImagesGenerationsProviderError({ code: "timeout" }), "PROVIDER_TIMEOUT");
});
