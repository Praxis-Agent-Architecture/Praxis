import assert from "node:assert/strict";
import test from "node:test";

import { createApiKeyAuthEnvelope } from "../../../../src/agentCore/agent_modelAdapter/authProfileLayer/authEnvelope.js";
import { createCredentialRef } from "../../../../src/agentCore/agent_modelAdapter/authProfileLayer/credentialRef.js";
import { probeAuth } from "../../../../src/agentCore/agent_modelAdapter/authProfileLayer/authProbe.js";
import { OPENAI_PROVIDER_CAPABILITY_CATALOG } from "../../../../src/agentCore/agent_modelAdapter/providerAccessLayer/openaiCapabilityCatalog.js";
import { createProviderCaller } from "../../../../src/agentCore/agent_modelAdapter/providerAccessLayer/providerCaller.js";
import {
  CHATGPT_CODEX_DEFAULT_BASE_URL,
  createChatGPTCodexResponsesCarrier,
  createProviderCarrier,
} from "../../../../src/agentCore/agent_modelAdapter/providerAccessLayer/providerCarrier.js";
import { registerProviderAccessCarriers } from "../../../../src/agentCore/agent_modelAdapter/providerAccessLayer/providerCarrierRegistry.js";
import { classifyProviderAccessError } from "../../../../src/agentCore/agent_modelAdapter/providerAccessLayer/providerErrorClassifier.js";
import { probeProviderCarrier } from "../../../../src/agentCore/agent_modelAdapter/providerAccessLayer/providerProbe.js";

function ref() {
  const credentialRef = createCredentialRef({
    id: "default",
    provider: "openai",
    credentialType: "openai_api_key",
    source: { kind: "test", label: "unit" },
  });
  assert.equal(credentialRef.ok, true);
  if (!credentialRef.ok) {
    throw new Error("expected ref");
  }
  return credentialRef.credentialRef;
}

function codexRef() {
  const credentialRef = createCredentialRef({
    id: "chatgpt",
    provider: "openai",
    credentialType: "chatgpt_codex_oauth",
    source: { kind: "codex-auth-file", filePath: "/explicit/auth.json" },
  });
  assert.equal(credentialRef.ok, true);
  if (!credentialRef.ok) {
    throw new Error("expected ref");
  }
  return credentialRef.credentialRef;
}

test("providerAccessLayer registers full carriers without losing auth, model, reasoning, or cache fields", () => {
  const credentialRef = ref();
  const carrier = createProviderCarrier({
    carrierId: " openai-responses ",
    provider: "openai",
    endpointShape: "responses",
    baseURL: "https://api.openai.com/",
    model: " gpt-5.4 ",
    reasoning: { effort: " low " },
    credentialRef,
    scopes: ["model.invoke", "model.invoke"],
    capabilities: ["text", "tool-call"],
    cachePolicy: { intent: "prefer-provider-cache", vendorHints: { promptCache: true } },
  });

  assert.equal(carrier.ok, true);
  if (!carrier.ok) {
    throw new Error("expected carrier");
  }

  assert.equal(carrier.carrier.baseURL, "https://api.openai.com");
  assert.equal(carrier.carrier.model, "gpt-5.4");
  assert.equal(carrier.carrier.reasoning?.effort, "low");
  assert.equal(carrier.carrier.credentialRef?.credentialType, "openai_api_key");
  assert.equal(carrier.carrier.cachePolicy.intent, "prefer-provider-cache");

  const registry = registerProviderAccessCarriers({
    registryId: "provider-access",
    allowedScopes: ["model.invoke"],
    carriers: [carrier.carrier],
  });
  assert.equal(registry.ok, true);
  if (!registry.ok) {
    throw new Error("expected registry");
  }
  assert.equal(registry.registry.carriers[0]?.credentialRef?.id, "default");
  assert.equal(registry.registry.capabilities.includes("tool-call"), true);
});

