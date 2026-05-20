import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  OPENAI_V1_THREADS_ENDPOINT,
  classifyOpenAIV1ThreadsProviderError,
  invokeOpenAIV1Threads,
} from "../../../../../src/agentCore_modelAdapter/actualInvocationLayer/openai/v1_threads.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_modelAdapter/actualInvocationLayer/openai/v1_threads.ts",
  docPath: "docs/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_threads.md",
  testFileUrl: import.meta.url,
});

test("OpenAI v1 threads builds a dry-run provider envelope", async () => {
  const result = await invokeOpenAIV1Threads({
    operation: "create",
    body: { metadata: { purpose: "agentCore-smoke" } },
    runtime: { runtimeId: "runtime-1", invocationId: "threads-1" },
    mockResponse: { id: "thread_1", object: "thread" },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.request.endpoint, OPENAI_V1_THREADS_ENDPOINT);
  assert.equal(result.request.method, "POST");
  assert.equal(result.request.providerFieldsOpaque, true);
  assert.equal(result.response.mode, "mock");
});

test("OpenAI v1 threads rejects governance denial with a governance boundary", async () => {
  const result = await invokeOpenAIV1Threads({
    operation: "create",
    runtime: { runtimeId: "runtime-1" },
    governance: { accepted: false, reason: "scope not approved" },
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.equal(result.error.code, "GOVERNANCE_REJECTED");
  assert.equal(result.error.boundary, "governance");
});

test("OpenAI v1 threads invokes only an injected caller in live mode", async () => {
  const result = await invokeOpenAIV1Threads({
    operation: "retrieve",
    method: "GET",
    pathSuffix: "thread_123",
    runtime: { runtimeId: "runtime-1" },
    dryRun: false,
    expectResponseObject: true,
    caller: (envelope) => {
      assert.equal(envelope.url.endsWith("/v1/threads/thread_123"), true);
      assert.equal(envelope.providerCallPlanned, true);
      return { id: "thread_123", object: "thread" };
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.response.mode, "caller");
  assert.equal(result.capability.rawShape, "thread-object");
});

test("OpenAI v1 threads classifies provider timeouts", () => {
  assert.equal(classifyOpenAIV1ThreadsProviderError({ name: "AbortError" }), "PROVIDER_TIMEOUT");
});
