import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import {
  ANTHROPIC_V1_MESSAGES_ENDPOINT,
  invokeAnthropicV1Messages,
} from "../../../../../src/agentCore/agent_modelAdapter/actualInvocationLayer/anthropic/v1_messages.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_modelAdapter/actualInvocationLayer/anthropic/v1_messages.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_modelAdapter/actualInvocationLayer/anthropic/v1_messages.md",
  testFileUrl: import.meta.url,
});

test("Anthropic v1 messages builds a dry-run provider envelope", async () => {
  const result = await invokeAnthropicV1Messages({
    operation: "create",
    runtime: { runtimeId: "runtime-1", correlationId: "corr-1" },
    body: { model: "claude-placeholder", messages: [] },
    mockResponse: { id: "msg_1", content: [] },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.request.endpoint, ANTHROPIC_V1_MESSAGES_ENDPOINT);
  assert.equal(result.request.urlPath, "/v1/messages");
  assert.equal(result.request.method, "POST");
  assert.deepEqual(result.request.body, { model: "claude-placeholder", messages: [] });
  assert.deepEqual(result.response.raw, { id: "msg_1", content: [] });
});

test("Anthropic v1 messages rejects empty input before provider access", async () => {
  const result = await invokeAnthropicV1Messages();

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.equal(result.error.code, "MISSING_OPERATION");
  assert.equal(result.error.boundary, "input");
});

test("Anthropic v1 messages uses an injected caller for guarded live invocation", async () => {
  const result = await invokeAnthropicV1Messages({
    operation: "create",
    runtime: { runtimeId: "runtime-1" },
    dryRun: false,
    expectResponseObject: true,
    caller: (request) => ({ providerPath: request.urlPath, opaque: true }),
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.response.mode, "caller");
  assert.deepEqual(result.response.raw, { providerPath: "/v1/messages", opaque: true });
  assert.equal(result.response.providerFieldsOpaque, true);
});
