import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  DEEPMIND_V1BETA_MODELS_PREDICT_LONG_RUNNING_ENDPOINT,
  classifyDeepMindV1BetaModelsPredictLongRunningProviderError,
  invokeDeepMindV1BetaModelsPredictLongRunning,
} from "../../../../../src/modelAdapter/actualInvocationLayer/deepmind/v1beta_models_predictLongRunning.js";

defineAgentCoreContractTest({
  sourcePath: "src/modelAdapter/actualInvocationLayer/deepmind/v1beta_models_predictLongRunning.ts",
  docPath: "docs/agentCore/agent_modelAdapter/actualInvocationLayer/deepmind/v1beta_models_predictLongRunning.md",
  testFileUrl: import.meta.url,
});

test("DeepMind v1beta predictLongRunning builds a dry-run provider envelope", async () => {
  const result = await invokeDeepMindV1BetaModelsPredictLongRunning({
    model: "models/gemini-pro",
    body: { instances: [{ prompt: "hello" }] },
    runtime: { runtimeId: "runtime-1", traceId: "trace-1" },
    requiredScopes: ["model.invoke"],
    allowedScopes: ["model.invoke"],
    mockResponse: { name: "operations/mock-1", done: false },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.request.endpoint, DEEPMIND_V1BETA_MODELS_PREDICT_LONG_RUNNING_ENDPOINT);
  assert.equal(result.request.dryRun, true);
  assert.equal(result.request.providerCallPlanned, false);
  assert.equal(result.request.providerFieldsOpaque, true);
  assert.equal(result.response.mode, "mock");
  assert.equal(result.capability.operation, "predict-long-running");
});

test("DeepMind v1beta predictLongRunning rejects invalid input with classified errors", async () => {
  const missingModel = await invokeDeepMindV1BetaModelsPredictLongRunning();
  assert.equal(missingModel.ok, false);
  if (missingModel.ok) {
    return;
  }
  assert.equal(missingModel.error.code, "MISSING_MODEL");
  assert.equal(missingModel.error.boundary, "input");
});

test("DeepMind v1beta predictLongRunning uses an injected caller for live envelopes", async () => {
  const result = await invokeDeepMindV1BetaModelsPredictLongRunning({
    model: "models/gemini-pro",
    body: { instances: [] },
    runtime: { runtimeId: "runtime-1" },
    dryRun: false,
    expectResponseObject: true,
    caller: (envelope) => {
      assert.equal(envelope.providerCallPlanned, true);
      assert.equal(envelope.unsafeSideEffects, false);
      return { name: "operations/real-1", done: false };
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  assert.equal(result.response.mode, "caller");
  assert.equal(result.capability.rawShape, "operation");
});

test("DeepMind v1beta predictLongRunning classifies provider throttling", () => {
  assert.equal(
    classifyDeepMindV1BetaModelsPredictLongRunningProviderError({ status: 429 }),
    "PROVIDER_RATE_LIMITED",
  );
});
