import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  OPENAI_V1_ASSISTANTS_ENDPOINT,
  classifyOpenAIV1AssistantsProviderError,
  invokeOpenAIV1Assistants,
} from "../../../../../src/agentCore_modelAdapter/actualInvocationLayer/openai/v1_assistants.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_modelAdapter/actualInvocationLayer/openai/v1_assistants.ts",
  docPath: "docs/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_assistants.md",
  testFileUrl: import.meta.url,
});

test("OpenAI v1 assistants builds a dry-run provider envelope", async () => {
  const result = await invokeOpenAIV1Assistants({
    operation: "list",
    method: "GET",
    query: { limit: 10 },
    runtime: { runtimeId: "runtime-1", invocationId: "invoke-1" },
    mockResponse: { object: "list", data: [] },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.request.provider, "openai");
  assert.equal(result.request.endpoint, OPENAI_V1_ASSISTANTS_ENDPOINT);
  assert.equal(result.request.query.limit, "10");
  assert.equal(result.request.providerFieldsOpaque, true);
  assert.equal(result.response.mode, "mock");
  assert.equal(result.capability.operation, "list");
});

test("OpenAI v1 assistants rejects governance denial without provider calls", async () => {
  const result = await invokeOpenAIV1Assistants({
    operation: "create",
    runtime: { runtimeId: "runtime-1" },
    governance: { accepted: false, reason: "outside policy" },
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }
  assert.equal(result.error.code, "GOVERNANCE_REJECTED");
  assert.equal(result.error.boundary, "governance");
});

test("OpenAI v1 assistants invokes only an injected caller in live mode", async () => {
  const result = await invokeOpenAIV1Assistants({
    operation: "retrieve",
    method: "GET",
    pathSuffix: "asst_123",
    runtime: { runtimeId: "runtime-1" },
    dryRun: false,
    expectResponseObject: true,
    caller: (envelope) => {
      assert.equal(envelope.url.endsWith("/v1/assistants/asst_123"), true);
      assert.equal(envelope.providerCallPlanned, true);
      return { id: "asst_123", object: "assistant" };
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  assert.equal(result.response.mode, "caller");
  assert.equal(result.capability.rawShape, "assistant-object");
});

test("OpenAI v1 assistants classifies provider auth failures", () => {
  assert.equal(classifyOpenAIV1AssistantsProviderError({ statusCode: 401 }), "PROVIDER_AUTH_FAILED");
});
