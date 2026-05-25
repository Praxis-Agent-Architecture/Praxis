import assert from "node:assert/strict";
import test from "node:test";

import {
  createApiKeyAuthEnvelope,
  createBearerAuthEnvelope,
} from "../../../../src/modelAdapter/authProfileLayer/authEnvelope.js";
import { probeAuth } from "../../../../src/modelAdapter/authProfileLayer/authProbe.js";
import {
  parseChatGPTCodexAuthJson,
  parseChatGPTCodexJwtClaims,
} from "../../../../src/modelAdapter/authProfileLayer/codexAuth.js";
import {
  completeChatGPTCodexLogin,
  startChatGPTCodexLogin,
} from "../../../../src/modelAdapter/authProfileLayer/codexLoginFlow.js";
import { refreshChatGPTCodexToken } from "../../../../src/modelAdapter/authProfileLayer/codexTokenRefresh.js";
import { createCredentialRef } from "../../../../src/modelAdapter/authProfileLayer/credentialRef.js";
import { createCredentialStore } from "../../../../src/modelAdapter/authProfileLayer/credentialStore.js";
import { createProviderProfile } from "../../../../src/modelAdapter/authProfileLayer/providerProfile.js";
import { resolveAuthEnvelope } from "../../../../src/modelAdapter/authProfileLayer/authResolver.js";
import {
  redactHeaders,
  redactSecretRecord,
  redactSecretText,
} from "../../../../src/modelAdapter/authProfileLayer/secretRedaction.js";

function openAiApiKeyRef() {
  const ref = createCredentialRef({
    id: " default ",
    provider: "openai",
    credentialType: "openai_api_key",
    source: { kind: "environment", envName: " OPENAI_API_KEY " },
  });
  assert.equal(ref.ok, true);
  if (!ref.ok) {
    throw new Error("expected credential ref");
  }
  return ref.credentialRef;
}

function fakeJwt(claims: Record<string, unknown>): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none", typ: "JWT" })}.${encode(claims)}.sig`;
}

test("authProfileLayer creates public-safe credential refs, profiles, and API key envelopes", () => {
  const credentialRef = openAiApiKeyRef();
  const profile = createProviderProfile({
    profileId: " openai-default ",
    provider: "openai",
    defaultCarrierId: "openai-responses",
    redactedIdentity: "[openai:key]",
    capabilities: ["responses", "responses", "images"],
  });
  assert.equal(profile.ok, true);
  if (!profile.ok) {
    throw new Error("expected profile");
  }

  const resolved = createApiKeyAuthEnvelope({
    credentialRef,
    apiKey: "sk-test-secret-1234567890",
  });

  assert.equal(resolved.envelope.present, true);
  assert.equal(resolved.envelope.kind, "api-key");
  assert.equal(resolved.envelope.publicSafe, true);
  assert.equal(resolved.envelope.headerPlan[0]?.value, "[redacted:32]");
  assert.equal(resolved.privateMaterial?.headers?.authorization, "Bearer sk-test-secret-1234567890");
  assert.equal(JSON.stringify(resolved.envelope).includes("sk-test-secret"), false);
  assert.deepEqual(profile.profile.capabilities, ["responses", "images"]);
});

