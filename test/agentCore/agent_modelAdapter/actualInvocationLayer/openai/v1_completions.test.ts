import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  OPENAI_V1_COMPLETIONS_ENDPOINT,
  classifyOpenAIV1CompletionsProviderError,
  invokeOpenAIV1Completions,
} from "../../../../../src/agentCore_modelAdapter/actualInvocationLayer/openai/v1_completions.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_modelAdapter/actualInvocationLayer/openai/v1_completions.ts",
  docPath: "docs/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_completions.md",
  testFileUrl: import.meta.url,
});

test("OpenAI v1 completions builds a dry-run provider envelope", async () => {
  const result = await invokeOpenAIV1Completions({
    body: { model: "gpt-3.5-turbo-instruct", prompt: "hello" },
    runtime: { runtimeId: "runtime-1", traceId: "trace-1" },
    mockResponse: { id: "cmpl_1", object: "text_completion" },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.request.endpoint, OPENAI_V1_COMPLETIONS_ENDPOINT);
  assert.equal(result.request.operation, "create-completion");
  assert.equal(result.request.providerFieldsOpaque, true);
  assert.equal(result.response.mode, "mock");
  assert.equal(result.capability.rawShape, "mock");
});

test("OpenAI v1 completions rejects missing body as an input boundary error", async () => {
  const result = await invokeOpenAIV1Completions({ runtime: { runtimeId: "runtime-1" } });

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.equal(result.error.code, "MISSING_BODY");
  assert.equal(result.error.boundary, "input");
});

test("OpenAI v1 completions invokes only an injected caller in live mode", async () => {
  const result = await invokeOpenAIV1Completions({
    body: { model: "gpt-3.5-turbo-instruct", prompt: "hello" },
    runtime: { runtimeId: "runtime-1" },
    dryRun: false,
    expectResponseObject: true,
    caller: (envelope) => {
      assert.equal(envelope.providerCallPlanned, true);
      assert.equal(envelope.unsafeSideEffects, false);
      return { id: "cmpl_1", choices: [] };
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.response.mode, "caller");
  assert.equal(result.capability.rawShape, "completion-object");
});

test("OpenAI v1 completions classifies provider rate limits", () => {
  assert.equal(classifyOpenAIV1CompletionsProviderError({ status: 429 }), "PROVIDER_RATE_LIMITED");
});
