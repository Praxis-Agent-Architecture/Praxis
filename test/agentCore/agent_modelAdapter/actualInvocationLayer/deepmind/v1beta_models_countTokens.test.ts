import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import {
  DEEPMIND_V1BETA_MODELS_COUNT_TOKENS_ENDPOINT,
  invokeDeepMindV1BetaModelsCountTokens,
} from "../../../../../src/agentCore/agent_modelAdapter/actualInvocationLayer/deepmind/v1beta_models_countTokens.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_modelAdapter/actualInvocationLayer/deepmind/v1beta_models_countTokens.ts",
  docPath: "docs/agentCore/agent_modelAdapter/actualInvocationLayer/deepmind/v1beta_models_countTokens.md",
  testFileUrl: import.meta.url,
});

test("v1beta_models_countTokens builds a dry-run Gemini request envelope", async () => {
  const result = await invokeDeepMindV1BetaModelsCountTokens({
    model: "gemini-test",
    body: { contents: [{ role: "user", parts: [{ text: "hello" }] }] },
    runtime: { runtimeId: "runtime:alpha", invocationId: "invoke:tokens" },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.envelope.endpoint, DEEPMIND_V1BETA_MODELS_COUNT_TOKENS_ENDPOINT);
  assert.equal(result.envelope.method, "POST");
  assert.equal(result.envelope.model, "models/gemini-test");
  assert.equal(result.envelope.url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-test:countTokens");
  assert.equal(result.envelope.providerCallPlanned, false);
  assert.equal(result.envelope.providerFieldsOpaque, true);
  assert.equal(result.capability.rawShape, "dry-run");
});

test("v1beta_models_countTokens rejects invalid input and governance blocks", async () => {
  const missingRequest = await invokeDeepMindV1BetaModelsCountTokens();
  assert.equal(missingRequest.ok, false);
  if (missingRequest.ok) {
    return;
  }
  assert.equal(missingRequest.error.code, "MISSING_REQUEST");
  assert.equal(missingRequest.error.boundary, "input");

  const governed = await invokeDeepMindV1BetaModelsCountTokens({
    model: "gemini-test",
    body: { contents: [] },
    governance: { accepted: false, reason: "scope denied" },
  });
  assert.equal(governed.ok, false);
  if (governed.ok) {
    return;
  }
  assert.equal(governed.error.code, "GOVERNANCE_REJECTED");
  assert.equal(governed.error.message, "scope denied");
});

test("v1beta_models_countTokens wraps mock token counts and classifies upstream errors", async () => {
  const ok = await invokeDeepMindV1BetaModelsCountTokens({
    dryRun: false,
    apiKey: "gemini-test-key",
    model: "models/gemini-test",
    body: { contents: [] },
    transport: (envelope) => {
      assert.equal(envelope.providerCallPlanned, true);
      assert.equal(envelope.headers["x-goog-api-key"], "gemini-test-key");
      return { statusCode: 200, body: { totalTokens: 12 } };
    },
  });

  assert.equal(ok.ok, true);
  if (!ok.ok) {
    return;
  }
  assert.equal(ok.response.kind, "provider");
  assert.equal(ok.capability.rawShape, "token-count");

  const limited = await invokeDeepMindV1BetaModelsCountTokens({
    dryRun: false,
    apiKey: "gemini-test-key",
    model: "gemini-test",
    body: { contents: [] },
    transport: () => ({ statusCode: 429, body: { error: { status: "RESOURCE_EXHAUSTED" } } }),
  });
  assert.equal(limited.ok, false);
  if (limited.ok) {
    return;
  }
  assert.equal(limited.error.code, "PROVIDER_RATE_LIMITED");
  assert.equal(limited.error.boundary, "provider");
  assert.equal(limited.error.statusCode, 429);
});
