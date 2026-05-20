import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import {
  ANTHROPIC_V1_MODELS_ENDPOINT,
  invokeAnthropicV1Models,
} from "../../../../../src/agentCore_modelAdapter/actualInvocationLayer/anthropic/v1_models.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_modelAdapter/actualInvocationLayer/anthropic/v1_models.ts",
  docPath: "docs/agentCore/agent_modelAdapter/actualInvocationLayer/anthropic/v1_models.md",
  testFileUrl: import.meta.url,
});

test("v1_models builds a dry-run provider envelope without calling Anthropic", async () => {
  const result = await invokeAnthropicV1Models({
    query: { limit: 2 },
    runtime: { runtimeId: "runtime:alpha", invocationId: "invoke:models" },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.envelope.endpoint, ANTHROPIC_V1_MODELS_ENDPOINT);
  assert.equal(result.envelope.method, "GET");
  assert.equal(result.envelope.providerCallPlanned, false);
  assert.deepEqual(result.envelope.query, { limit: 2 });
  assert.equal(result.response.kind, "dry-run");
  assert.equal(result.capability.rawShape, "dry-run");
});

test("v1_models rejects missing request and missing live transport/auth", async () => {
  const missingRequest = await invokeAnthropicV1Models();
  assert.equal(missingRequest.ok, false);
  if (missingRequest.ok) {
    return;
  }
  assert.equal(missingRequest.error.code, "MISSING_REQUEST");
  assert.equal(missingRequest.error.boundary, "input");

  const missingAuth = await invokeAnthropicV1Models({
    dryRun: false,
    transport: () => ({ statusCode: 200, body: { data: [] } }),
  });
  assert.equal(missingAuth.ok, false);
  if (missingAuth.ok) {
    return;
  }
  assert.equal(missingAuth.error.code, "MISSING_AUTH_TOKEN");
  assert.equal(missingAuth.envelope?.providerCallPlanned, true);
});

test("v1_models wraps mock provider responses and classifies drift", async () => {
  const ok = await invokeAnthropicV1Models({
    dryRun: false,
    apiKey: "sk-ant-test",
    transport: (envelope) => {
      assert.equal(envelope.headers["x-api-key"], "sk-ant-test");
      return { statusCode: 200, body: { data: [{ id: "claude-test", type: "model" }] } };
    },
  });

  assert.equal(ok.ok, true);
  if (!ok.ok) {
    return;
  }
  assert.equal(ok.response.kind, "provider");
  assert.equal(ok.capability.rawShape, "models-list");

  const drift = await invokeAnthropicV1Models({
    dryRun: false,
    apiKey: "sk-ant-test",
    transport: () => ({ statusCode: 200, body: { unexpected: true } }),
  });
  assert.equal(drift.ok, false);
  if (drift.ok) {
    return;
  }
  assert.equal(drift.error.code, "RESPONSE_FORMAT_DRIFT");
  assert.equal(drift.error.boundary, "response");
});
