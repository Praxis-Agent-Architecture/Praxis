import assert from "node:assert/strict";
import test from "node:test";

import {
  anthropicProvider,
  createProviderAuthRef,
  googleProvider,
  openAIProvider,
  resolveRaxAuth,
  runEffect,
} from "../../../../src/modelAdapter/index.js";

test("provider auth profiles preserve provider-specific API key headers", async () => {
  const openai = await runEffect(resolveRaxAuth(createProviderAuthRef(openAIProvider, { value: "openai-key" })));
  assert.equal(openai.headers.Authorization, "Bearer openai-key");
  assert.equal(openai.redactedHeaders.Authorization, "Bearer [redacted]");

  const anthropic = await runEffect(resolveRaxAuth(createProviderAuthRef(anthropicProvider, { value: "anthropic-key" })));
  assert.equal(anthropic.headers["x-api-key"], "anthropic-key");
  assert.equal(anthropic.redactedHeaders["x-api-key"], "[redacted]");

  const google = await runEffect(resolveRaxAuth(createProviderAuthRef(googleProvider, { value: "google-key" })));
  assert.equal(google.headers["x-goog-api-key"], "google-key");
  assert.equal(google.redactedHeaders["x-goog-api-key"], "[redacted]");
});