test("authResolver uses explicit environment readers and explicit Codex auth readers", () => {
  const apiRef = openAiApiKeyRef();
  const resolvedApi = resolveAuthEnvelope({
    credentialRef: apiRef,
    readEnv: (name) => name === "OPENAI_API_KEY" ? "sk-live-secret-abcdef123456" : undefined,
  });
  assert.equal(resolvedApi.ok, true);
  assert.equal(resolvedApi.resolved.envelope.present, true);
  assert.equal(JSON.stringify(resolvedApi.resolved.envelope).includes("sk-live-secret"), false);

  const codexRef = createCredentialRef({
    id: "chatgpt",
    provider: "openai",
    credentialType: "chatgpt_codex_oauth",
    source: { kind: "codex-auth-file", filePath: "/explicit/auth.json" },
  });
  assert.equal(codexRef.ok, true);
  if (!codexRef.ok) {
    throw new Error("expected codex ref");
  }

  const resolvedCodex = resolveAuthEnvelope({
    credentialRef: codexRef.credentialRef,
    readFile: () => JSON.stringify({
      tokens: {
        id_token: fakeJwt({
          email: "user@example.com",
          "https://api.openai.com/auth": {
            chatgpt_plan_type: "business",
            chatgpt_account_id: "47624111-1111-1111-1111-111111111111",
            chatgpt_account_is_fedramp: true,
          },
        }),
        access_token: "eyJcodexAccessTokenSecretMaterialForTest",
        refresh_token: "rt_secret_refresh_should_not_escape",
        account_id: "47624111-1111-1111-1111-111111111111",
      },
      last_refresh: "2026-04-26T00:00:00.000Z",
    }),
    extraHeaders: { "chatgpt-account-id": "47624111-1111-1111-1111-111111111111" },
  });

  assert.equal(resolvedCodex.ok, true);
  assert.equal(resolvedCodex.resolved.envelope.kind, "oauth");
  assert.equal(JSON.stringify(resolvedCodex.resolved.envelope).includes("eyJcodex"), false);
  assert.equal(JSON.stringify(resolvedCodex.resolved.envelope).includes("rt_secret"), false);
  assert.equal(JSON.stringify(resolvedCodex.resolved.envelope).includes("47624111"), false);
  assert.equal(resolvedCodex.resolved.privateMaterial?.headers?.authorization?.startsWith("Bearer eyJcodex"), true);
  assert.equal(resolvedCodex.resolved.privateMaterial?.headers?.["ChatGPT-Account-ID"], "47624111-1111-1111-1111-111111111111");
  assert.equal(resolvedCodex.resolved.privateMaterial?.headers?.["X-OpenAI-Fedramp"], "true");
});

test("authResolver resolves Anthropic API keys with standard messages headers", () => {
  const anthropicRef = createCredentialRef({
    id: "anthropic-default",
    provider: "anthropic",
    credentialType: "anthropic_api_key",
    source: { kind: "environment", envName: "ANTHROPIC_API_KEY" },
  });
  assert.equal(anthropicRef.ok, true);
  if (!anthropicRef.ok) {
    throw new Error("expected anthropic ref");
  }

  const resolved = resolveAuthEnvelope({
    credentialRef: anthropicRef.credentialRef,
    readEnv: (name) => name === "ANTHROPIC_API_KEY" ? "sk-ant-secret-abcdef123456" : undefined,
  });

  assert.equal(resolved.ok, true);
  assert.equal(resolved.resolved.envelope.kind, "api-key");
  assert.equal(resolved.resolved.envelope.present, true);
  assert.equal(resolved.resolved.privateMaterial?.headers?.["x-api-key"], "sk-ant-secret-abcdef123456");
  assert.equal(resolved.resolved.privateMaterial?.headers?.["anthropic-version"], "2023-06-01");
  assert.equal(JSON.stringify(resolved.resolved.envelope).includes("sk-ant-secret"), false);
});

test("authResolver uses custom header hints without forwarding the hint header", () => {
  const customRef = createCredentialRef({
    id: "custom-default",
    provider: "custom",
    credentialType: "custom",
    source: { kind: "test", label: "unit" },
  });
  assert.equal(customRef.ok, true);
  if (!customRef.ok) {
    throw new Error("expected custom ref");
  }

  const resolved = resolveAuthEnvelope({
    credentialRef: customRef.credentialRef,
    injectedSecret: "custom-secret-abcdef123456",
    extraHeaders: {
      "x-praxis-auth-header": "x-api-key",
      "x-provider-feature": "enabled",
    },
  });

  assert.equal(resolved.ok, true);
  assert.equal(resolved.resolved.privateMaterial?.headers?.["x-api-key"], "custom-secret-abcdef123456");
  assert.equal(resolved.resolved.privateMaterial?.headers?.["x-praxis-auth-header"], undefined);
  assert.equal(resolved.resolved.privateMaterial?.headers?.["x-provider-feature"], "enabled");
  assert.equal(JSON.stringify(resolved.resolved.envelope).includes("custom-secret"), false);
});

