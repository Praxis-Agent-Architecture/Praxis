import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import {
  OPENAI_V1_FILES_ENDPOINT,
  classifyOpenAIV1FilesProviderError,
  invokeOpenAIV1Files,
} from "../../../../../src/agentCore_modelAdapter/actualInvocationLayer/openai/v1_files.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_modelAdapter/actualInvocationLayer/openai/v1_files.ts",
  docPath: "docs/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_files.md",
  testFileUrl: import.meta.url,
});

test("OpenAI v1 files builds a dry-run provider envelope", async () => {
  const result = await invokeOpenAIV1Files({
    operation: "list",
    runtime: { runtimeId: "runtime-1", callerId: "adapter-test" },
    headers: { "openai-organization": "org_1", empty: " " },
    pathSuffix: "file_1",
    mockResponse: { id: "file_1", object: "file" },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.request.endpoint, OPENAI_V1_FILES_ENDPOINT);
  assert.equal(result.request.urlPath, "/v1/files/file_1");
  assert.equal(result.request.unsafeSideEffects, false);
  assert.equal(result.request.providerFieldsOpaque, true);
  assert.equal(result.request.headers["openai-organization"], "org_1");
  assert.equal(result.request.headers.empty, undefined);
  assert.deepEqual(result.response.raw, { id: "file_1", object: "file" });
  assert.equal(result.response.mode, "mock");
});

test("OpenAI v1 files rejects empty input before provider access", async () => {
  const result = await invokeOpenAIV1Files();

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.equal(result.error.code, "MISSING_OPERATION");
  assert.equal(result.error.boundary, "input");
});

test("OpenAI v1 files classifies retryable provider failures", async () => {
  assert.equal(classifyOpenAIV1FilesProviderError({ name: "TimeoutError" }), "PROVIDER_TIMEOUT");

  const result = await invokeOpenAIV1Files({
    operation: "retrieve",
    runtime: { runtimeId: "runtime-1" },
    dryRun: false,
    caller: () => {
      throw { name: "TimeoutError" };
    },
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.equal(result.error.code, "PROVIDER_TIMEOUT");
  assert.equal(result.error.retryable, true);
});
