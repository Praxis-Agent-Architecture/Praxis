import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import {
  OPENAI_V1_EVALS_ENDPOINT,
  classifyOpenAIV1EvalsProviderError,
  invokeOpenAIV1Evals,
} from "../../../../../src/modelAdapter/actualInvocationLayer/openai/v1_evals.js";

defineAgentCoreContractTest({
  sourcePath: "src/modelAdapter/actualInvocationLayer/openai/v1_evals.ts",
  docPath: "docs/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_evals.md",
  testFileUrl: import.meta.url,
});

test("OpenAI v1 evals builds a dry-run provider envelope", async () => {
  const result = await invokeOpenAIV1Evals({
    operation: "list",
    runtime: { runtimeId: "runtime-1", correlationId: "corr-1" },
    headers: { authorization: "Bearer redacted", empty: " " },
    query: { limit: 2, after: undefined },
    mockResponse: { data: [{ id: "eval_1" }] },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.request.endpoint, OPENAI_V1_EVALS_ENDPOINT);
  assert.equal(result.request.urlPath, "/v1/evals");
  assert.equal(result.request.providerFieldsOpaque, true);
  assert.equal(result.request.query.limit, "2");
  assert.equal(result.request.query.after, undefined);
  assert.equal(result.request.headers.authorization, "Bearer redacted");
  assert.equal(result.request.headers.empty, undefined);
  assert.deepEqual(result.response.raw, { data: [{ id: "eval_1" }] });
  assert.equal(result.response.mode, "mock");
});

test("OpenAI v1 evals rejects empty input before provider access", async () => {
  const result = await invokeOpenAIV1Evals();

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.equal(result.error.code, "MISSING_OPERATION");
  assert.equal(result.error.boundary, "input");
});

test("OpenAI v1 evals classifies retryable provider failures", async () => {
  assert.equal(classifyOpenAIV1EvalsProviderError({ status: 429 }), "PROVIDER_RATE_LIMITED");

  const result = await invokeOpenAIV1Evals({
    operation: "list",
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
