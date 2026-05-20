import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  OPENAI_V1_IMAGES_EDITS_ENDPOINT,
  classifyOpenAIV1ImagesEditsProviderError,
  invokeOpenAIV1ImagesEdits,
} from "../../../../../src/modelAdapter/actualInvocationLayer/openai/v1_images_edits.js";

defineAgentCoreContractTest({
  sourcePath: "src/modelAdapter/actualInvocationLayer/openai/v1_images_edits.ts",
  docPath: "docs/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_images_edits.md",
  testFileUrl: import.meta.url,
});

test("OpenAI v1 images edits builds a dry-run edit envelope", async () => {
  const result = await invokeOpenAIV1ImagesEdits({
    body: { model: "gpt-image-1", prompt: "replace background" },
    images: [{ sourceRef: "artifact://image/input.png", mimeType: "image/png" }],
    runtime: { runtimeId: "runtime-1", traceId: "trace-1" },
    mockResponse: { data: [{ b64_json: "abc" }] },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.request.endpoint, OPENAI_V1_IMAGES_EDITS_ENDPOINT);
  assert.equal(result.request.operation, "edit-image");
  assert.equal(result.request.images.length, 1);
  assert.equal(result.request.providerFieldsOpaque, true);
  assert.equal(result.response.mode, "mock");
});

test("OpenAI v1 images edits rejects missing image before provider calls", async () => {
  const result = await invokeOpenAIV1ImagesEdits({
    body: { model: "gpt-image-1", prompt: "replace background" },
    runtime: { runtimeId: "runtime-1" },
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }
  assert.equal(result.error.code, "MISSING_IMAGE");
  assert.equal(result.error.boundary, "input");
});

test("OpenAI v1 images edits invokes an injected caller and validates image-list responses", async () => {
  const result = await invokeOpenAIV1ImagesEdits({
    body: { model: "gpt-image-1", prompt: "replace background" },
    images: [{ sourceRef: "artifact://image/input.png" }],
    runtime: { runtimeId: "runtime-1" },
    dryRun: false,
    expectImageListResponse: true,
    caller: (envelope) => {
      assert.equal(envelope.url.endsWith("/v1/images/edits"), true);
      assert.equal(envelope.providerCallPlanned, true);
      return { data: [{ url: "https://example.test/edited.png" }] };
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  assert.equal(result.response.mode, "caller");
  assert.equal(result.capability.rawShape, "image-list");
});

test("OpenAI v1 images edits classifies provider rate limits", () => {
  assert.equal(classifyOpenAIV1ImagesEditsProviderError({ status: 429 }), "PROVIDER_RATE_LIMITED");
});
