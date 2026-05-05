import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  OPENAI_V1_CHAT_COMPLETIONS_ENDPOINT,
  invokeOpenAiV1ChatCompletions,
} from "../../../../../src/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_chat_completions.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_chat_completions.ts",
  docPath: "docs/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_chat_completions.md",
  testFileUrl: import.meta.url,
});

test("invokeOpenAiV1ChatCompletions builds a dry-run provider envelope without calling the provider", async () => {
  const result = await invokeOpenAiV1ChatCompletions({
    requestBody: { model: "gpt-test", messages: [{ role: "user", content: "hello" }] },
    baseUrl: "https://mock.openai.local/",
    apiKey: "sk-test",
    trace: { correlationId: " corr-1 ", callerId: " runtime.modelAdapter " },
  });

  assert.equal(result.ok, true);
  assert.equal(result.envelope.provider, "openai");
  assert.equal(result.envelope.endpoint, OPENAI_V1_CHAT_COMPLETIONS_ENDPOINT);
  assert.equal(result.envelope.url, "https://mock.openai.local/v1/chat/completions");
  assert.equal(result.envelope.method, "POST");
  assert.equal(result.envelope.authState, "provided");
  assert.equal(result.envelope.capabilitySignals.actualInvocationLayer, true);
  assert.equal(result.envelope.capabilitySignals.providerShapePreserved, true);
  assert.equal(result.envelope.dryRun, true);
  assert.equal(result.envelope.unsafeSideEffects, false);
  assert.deepEqual(result.envelope.trace, { correlationId: "corr-1", callerId: "runtime.modelAdapter" });
});

test("invokeOpenAiV1ChatCompletions rejects invalid input and contract or governance denials", async () => {
  const missing = await invokeOpenAiV1ChatCompletions();
  assert.equal(missing.ok, false);
  assert.equal(missing.error.code, "MISSING_REQUEST");

  const invalidBody = await invokeOpenAiV1ChatCompletions({ requestBody: "not-json-object" });
  assert.equal(invalidBody.ok, false);
  assert.equal(invalidBody.error.code, "INVALID_REQUEST_BODY");

  const rejectedByContract = await invokeOpenAiV1ChatCompletions({
    requestBody: {},
    contract: { accepted: false, reason: "contract denied" },
  });
  assert.equal(rejectedByContract.ok, false);
  assert.equal(rejectedByContract.error.code, "CONTRACT_REJECTED");
  assert.equal(rejectedByContract.error.boundary, "contract");

  const rejectedByGovernance = await invokeOpenAiV1ChatCompletions({
    requestBody: {},
    governance: { accepted: false, reason: "scope denied" },
  });
  assert.equal(rejectedByGovernance.ok, false);
  assert.equal(rejectedByGovernance.error.code, "GOVERNANCE_REJECTED");
  assert.equal(rejectedByGovernance.error.boundary, "governance");
});

test("invokeOpenAiV1ChatCompletions uses mockCaller and classifies upstream failures", async () => {
  const success = await invokeOpenAiV1ChatCompletions({
    requestBody: { model: "gpt-test", messages: [{ role: "user", content: "hello" }] },
    apiKey: "sk-test",
    dryRun: false,
    mockCaller: (request) => {
      assert.equal(request.endpoint, OPENAI_V1_CHAT_COMPLETIONS_ENDPOINT);
      assert.equal(request.headers.authorization, "Bearer sk-test");
      return {
        status: 200,
        body: { id: "chatcmpl_1", choices: [{ message: { role: "assistant", content: "hi" } }] },
      };
    },
  });

  assert.equal(success.ok, true);
  assert.equal(success.envelope.status, 200);
  assert.deepEqual(success.envelope.rawResponse, {
    id: "chatcmpl_1",
    choices: [{ message: { role: "assistant", content: "hi" } }],
  });
  assert.equal(success.envelope.dryRun, false);

  const rateLimited = await invokeOpenAiV1ChatCompletions({
    requestBody: {},
    dryRun: false,
    mockCaller: () => ({ status: 429, body: { error: "rate limited" } }),
  });
  assert.equal(rateLimited.ok, false);
  assert.equal(rateLimited.error.code, "UPSTREAM_RATE_LIMITED");

  const drift = await invokeOpenAiV1ChatCompletions({
    requestBody: {},
    dryRun: false,
    mockCaller: () => ({ status: 200 }),
  });
  assert.equal(drift.ok, false);
  assert.equal(drift.error.code, "UPSTREAM_RESPONSE_DRIFT");

  const timeout = await invokeOpenAiV1ChatCompletions({
    requestBody: {},
    dryRun: false,
    mockCaller: () => {
      throw Object.assign(new Error("late provider"), { code: "ETIMEDOUT" });
    },
  });
  assert.equal(timeout.ok, false);
  assert.equal(timeout.error.code, "UPSTREAM_TIMEOUT");
});
