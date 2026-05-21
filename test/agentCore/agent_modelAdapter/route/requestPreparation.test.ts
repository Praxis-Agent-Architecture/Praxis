import assert from "node:assert/strict";
import test from "node:test";

import {
  createFetchTransport,
  createRaxModelClient,
  openAIProvider,
  type RaxPreparedModelRequest,
} from "../../../../src/modelAdapter/index.js";

test("model client prepares filtered native options, query params, and redacted sensitive headers", async () => {
  const client = createRaxModelClient([openAIProvider.routes[0]!]);

  const prepared = await client.prepare({
    id: "prepared-1",
    model: {
      provider: "openai",
      model: "gpt-test",
      route: "openai",
      baseUrl: "https://proxy.local",
      auth: { type: "none" },
    },
    messages: [{ role: "user", content: "hello" }],
    providerOptions: {
      native: {
        service_tier: "priority",
        unsupported_provider_knob: true,
      },
      query: { organization: "org_1" },
      headers: {
        "x-debug-id": "debug-1",
        Authorization: "Bearer raw-provider-token",
        "x-api-key": "raw-api-key",
      },
    },
    http: { timeoutMs: 1234 },
  });

  assert.equal(prepared.url, "https://proxy.local/v1/chat/completions?organization=org_1");
  assert.equal((prepared.body as { service_tier?: string }).service_tier, "priority");
  assert.equal((prepared.body as { unsupported_provider_knob?: boolean }).unsupported_provider_knob, undefined);
  assert.equal(prepared.headers.Authorization, "Bearer raw-provider-token");
  assert.equal(prepared.headers["x-api-key"], "raw-api-key");
  assert.equal(prepared.redacted.headers.Authorization, "[redacted]");
  assert.equal(prepared.redacted.headers["x-api-key"], "[redacted]");
  assert.equal(prepared.redacted.headers["x-debug-id"], "debug-1");
  assert.equal(prepared.timeoutMs, 1234);
});

test("fetch transport forwards prepared abort signal and timeout signal to fetch", async () => {
  let seenSignal: AbortSignal | undefined;
  const transport = createFetchTransport(async (_input, init) => {
    seenSignal = init?.signal ?? undefined;
    return new Response("data: {}\n\n", { status: 200 });
  });
  const prepared: RaxPreparedModelRequest = {
    id: "prepared-2",
    routeId: "openai",
    protocolId: "openai.chat",
    url: "https://provider.local/v1/chat/completions",
    method: "POST",
    headers: {},
    body: {},
    timeoutMs: 5000,
    redacted: { url: "https://provider.local/v1/chat/completions", method: "POST", headers: {}, body: {} },
    metadata: {},
  };

  for await (const _frame of transport.send(prepared)) {
    // consume stream
  }

  assert.ok(seenSignal instanceof AbortSignal);
});
