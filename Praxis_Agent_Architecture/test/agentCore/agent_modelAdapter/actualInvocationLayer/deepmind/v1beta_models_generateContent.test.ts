import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import {
  DEEPMIND_V1BETA_MODELS_GENERATE_CONTENT_ENDPOINT,
  invokeDeepMindV1BetaModelsGenerateContent,
} from "../../../../../src/agentCore/agent_modelAdapter/actualInvocationLayer/deepmind/v1beta_models_generateContent.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_modelAdapter/actualInvocationLayer/deepmind/v1beta_models_generateContent.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_modelAdapter/actualInvocationLayer/deepmind/v1beta_models_generateContent.md",
  testFileUrl: import.meta.url,
});

test("v1beta_models_generateContent builds a dry-run Gemini request envelope", async () => {
  const result = await invokeDeepMindV1BetaModelsGenerateContent({
    model: "gemini-test",
    body: { contents: [{ role: "user", parts: [{ text: "hello" }] }] },
    runtime: { runtimeId: "runtime:alpha", invocationId: "invoke:generate" },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.envelope.endpoint, DEEPMIND_V1BETA_MODELS_GENERATE_CONTENT_ENDPOINT);
  assert.equal(result.envelope.method, "POST");
  assert.equal(result.envelope.model, "models/gemini-test");
  assert.equal(result.envelope.url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent");
  assert.equal(result.envelope.providerCallPlanned, false);
  assert.equal(result.envelope.providerFieldsOpaque, true);
  assert.equal(result.capability.rawShape, "dry-run");
});

test("v1beta_models_generateContent rejects missing body and governance blocks", async () => {
  const missingBody = await invokeDeepMindV1BetaModelsGenerateContent({
    model: "gemini-test",
  });
  assert.equal(missingBody.ok, false);
  if (missingBody.ok) {
    return;
  }
  assert.equal(missingBody.error.code, "MISSING_REQUEST_BODY");
  assert.equal(missingBody.error.boundary, "input");

  const governed = await invokeDeepMindV1BetaModelsGenerateContent({
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

test("v1beta_models_generateContent wraps mock candidates and classifies auth failures", async () => {
  const ok = await invokeDeepMindV1BetaModelsGenerateContent({
    dryRun: false,
    apiKey: "gemini-test-key",
    model: "models/gemini-test",
    body: { contents: [{ parts: [{ text: "hello" }] }] },
    transport: (envelope) => {
      assert.equal(envelope.providerCallPlanned, true);
      assert.equal(envelope.headers["x-goog-api-key"], "gemini-test-key");
      return { statusCode: 200, body: { candidates: [{ content: { parts: [{ text: "hi" }] } }] } };
    },
  });

  assert.equal(ok.ok, true);
  if (!ok.ok) {
    return;
  }
  assert.equal(ok.response.kind, "provider");
  assert.equal(ok.capability.rawShape, "candidates");

  const denied = await invokeDeepMindV1BetaModelsGenerateContent({
    dryRun: false,
    apiKey: "gemini-test-key",
    model: "gemini-test",
    body: { contents: [] },
    transport: () => ({ statusCode: 403, body: { error: { status: "PERMISSION_DENIED" } } }),
  });
  assert.equal(denied.ok, false);
  if (denied.ok) {
    return;
  }
  assert.equal(denied.error.code, "PROVIDER_AUTH_FAILED");
  assert.equal(denied.error.boundary, "provider");
  assert.equal(denied.error.statusCode, 403);
});
