import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import {
  DEEPMIND_V1BETA_MODELS_ENDPOINT,
  classifyDeepMindV1BetaModelsProviderError,
  invokeDeepMindV1BetaModels,
} from "../../../../../src/modelAdapter/actualInvocationLayer/deepmind/v1beta_models.js";

defineAgentCoreContractTest({
  sourcePath: "src/modelAdapter/actualInvocationLayer/deepmind/v1beta_models.ts",
  docPath: "docs/agentCore/agent_modelAdapter/actualInvocationLayer/deepmind/v1beta_models.md",
  testFileUrl: import.meta.url,
});

test("DeepMind v1beta models builds a dry-run provider envelope", async () => {
  const result = await invokeDeepMindV1BetaModels({
    operation: "list",
    runtime: { runtimeId: "runtime-1", callerId: "model-adapter" },
    query: { pageSize: 3 },
    mockResponse: { models: [{ name: "models/gemini-test" }] },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.envelope.endpoint, DEEPMIND_V1BETA_MODELS_ENDPOINT);
  assert.equal(result.envelope.method, "GET");
  assert.equal(result.envelope.dryRun, true);
  assert.equal(result.envelope.query.pageSize, "3");
  assert.deepEqual(result.response.raw, { models: [{ name: "models/gemini-test" }] });
});

test("DeepMind v1beta models rejects empty input and missing live caller", async () => {
  const missingOperation = await invokeDeepMindV1BetaModels();
  assert.equal(missingOperation.ok, false);
  if (missingOperation.ok) {
    return;
  }
  assert.equal(missingOperation.error.code, "MISSING_OPERATION");

  const missingCaller = await invokeDeepMindV1BetaModels({
    operation: "list",
    runtime: { runtimeId: "runtime-1" },
    dryRun: false,
  });
  assert.equal(missingCaller.ok, false);
  if (missingCaller.ok) {
    return;
  }
  assert.equal(missingCaller.error.code, "CALLER_REQUIRED");
  assert.equal(missingCaller.envelope?.dryRun, false);
});

test("DeepMind v1beta models wraps caller responses and classifies drift", async () => {
  const ok = await invokeDeepMindV1BetaModels({
    operation: "list",
    runtime: { runtimeId: "runtime-1" },
    dryRun: false,
    expectModelsArray: true,
    caller: (envelope) => {
      assert.equal(envelope.endpoint, DEEPMIND_V1BETA_MODELS_ENDPOINT);
      return { models: [{ name: "models/gemini-test" }] };
    },
  });

  assert.equal(ok.ok, true);
  if (!ok.ok) {
    return;
  }
  assert.equal(ok.response.mode, "caller");
  assert.equal(ok.capability.rawShape, "models-list");

  const drift = await invokeDeepMindV1BetaModels({
    operation: "list",
    runtime: { runtimeId: "runtime-1" },
    dryRun: false,
    expectModelsArray: true,
    caller: () => ({ unexpected: true }),
  });
  assert.equal(drift.ok, false);
  if (drift.ok) {
    return;
  }
  assert.equal(drift.error.code, "RESPONSE_FORMAT_DRIFT");
  assert.equal(drift.error.boundary, "response");

  assert.equal(classifyDeepMindV1BetaModelsProviderError({ statusCode: 408 }), "PROVIDER_TIMEOUT");
});
