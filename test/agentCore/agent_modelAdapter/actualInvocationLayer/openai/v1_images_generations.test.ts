import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  OPENAI_V1_IMAGES_GENERATIONS_ENDPOINT,
  classifyOpenAIV1ImagesGenerationsProviderError,
  invokeOpenAIV1ImagesGenerations,
} from "../../../../../src/modelAdapter/actualInvocationLayer/openai/v1_images_generations.js";
import { createApiKeyAuthEnvelope } from "../../../../../src/modelAdapter/authProfileLayer/authEnvelope.js";
import { createCredentialRef } from "../../../../../src/modelAdapter/authProfileLayer/credentialRef.js";

defineAgentCoreContractTest({
  sourcePath: "src/modelAdapter/actualInvocationLayer/openai/v1_images_generations.ts",
  docPath: "docs/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_images_generations.md",
  testFileUrl: import.meta.url,
});

function testAuthEnvelope() {
  const ref = createCredentialRef({
    id: "images-test",
    provider: "openai",
    credentialType: "openai_api_key",
    source: { kind: "test", label: "unit" },
  });
  assert.equal(ref.ok, true);
  if (!ref.ok) {
    throw new Error("expected ref");
  }
  return createApiKeyAuthEnvelope({ credentialRef: ref.credentialRef, apiKey: "sk-test-secret-images" }).envelope;
}

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
    auth: testAuthEnvelope(),
    governance: { accepted: true },
    expectImageListResponse: true,
    caller: (envelope) => {
      assert.equal(envelope.providerCallPlanned, true);
      assert.equal(envelope.unsafeSideEffects, false);
      assert.equal(envelope.headers.authorization, "[redacted:28]");
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

test("OpenAI v1 images generations blocks live mode without explicit auth/gov/caller", async () => {
  const missingAuth = await invokeOpenAIV1ImagesGenerations({
    body: { model: "gpt-image-1", prompt: "x" },
    runtime: { runtimeId: "runtime-1" },
    dryRun: false,
    governance: { accepted: true },
  });
  assert.equal(missingAuth.ok, false);
  if (!missingAuth.ok) {
    assert.equal(missingAuth.error.code, "AUTH_REJECTED");
  }

  const missingCaller = await invokeOpenAIV1ImagesGenerations({
    body: { model: "gpt-image-1", prompt: "x" },
    runtime: { runtimeId: "runtime-1" },
    dryRun: false,
    governance: { accepted: true },
    auth: testAuthEnvelope(),
  });
  assert.equal(missingCaller.ok, false);
  if (!missingCaller.ok) {
    assert.equal(missingCaller.error.code, "CALLER_REQUIRED");
  }
});
