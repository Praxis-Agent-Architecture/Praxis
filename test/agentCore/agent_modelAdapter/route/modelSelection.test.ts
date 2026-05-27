import assert from "node:assert/strict";
import test from "node:test";

import {
  createDefaultRaxProviderRegistry,
  createOpenAICompatibleProvider,
  createRaxProviderRegistry,
} from "../../../../src/modelAdapter/index.js";

test("provider registry selects route, auth, compat, and catalog metadata for a model request", () => {
  const registry = createDefaultRaxProviderRegistry();
  const completed = registry.completeModelRequest({
    model: { provider: "anthropic", model: "claude-sonnet-4-5" },
    messages: [{ role: "user", content: "hello" }],
    tools: [{ name: "file.read", inputSchema: { type: "object" } }],
  });

  assert.equal(completed.model.route, "anthropic");
  assert.deepEqual(completed.model.auth, { type: "api_key", env: "ANTHROPIC_API_KEY", header: "x-api-key" });
  assert.equal((completed.metadata?.provider as { id?: string }).id, "anthropic");
  assert.equal((completed.metadata?.provider as { routeId?: string }).routeId, "anthropic");
  assert.equal((completed.metadata?.provider as { protocolId?: string }).protocolId, "anthropic.messages");
});

test("provider registry rejects tool requests for models without tool support", () => {
  const provider = createOpenAICompatibleProvider({
    id: "text-only",
    baseUrl: "https://text-only.local",
    models: ["text-small"],
  });
  provider.models = provider.models?.map((model) => ({ ...model, supportsTools: false }));
  const registry = createRaxProviderRegistry([provider]);

  assert.throws(
    () => registry.completeModelRequest({
      model: { provider: "text-only", model: "text-small" },
      messages: [{ role: "user", content: "hello" }],
      tools: [{ name: "file.read", inputSchema: { type: "object" } }],
    }),
    /does not support tools/u,
  );
});

test("provider registry rejects reasoning requests when model metadata disables reasoning", () => {
  const provider = createOpenAICompatibleProvider({
    id: "plain-reasoning",
    baseUrl: "https://plain-reasoning.local",
    models: ["plain-small"],
  });
  provider.models = provider.models?.map((model) => ({ ...model, supportsReasoning: false }));
  const registry = createRaxProviderRegistry([provider]);

  assert.throws(
    () => registry.completeModelRequest({
      model: { provider: "plain-reasoning", model: "plain-small" },
      messages: [{ role: "user", content: "think carefully" }],
      generation: { reasoningEffort: "medium" },
    }),
    /does not support reasoning/u,
  );
});

test("provider registry rejects vision requests when model metadata disables vision", () => {
  const provider = createOpenAICompatibleProvider({
    id: "plain-vision",
    baseUrl: "https://plain-vision.local",
    models: ["plain-small"],
  });
  provider.models = provider.models?.map((model) => ({ ...model, supportsVision: false }));
  const registry = createRaxProviderRegistry([provider]);

  assert.throws(
    () => registry.completeModelRequest({
      model: { provider: "plain-vision", model: "plain-small" },
      messages: [{
        role: "user",
        content: [{ type: "image", mimeType: "image/png", data: "iVBORw0KGgo=" }],
      }],
    }),
    /does not support vision/u,
  );
});

test("provider registry clamps generation limits from model catalog metadata", () => {
  const provider = createOpenAICompatibleProvider({
    id: "limited-output",
    baseUrl: "https://limited-output.local",
    models: ["tiny-out"],
  });
  provider.models = provider.models?.map((model) => ({
    ...model,
    contextWindow: 4096,
    maxOutputTokens: 128,
  }));
  const registry = createRaxProviderRegistry([provider]);

  const completed = registry.completeModelRequest({
    model: { provider: "limited-output", model: "tiny-out" },
    messages: [{ role: "user", content: "hello" }],
    generation: { maxOutputTokens: 512, temperature: 0.2 },
  });

  assert.equal(completed.generation?.maxOutputTokens, 128);
  assert.equal(completed.generation?.temperature, 0.2);
  const providerMetadata = completed.metadata?.provider as {
    limits?: { contextWindow?: number; maxOutputTokens?: number };
    appliedLimits?: Array<{ field: string; requested: number; applied: number; reason: string }>;
  };
  assert.deepEqual(providerMetadata.limits, { contextWindow: 4096, maxOutputTokens: 128 });
  assert.deepEqual(providerMetadata.appliedLimits, [{
    field: "maxOutputTokens",
    requested: 512,
    applied: 128,
    reason: "model.maxOutputTokens",
  }]);
});
