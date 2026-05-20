import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  OPENAI_V1_MODELS_ENDPOINT,
  classifyOpenAIV1ModelsProviderError,
  invokeOpenAIV1Models,
} from "../../../../../src/agentCore_modelAdapter/actualInvocationLayer/openai/v1_models.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_modelAdapter/actualInvocationLayer/openai/v1_models.ts",
  docPath: "docs/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_models.md",
  testFileUrl: import.meta.url,
});

test("OpenAI v1 models builds a dry-run list envelope", async () => {
  const result = await invokeOpenAIV1Models({
    operation: "list",
    query: { limit: 20 },
    runtime: { runtimeId: "runtime-1", invocationId: "models-1" },
    mockResponse: { object: "list", data: [] },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.request.endpoint, OPENAI_V1_MODELS_ENDPOINT);
  assert.equal(result.request.method, "GET");
  assert.equal(result.request.query.limit, "20");
  assert.equal(result.request.providerFieldsOpaque, true);
  assert.equal(result.response.mode, "mock");
});

test("OpenAI v1 models requires modelId for retrieve and delete", async () => {
  const result = await invokeOpenAIV1Models({
    operation: "retrieve",
    runtime: { runtimeId: "runtime-1" },
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }
  assert.equal(result.error.code, "MISSING_MODEL_ID");
  assert.equal(result.error.boundary, "input");
});

test("OpenAI v1 models invokes only an injected caller in live mode", async () => {
  const result = await invokeOpenAIV1Models({
    operation: "retrieve",
    modelId: "gpt-4.1",
    runtime: { runtimeId: "runtime-1" },
    dryRun: false,
    expectResponseObject: true,
    caller: (envelope) => {
      assert.equal(envelope.url.endsWith("/v1/models/gpt-4.1"), true);
      assert.equal(envelope.providerCallPlanned, true);
      return { id: "gpt-4.1", object: "model" };
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  assert.equal(result.response.mode, "caller");
  assert.equal(result.capability.rawShape, "model-object");
});

test("OpenAI v1 models classifies provider unavailability", () => {
  assert.equal(classifyOpenAIV1ModelsProviderError({ status: 503 }), "PROVIDER_UNAVAILABLE");
});
