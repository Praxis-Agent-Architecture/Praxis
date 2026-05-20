import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  OPENAI_V1_RESPONSES_ENDPOINT,
  classifyOpenAIV1ResponsesProviderError,
  extractOpenAIV1ResponsesUsage,
  invokeOpenAIV1Responses,
} from "../../../../../src/agentCore_modelAdapter/actualInvocationLayer/openai/v1_responses.js";
import { createApiKeyAuthEnvelope } from "../../../../../src/agentCore_modelAdapter/authProfileLayer/authEnvelope.js";
import { createCredentialRef } from "../../../../../src/agentCore_modelAdapter/authProfileLayer/credentialRef.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_modelAdapter/actualInvocationLayer/openai/v1_responses.ts",
  docPath: "docs/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_responses.md",
  testFileUrl: import.meta.url,
});

function testAuthEnvelope() {
  const ref = createCredentialRef({
    id: "responses-test",
    provider: "openai",
    credentialType: "openai_api_key",
    source: { kind: "test", label: "unit" },
  });
  assert.equal(ref.ok, true);
  if (!ref.ok) {
    throw new Error("expected ref");
  }
  return createApiKeyAuthEnvelope({ credentialRef: ref.credentialRef, apiKey: "sk-test-secret-responses" }).envelope;
}

test("OpenAI v1 responses builds a dry-run provider envelope", async () => {
  const result = await invokeOpenAIV1Responses({
    operation: "create",
    body: { model: "gpt-5.4", input: "hello" },
    runtime: { runtimeId: "runtime-1", invocationId: "responses-1" },
    mockResponse: { id: "resp_1", object: "response" },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.request.endpoint, OPENAI_V1_RESPONSES_ENDPOINT);
  assert.equal(result.request.method, "POST");
  assert.equal(result.request.providerFieldsOpaque, true);
  assert.equal(result.response.mode, "mock");
  assert.equal(result.capability.rawShape, "mock");
});

test("OpenAI v1 responses rejects missing operation as an input boundary error", async () => {
  const result = await invokeOpenAIV1Responses({ runtime: { runtimeId: "runtime-1" } });

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.equal(result.error.code, "MISSING_OPERATION");
  assert.equal(result.error.boundary, "input");
});

test("OpenAI v1 responses invokes only an injected caller in live mode", async () => {
  const result = await invokeOpenAIV1Responses({
    operation: "retrieve",
    method: "GET",
    pathSuffix: "resp_123",
    runtime: { runtimeId: "runtime-1" },
    dryRun: false,
    auth: testAuthEnvelope(),
    governance: { accepted: true },
    expectResponseObject: true,
    caller: (envelope) => {
      assert.equal(envelope.url.endsWith("/v1/responses/resp_123"), true);
      assert.equal(envelope.providerCallPlanned, true);
      assert.equal(envelope.headers.authorization, "[redacted:31]");
      return { id: "resp_123", object: "response" };
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.response.mode, "caller");
  assert.equal(result.capability.rawShape, "response-object");
});

test("OpenAI v1 responses normalizes provider usage from response objects and SSE completions", () => {
  assert.deepEqual(extractOpenAIV1ResponsesUsage({
    id: "resp_123",
    usage: {
      input_tokens: 123,
      output_tokens: 45,
      total_tokens: 168,
      input_tokens_details: { cached_tokens: 12 },
      output_tokens_details: { reasoning_tokens: 9 },
    },
  }), {
    source: "openai.responses.usage",
    inputTokens: 123,
    outputTokens: 45,
    totalTokens: 168,
    cachedInputTokens: 12,
    reasoningTokens: 9,
    estimated: false,
  });

  const sse = [
    'data: {"type":"response.output_text.delta","delta":"hello"}',
    "",
    'data: {"type":"response.completed","response":{"usage":{"input_tokens":5,"output_tokens":2,"output_tokens_details":{"reasoning_tokens":1}}}}',
    "",
    "data: [DONE]",
    "",
  ].join("\n");
  assert.deepEqual(extractOpenAIV1ResponsesUsage(sse), {
    source: "openai.responses.usage",
    inputTokens: 5,
    outputTokens: 2,
    totalTokens: undefined,
    cachedInputTokens: undefined,
    reasoningTokens: 1,
    estimated: false,
  });
});

test("OpenAI v1 responses classifies provider rate limits", () => {
  assert.equal(classifyOpenAIV1ResponsesProviderError({ status: 429 }), "PROVIDER_RATE_LIMITED");
});

test("OpenAI v1 responses requires governance, auth, and caller for live mode", async () => {
  const missingGovernance = await invokeOpenAIV1Responses({
    operation: "create",
    runtime: { runtimeId: "runtime-1" },
    dryRun: false,
    auth: testAuthEnvelope(),
  });
  assert.equal(missingGovernance.ok, false);
  if (!missingGovernance.ok) {
    assert.equal(missingGovernance.error.code, "GOVERNANCE_REJECTED");
  }

  const missingAuth = await invokeOpenAIV1Responses({
    operation: "create",
    runtime: { runtimeId: "runtime-1" },
    dryRun: false,
    governance: { accepted: true },
  });
  assert.equal(missingAuth.ok, false);
  if (!missingAuth.ok) {
    assert.equal(missingAuth.error.code, "AUTH_REJECTED");
  }

  const missingCaller = await invokeOpenAIV1Responses({
    operation: "create",
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
