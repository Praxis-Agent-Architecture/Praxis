import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import {
  DEEPMIND_V1BETA_BATCHES_ENDPOINT,
  classifyDeepmindV1BetaBatchesProviderError,
  invokeDeepmindV1BetaBatches,
} from "../../../../../src/agentCore/agent_modelAdapter/actualInvocationLayer/deepmind/v1beta_batches.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_modelAdapter/actualInvocationLayer/deepmind/v1beta_batches.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_modelAdapter/actualInvocationLayer/deepmind/v1beta_batches.md",
  testFileUrl: import.meta.url,
});

test("DeepMind/Gemini v1beta batches builds a dry-run provider envelope", async () => {
  const result = await invokeDeepmindV1BetaBatches({
    operation: "list",
    runtime: { runtimeId: "runtime-1", correlationId: " corr-1 " },
    query: { pageSize: 20, empty: undefined },
    headers: { "x-goog-api-client": " praxis-test ", empty: " " },
    mockResponse: { batches: [{ name: "batches/1" }] },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.request.endpoint, DEEPMIND_V1BETA_BATCHES_ENDPOINT);
  assert.equal(result.request.urlPath, "/v1beta/batches");
  assert.equal(result.request.runtime.correlationId, "corr-1");
  assert.equal(result.request.query.pageSize, "20");
  assert.equal(result.request.query.empty, undefined);
  assert.equal(result.request.headers["x-goog-api-client"], "praxis-test");
  assert.equal(result.response.mode, "mock");
  assert.deepEqual(result.response.raw, { batches: [{ name: "batches/1" }] });
  assert.equal(result.response.providerFieldsOpaque, true);
});

test("DeepMind/Gemini v1beta batches rejects empty input before provider access", async () => {
  const result = await invokeDeepmindV1BetaBatches();

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.equal(result.error.code, "MISSING_OPERATION");
  assert.equal(result.error.boundary, "input");
});

test("DeepMind/Gemini v1beta batches classifies retryable provider failures", async () => {
  assert.equal(classifyDeepmindV1BetaBatchesProviderError({ status: 429 }), "PROVIDER_RATE_LIMITED");

  const result = await invokeDeepmindV1BetaBatches({
    operation: "get",
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
