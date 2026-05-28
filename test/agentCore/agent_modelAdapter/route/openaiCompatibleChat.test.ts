import assert from "node:assert/strict";
import test from "node:test";
import { createMockTransport, createOpenAICompatibleProvider, createRaxModelClient } from "../../../../src/modelAdapter/index.js";

test("openai.compatible_chat prepares, streams, and folds tool-call events", async () => {
  const frames = [
    { id: "chatcmpl_1", choices: [{ delta: { content: "hello " } }] },
    { id: "chatcmpl_1", choices: [{ delta: { content: "world" } }] },
    {
      id: "chatcmpl_1",
      choices: [{ delta: { tool_calls: [{ index: 0, id: "call_1", function: { name: "file_read", arguments: "{\"path\"" } }] } }],
    },
    {
      id: "chatcmpl_1",
      choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: ":\"README.md\"}" } }] }, finish_reason: "tool_calls" }],
    },
    { id: "chatcmpl_1", choices: [], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } },
  ];

  const provider = createOpenAICompatibleProvider({
    id: "mock-openai",
    baseUrl: "https://mock.local",
    models: ["mock-model"],
  });
  provider.routes[0].transport = createMockTransport(frames);

  const client = createRaxModelClient(provider.routes);
  const request = {
    id: "req_1",
    model: { provider: "mock-openai", model: "mock-model", auth: { type: "none" as const } },
    messages: [{ role: "user" as const, content: "hi" }],
    tools: [
      {
        name: "file.read",
        description: "read a file",
        inputSchema: { type: "object" as const, properties: { path: { type: "string" } }, required: ["path"] },
      },
    ],
  };

  const prepared = await client.prepare(request);
  assert.equal(prepared.protocolId, "openai.compatible_chat");
  assert.equal(prepared.url, "https://mock.local/v1/chat/completions");
  assert.equal((prepared.body as { stream?: boolean }).stream, true);
  assert.equal(((prepared.body as { tools: Array<{ function: { name: string } }> }).tools[0]).function.name, "file_read");

  const events = [];
  for await (const event of client.stream(request)) events.push(event);
  assert.deepEqual(
    events.map((event) => event.type),
    [
      "response.start",
      "text.delta",
      "text.delta",
      "tool.input.start",
      "tool.input.delta",
      "tool.input.delta",
      "usage",
      "tool.input.end",
      "tool.call",
      "response.finish",
    ],
  );

  const response = await client.generate(request);
  assert.equal(response.text, "hello world");
  assert.deepEqual(response.toolCalls[0]?.input, { path: "README.md" });
  assert.equal(response.usage?.totalTokens, 15);
});
