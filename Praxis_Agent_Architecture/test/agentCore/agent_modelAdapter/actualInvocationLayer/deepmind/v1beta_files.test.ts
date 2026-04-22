import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import {
  DEEPMIND_V1BETA_FILES_ENDPOINT,
  classifyDeepMindV1BetaFilesProviderError,
  invokeDeepMindV1BetaFiles,
} from "../../../../../src/agentCore/agent_modelAdapter/actualInvocationLayer/deepmind/v1beta_files.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_modelAdapter/actualInvocationLayer/deepmind/v1beta_files.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_modelAdapter/actualInvocationLayer/deepmind/v1beta_files.md",
  testFileUrl: import.meta.url,
});

test("DeepMind v1beta files builds a dry-run provider envelope", async () => {
  const result = await invokeDeepMindV1BetaFiles({
    operation: "list",
    runtime: { runtimeId: "runtime-1", correlationId: "trace-1" },
    query: { pageSize: 2, empty: undefined },
    headers: { "x-goog-api-client": "praxis-test", empty: " " },
    mockResponse: { files: [{ name: "files/1" }] },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.request.endpoint, DEEPMIND_V1BETA_FILES_ENDPOINT);
  assert.equal(result.request.urlPath, "/v1beta/files");
  assert.equal(result.request.dryRun, true);
  assert.equal(result.request.query.pageSize, "2");
  assert.equal(result.request.query.empty, undefined);
  assert.equal(result.request.headers["x-goog-api-client"], "praxis-test");
  assert.equal(result.request.headers.empty, undefined);
  assert.deepEqual(result.response.raw, { files: [{ name: "files/1" }] });
  assert.equal(result.capability.rawShape, "opaque-provider-payload");
});

test("DeepMind v1beta files rejects empty input before provider access", async () => {
  const result = await invokeDeepMindV1BetaFiles();

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.equal(result.error.code, "MISSING_OPERATION");
  assert.equal(result.error.boundary, "input");
});

test("DeepMind v1beta files classifies retryable provider failures", async () => {
  assert.equal(classifyDeepMindV1BetaFilesProviderError({ status: 429 }), "PROVIDER_RATE_LIMITED");

  const result = await invokeDeepMindV1BetaFiles({
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
