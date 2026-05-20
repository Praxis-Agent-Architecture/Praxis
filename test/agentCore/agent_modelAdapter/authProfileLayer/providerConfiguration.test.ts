import assert from "node:assert/strict";
import test from "node:test";

import {
  bindRaxodeRoleModel,
  createRaxodeModelEntry,
  createRaxodeProviderProfile,
  createRaxodeSecret,
  maskRaxodeSecret,
  resolveRaxodeProviderRequestUrl,
} from "../../../../src/modelAdapter/authProfileLayer/providerConfiguration.js";

test("providerConfiguration resolves provider roots and literal URLs for supported endpoint shapes", () => {
  const messages = resolveRaxodeProviderRequestUrl({
    inputBaseURL: "https://api.deepseek.com",
    endpointShape: "messages",
  });
  assert.equal(messages.ok, true);
  if (!messages.ok) throw new Error("expected messages URL plan");
  assert.equal(messages.plan.urlMode, "auto_append_endpoint");
  assert.equal(messages.plan.finalRequestURL, "https://api.deepseek.com/v1/messages");

  const literal = resolveRaxodeProviderRequestUrl({
    inputBaseURL: "https://api.deepseek.com/anthropic/",
    endpointShape: "messages",
  });
  assert.equal(literal.ok, true);
  if (!literal.ok) throw new Error("expected literal URL plan");
  assert.equal(literal.plan.urlMode, "literal");
  assert.equal(literal.plan.finalRequestURL, "https://api.deepseek.com/anthropic/");

  const responses = resolveRaxodeProviderRequestUrl({
    inputBaseURL: "https://gateway.example.com",
    endpointShape: "responses",
  });
  assert.equal(responses.ok, true);
  if (!responses.ok) throw new Error("expected responses URL plan");
  assert.equal(responses.plan.finalRequestURL, "https://gateway.example.com/v1/responses");

  const responsesWithVersionRoot = resolveRaxodeProviderRequestUrl({
    inputBaseURL: "https://api.openai.com/v1",
    endpointShape: "responses",
  });
  assert.equal(responsesWithVersionRoot.ok, true);
  if (!responsesWithVersionRoot.ok) throw new Error("expected version-root responses URL plan");
  assert.equal(responsesWithVersionRoot.plan.finalRequestURL, "https://api.openai.com/v1/responses");

  const chat = resolveRaxodeProviderRequestUrl({
    inputBaseURL: "https://gateway.example.com",
    endpointShape: "chat_completions",
  });
  assert.equal(chat.ok, true);
  if (!chat.ok) throw new Error("expected chat completions URL plan");
  assert.equal(chat.plan.finalRequestURL, "https://gateway.example.com/v1/chat/completions");
});

test("providerConfiguration rejects full endpoints without a trailing slash", () => {
  for (const [inputBaseURL, endpointShape] of [
    ["https://gateway.example.com/v1/responses", "responses"],
    ["https://gateway.example.com/v1/chat/completions", "chat_completions"],
    ["https://gateway.example.com/v1/messages", "messages"],
  ] as const) {
    const result = resolveRaxodeProviderRequestUrl({ inputBaseURL, endpointShape });
    assert.equal(result.ok, false);
    if (result.ok) throw new Error("expected rejection");
    assert.equal(result.error.code, "FULL_ENDPOINT_REQUIRES_TRAILING_SLASH");
    assert.equal(result.error.publicSafe, true);
    assert.match(result.error.message, /trailing/i);
  }
});

test("providerConfiguration masks secrets and creates alpha-grade secret records without false encryption claims", () => {
  assert.equal(maskRaxodeSecret("sk-1234567890abcdef"), "sk-123...abcdef");
  assert.equal(maskRaxodeSecret("short"), "s***t");

  const secret = createRaxodeSecret({
    id: " secret.deepseek ",
    providerLabel: " DeepSeek ",
    secretKind: "api_key",
    apiKey: "sk-1234567890abcdef",
    now: "2026-05-17T00:00:00.000Z",
  });
  assert.equal(secret.ok, true);
  if (!secret.ok) throw new Error("expected secret");
  assert.equal(secret.secret.id, "secret.deepseek");
  assert.equal(secret.secret.display.masked, "sk-123...abcdef");
  assert.equal(secret.secret.encryption.mode, "none");
  assert.equal(secret.secret.encryption.reserved, true);
  assert.equal(JSON.stringify(secret.secret.display).includes("1234567890"), false);
});

test("providerConfiguration builds provider profiles with nested model entries and independent role bindings", () => {
  const model = createRaxodeModelEntry({
    id: "model.deepseek.pro",
    model: "deepseek-v4-pro",
    reasoningEffort: "high",
    contextWindowTokens: 1_000_000,
    maxOutputTokens: 384_000,
  });
  assert.equal(model.ok, true);
  if (!model.ok) throw new Error("expected model");
  assert.equal(model.modelEntry.usableInputTokens, 585_200);
  assert.equal(model.modelEntry.testStatus.state, "unknown");

  const profile = createRaxodeProviderProfile({
    id: "profile.deepseek.chat",
    name: "DeepSeek Chat Completions (api.deepseek.com)",
    providerLabel: "DeepSeek",
    endpointShape: "chat_completions",
    authSecretId: "secret.deepseek",
    inputBaseURL: "https://api.deepseek.com",
    modelEntries: [model.modelEntry],
    now: "2026-05-17T00:00:00.000Z",
  });
  assert.equal(profile.ok, true);
  if (!profile.ok) throw new Error("expected profile");
  assert.equal(profile.profile.finalRequestURL, "https://api.deepseek.com/v1/chat/completions");
  assert.equal(profile.profile.modelEntries[0]?.model, "deepseek-v4-pro");

  const core = bindRaxodeRoleModel({
    roleId: "core.main",
    providerProfileId: profile.profile.id,
    modelEntryId: model.modelEntry.id,
  });
  const tui = bindRaxodeRoleModel({
    roleId: "tui.main",
    providerProfileId: profile.profile.id,
    modelEntryId: model.modelEntry.id,
  });
  assert.equal(core.ok, true);
  assert.equal(tui.ok, true);
  if (!core.ok || !tui.ok) throw new Error("expected role bindings");
  assert.equal(core.binding.roleId, "core.main");
  assert.equal(tui.binding.roleId, "tui.main");
  assert.notEqual(core.binding.roleId, tui.binding.roleId);
});
