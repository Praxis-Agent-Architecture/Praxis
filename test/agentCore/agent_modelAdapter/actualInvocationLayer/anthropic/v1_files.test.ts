import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import {
  ANTHROPIC_V1_FILES_ENDPOINT,
  classifyAnthropicV1FilesProviderError,
  invokeAnthropicV1Files,
} from "../../../../../src/modelAdapter/actualInvocationLayer/anthropic/v1_files.js";

defineAgentCoreContractTest({
  sourcePath: "src/modelAdapter/actualInvocationLayer/anthropic/v1_files.ts",
  docPath: "docs/agentCore/agent_modelAdapter/actualInvocationLayer/anthropic/v1_files.md",
  testFileUrl: import.meta.url,
});

test("Anthropic v1 files builds a dry-run provider envelope", async () => {
  const result = await invokeAnthropicV1Files({
    operation: "list",
    runtime: { runtimeId: "runtime-1" },
    headers: { "anthropic-version": "2023-06-01", empty: " " },
    mockResponse: { data: [{ id: "file_1" }] },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.request.endpoint, ANTHROPIC_V1_FILES_ENDPOINT);
  assert.equal(result.request.urlPath, "/v1/files");
  assert.equal(result.request.headers["anthropic-version"], "2023-06-01");
  assert.equal(result.request.headers.empty, undefined);
  assert.deepEqual(result.response.raw, { data: [{ id: "file_1" }] });
});

test("Anthropic v1 files rejects empty input before provider access", async () => {
  const result = await invokeAnthropicV1Files();

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.equal(result.error.code, "MISSING_OPERATION");
  assert.equal(result.error.boundary, "input");
});

test("Anthropic v1 files classifies retryable provider failures", async () => {
  assert.equal(classifyAnthropicV1FilesProviderError({ status: 429 }), "PROVIDER_RATE_LIMITED");

  const result = await invokeAnthropicV1Files({
    operation: "list",
    runtime: { runtimeId: "runtime-1" },
    dryRun: false,
    caller: () => {
      throw { status: 429 };
    },
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.equal(result.error.code, "PROVIDER_RATE_LIMITED");
  assert.equal(result.error.retryable, true);
});
