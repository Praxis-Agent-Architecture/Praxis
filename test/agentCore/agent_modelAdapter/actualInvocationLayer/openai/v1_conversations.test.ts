import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  OPENAI_V1_CONVERSATIONS_ENDPOINT,
  classifyOpenAIV1ConversationsProviderError,
  invokeOpenAIV1Conversations,
} from "../../../../../src/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_conversations.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_conversations.ts",
  docPath: "docs/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_conversations.md",
  testFileUrl: import.meta.url,
});

test("OpenAI v1 conversations builds a dry-run provider envelope", async () => {
  const result = await invokeOpenAIV1Conversations({
    operation: "list",
    method: "GET",
    query: { limit: 5 },
    runtime: { runtimeId: "runtime-1", invocationId: "invoke-1" },
    mockResponse: { object: "list", data: [] },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.request.endpoint, OPENAI_V1_CONVERSATIONS_ENDPOINT);
  assert.equal(result.request.query.limit, "5");
  assert.equal(result.request.providerFieldsOpaque, true);
  assert.equal(result.response.mode, "mock");
  assert.equal(result.capability.rawShape, "mock");
});

test("OpenAI v1 conversations rejects missing operation as an input boundary error", async () => {
  const result = await invokeOpenAIV1Conversations({ runtime: { runtimeId: "runtime-1" } });

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.equal(result.error.code, "MISSING_OPERATION");
  assert.equal(result.error.boundary, "input");
});

test("OpenAI v1 conversations invokes only an injected caller in live mode", async () => {
  const result = await invokeOpenAIV1Conversations({
    operation: "retrieve",
    method: "GET",
    pathSuffix: "conv_123",
    runtime: { runtimeId: "runtime-1" },
    dryRun: false,
    expectResponseObject: true,
    caller: (envelope) => {
      assert.equal(envelope.url.endsWith("/v1/conversations/conv_123"), true);
      assert.equal(envelope.providerCallPlanned, true);
      return { id: "conv_123", object: "conversation" };
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.response.mode, "caller");
  assert.equal(result.capability.rawShape, "conversation-object");
});

test("OpenAI v1 conversations classifies provider auth failures", () => {
  assert.equal(classifyOpenAIV1ConversationsProviderError({ statusCode: 401 }), "PROVIDER_AUTH_FAILED");
});
