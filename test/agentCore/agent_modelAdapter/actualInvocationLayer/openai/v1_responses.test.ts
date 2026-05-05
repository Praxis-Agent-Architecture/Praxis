import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  OPENAI_V1_RESPONSES_ENDPOINT,
  classifyOpenAIV1ResponsesProviderError,
  invokeOpenAIV1Responses,
} from "../../../../../src/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_responses.js";
import { createApiKeyAuthEnvelope } from "../../../../../src/agentCore/agent_modelAdapter/authProfileLayer/authEnvelope.js";
import { createCredentialRef } from "../../../../../src/agentCore/agent_modelAdapter/authProfileLayer/credentialRef.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_responses.ts",
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
