import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  OPENAI_V1_CHAT_COMPLETIONS_ENDPOINT,
  invokeOpenAiV1ChatCompletions,
} from "../../../../../src/modelAdapter/actualInvocationLayer/openai/v1_chat_completions.js";
import { createApiKeyAuthEnvelope } from "../../../../../src/modelAdapter/authProfileLayer/authEnvelope.js";
import { createCredentialRef } from "../../../../../src/modelAdapter/authProfileLayer/credentialRef.js";

defineAgentCoreContractTest({
  sourcePath: "src/modelAdapter/actualInvocationLayer/openai/v1_chat_completions.ts",
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
      assert.equal(request.headers["content-type"], "application/json");
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

test("invokeOpenAiV1ChatCompletions uses public auth envelope with injected live caller and extracts usage", async () => {
  const credential = createCredentialRef({
    id: "openai-api",
    provider: "openai",
    credentialType: "openai_api_key",
    source: { kind: "test", label: "unit" },
  });
  assert.equal(credential.ok, true);
  if (!credential.ok) return;

  const auth = createApiKeyAuthEnvelope({
    credentialRef: credential.credentialRef,
    apiKey: "sk-secret-openai",
  });

  const result = await invokeOpenAiV1ChatCompletions({
    requestBody: { model: "compatible-chat", messages: [{ role: "user", content: "hello" }] },
    baseUrl: "https://gateway.example.com/v1",
    dryRun: false,
    governance: { accepted: true },
    auth: auth.envelope,
    caller: (request) => {
      assert.equal(request.endpoint, OPENAI_V1_CHAT_COMPLETIONS_ENDPOINT);
      assert.equal(request.url, "https://gateway.example.com/v1/chat/completions");
      assert.equal(request.headers["content-type"], "application/json");
      assert.equal(request.headers.authorization, "[redacted:23]");
      return {
        id: "chatcmpl_1",
        choices: [{ message: { role: "assistant", content: "hi" } }],
        usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
      };
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.envelope.rawResponse, {
    id: "chatcmpl_1",
    choices: [{ message: { role: "assistant", content: "hi" } }],
    usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
  });
  assert.equal(result.envelope.usage?.source, "openai.chat_completions.usage");
  assert.equal(result.envelope.usage?.inputTokens, 3);
  assert.equal(result.envelope.usage?.outputTokens, 2);
  assert.equal(result.envelope.usage?.totalTokens, 5);
});

test("invokeOpenAiV1ChatCompletions extracts cache telemetry from OpenAI-compatible usage fields", async () => {
  const detailResult = await invokeOpenAiV1ChatCompletions({
    requestBody: { model: "compatible-chat", messages: [{ role: "user", content: "hello" }] },
    dryRun: false,
    mockCaller: () => ({
      status: 200,
      body: {
        id: "chatcmpl_cached_details",
        choices: [{ message: { role: "assistant", content: "hi" } }],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 5,
          total_tokens: 105,
          prompt_tokens_details: { cached_tokens: 90 },
        },
      },
    }),
  });

  assert.equal(detailResult.ok, true);
  if (!detailResult.ok) return;
  assert.equal(detailResult.envelope.usage?.inputTokens, 100);
  assert.equal(detailResult.envelope.usage?.cachedInputTokens, 90);

  const deepSeekResult = await invokeOpenAiV1ChatCompletions({
    requestBody: { model: "deepseek-v4-pro", messages: [{ role: "user", content: "hello" }] },
    dryRun: false,
    mockCaller: () => ({
      status: 200,
      body: {
        id: "chatcmpl_deepseek_cache",
        choices: [{ message: { role: "assistant", content: "hi" } }],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 5,
          total_tokens: 105,
          prompt_cache_hit_tokens: 91,
          prompt_cache_miss_tokens: 9,
          completion_tokens_details: { reasoning_tokens: 2 },
        },
      },
    }),
  });

  assert.equal(deepSeekResult.ok, true);
  if (!deepSeekResult.ok) return;
  assert.equal(deepSeekResult.envelope.usage?.inputTokens, 100);
  assert.equal(deepSeekResult.envelope.usage?.cachedInputTokens, 91);
  assert.equal(deepSeekResult.envelope.usage?.reasoningTokens, 2);
});

test("invokeOpenAiV1ChatCompletions maps Praxis DeepSeek reasoning levels onto provider fields", async () => {
  const highResult = await invokeOpenAiV1ChatCompletions({
    requestBody: {
      model: "deepseek-v4-pro",
      messages: [{ role: "user", content: "hello" }],
      reasoning_effort: "high",
    },
    dryRun: false,
    mockCaller: (request) => {
      assert.deepEqual(request.requestBody.thinking, { type: "enabled" });
      assert.equal(request.requestBody.reasoning_effort, "max");
      return {
        status: 200,
        body: { choices: [{ message: { role: "assistant", content: "ok" } }] },
      };
    },
  });
  assert.equal(highResult.ok, true);

  const noneResult = await invokeOpenAiV1ChatCompletions({
    requestBody: {
      model: "deepseek-v4-flash",
      messages: [{ role: "user", content: "hello" }],
      reasoning_effort: "none",
    },
    dryRun: true,
  });
  assert.equal(noneResult.ok, true);
  if (!noneResult.ok) return;
  assert.deepEqual(noneResult.envelope.requestBody.thinking, { type: "disabled" });
  assert.equal("reasoning_effort" in noneResult.envelope.requestBody, false);
});

test("invokeOpenAiV1ChatCompletions extracts usage from streaming chat completions chunks", async () => {
  const result = await invokeOpenAiV1ChatCompletions({
    requestBody: { model: "deepseek-v4-pro", stream: true, messages: [{ role: "user", content: "hello" }] },
    dryRun: false,
    mockCaller: () => ({
      status: 200,
      body: [
        'data: {"choices":[{"delta":{"content":"hi"}}],"usage":null}',
        "",
        'data: {"choices":[],"usage":{"prompt_tokens":100,"completion_tokens":8,"total_tokens":108,"prompt_cache_hit_tokens":92,"prompt_cache_miss_tokens":8}}',
        "",
        "data: [DONE]",
        "",
      ].join("\n"),
    }),
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.envelope.usage?.inputTokens, 100);
  assert.equal(result.envelope.usage?.outputTokens, 8);
  assert.equal(result.envelope.usage?.cachedInputTokens, 92);
});
