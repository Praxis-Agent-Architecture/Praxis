import assert from "node:assert/strict";
import test from "node:test";

import {
  anthropicProvider,
  createMockTransport,
  createRaxModelClient,
  googleProvider,
  openAIProvider,
} from "../../../../src/modelAdapter/index.js";

test("openai.chat lowers image content parts into provider image_url blocks", async () => {
  const client = createRaxModelClient([{
    ...openAIProvider.routes[0]!,
    transport: createMockTransport([{ choices: [{ delta: { content: "ok" }, finish_reason: "stop" }] }]),
  }]);

  const prepared = await client.prepare({
    id: "openai-image",
    model: { provider: "openai", model: "gpt-test", route: "openai", auth: { type: "none" } },
    messages: [{
      role: "user",
      content: [
        { type: "text", text: "describe" },
        { type: "image", mimeType: "image/png", data: "iVBORw0KGgo=" },
      ],
    }],
  });

  const body = prepared.body as { messages: Array<{ content: unknown }> };
  assert.deepEqual(body.messages[0]?.content, [
    { type: "text", text: "describe" },
    { type: "image_url", image_url: { url: "data:image/png;base64,iVBORw0KGgo=" } },
  ]);
});

test("openai.chat lowers structured response schemas into json_schema response format", async () => {
  const client = createRaxModelClient([{
    ...openAIProvider.routes[0]!,
    transport: createMockTransport([{ choices: [{ delta: { content: "{}" }, finish_reason: "stop" }] }]),
  }]);

  const prepared = await client.prepare({
    id: "openai-schema",
    model: { provider: "openai", model: "gpt-test", route: "openai", auth: { type: "none" } },
    messages: [{ role: "user", content: "return json" }],
    generation: {
      responseFormat: {
        type: "task_result",
        schema: {
          type: "object",
          properties: { ok: { type: "boolean" } },
          required: ["ok"],
          additionalProperties: false,
        },
      },
    },
  });

  assert.deepEqual((prepared.body as { response_format?: unknown }).response_format, {
    type: "json_schema",
    json_schema: {
      name: "task_result",
      schema: {
        type: "object",
        properties: { ok: { type: "boolean" } },
        required: ["ok"],
        additionalProperties: false,
      },
      strict: true,
    },
  });
});

test("openai.chat decodes non-stream JSON message and tool calls", async () => {
  const client = createRaxModelClient([{
    ...openAIProvider.routes[0]!,
    transport: createMockTransport([{
      choices: [{
        message: {
          content: "need file",
          tool_calls: [{
            id: "call_1",
            type: "function",
            function: { name: "file_read", arguments: "{\"path\":\"README.md\"}" },
          }],
        },
        finish_reason: "tool_calls",
      }],
      usage: { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10 },
    }]),
  }]);

  const response = await client.generate({
    id: "openai-json",
    model: { provider: "openai", model: "gpt-test", route: "openai", auth: { type: "none" } },
    messages: [{ role: "user", content: "read" }],
  });

  assert.equal(response.text, "need file");
  assert.deepEqual(response.toolCalls[0], {
    id: "call_1",
    name: "file_read",
    providerName: "file_read",
    input: { path: "README.md" },
  });
  assert.equal(response.finishReason, "tool_calls");
  assert.equal(response.usage?.totalTokens, 10);
});

test("anthropic.messages decodes non-stream JSON content and tool_use blocks", async () => {
  const client = createRaxModelClient([{
    ...anthropicProvider.routes[0]!,
    transport: createMockTransport([{
      type: "message",
      content: [
        { type: "text", text: "need file" },
        { type: "tool_use", id: "toolu_1", name: "file_read", input: { path: "README.md" } },
      ],
      stop_reason: "tool_use",
      usage: { input_tokens: 5, output_tokens: 4 },
    }]),
  }]);

  const response = await client.generate({
    id: "anthropic-json",
    model: { provider: "anthropic", model: "claude-test", route: "anthropic", auth: { type: "none" } },
    messages: [{ role: "user", content: "read" }],
  });

  assert.equal(response.text, "need file");
  assert.deepEqual(response.toolCalls[0], {
    id: "toolu_1",
    name: "file_read",
    providerName: "file_read",
    input: { path: "README.md" },
  });
  assert.equal(response.finishReason, "tool_use");
  assert.equal(response.usage?.inputTokens, 5);
});

test("anthropic.messages lowers image content parts into image source blocks", async () => {
  const client = createRaxModelClient([{
    ...anthropicProvider.routes[0]!,
    transport: createMockTransport([{ type: "message_delta", delta: { stop_reason: "end_turn" } }]),
  }]);

  const prepared = await client.prepare({
    id: "anthropic-image",
    model: { provider: "anthropic", model: "claude-test", route: "anthropic", auth: { type: "none" } },
    messages: [{
      role: "user",
      content: [
        { type: "text", text: "describe" },
        { type: "image", mimeType: "image/jpeg", data: "abc123" },
      ],
    }],
  });

  const body = prepared.body as { messages: Array<{ content: unknown }> };
  assert.deepEqual(body.messages[0]?.content, [
    { type: "text", text: "describe" },
    { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "abc123" } },
  ]);
});

test("google.generate_content lowers image parts and decodes functionCall events", async () => {
  const client = createRaxModelClient([{
    ...googleProvider.routes[0]!,
    transport: createMockTransport([
      {
        candidates: [{
          content: {
            parts: [
              { text: "need tool" },
              { functionCall: { name: "file_read", args: { path: "README.md" } } },
            ],
          },
          finishReason: "STOP",
        }],
        usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 2, totalTokenCount: 5 },
      },
    ]),
  }]);

  const request = {
    id: "google-image",
    model: { provider: "google", model: "gemini-test", route: "google", auth: { type: "none" as const } },
    messages: [{
      role: "user" as const,
      content: [
        { type: "text" as const, text: "describe" },
        { type: "image" as const, mimeType: "image/png", data: "iVBORw0KGgo=" },
      ],
    }],
  };

  const prepared = await client.prepare(request);
  const body = prepared.body as { contents: Array<{ parts: unknown[] }> };
  assert.deepEqual(body.contents[0]?.parts, [
    { text: "describe" },
    { inlineData: { mimeType: "image/png", data: "iVBORw0KGgo=" } },
  ]);

  const response = await client.generate(request);
  assert.equal(response.text, "need tool");
  assert.deepEqual(response.toolCalls[0], {
    id: "google_file_read",
    name: "file_read",
    providerName: "file_read",
    input: { path: "README.md" },
  });
  assert.equal(response.usage?.totalTokens, 5);
});

test("google.generate_content lowers json response schemas into generationConfig", async () => {
  const client = createRaxModelClient([{
    ...googleProvider.routes[0]!,
    transport: createMockTransport([{ candidates: [{ content: { parts: [{ text: "{}" }] }, finishReason: "STOP" }] }]),
  }]);

  const schema = {
    type: "object",
    properties: { ok: { type: "boolean" } },
    required: ["ok"],
  };
  const prepared = await client.prepare({
    id: "google-schema",
    model: { provider: "google", model: "gemini-test", route: "google", auth: { type: "none" } },
    messages: [{ role: "user", content: "return json" }],
    generation: { responseFormat: { type: "task_result", schema } },
  });

  assert.deepEqual((prepared.body as { generationConfig?: unknown }).generationConfig, {
    responseMimeType: "application/json",
    responseSchema: schema,
  });
});
