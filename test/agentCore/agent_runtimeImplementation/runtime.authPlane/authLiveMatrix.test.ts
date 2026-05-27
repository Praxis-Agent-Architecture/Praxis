import assert from "node:assert/strict";
import test from "node:test";

import {
  appendEndpoint,
  buildLiveAuthProbePlan,
} from "../../../../examples/scripts/agentcore_auth_live_matrix.js";
import type { RuntimeAuthProviderProfile } from "../../../../src/runtimeImplementation/runtime.authPlane/index.js";

function profile(input: {
  endpointShape: RuntimeAuthProviderProfile["endpointShape"];
  baseURL: string;
}): RuntimeAuthProviderProfile {
  return {
    profileId: `profile.${input.endpointShape}`,
    name: input.endpointShape,
    provider: "openai",
    providerLabel: "OpenAI",
    endpointShape: input.endpointShape,
    baseURL: input.baseURL,
    credentialRef: {
      credentialRefId: "credential.test",
      secretId: "secret.test",
      provider: "openai",
      credentialType: "openai_api_key",
      secretKind: "api_key",
      publicSafe: true,
    },
    authMode: "api_key",
    createdAt: "2026-05-25T00:00:00.000Z",
    updatedAt: "2026-05-25T00:00:00.000Z",
    publicSafe: true,
  };
}

test("auth live matrix probes OpenAI Responses with the Responses endpoint and body", () => {
  const plan = buildLiveAuthProbePlan({
    profile: profile({ endpointShape: "responses", baseURL: "https://api.openai.com/v1" }),
    model: "gpt-5.5",
    headers: { authorization: "Bearer test" },
  });

  assert.equal(plan.url, "https://api.openai.com/v1/responses");
  assert.equal(plan.method, "POST");
  assert.equal(plan.headers.authorization, "Bearer test");
  assert.deepEqual(plan.body, {
    model: "gpt-5.5",
    input: "Say praxis-auth-ok.",
    max_output_tokens: 32,
    store: false,
  });
});

test("auth live matrix keeps chat completions separate from Responses", () => {
  const plan = buildLiveAuthProbePlan({
    profile: profile({ endpointShape: "chat_completions", baseURL: "https://api.deepseek.com" }),
    model: "deepseek-v4-pro",
  });

  assert.equal(plan.url, "https://api.deepseek.com/v1/chat/completions");
  assert.deepEqual(plan.body, {
    model: "deepseek-v4-pro",
    messages: [{ role: "user", content: "Say praxis-auth-ok." }],
    max_tokens: 32,
  });
});

test("appendEndpoint does not duplicate versioned endpoint prefixes", () => {
  assert.equal(appendEndpoint("https://api.openai.com/v1", "/v1/responses"), "https://api.openai.com/v1/responses");
  assert.equal(
    appendEndpoint("https://generativelanguage.googleapis.com/v1beta", "/v1beta/models/gemini:generateContent"),
    "https://generativelanguage.googleapis.com/v1beta/models/gemini:generateContent",
  );
});
