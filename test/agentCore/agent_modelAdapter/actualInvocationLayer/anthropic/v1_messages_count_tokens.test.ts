import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import {
  ANTHROPIC_V1_MESSAGES_COUNT_TOKENS_ENDPOINT,
  invokeAnthropicV1MessagesCountTokens,
} from "../../../../../src/agentCore_modelAdapter/actualInvocationLayer/anthropic/v1_messages_count_tokens.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_modelAdapter/actualInvocationLayer/anthropic/v1_messages_count_tokens.ts",
  docPath: "docs/agentCore/agent_modelAdapter/actualInvocationLayer/anthropic/v1_messages_count_tokens.md",
  testFileUrl: import.meta.url,
});

test("v1_messages_count_tokens builds a dry-run request envelope", async () => {
  const result = await invokeAnthropicV1MessagesCountTokens({
    body: { model: "claude-test", messages: [{ role: "user", content: "hello" }] },
    runtime: { runtimeId: "runtime:alpha" },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.envelope.endpoint, ANTHROPIC_V1_MESSAGES_COUNT_TOKENS_ENDPOINT);
  assert.equal(result.envelope.method, "POST");
  assert.equal(result.envelope.url, "https://api.anthropic.com/v1/messages/count_tokens");
  assert.equal(result.envelope.providerCallPlanned, false);
  assert.equal(result.envelope.headers["content-type"], "application/json");
  assert.equal(result.capability.operation, "count-message-tokens");
});

test("v1_messages_count_tokens rejects missing body and governance blocks", async () => {
  const missingBody = await invokeAnthropicV1MessagesCountTokens({});
  assert.equal(missingBody.ok, false);
  if (missingBody.ok) {
    return;
  }
  assert.equal(missingBody.error.code, "MISSING_REQUEST_BODY");
  assert.equal(missingBody.error.boundary, "input");

  const governed = await invokeAnthropicV1MessagesCountTokens({
    body: { model: "claude-test", messages: [] },
    governance: { accepted: false, reason: "scope denied" },
  });
  assert.equal(governed.ok, false);
  if (governed.ok) {
    return;
  }
  assert.equal(governed.error.code, "GOVERNANCE_REJECTED");
  assert.equal(governed.error.message, "scope denied");
});

test("v1_messages_count_tokens wraps mock token counts and classifies rate limits", async () => {
  const ok = await invokeAnthropicV1MessagesCountTokens({
    dryRun: false,
    apiKey: "sk-ant-test",
    body: { model: "claude-test", messages: [{ role: "user", content: "hello" }] },
    transport: (envelope) => {
      assert.equal(envelope.providerCallPlanned, true);
      return { statusCode: 200, body: { input_tokens: 8 } };
    },
  });

  assert.equal(ok.ok, true);
  if (!ok.ok) {
    return;
  }
  assert.equal(ok.response.kind, "provider");
  assert.equal(ok.capability.rawShape, "token-count");

  const limited = await invokeAnthropicV1MessagesCountTokens({
    dryRun: false,
    apiKey: "sk-ant-test",
    body: { model: "claude-test", messages: [] },
    transport: () => ({ statusCode: 429, body: { error: { type: "rate_limit_error" } } }),
  });
  assert.equal(limited.ok, false);
  if (limited.ok) {
    return;
  }
  assert.equal(limited.error.code, "PROVIDER_RATE_LIMITED");
  assert.equal(limited.error.boundary, "provider");
  assert.equal(limited.error.statusCode, 429);
});
