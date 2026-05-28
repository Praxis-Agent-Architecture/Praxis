import assert from "node:assert/strict";
import test from "node:test";

import {
  createFetchTransport,
  decodeCompleteServerSentEvents,
  decodeServerSentEventChunk,
  type RaxPreparedModelRequest,
} from "../../../../src/modelAdapter/index.js";

const prepared: RaxPreparedModelRequest = {
  id: "stream-1",
  routeId: "openai",
  protocolId: "openai.chat",
  url: "https://provider.local/v1/chat/completions",
  method: "POST",
  headers: {},
  body: {},
  redacted: { url: "https://provider.local/v1/chat/completions", method: "POST", headers: {}, body: {} },
  metadata: {},
};

test("decodeCompleteServerSentEvents keeps partial SSE blocks as remainder", () => {
  const first = decodeCompleteServerSentEvents('data: {"choices":[{"delta":{"content":"hel');
  assert.deepEqual(first.frames, []);
  assert.equal(first.remainder, 'data: {"choices":[{"delta":{"content":"hel');

  const second = decodeCompleteServerSentEvents(first.remainder + 'lo"}}]}\n\n');
  assert.deepEqual(second.frames, [{ choices: [{ delta: { content: "hello" } }] }]);
  assert.equal(second.remainder, "");
});

test("fetch transport does not emit partial JSON fragments from split SSE chunks", async () => {
  const chunks = [
    'data: {"choices":[{"delta":{"content":"hel',
    'lo"}}]}\n\n',
    'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
  ];
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  const transport = createFetchTransport(async () => new Response(stream, { status: 200 }));

  const frames: unknown[] = [];
  for await (const frame of transport.send(prepared, decodeServerSentEventChunk)) frames.push(frame);

  assert.deepEqual(frames, [
    { choices: [{ delta: { content: "hello" } }] },
    { choices: [{ delta: { content: " world" } }] },
  ]);
});

test("fetch transport yields application/json responses as a single frame", async () => {
  const transport = createFetchTransport(async () => new Response(
    JSON.stringify({ choices: [{ message: { content: "json-ok" }, finish_reason: "stop" }] }),
    { status: 200, headers: { "content-type": "application/json" } },
  ));

  const frames: unknown[] = [];
  for await (const frame of transport.send(prepared, decodeServerSentEventChunk)) frames.push(frame);

  assert.deepEqual(frames, [
    { choices: [{ message: { content: "json-ok" }, finish_reason: "stop" }] },
  ]);
});
