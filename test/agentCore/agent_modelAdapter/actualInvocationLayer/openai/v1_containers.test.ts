import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  OPENAI_V1_CONTAINERS_ENDPOINT,
  classifyOpenAIV1ContainersProviderError,
  invokeOpenAIV1Containers,
} from "../../../../../src/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_containers.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_containers.ts",
  docPath: "docs/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_containers.md",
  testFileUrl: import.meta.url,
});

test("OpenAI v1 containers builds a dry-run provider envelope", async () => {
  const result = await invokeOpenAIV1Containers({
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

  assert.equal(result.request.endpoint, OPENAI_V1_CONTAINERS_ENDPOINT);
  assert.equal(result.request.query.limit, "10");
  assert.equal(result.request.providerFieldsOpaque, true);
  assert.equal(result.response.mode, "mock");
  assert.equal(result.capability.rawShape, "mock");
});

test("OpenAI v1 containers rejects governance denial without provider calls", async () => {
  const result = await invokeOpenAIV1Containers({
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

test("OpenAI v1 containers invokes only an injected caller in live mode", async () => {
  const result = await invokeOpenAIV1Containers({
    operation: "retrieve",
    method: "GET",
    pathSuffix: "cntr_123",
    runtime: { runtimeId: "runtime-1" },
    dryRun: false,
    expectResponseObject: true,
    caller: (envelope) => {
      assert.equal(envelope.url.endsWith("/v1/containers/cntr_123"), true);
      assert.equal(envelope.providerCallPlanned, true);
      return { id: "cntr_123", object: "container" };
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.response.mode, "caller");
  assert.equal(result.capability.rawShape, "container-object");
});

test("OpenAI v1 containers classifies provider timeouts", () => {
  assert.equal(classifyOpenAIV1ContainersProviderError({ name: "AbortError" }), "PROVIDER_TIMEOUT");
});
