import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import {
  DEEPMIND_V1BETA_MODELS_BATCH_EMBED_CONTENTS_ENDPOINT,
  classifyDeepMindV1BetaModelsBatchEmbedContentsProviderError,
  invokeDeepMindV1BetaModelsBatchEmbedContents,
} from "../../../../../src/agentCore/agent_modelAdapter/actualInvocationLayer/deepmind/v1beta_models_batchEmbedContents.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_modelAdapter/actualInvocationLayer/deepmind/v1beta_models_batchEmbedContents.ts",
  docPath: "docs/agentCore/agent_modelAdapter/actualInvocationLayer/deepmind/v1beta_models_batchEmbedContents.md",
  testFileUrl: import.meta.url,
});

test("DeepMind v1beta batchEmbedContents builds a guarded dry-run envelope", async () => {
  const result = await invokeDeepMindV1BetaModelsBatchEmbedContents({
    runtime: { runtimeId: "runtime-1" },
    body: { requests: [{ content: { parts: [{ text: "hello" }] } }] },
    mockResponse: { embeddings: [{ values: [0.1, 0.2] }] },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.request.endpoint, DEEPMIND_V1BETA_MODELS_BATCH_EMBED_CONTENTS_ENDPOINT);
  assert.equal(result.request.method, "POST");
  assert.equal(result.request.unsafeSideEffects, false);
  assert.equal(result.response.mode, "mock");
  assert.deepEqual(result.response.raw, { embeddings: [{ values: [0.1, 0.2] }] });
});

test("DeepMind v1beta batchEmbedContents rejects missing body", async () => {
  const result = await invokeDeepMindV1BetaModelsBatchEmbedContents({
    runtime: { runtimeId: "runtime-1" },
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.equal(result.error.code, "MISSING_BODY");
  assert.equal(result.error.boundary, "input");
});

test("DeepMind v1beta batchEmbedContents wraps caller responses and classifies drift", async () => {
  const ok = await invokeDeepMindV1BetaModelsBatchEmbedContents({
    runtime: { runtimeId: "runtime-1" },
    body: { requests: [] },
    dryRun: false,
    expectEmbeddingsArray: true,
    caller: (request) => {
      assert.equal(request.endpoint, DEEPMIND_V1BETA_MODELS_BATCH_EMBED_CONTENTS_ENDPOINT);
      return { embeddings: [] };
    },
  });

  assert.equal(ok.ok, true);
  if (!ok.ok) {
    return;
  }
  assert.equal(ok.capability.rawShape, "embeddings-list");

  const drift = await invokeDeepMindV1BetaModelsBatchEmbedContents({
    runtime: { runtimeId: "runtime-1" },
    body: { requests: [] },
    dryRun: false,
    expectEmbeddingsArray: true,
    caller: () => ({ unexpected: true }),
  });
  assert.equal(drift.ok, false);
  if (drift.ok) {
    return;
  }
  assert.equal(drift.error.code, "RESPONSE_FORMAT_DRIFT");

  assert.equal(
    classifyDeepMindV1BetaModelsBatchEmbedContentsProviderError({ status: 503 }),
    "PROVIDER_UNAVAILABLE",
  );
});