test("authResolver preserves provider-specific headers when resolving stored Gemini and custom credentials", () => {
  const geminiRef = createCredentialRef({
    id: "gemini-store",
    provider: "gemini",
    credentialType: "gemini_api_key",
    source: { kind: "profile-store", label: "unit" },
  });
  const customRef = createCredentialRef({
    id: "custom-store",
    provider: "custom",
    credentialType: "custom",
    source: { kind: "profile-store", label: "unit" },
  });
  assert.equal(geminiRef.ok, true);
  assert.equal(customRef.ok, true);
  if (!geminiRef.ok || !customRef.ok) {
    throw new Error("expected credential refs");
  }

  const store = createCredentialStore([
    {
      credentialRef: geminiRef.credentialRef,
      redactedIdentity: "[stored-gemini-key]",
      privateMaterial: {
        headers: { "x-goog-api-key": "gemini-store-secret-abcdef123456" },
      },
    },
    {
      credentialRef: customRef.credentialRef,
      redactedIdentity: "[stored-custom-key]",
      privateMaterial: {
        headers: { "x-api-key": "custom-store-secret-abcdef123456" },
      },
    },
  ]);

  const gemini = resolveAuthEnvelope({ credentialRef: geminiRef.credentialRef, store });
  assert.equal(gemini.ok, true);
  assert.equal(gemini.resolved.envelope.headerPlan[0]?.name, "x-goog-api-key");
  assert.equal(gemini.resolved.privateMaterial?.headers?.["x-goog-api-key"], "gemini-store-secret-abcdef123456");
  assert.equal(gemini.resolved.privateMaterial?.headers?.authorization, undefined);
  assert.equal(JSON.stringify(gemini.resolved.envelope).includes("gemini-store-secret"), false);

  const custom = resolveAuthEnvelope({
    credentialRef: customRef.credentialRef,
    store,
    extraHeaders: {
      "x-praxis-auth-header": "x-api-key",
      "x-provider-feature": "enabled",
    },
  });
  assert.equal(custom.ok, true);
  assert.equal(custom.resolved.envelope.headerPlan.some((header) => header.name === "x-api-key"), true);
  assert.equal(custom.resolved.envelope.headerPlan.some((header) => header.name === "x-praxis-auth-header"), false);
  assert.equal(custom.resolved.privateMaterial?.headers?.["x-api-key"], "custom-store-secret-abcdef123456");
  assert.equal(custom.resolved.privateMaterial?.headers?.["x-provider-feature"], "enabled");
  assert.equal(custom.resolved.privateMaterial?.headers?.["x-praxis-auth-header"], undefined);
  assert.equal(JSON.stringify(custom.resolved.envelope).includes("custom-store-secret"), false);
});

test("Codex auth parser follows CLI auth.json and JWT claim shape without exposing tokens", () => {
  const idToken = fakeJwt({
    email: "user@example.com",
    exp: 1_800_000_000,
    "https://api.openai.com/auth": {
      chatgpt_plan_type: "self_serve_business_usage_based",
      chatgpt_user_id: "user-secret-id",
      chatgpt_account_id: "workspace-secret-id",
      chatgpt_account_is_fedramp: true,
    },
  });

  const claims = parseChatGPTCodexJwtClaims(idToken);
  assert.equal(claims?.chatgptPlanType, "self_serve_business_usage_based");
  assert.equal(claims?.chatgptAccountId, "workspace-secret-id");
  assert.equal(claims?.chatgptAccountIsFedramp, true);

  const parsed = parseChatGPTCodexAuthJson(JSON.stringify({
    auth_mode: "chatgpt",
    tokens: {
      id_token: idToken,
      access_token: fakeJwt({ "https://api.openai.com/auth": { chatgpt_account_id: "workspace-secret-id" } }),
      refresh_token: "rt_secret_refresh_should_not_escape",
    },
    last_refresh: "2026-04-26T00:00:00.000Z",
  }));

  assert.equal(parsed.ok, true);
  if (!parsed.ok) {
    throw new Error("expected parsed codex auth");
  }

  assert.equal(parsed.snapshot.accountId, "workspace-secret-id");
  assert.equal(parsed.publicSnapshot.planType, "self_serve_business_usage_based");
  assert.equal(parsed.publicSnapshot.refreshTokenPresent, true);
  assert.equal(JSON.stringify(parsed.publicSnapshot).includes("rt_secret"), false);
  assert.equal(JSON.stringify(parsed.publicSnapshot).includes("workspace-secret-id"), false);
  assert.equal(JSON.stringify(parsed.publicSnapshot).includes("access_token"), false);
});

