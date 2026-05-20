import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  OPENAI_V1_MODERATIONS_ENDPOINT,
  classifyOpenAIV1ModerationsProviderError,
  invokeOpenAIV1Moderations,
} from "../../../../../src/modelAdapter/actualInvocationLayer/openai/v1_moderations.js";

defineAgentCoreContractTest({
  sourcePath: "src/modelAdapter/actualInvocationLayer/openai/v1_moderations.ts",
  docPath: "docs/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_moderations.md",
  testFileUrl: import.meta.url,
});

test("OpenAI v1 moderations builds a dry-run moderation envelope", async () => {
  const result = await invokeOpenAIV1Moderations({
    body: { model: "omni-moderation-latest", input: "review this text" },
    runtime: { runtimeId: "runtime-1", traceId: "trace-1" },
    mockResponse: { id: "modr_1", results: [] },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.request.endpoint, OPENAI_V1_MODERATIONS_ENDPOINT);
  assert.equal(result.request.operation, "create-moderation");
  assert.equal(result.request.providerFieldsOpaque, true);
  assert.equal(result.response.mode, "mock");
  assert.equal(result.capability.rawShape, "mock");
});

test("OpenAI v1 moderations rejects missing body as an input boundary error", async () => {
  const result = await invokeOpenAIV1Moderations({ runtime: { runtimeId: "runtime-1" } });

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }
  assert.equal(result.error.code, "MISSING_BODY");
  assert.equal(result.error.boundary, "input");
});

test("OpenAI v1 moderations invokes only an injected caller in live mode", async () => {
  const result = await invokeOpenAIV1Moderations({
    body: { model: "omni-moderation-latest", input: "review this text" },
    runtime: { runtimeId: "runtime-1" },
    dryRun: false,
    expectResponseObject: true,
    caller: (envelope) => {
      assert.equal(envelope.providerCallPlanned, true);
      assert.equal(envelope.unsafeSideEffects, false);
      return { id: "modr_1", results: [{ flagged: false }] };
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  assert.equal(result.response.mode, "caller");
  assert.equal(result.capability.rawShape, "moderation-result");
});

test("OpenAI v1 moderations classifies provider rate limits", () => {
  assert.equal(classifyOpenAIV1ModerationsProviderError({ status: 429 }), "PROVIDER_RATE_LIMITED");
});
