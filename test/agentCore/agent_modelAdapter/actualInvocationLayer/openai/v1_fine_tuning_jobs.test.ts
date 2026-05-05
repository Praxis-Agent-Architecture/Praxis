import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import {
  OPENAI_V1_FINE_TUNING_JOBS_ENDPOINT,
  classifyOpenAIV1FineTuningJobsProviderError,
  invokeOpenAIV1FineTuningJobs,
} from "../../../../../src/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_fine_tuning_jobs.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_fine_tuning_jobs.ts",
  docPath: "docs/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_fine_tuning_jobs.md",
  testFileUrl: import.meta.url,
});

test("OpenAI v1 fine tuning jobs builds a dry-run provider envelope", async () => {
  const result = await invokeOpenAIV1FineTuningJobs({
    operation: "create",
    method: "POST",
    runtime: { runtimeId: "runtime-1" },
    body: { training_file: "file_1", model: "opaque-provider-model" },
    mockResponse: { id: "ftjob_1", status: "queued" },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.request.endpoint, OPENAI_V1_FINE_TUNING_JOBS_ENDPOINT);
  assert.equal(OPENAI_V1_FINE_TUNING_JOBS_ENDPOINT, "/v1/fine_tuning/jobs");
  assert.equal(result.request.urlPath, "/v1/fine_tuning/jobs");
  assert.equal(result.request.method, "POST");
  assert.equal(result.request.providerFieldsOpaque, true);
  assert.deepEqual(result.request.body, { training_file: "file_1", model: "opaque-provider-model" });
  assert.deepEqual(result.response.raw, { id: "ftjob_1", status: "queued" });
  assert.equal(result.response.mode, "mock");
});

test("OpenAI v1 fine tuning jobs rejects empty input before provider access", async () => {
  const result = await invokeOpenAIV1FineTuningJobs();

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.equal(result.error.code, "MISSING_OPERATION");
  assert.equal(result.error.boundary, "input");
});

test("OpenAI v1 fine tuning jobs classifies retryable provider failures", async () => {
  assert.equal(classifyOpenAIV1FineTuningJobsProviderError({ status: 503 }), "PROVIDER_UNAVAILABLE");

  const result = await invokeOpenAIV1FineTuningJobs({
    operation: "list",
    runtime: { runtimeId: "runtime-1" },
    dryRun: false,
    caller: () => {
      throw { status: 503 };
    },
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.equal(result.error.code, "PROVIDER_UNAVAILABLE");
  assert.equal(result.error.retryable, true);
});