test("Codex login flow exposes a thin framework entry for raxode-style login shells", async () => {
  const started = startChatGPTCodexLogin({
    redirectUri: "http://localhost:1455/auth/callback",
    forceState: "state-1",
    forcedWorkspaceId: "workspace-secret-id",
    now: new Date("2026-04-26T00:00:00.000Z"),
  });
  assert.equal(started.ok, true);
  if (!started.ok) {
    throw new Error("expected login start");
  }

  const authUrl = new URL(started.login.authUrl);
  assert.equal(authUrl.origin, "https://auth.openai.com");
  assert.equal(authUrl.searchParams.get("client_id"), "app_EMoamEEZ73f0CkXaXp7hrann");
  assert.equal(authUrl.searchParams.get("code_challenge_method"), "S256");
  assert.equal(authUrl.searchParams.get("codex_cli_simplified_flow"), "true");
  assert.equal(authUrl.searchParams.get("originator"), "codex_cli_rs");
  assert.equal(authUrl.searchParams.get("allowed_workspace_id"), "workspace-secret-id");

  const store = createCredentialStore();
  let persistedText = "";
  const idToken = fakeJwt({
    email: "user@example.com",
    "https://api.openai.com/auth": {
      chatgpt_plan_type: "pro",
      chatgpt_account_id: "workspace-secret-id",
    },
  });
  const accessToken = fakeJwt({
    "https://api.openai.com/auth": {
      chatgpt_plan_type: "pro",
      chatgpt_account_id: "workspace-secret-id",
    },
  });

  const completed = await completeChatGPTCodexLogin({
    session: started.session,
    callbackUrl: "http://localhost:1455/auth/callback?code=oauth-code-secret&state=state-1",
    authFilePath: "/home/proview/.codex/auth.json",
    store,
    writeAuthJson: ({ authJsonText }) => {
      persistedText = authJsonText;
    },
    exchange: async (request) => {
      assert.equal(request.code, "oauth-code-secret");
      assert.equal(request.codeVerifier, started.session.codeVerifier);
      return {
        idToken,
        accessToken,
        refreshToken: "rt_secret_refresh_should_not_escape",
      };
    },
    now: new Date("2026-04-26T00:00:00.000Z"),
  });

  assert.equal(completed.ok, true);
  if (!completed.ok) {
    throw new Error("expected login completion");
  }

  assert.equal(completed.credentialRef.credentialType, "chatgpt_codex_oauth");
  assert.equal(completed.credentialRef.source.kind, "codex-auth-file");
  assert.equal(completed.profile.defaultCarrierId, "chatgpt-codex-responses");
  assert.equal(completed.carrier.baseURL, "https://chatgpt.com/backend-api/codex");
  assert.equal(store.get(completed.credentialRef)?.privateMaterial?.headers?.authorization?.startsWith("Bearer "), true);
  assert.equal(persistedText.includes("rt_secret_refresh_should_not_escape"), true);
  assert.equal(JSON.stringify(completed).includes("rt_secret"), false);
  assert.equal(JSON.stringify(completed).includes("oauth-code-secret"), false);
  assert.equal(JSON.stringify(completed).includes("workspace-secret-id"), false);
});

