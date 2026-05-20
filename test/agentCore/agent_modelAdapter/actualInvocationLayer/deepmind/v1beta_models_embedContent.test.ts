import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import {
  DEEPMIND_V1BETA_MODELS_EMBED_CONTENT_ENDPOINT,
  invokeDeepMindV1BetaModelsEmbedContent,
} from "../../../../../src/agentCore_modelAdapter/actualInvocationLayer/deepmind/v1beta_models_embedContent.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_modelAdapter/actualInvocationLayer/deepmind/v1beta_models_embedContent.ts",
  docPath: "docs/agentCore/agent_modelAdapter/actualInvocationLayer/deepmind/v1beta_models_embedContent.md",
  testFileUrl: import.meta.url,
});

test("v1beta_models_embedContent builds a dry-run Gemini request envelope", async () => {
  const result = await invokeDeepMindV1BetaModelsEmbedContent({
    model: "text-embedding-test",
    body: { content: { parts: [{ text: "hello" }] } },
    runtime: { runtimeId: "runtime:alpha", invocationId: "invoke:embed" },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.envelope.endpoint, DEEPMIND_V1BETA_MODELS_EMBED_CONTENT_ENDPOINT);
  assert.equal(result.envelope.method, "POST");
  assert.equal(result.envelope.model, "models/text-embedding-test");
  assert.equal(result.envelope.url, "https://generativelanguage.googleapis.com/v1beta/models/text-embedding-test:embedContent");
  assert.equal(result.envelope.providerCallPlanned, false);
  assert.equal(result.response.providerFieldsOpaque, true);
  assert.equal(result.capability.rawShape, "dry-run");
});

test("v1beta_models_embedContent rejects missing model and contract blocks", async () => {
  const missingModel = await invokeDeepMindV1BetaModelsEmbedContent({
    body: { content: { parts: [] } },
  });
  assert.equal(missingModel.ok, false);
  if (missingModel.ok) {
    return;
  }
  assert.equal(missingModel.error.code, "MISSING_MODEL");
  assert.equal(missingModel.error.boundary, "input");

  const blocked = await invokeDeepMindV1BetaModelsEmbedContent({
    model: "text-embedding-test",
    body: { content: { parts: [] } },
    contract: { accepted: false, reason: "shape denied" },
  });
  assert.equal(blocked.ok, false);
  if (blocked.ok) {
    return;
  }
  assert.equal(blocked.error.code, "CONTRACT_REJECTED");
  assert.equal(blocked.error.message, "shape denied");
});

test("v1beta_models_embedContent wraps mock embeddings and classifies response drift", async () => {
  const ok = await invokeDeepMindV1BetaModelsEmbedContent({
    dryRun: false,
    apiKey: "gemini-test-key",
    model: "text-embedding-test",
    body: { content: { parts: [{ text: "hello" }] } },
    transport: (envelope) => {
      assert.equal(envelope.providerCallPlanned, true);
      return { statusCode: 200, body: { embedding: { values: [0.1, 0.2] } } };
    },
  });

  assert.equal(ok.ok, true);
  if (!ok.ok) {
    return;
  }
  assert.equal(ok.response.kind, "provider");
  assert.equal(ok.capability.rawShape, "embedding");

  const drift = await invokeDeepMindV1BetaModelsEmbedContent({
    dryRun: false,
    apiKey: "gemini-test-key",
    model: "text-embedding-test",
    body: { content: { parts: [] } },
    transport: () => ({ statusCode: 200, body: { unexpected: true } }),
  });
  assert.equal(drift.ok, false);
  if (drift.ok) {
    return;
  }
  assert.equal(drift.error.code, "RESPONSE_FORMAT_DRIFT");
  assert.equal(drift.error.boundary, "response");
});
