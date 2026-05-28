import assert from "node:assert/strict";
import test from "node:test";

import {
  createDefaultRaxModelClient,
  createDefaultRaxProviderRegistry,
  createMockTransport,
} from "../../../../src/modelAdapter/index.js";

test("default provider registry exposes provider, compat, catalog, and auth surfaces without global mutation", () => {
  const registry = createDefaultRaxProviderRegistry();

  assert.ok(registry.get("openai"));
  assert.ok(registry.get("anthropic"));
  assert.ok(registry.compat.get("google"));
  assert.ok(registry.catalog.get("deepseek", "deepseek-chat"));
  assert.deepEqual(registry.authRef("anthropic", { value: "test-key" }), {
    type: "api_key",
    value: "test-key",
    header: "x-api-key",
  });
});

test("default model client factory applies transport overrides to provider routes", async () => {
  const client = createDefaultRaxModelClient({
    transport: createMockTransport([
      { choices: [{ delta: { content: "factory" }, finish_reason: "stop" }] },
    ]),
  });

  const response = await client.generate({
    model: { provider: "openai", model: "gpt-5.4", route: "openai", auth: { type: "none" } },
    messages: [{ role: "user", content: "hello" }],
  });

  assert.equal(response.text, "factory");
});
