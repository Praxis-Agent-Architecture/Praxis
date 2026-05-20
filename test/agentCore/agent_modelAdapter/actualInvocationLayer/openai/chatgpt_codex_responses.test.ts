import assert from "node:assert/strict";
import test from "node:test";

import {
  CHATGPT_CODEX_RESPONSES_BASE_URL,
  invokeChatGPTCodexResponses,
} from "../../../../../src/modelAdapter/actualInvocationLayer/openai/chatgpt_codex_responses.js";
import { createChatGPTCodexAuthEnvelope } from "../../../../../src/modelAdapter/authProfileLayer/codexAuth.js";
import { createCredentialRef } from "../../../../../src/modelAdapter/authProfileLayer/credentialRef.js";

function codexAuthEnvelope() {
  const ref = createCredentialRef({
    id: "chatgpt",
    provider: "openai",
    credentialType: "chatgpt_codex_oauth",
    source: { kind: "test", label: "unit" },
  });
  assert.equal(ref.ok, true);
  if (!ref.ok) {
    throw new Error("expected credential ref");
  }

  return createChatGPTCodexAuthEnvelope({
    credentialRef: ref.credentialRef,
    snapshot: {
      sourceShape: "chatgpt-auth-tokens",
      authMode: "chatgpt",
      accessToken: "codex-access-token-secret",
      refreshTokenPresent: false,
      idTokenPresent: false,
      accountId: "workspace-secret-id",
      planType: "pro",
      email: "user@example.com",
      chatgptUserId: "user-secret-id",
      accountIsFedramp: true,
      publicSafe: false,
    },
  });
}

test("ChatGPT Codex responses uses product backend path and public-safe auth headers", async () => {
  const auth = codexAuthEnvelope();
  let transportHeaders: Readonly<Record<string, string>> = {};

  const result = await invokeChatGPTCodexResponses({
    operation: "create",
    runtime: { runtimeId: "runtime-1" },
    dryRun: false,
    governance: { accepted: true },
    auth: auth.envelope,
    clientName: "praxis-test",
    clientVersion: "0.0.0-test",
    body: { model: "gpt-5.4", input: "hello" },
    caller: async (request) => {
      assert.equal(request.url, `${CHATGPT_CODEX_RESPONSES_BASE_URL}/responses`);
      assert.equal(request.endpoint, "/responses");
      assert.equal(request.query.client_version, "0.0.0-test");
      assert.equal(request.headers.authorization, "[redacted:32]");
      assert.equal(request.headers["chatgpt-account-id"], "[redacted:19]");
      assert.equal(JSON.stringify(request).includes("workspace-secret-id"), false);
      assert.deepEqual((request.body as Record<string, unknown>).client_metadata, {
        client_name: "praxis-test",
        client_version: "0.0.0-test",
      });
      transportHeaders = auth.privateMaterial?.headers ?? {};
      return { id: "resp_1", object: "response" };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(transportHeaders.authorization, "Bearer codex-access-token-secret");
  assert.equal(transportHeaders["ChatGPT-Account-ID"], "workspace-secret-id");
  assert.equal(transportHeaders["X-OpenAI-Fedramp"], "true");
});

test("ChatGPT Codex responses preserves Responses image input content blocks", async () => {
  const auth = codexAuthEnvelope();
  let capturedBody: Record<string, unknown> | undefined;

  const result = await invokeChatGPTCodexResponses({
    operation: "create",
    runtime: { runtimeId: "runtime-vision" },
    dryRun: false,
    governance: { accepted: true },
    auth: auth.envelope,
    body: {
      model: "gpt-5.5",
      input: [{
        role: "user",
        content: [
          { type: "input_text", text: "What is visible?" },
          { type: "input_image", image_url: "data:image/png;base64,AAAA", detail: "high" },
        ],
      }],
    },
    caller: async (request) => {
      capturedBody = request.body as Record<string, unknown>;
      return { id: "resp_vision", object: "response" };
    },
  });

  assert.equal(result.ok, true);
  const bodyText = JSON.stringify(capturedBody);
  assert.match(bodyText, /input_image/u);
  assert.match(bodyText, /data:image\/png;base64,AAAA/u);
});

test("ChatGPT Codex responses preserves explicit non-stream requests", async () => {
  const auth = codexAuthEnvelope();
  let capturedBody: Record<string, unknown> | undefined;

  const result = await invokeChatGPTCodexResponses({
    operation: "create",
    runtime: { runtimeId: "runtime-image-generation" },
    dryRun: false,
    governance: { accepted: true },
    auth: auth.envelope,
    body: {
      model: "gpt-5.5",
      input: "Draw a small image.",
      tools: [{ type: "image_generation" }],
      stream: false,
    },
    caller: async (request) => {
      capturedBody = request.body as Record<string, unknown>;
      return { id: "resp_image_generation", object: "response" };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(capturedBody?.stream, false);
  assert.equal(capturedBody?.store, false);
});
