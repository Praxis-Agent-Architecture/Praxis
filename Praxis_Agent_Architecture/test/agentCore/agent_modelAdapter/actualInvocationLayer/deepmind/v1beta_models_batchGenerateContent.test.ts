import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import {
  DEEPMIND_V1BETA_MODELS_BATCH_GENERATE_CONTENT_ENDPOINT,
  classifyDeepMindV1BetaModelsBatchGenerateContentProviderError,
  invokeDeepMindV1BetaModelsBatchGenerateContent,
} from "../../../../../src/agentCore/agent_modelAdapter/actualInvocationLayer/deepmind/v1beta_models_batchGenerateContent.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_modelAdapter/actualInvocationLayer/deepmind/v1beta_models_batchGenerateContent.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_modelAdapter/actualInvocationLayer/deepmind/v1beta_models_batchGenerateContent.md",
  testFileUrl: import.meta.url,
});

test("DeepMind v1beta batchGenerateContent builds a guarded dry-run envelope", async () => {
  const result = await invokeDeepMindV1BetaModelsBatchGenerateContent({
    runtime: { runtimeId: "runtime-1", correlationId: "trace-1" },
    body: { requests: [{ contents: [{ parts: [{ text: "hello" }] }] }] },
    mockResponse: { responses: [{ candidates: [] }] },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.request.endpoint, DEEPMIND_V1BETA_MODELS_BATCH_GENERATE_CONTENT_ENDPOINT);
  assert.equal(result.request.method, "POST");
  assert.equal(result.request.unsafeSideEffects, false);
  assert.equal(result.request.runtime.correlationId, "trace-1");
  assert.deepEqual(result.response.raw, { responses: [{ candidates: [] }] });
});

test("DeepMind v1beta batchGenerateContent rejects missing runtime before provider access", async () => {
  const result = await invokeDeepMindV1BetaModelsBatchGenerateContent({
    body: { requests: [] },
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.equal(result.error.code, "MISSING_RUNTIME_ID");
  assert.equal(result.error.boundary, "input");
});

test("DeepMind v1beta batchGenerateContent wraps caller responses and classifies provider errors", async () => {
  const ok = await invokeDeepMindV1BetaModelsBatchGenerateContent({
    runtime: { runtimeId: "runtime-1" },
    body: { requests: [] },
    dryRun: false,
    expectBatchResultsArray: true,
    caller: (request) => {
      assert.equal(request.endpoint, DEEPMIND_V1BETA_MODELS_BATCH_GENERATE_CONTENT_ENDPOINT);
      return { responses: [] };
    },
  });

  assert.equal(ok.ok, true);
  if (!ok.ok) {
    return;
  }
  assert.equal(ok.response.mode, "caller");
  assert.equal(ok.capability.rawShape, "batch-generate-results");

  const failed = await invokeDeepMindV1BetaModelsBatchGenerateContent({
    runtime: { runtimeId: "runtime-1" },
    body: { requests: [] },
    dryRun: false,
    caller: () => {
      throw { name: "AbortError" };
    },
  });

  assert.equal(failed.ok, false);
  if (failed.ok) {
    return;
  }
  assert.equal(failed.error.code, "PROVIDER_TIMEOUT");
  assert.equal(failed.error.retryable, true);

  assert.equal(
    classifyDeepMindV1BetaModelsBatchGenerateContentProviderError({ statusCode: 401 }),
    "PROVIDER_AUTH_FAILED",
  );
});
