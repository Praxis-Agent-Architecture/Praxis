import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyProviderError,
  createFetchTransport,
  raxModelError,
  type RaxPreparedModelRequest,
} from "../../../../src/modelAdapter/index.js";

const prepared: RaxPreparedModelRequest = {
  id: "req",
  routeId: "openai",
  protocolId: "openai.chat",
  url: "https://provider.test/v1/chat/completions",
  method: "POST",
  headers: {},
  body: {},
  redacted: { url: "https://provider.test/v1/chat/completions", method: "POST", headers: {}, body: {} },
  metadata: {},
};

test("provider error classification marks auth, rate-limit, quota, and server retry behavior", () => {
  assert.deepEqual(classifyProviderError({ status: 401 }), { category: "authentication", retryable: false, status: 401 });
  assert.deepEqual(classifyProviderError({ status: 429, headers: { "retry-after": "2" } }), {
    category: "rate_limit",
    retryable: true,
    status: 429,
    retryAfterMs: 2000,
  });
  assert.deepEqual(classifyProviderError({ status: 429, body: "insufficient_quota" }), {
    category: "quota",
    retryable: true,
    status: 429,
  });
  assert.deepEqual(classifyProviderError({ status: 503 }), { category: "server", retryable: true, status: 503 });
});

test("fetch transport attaches classified provider details to HTTP errors", async () => {
  const transport = createFetchTransport(async () => new Response(
    JSON.stringify({ error: { message: "slow down" } }),
    { status: 429, headers: { "retry-after": "3" } },
  ));

  await assert.rejects(
    async () => {
      for await (const _frame of transport.send(prepared)) {
        // consume stream
      }
    },
    (error: unknown) => {
      assert.ok(error instanceof Error);
      const modelError = error as ReturnType<typeof raxModelError>;
      assert.equal(modelError.code, "provider_error");
      assert.equal(modelError.details?.category, "rate_limit");
      assert.equal(modelError.details?.retryable, true);
      assert.equal(modelError.details?.retryAfterMs, 3000);
      assert.equal(modelError.details?.status, 429);
      assert.equal(typeof modelError.details?.bodyPreview, "string");
      return true;
    },
  );
});

