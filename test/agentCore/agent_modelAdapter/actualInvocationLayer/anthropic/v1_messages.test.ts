import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import {
  ANTHROPIC_V1_MESSAGES_ENDPOINT,
  invokeAnthropicV1Messages,
} from "../../../../../src/modelAdapter/actualInvocationLayer/anthropic/v1_messages.js";

defineAgentCoreContractTest({
  sourcePath: "src/modelAdapter/actualInvocationLayer/anthropic/v1_messages.ts",
  docPath: "docs/agentCore/agent_modelAdapter/actualInvocationLayer/anthropic/v1_messages.md",
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

test("Anthropic v1 messages extracts standard usage from provider responses", async () => {
  const result = await invokeAnthropicV1Messages({
    operation: "create",
    runtime: { runtimeId: "runtime-usage" },
    auth: { kind: "api-key", present: true },
    dryRun: false,
    expectResponseObject: true,
    caller: () => ({
      id: "msg_1",
      content: [{ type: "text", text: "hello" }],
      usage: { input_tokens: 7, output_tokens: 3 },
    }),
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.response.usage?.source, "anthropic.messages.usage");
  assert.equal(result.response.usage?.inputTokens, 7);
  assert.equal(result.response.usage?.outputTokens, 3);
  assert.equal(result.response.usage?.totalTokens, undefined);
  assert.equal(result.response.usage?.estimated, false);
});

test("Anthropic v1 messages extracts usage from streamed message events", async () => {
  const result = await invokeAnthropicV1Messages({
    operation: "create",
    runtime: { runtimeId: "runtime-stream-usage" },
    auth: { kind: "api-key", present: true },
    dryRun: false,
    expectResponseObject: false,
    caller: () => [
      "event: message_start",
      "data: {\"type\":\"message_start\",\"message\":{\"id\":\"msg_1\",\"type\":\"message\",\"role\":\"assistant\",\"content\":[],\"usage\":{\"input_tokens\":101,\"cache_creation_input_tokens\":9,\"cache_read_input_tokens\":91,\"output_tokens\":1}}}",
      "",
      "event: content_block_delta",
      "data: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"ok\"}}",
      "",
      "event: message_delta",
      "data: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"end_turn\"},\"usage\":{\"output_tokens\":7}}",
      "",
      "event: message_stop",
      "data: {\"type\":\"message_stop\"}",
      "",
      "data: [DONE]",
      "",
    ].join("\n"),
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.response.usage?.source, "anthropic.messages.usage");
  assert.equal(result.response.usage?.inputTokens, 201);
  assert.equal(result.response.usage?.cachedInputTokens, 91);
  assert.equal(result.response.usage?.outputTokens, 7);
  assert.equal(result.response.usage?.estimated, false);
});
