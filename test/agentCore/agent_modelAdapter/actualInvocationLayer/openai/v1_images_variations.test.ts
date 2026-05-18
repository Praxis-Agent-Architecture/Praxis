import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  OPENAI_V1_IMAGES_VARIATIONS_ENDPOINT,
  classifyOpenAIV1ImagesVariationsProviderError,
  invokeOpenAIV1ImagesVariations,
} from "../../../../../src/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_images_variations.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_images_variations.ts",
  docPath: "docs/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_images_variations.md",
  testFileUrl: import.meta.url,
});

test("OpenAI v1 images variations builds a dry-run variation envelope", async () => {
  const result = await invokeOpenAIV1ImagesVariations({
    image: { sourceRef: "artifact://image/source.png", mimeType: "image/png" },
    body: { model: "gpt-image-1", n: 2 },
    runtime: { runtimeId: "runtime-1", invocationId: "variation-1" },
    mockResponse: { data: [{ b64_json: "abc" }] },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.request.endpoint, OPENAI_V1_IMAGES_VARIATIONS_ENDPOINT);
  assert.equal(result.request.operation, "create-image-variation");
  assert.equal(result.request.providerFieldsOpaque, true);
  assert.equal(result.response.mode, "mock");
});

test("OpenAI v1 images variations rejects missing image as input error", async () => {
  const result = await invokeOpenAIV1ImagesVariations({ runtime: { runtimeId: "runtime-1" } });

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }
  assert.equal(result.error.code, "MISSING_IMAGE");
  assert.equal(result.error.boundary, "input");
});

test("OpenAI v1 images variations invokes an injected caller in live mode", async () => {
  const result = await invokeOpenAIV1ImagesVariations({
    image: { sourceRef: "artifact://image/source.png" },
    runtime: { runtimeId: "runtime-1" },
    dryRun: false,
    expectImageListResponse: true,
    caller: (envelope) => {
      assert.equal(envelope.providerCallPlanned, true);
      assert.equal(envelope.unsafeSideEffects, false);
      return { data: [{ url: "https://example.test/variation.png" }] };
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  assert.equal(result.response.mode, "caller");
  assert.equal(result.capability.rawShape, "image-list");
});

test("OpenAI v1 images variations classifies provider auth failures", () => {
  assert.equal(classifyOpenAIV1ImagesVariationsProviderError({ statusCode: 401 }), "PROVIDER_AUTH_FAILED");
});
