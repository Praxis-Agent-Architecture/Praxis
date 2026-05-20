import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import {
  OPENAI_V1_VIDEOS_ENDPOINT,
  classifyOpenAIV1VideosProviderError,
  invokeOpenAIV1Videos,
} from "../../../../../src/agentCore_modelAdapter/actualInvocationLayer/openai/v1_videos.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_modelAdapter/actualInvocationLayer/openai/v1_videos.ts",
  docPath: "docs/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_videos.md",
  testFileUrl: import.meta.url,
});

test("OpenAI v1 videos builds a dry-run provider envelope", async () => {
  const result = await invokeOpenAIV1Videos({
    operation: "create",
    method: "POST",
    runtime: { runtimeId: "runtime-1", callerId: "adapter-test" },
    body: { prompt: "short product shot", model: "sora-2" },
    mockResponse: { id: "video_1", status: "queued" },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.request.endpoint, OPENAI_V1_VIDEOS_ENDPOINT);
  assert.equal(result.request.urlPath, "/v1/videos");
  assert.equal(result.request.method, "POST");
  assert.equal(result.request.unsafeSideEffects, false);
  assert.equal(result.request.providerFieldsOpaque, true);
  assert.deepEqual(result.response.raw, { id: "video_1", status: "queued" });
  assert.equal(result.response.mode, "mock");
});

test("OpenAI v1 videos rejects governance and scope boundary failures", async () => {
  const governanceRejected = await invokeOpenAIV1Videos({
    operation: "create",
    runtime: { runtimeId: "runtime-1" },
    governance: { accepted: false, reason: "video generation disabled" },
  });

  assert.equal(governanceRejected.ok, false);
  if (!governanceRejected.ok) {
    assert.equal(governanceRejected.error.code, "GOVERNANCE_REJECTED");
    assert.equal(governanceRejected.error.message, "video generation disabled");
  }

  const scopeDenied = await invokeOpenAIV1Videos({
    operation: "create",
    runtime: { runtimeId: "runtime-1" },
    requiredScopes: ["videos.write"],
    allowedScopes: ["videos.read"],
  });

  assert.equal(scopeDenied.ok, false);
  if (!scopeDenied.ok) {
    assert.equal(scopeDenied.error.code, "SCOPE_DENIED");
    assert.equal(scopeDenied.error.boundary, "scope");
  }
});

test("OpenAI v1 videos classifies timeout provider failures", async () => {
  assert.equal(classifyOpenAIV1VideosProviderError({ name: "AbortError" }), "PROVIDER_TIMEOUT");

  const result = await invokeOpenAIV1Videos({
    operation: "retrieve",
    runtime: { runtimeId: "runtime-1" },
    dryRun: false,
    caller: () => {
      throw { name: "AbortError" };
    },
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.equal(result.error.code, "PROVIDER_TIMEOUT");
  assert.equal(result.error.retryable, true);
});