test("providerAccessLayer exposes a first-class ChatGPT Codex responses carrier", () => {
  const carrier = createChatGPTCodexResponsesCarrier({
    carrierId: "chatgpt-codex-responses",
    credentialRef: codexRef(),
    model: "gpt-5.4",
    clientName: "praxis-test",
    clientVersion: "0.0.0-test",
  });

  assert.equal(carrier.ok, true);
  if (!carrier.ok) {
    throw new Error("expected carrier");
  }

  assert.equal(carrier.carrier.provider, "openai");
  assert.equal(carrier.carrier.endpointShape, "responses");
  assert.equal(carrier.carrier.baseURL, CHATGPT_CODEX_DEFAULT_BASE_URL);
  assert.equal(carrier.carrier.credentialRef?.credentialType, "chatgpt_codex_oauth");
  assert.equal(carrier.carrier.capabilities.includes("chatgpt-subscription"), true);
  assert.equal(carrier.carrier.metadata.productChannel, "chatgpt-codex");
});

test("providerCaller uses private auth material for transport but returns only redacted public output", async () => {
  const credentialRef = ref();
  const auth = createApiKeyAuthEnvelope({
    credentialRef,
    apiKey: "sk-provider-caller-secret-1234567890",
  });
  let transportAuthorization = "";
  const caller = createProviderCaller({
    authMaterial: auth.privateMaterial,
    transport: async (request) => {
      transportAuthorization = request.headers?.authorization ?? "";
      return {
        status: 200,
        headers: { "x-request-id": "req_1", authorization: "Bearer should-not-escape" },
        body: { id: "resp_1", echoed: "Bearer sk-provider-caller-secret-1234567890" },
      };
    },
  });

  const response = await caller({
    method: "POST",
    url: "https://api.openai.com/v1/responses",
    headers: { "content-type": "application/json" },
    body: { model: "gpt-5.4", input: "hello" },
  });

  assert.equal(transportAuthorization, "Bearer sk-provider-caller-secret-1234567890");
  assert.equal(JSON.stringify(response).includes("sk-provider-caller-secret"), false);
  assert.equal(response.headers.authorization, "[redacted:24]");
  assert.equal(response.providerRawShapePromoted, false);
});

test("provider errors and probes stay public-safe", () => {
  assert.equal(classifyProviderAccessError({ status: 401 }).code, "PROVIDER_AUTH_FAILED");
  assert.equal(classifyProviderAccessError({ status: 429 }).code, "PROVIDER_RATE_LIMITED");
  assert.equal(classifyProviderAccessError({ code: "AbortError" }).code, "PROVIDER_TIMEOUT");
  assert.equal(classifyProviderAccessError({ status: 503 }).code, "PROVIDER_UNAVAILABLE");
  assert.equal(classifyProviderAccessError({ code: "schema_drift" }).code, "RESPONSE_FORMAT_DRIFT");

  const credentialRef = ref();
  const auth = createApiKeyAuthEnvelope({ credentialRef, apiKey: "sk-probe-secret-1234567890" });
  const carrier = createProviderCarrier({
    carrierId: "openai-image",
    provider: "openai",
    endpointShape: "image",
    credentialRef,
    capabilities: ["image-generation"],
  });
  assert.equal(carrier.ok, true);
  if (!carrier.ok) {
    throw new Error("expected carrier");
  }

  const providerProbe = probeProviderCarrier({
    carrier: carrier.carrier,
    auth: probeAuth({ credentialRef, injectedSecret: "sk-probe-secret-1234567890" }),
  });

  assert.equal(providerProbe.ok, true);
  assert.equal(providerProbe.status, "ready");
  assert.equal(JSON.stringify(providerProbe).includes("sk-probe-secret"), false);
  assert.equal(auth.envelope.present, true);
});

test("OpenAI capability catalog lists representative and catalog-only endpoint families", () => {
  const ids = OPENAI_PROVIDER_CAPABILITY_CATALOG.map((item) => item.capabilityId);
  assert.equal(ids.includes("openai.responses.text-reasoning"), true);
  assert.equal(ids.includes("openai.images.generations"), true);
  assert.equal(ids.includes("openai.audio.transcriptions"), true);
  assert.equal(ids.includes("openai.realtime.sessions"), true);
  assert.equal(ids.includes("openai.videos"), true);
});
