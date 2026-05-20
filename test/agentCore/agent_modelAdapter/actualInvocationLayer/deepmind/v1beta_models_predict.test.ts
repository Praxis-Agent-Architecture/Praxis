import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import {
  DEEPMIND_V1BETA_MODELS_PREDICT_ENDPOINT,
  invokeDeepMindV1BetaModelsPredict,
} from "../../../../../src/modelAdapter/actualInvocationLayer/deepmind/v1beta_models_predict.js";

defineAgentCoreContractTest({
  sourcePath: "src/modelAdapter/actualInvocationLayer/deepmind/v1beta_models_predict.ts",
  docPath: "docs/agentCore/agent_modelAdapter/actualInvocationLayer/deepmind/v1beta_models_predict.md",
  testFileUrl: import.meta.url,
});

test("v1beta_models_predict builds a dry-run Gemini request envelope", async () => {
  const result = await invokeDeepMindV1BetaModelsPredict({
    model: "predict-test",
    body: { instances: [{ text: "hello" }] },
    runtime: { runtimeId: "runtime:alpha", invocationId: "invoke:predict" },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.envelope.endpoint, DEEPMIND_V1BETA_MODELS_PREDICT_ENDPOINT);
  assert.equal(result.envelope.method, "POST");
  assert.equal(result.envelope.model, "models/predict-test");
  assert.equal(result.envelope.url, "https://generativelanguage.googleapis.com/v1beta/models/predict-test:predict");
  assert.equal(result.envelope.providerCallPlanned, false);
  assert.equal(result.envelope.providerFieldsOpaque, true);
  assert.equal(result.capability.rawShape, "dry-run");
});

test("v1beta_models_predict rejects missing model and missing live auth", async () => {
  const missingModel = await invokeDeepMindV1BetaModelsPredict({
    body: { instances: [] },
  });
  assert.equal(missingModel.ok, false);
  if (missingModel.ok) {
    return;
  }
  assert.equal(missingModel.error.code, "MISSING_MODEL");
  assert.equal(missingModel.error.boundary, "input");

  const missingAuth = await invokeDeepMindV1BetaModelsPredict({
    dryRun: false,
    model: "predict-test",
    body: { instances: [] },
    transport: () => ({ statusCode: 200, body: { predictions: [] } }),
  });
  assert.equal(missingAuth.ok, false);
  if (missingAuth.ok) {
    return;
  }
  assert.equal(missingAuth.error.code, "MISSING_AUTH_TOKEN");
  assert.equal(missingAuth.envelope?.providerCallPlanned, true);
});

test("v1beta_models_predict wraps mock predictions and classifies unavailable provider", async () => {
  const ok = await invokeDeepMindV1BetaModelsPredict({
    dryRun: false,
    apiKey: "gemini-test-key",
    model: "models/predict-test",
    body: { instances: [{ text: "hello" }] },
    transport: (envelope) => {
      assert.equal(envelope.providerCallPlanned, true);
      return { statusCode: 200, body: { predictions: [{ label: "ok" }] } };
    },
  });

  assert.equal(ok.ok, true);
  if (!ok.ok) {
    return;
  }
  assert.equal(ok.response.kind, "provider");
  assert.equal(ok.capability.rawShape, "predictions");

  const unavailable = await invokeDeepMindV1BetaModelsPredict({
    dryRun: false,
    apiKey: "gemini-test-key",
    model: "predict-test",
    body: { instances: [] },
    transport: () => ({ statusCode: 503, body: { error: { status: "UNAVAILABLE" } } }),
  });
  assert.equal(unavailable.ok, false);
  if (unavailable.ok) {
    return;
  }
  assert.equal(unavailable.error.code, "PROVIDER_UNAVAILABLE");
  assert.equal(unavailable.error.boundary, "provider");
  assert.equal(unavailable.error.statusCode, 503);
});
