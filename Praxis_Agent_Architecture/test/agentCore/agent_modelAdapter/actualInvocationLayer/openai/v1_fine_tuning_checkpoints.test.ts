import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import {
  OPENAI_V1_FINE_TUNING_CHECKPOINTS_ENDPOINT,
  classifyOpenAIV1FineTuningCheckpointsProviderError,
  invokeOpenAIV1FineTuningCheckpoints,
} from "../../../../../src/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_fine_tuning_checkpoints.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_fine_tuning_checkpoints.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_fine_tuning_checkpoints.md",
  testFileUrl: import.meta.url,
});

test("OpenAI v1 fine tuning checkpoints builds a dry-run provider envelope", async () => {
  const result = await invokeOpenAIV1FineTuningCheckpoints({
    operation: "list-permissions",
    runtime: { runtimeId: "runtime-1" },
    pathSuffix: "ftckpt_1/permissions",
    query: { limit: 1 },
    mockResponse: { data: [{ id: "cp_1" }] },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.request.endpoint, OPENAI_V1_FINE_TUNING_CHECKPOINTS_ENDPOINT);
  assert.equal(OPENAI_V1_FINE_TUNING_CHECKPOINTS_ENDPOINT, "/v1/fine_tuning/checkpoints");
  assert.equal(result.request.urlPath, "/v1/fine_tuning/checkpoints/ftckpt_1/permissions");
  assert.equal(result.request.query.limit, "1");
  assert.equal(result.request.providerFieldsOpaque, true);
  assert.deepEqual(result.response.raw, { data: [{ id: "cp_1" }] });
  assert.equal(result.response.mode, "mock");
});

test("OpenAI v1 fine tuning checkpoints rejects empty input before provider access", async () => {
  const result = await invokeOpenAIV1FineTuningCheckpoints();

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.equal(result.error.code, "MISSING_OPERATION");
  assert.equal(result.error.boundary, "input");
});

test("OpenAI v1 fine tuning checkpoints classifies provider response drift", async () => {
  assert.equal(
    classifyOpenAIV1FineTuningCheckpointsProviderError({ code: "schema_mismatch" }),
    "RESPONSE_FORMAT_DRIFT",
  );

  const result = await invokeOpenAIV1FineTuningCheckpoints({
    operation: "list",
    runtime: { runtimeId: "runtime-1" },
    dryRun: false,
    expectResponseObject: true,
    caller: () => "not-an-object",
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.equal(result.error.code, "RESPONSE_FORMAT_DRIFT");
  assert.equal(result.error.boundary, "provider");
});
