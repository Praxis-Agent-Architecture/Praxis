import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  OPENAI_V1_BATCHES_ENDPOINT,
  invokeOpenAiV1Batches,
} from "../../../../../src/modelAdapter/actualInvocationLayer/openai/v1_batches.js";

defineAgentCoreContractTest({
  sourcePath: "src/modelAdapter/actualInvocationLayer/openai/v1_batches.ts",
  docPath: "docs/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_batches.md",
  testFileUrl: import.meta.url,
});

test("invokeOpenAiV1Batches builds a dry-run provider envelope without calling the provider", async () => {
  const result = await invokeOpenAiV1Batches({
    requestBody: { endpoint: "/v1/responses", completion_window: "24h" },
    baseUrl: "https://mock.openai.local/",
    apiKey: "sk-test",
    trace: { correlationId: " corr-1 ", callerId: " runtime.modelAdapter " },
  });

  assert.equal(result.ok, true);
  assert.equal(result.envelope.provider, "openai");
  assert.equal(result.envelope.endpoint, OPENAI_V1_BATCHES_ENDPOINT);
  assert.equal(result.envelope.url, "https://mock.openai.local/v1/batches");
  assert.equal(result.envelope.method, "POST");
  assert.equal(result.envelope.authState, "provided");
  assert.equal(result.envelope.capabilitySignals.providerShapePreserved, true);
  assert.equal(result.envelope.dryRun, true);
  assert.equal(result.envelope.unsafeSideEffects, false);
  assert.deepEqual(result.envelope.trace, { correlationId: "corr-1", callerId: "runtime.modelAdapter" });
});

test("invokeOpenAiV1Batches rejects empty input, invalid body, timeout, and governance denial", async () => {
  const missing = await invokeOpenAiV1Batches();
  assert.equal(missing.ok, false);
  assert.equal(missing.error.code, "MISSING_REQUEST");
  assert.equal(missing.error.boundary, "input");

  const invalidBody = await invokeOpenAiV1Batches({ requestBody: [] });
  assert.equal(invalidBody.ok, false);
  assert.equal(invalidBody.error.code, "INVALID_REQUEST_BODY");

  const invalidTimeout = await invokeOpenAiV1Batches({ requestBody: {}, timeoutMs: 0 });
  assert.equal(invalidTimeout.ok, false);
  assert.equal(invalidTimeout.error.code, "INVALID_TIMEOUT");

  const rejected = await invokeOpenAiV1Batches({
    requestBody: {},
    governance: { accepted: false, reason: "scope denied" },
  });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.error.code, "GOVERNANCE_REJECTED");
  assert.equal(rejected.error.boundary, "governance");
});

test("invokeOpenAiV1Batches normalizes mock responses and classifies provider failures", async () => {
  const success = await invokeOpenAiV1Batches({
    requestBody: { endpoint: "/v1/responses", completion_window: "24h" },
    apiKey: "sk-test",
    dryRun: false,
    mockCaller: (request) => {
      assert.equal(request.endpoint, OPENAI_V1_BATCHES_ENDPOINT);
      assert.equal(request.headers.authorization, "Bearer sk-test");
      return { status: 200, body: { id: "batch_1", object: "batch" }, headers: { "x-request-id": "req_1" } };
    },
  });

  assert.equal(success.ok, true);
  assert.equal(success.envelope.status, 200);
  assert.deepEqual(success.envelope.rawResponse, { id: "batch_1", object: "batch" });
  assert.deepEqual(success.envelope.responseHeaders, { "x-request-id": "req_1" });
  assert.equal(success.envelope.dryRun, false);

  const rateLimited = await invokeOpenAiV1Batches({
    requestBody: {},
    dryRun: false,
    mockCaller: () => ({ status: 429, body: { error: "too many requests" } }),
  });
  assert.equal(rateLimited.ok, false);
  assert.equal(rateLimited.error.code, "UPSTREAM_RATE_LIMITED");

  const drift = await invokeOpenAiV1Batches({
    requestBody: {},
    dryRun: false,
    mockCaller: () => ({ status: 200 }),
  });
  assert.equal(drift.ok, false);
  assert.equal(drift.error.code, "UPSTREAM_RESPONSE_DRIFT");

  const timeout = await invokeOpenAiV1Batches({
    requestBody: {},
    dryRun: false,
    mockCaller: () => {
      throw Object.assign(new Error("late provider"), { code: "ETIMEDOUT" });
    },
  });
  assert.equal(timeout.ok, false);
  assert.equal(timeout.error.code, "UPSTREAM_TIMEOUT");
});