test("Codex login completion rejects callback state mismatch before token exchange", async () => {
  const started = startChatGPTCodexLogin({
    redirectUri: "http://localhost:1455/auth/callback",
    forceState: "state-1",
  });
  assert.equal(started.ok, true);
  if (!started.ok) {
    throw new Error("expected login start");
  }

  let exchangeCalled = false;
  const completed = await completeChatGPTCodexLogin({
    session: started.session,
    callbackUrl: "http://localhost:1455/auth/callback?code=oauth-code-secret&state=wrong",
    store: createCredentialStore(),
    exchange: async () => {
      exchangeCalled = true;
      throw new Error("should not run");
    },
  });

  assert.equal(completed.ok, false);
  if (!completed.ok) {
    assert.equal(completed.error.code, "STATE_MISMATCH");
    assert.equal(JSON.stringify(completed).includes("oauth-code-secret"), false);
  }
  assert.equal(exchangeCalled, false);
});

test("Codex token refresh uses explicit writer and keeps public output redacted", async () => {
  const idToken = fakeJwt({
    "https://api.openai.com/auth": {
      chatgpt_plan_type: "plus",
      chatgpt_account_id: "workspace-secret-id",
    },
  });
  const accessToken = fakeJwt({
    "https://api.openai.com/auth": {
      chatgpt_account_id: "workspace-secret-id",
    },
  });
  let persistedText = "";

  const refreshed = await refreshChatGPTCodexToken({
    previousTokens: {
      idToken,
      accessToken,
      refreshToken: "rt_secret_old_refresh_should_not_escape",
    },
    writeAuthJson: ({ authJsonText }) => {
      persistedText = authJsonText;
    },
    exchange: async (request) => {
      assert.equal(request.refreshToken, "rt_secret_old_refresh_should_not_escape");
      return {
        accessToken: fakeJwt({ "https://api.openai.com/auth": { chatgpt_account_id: "workspace-secret-id" } }),
        refreshToken: "rt_secret_new_refresh_should_not_escape",
      };
    },
    now: new Date("2026-04-26T00:00:00.000Z"),
  });

  assert.equal(refreshed.ok, true);
  assert.equal(persistedText.includes("rt_secret_new_refresh_should_not_escape"), true);
  assert.equal(JSON.stringify(refreshed).includes("rt_secret"), false);
  assert.equal(JSON.stringify(refreshed).includes("workspace-secret-id"), false);
});

test("credentialStore and authProbe expose only redacted credential state", () => {
  const credentialRef = openAiApiKeyRef();
  const envelope = createBearerAuthEnvelope({
    credentialRef,
    token: "sk-store-secret-abcdef123456",
  });
  const store = createCredentialStore([
    {
      credentialRef,
      privateMaterial: envelope.privateMaterial,
      redactedIdentity: "[stored-openai-key]",
    },
  ]);

  assert.equal(JSON.stringify(store.listPublic()).includes("sk-store-secret"), false);
  const probe = probeAuth({ credentialRef, store });
  assert.equal(probe.ok, true);
  assert.equal(probe.status, "available");
  assert.equal(probe.headerPlanCount, 1);
  assert.equal(JSON.stringify(probe).includes("sk-store-secret"), false);
});

test("secret redaction covers nested records and authorization headers", () => {
  assert.equal(redactSecretText("Authorization: Bearer sk-test-secret-1234567890"), "Authorization: Bearer [redacted]");
  assert.deepEqual(redactHeaders({
    authorization: "Bearer sk-test-secret-1234567890",
    "x-codex-turn-state": "route-token",
    "x-safe": "ok",
  }), {
    authorization: "[redacted:32]",
    "x-codex-turn-state": "[redacted:11]",
    "x-safe": "ok",
  });
  const redacted = redactSecretRecord({
    nested: {
      refresh_token: "rt_secret_refresh_should_not_escape",
      message: "Bearer eyJsecretJwtLikeTokenMaterial123456",
    },
  });
  assert.equal(JSON.stringify(redacted).includes("rt_secret"), false);
  assert.equal(JSON.stringify(redacted).includes("eyJsecret"), false);
});
