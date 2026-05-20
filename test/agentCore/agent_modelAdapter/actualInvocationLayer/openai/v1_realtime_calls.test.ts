import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import {
  OPENAI_V1_REALTIME_CALLS_ENDPOINT,
  classifyOpenAIV1RealtimeCallsProviderError,
  invokeOpenAIV1RealtimeCalls,
} from "../../../../../src/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_realtime_calls.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_realtime_calls.ts",
  docPath: "docs/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_realtime_calls.md",
  testFileUrl: import.meta.url,
});

test("openai v1 realtime calls builds a dry-run provider envelope", async () => {
  const result = await invokeOpenAIV1RealtimeCalls({
    requestBody: { model: "gpt-realtime", call: { id: "call_1" } },
    runtime: { runtimeId: "runtime-1", invocationId: "invoke-1" },
    requiredScopes: ["realtime:calls"],
    allowedScopes: ["realtime:calls"],
    headers: { "OpenAI-Beta": "realtime=v1" },
    mockResponse: { id: "call_1" },
  });

  assert.ok(result.ok);
  assert.equal(result.request.endpoint, OPENAI_V1_REALTIME_CALLS_ENDPOINT);
  assert.equal(result.request.method, "POST");
  assert.equal(result.request.dryRun, true);
  assert.equal(result.request.providerCallPlanned, false);
  assert.equal(result.request.providerFieldsOpaque, true);
  assert.deepEqual(result.response.raw, { id: "call_1" });
  assert.equal(result.capability.rawShape, "mock");
});

test("openai v1 realtime calls classifies provider timeout errors", () => {
  assert.equal(classifyOpenAIV1RealtimeCallsProviderError({ code: "ETIMEDOUT" }), "PROVIDER_TIMEOUT");
});

test("openai v1 realtime calls rejects missing request body", async () => {
  const result = await invokeOpenAIV1RealtimeCalls();

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "MISSING_REQUEST_BODY");
  assert.equal(result.error.boundary, "input");
});
