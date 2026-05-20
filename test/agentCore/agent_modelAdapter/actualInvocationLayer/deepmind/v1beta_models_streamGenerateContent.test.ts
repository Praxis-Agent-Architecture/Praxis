import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  DEEPMIND_V1BETA_MODELS_STREAM_GENERATE_CONTENT_ENDPOINT,
  classifyDeepMindV1BetaModelsStreamGenerateContentProviderError,
  invokeDeepMindV1BetaModelsStreamGenerateContent,
} from "../../../../../src/agentCore_modelAdapter/actualInvocationLayer/deepmind/v1beta_models_streamGenerateContent.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_modelAdapter/actualInvocationLayer/deepmind/v1beta_models_streamGenerateContent.ts",
  docPath: "docs/agentCore/agent_modelAdapter/actualInvocationLayer/deepmind/v1beta_models_streamGenerateContent.md",
  testFileUrl: import.meta.url,
});

test("DeepMind v1beta streamGenerateContent builds a dry-run stream envelope", async () => {
  const result = await invokeDeepMindV1BetaModelsStreamGenerateContent({
    model: "models/gemini-pro",
    body: { contents: [{ role: "user", parts: [{ text: "hello" }] }] },
    runtime: { runtimeId: "runtime-1", traceId: "trace-1" },
    mockChunks: [{ text: "he" }, { text: "llo" }],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.request.endpoint, DEEPMIND_V1BETA_MODELS_STREAM_GENERATE_CONTENT_ENDPOINT);
  assert.equal(result.request.providerFieldsOpaque, true);
  assert.equal(result.request.providerCallPlanned, false);
  assert.equal(result.response.mode, "mock");
  assert.equal(result.response.chunks.length, 2);
  assert.equal(result.capability.operation, "stream-generate-content");
});

test("DeepMind v1beta streamGenerateContent rejects scope drift before caller execution", async () => {
  const result = await invokeDeepMindV1BetaModelsStreamGenerateContent({
    model: "models/gemini-pro",
    body: {},
    runtime: { runtimeId: "runtime-1" },
    requiredScopes: ["model.stream", "model.admin"],
    allowedScopes: ["model.stream"],
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }
  assert.equal(result.error.code, "SCOPE_DENIED");
  assert.equal(result.error.boundary, "scope");
});

test("DeepMind v1beta streamGenerateContent collects injected provider chunks", async () => {
  const result = await invokeDeepMindV1BetaModelsStreamGenerateContent({
    model: "models/gemini-pro",
    body: { contents: [] },
    runtime: { runtimeId: "runtime-1" },
    dryRun: false,
    expectAtLeastOneChunk: true,
    caller: () => [{ delta: "a" }, { delta: "b" }],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  assert.equal(result.response.mode, "caller");
  assert.deepEqual(result.response.chunks, [{ delta: "a" }, { delta: "b" }]);
});

test("DeepMind v1beta streamGenerateContent classifies provider timeout", () => {
  assert.equal(
    classifyDeepMindV1BetaModelsStreamGenerateContentProviderError({ name: "AbortError" }),
    "PROVIDER_TIMEOUT",
  );
});
