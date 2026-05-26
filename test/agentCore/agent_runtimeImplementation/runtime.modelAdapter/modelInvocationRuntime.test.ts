import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import { createApiKeyAuthEnvelope } from "../../../../src/modelAdapter/authProfileLayer/authEnvelope.js";
import { createChatGPTCodexAuthEnvelope } from "../../../../src/modelAdapter/authProfileLayer/codexAuth.js";
import { createCredentialRef } from "../../../../src/modelAdapter/authProfileLayer/credentialRef.js";
import {
  invokeModelThroughRuntime,
  planModelInvocation,
} from "../../../../src/runtimeImplementation/runtime.modelAdapter/modelInvocationRuntime.js";
import {
  bindRuntimeAuthRole,
  createInMemoryRuntimeAuthSecretVault,
  createRuntimeAuthModelEntry,
  createRuntimeAuthProviderProfile,
  createRuntimeAuthRegistry,
  createRuntimeAuthResolver,
  createRuntimeAuthSecretRecord,
  runtimeAuthCredentialRef,
} from "../../../../src/runtimeImplementation/runtime.authPlane/index.js";

defineAgentCoreContractTest({
  sourcePath: "src/runtimeImplementation/runtime.modelAdapter/modelInvocationRuntime.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.modelAdapter/modelInvocationRuntime.md",
  testFileUrl: import.meta.url,
});

test("modelInvocationRuntime builds a mockable dry-run invocation envelope", () => {
  const result = planModelInvocation({
    runtimeId: " runtime-1 ",
    caller: { kind: "application", id: " app-1 " },
    loweredPrompt: {
      loweringId: " lowering-1 ",
      promptPackId: " prompt-pack-1 ",
      materialRefs: [" system:base ", "user:turn:1"],
    },
    capability: { capabilityId: " capability:text ", kind: " text-generation " },
    carrier: { carrierId: " openai-carrier ", provider: " openai " },
    mode: " stream ",
    metadata: { requestedBy: "invocationMethod" },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.plan.invocationId, "runtime-1:modelInvocation:lowering-1");
  assert.equal(result.plan.route, "runtime.modelAdapter.modelInvocationRuntime");
  assert.equal(result.plan.transport, "mockable-envelope");
  assert.equal(result.plan.providerCallPermitted, false);
  assert.equal(result.plan.envelope.loweringId, "lowering-1");
  assert.equal(result.plan.envelope.promptPackId, "prompt-pack-1");
  assert.equal(result.plan.envelope.capabilityId, "capability:text");
  assert.equal(result.plan.envelope.carrierId, "openai-carrier");
  assert.equal(result.plan.envelope.mode, "stream");
  assert.deepEqual(result.plan.envelope.materialRefs, ["system:base", "user:turn:1"]);
  assert.equal(result.plan.dryRun, true);
  assert.equal(result.plan.unsafeSideEffects, false);
});

test("modelInvocationRuntime rejects missing envelopes and real provider calls in first pass", () => {
  const missing = planModelInvocation({
    runtimeId: "runtime-1",
    caller: { kind: "application", id: "app-1" },
    capability: { capabilityId: "capability:text" },
    carrier: { carrierId: "carrier-1" },
  });

  assert.equal(missing.ok, false);
  if (missing.ok) {
    return;
  }

  assert.equal(missing.error.code, "MISSING_LOWERED_PROMPT");
  assert.equal(missing.error.boundary, "prompt");

  const unsafe = planModelInvocation({
    runtimeId: "runtime-1",
    caller: { kind: "application", id: "app-1" },
    loweredPrompt: { loweringId: "lowering-1" },
    capability: { capabilityId: "capability:text" },
    carrier: { carrierId: "carrier-1" },
    allowProviderCall: true,
  });

  assert.equal(unsafe.ok, false);
  if (unsafe.ok) {
    return;
  }

  assert.equal(unsafe.error.code, "UNSAFE_INVOCATION_DISABLED");
  assert.equal(unsafe.error.boundary, "side-effect");
});

test("invokeModelThroughRuntime can call the codex responses provider path when governance allows it", async () => {
  const ref = createCredentialRef({
    id: "chatgpt",
    provider: "openai",
    credentialType: "chatgpt_codex_oauth",
    source: { kind: "test", label: "unit" },
  });
  assert.equal(ref.ok, true);
  if (!ref.ok) return;

  const auth = createChatGPTCodexAuthEnvelope({
    credentialRef: ref.credentialRef,
    snapshot: {
      sourceShape: "chatgpt-auth-tokens",
      authMode: "chatgpt",
      accessToken: "codex-access-token-secret",
      refreshTokenPresent: false,
      idTokenPresent: false,
      accountId: "workspace-secret-id",
      accountIsFedramp: false,
      publicSafe: false,
    },
  });

  const result = await invokeModelThroughRuntime({
    runtimeId: "runtime-1",
    caller: { kind: "application", id: "app-1" },
    loweredPrompt: { loweringId: "lowering-1" },
    capability: { capabilityId: "codex-responses", kind: "responses" },
    carrier: { carrierId: "carrier-1", provider: "openai" },
    dryRun: false,
    allowProviderCall: true,
    governance: { accepted: true },
    auth: auth.envelope,
    providerBody: { model: "gpt-5.4", input: "hello" },
    openaiResponsesCaller: async (request) => {
      assert.equal(request.url.endsWith("/responses"), true);
      assert.equal(request.headers.authorization, "[redacted:32]");
      return {
        output_text: "hello from codex responses",
        usage: {
          input_tokens: 11,
          output_tokens: 4,
          output_tokens_details: { reasoning_tokens: 2 },
        },
      };
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.plan.providerCallPermitted, true);
  assert.equal(result.plan.transport, "provider");
  assert.deepEqual(result.raw, {
    output_text: "hello from codex responses",
    usage: {
      input_tokens: 11,
      output_tokens: 4,
      output_tokens_details: { reasoning_tokens: 2 },
    },
  });
  assert.equal(result.usage?.inputTokens, 11);
  assert.equal(result.usage?.outputTokens, 4);
  assert.equal(result.usage?.source, "openai.responses.usage");
  if (result.usage?.source === "openai.responses.usage") {
    assert.equal(result.usage.reasoningTokens, 2);
  }
});

test("invokeModelThroughRuntime forwards AbortSignal and stops before provider calls when aborted", async () => {
  const ref = createCredentialRef({
    id: "chatgpt-abort",
    provider: "openai",
    credentialType: "chatgpt_codex_oauth",
    source: { kind: "test", label: "unit" },
  });
  assert.equal(ref.ok, true);
  if (!ref.ok) return;
  const auth = createChatGPTCodexAuthEnvelope({
    credentialRef: ref.credentialRef,
    snapshot: {
      sourceShape: "chatgpt-auth-tokens",
      authMode: "chatgpt",
      accessToken: "codex-access-token-secret",
      refreshTokenPresent: false,
      idTokenPresent: false,
      accountId: "workspace-secret-id",
      accountIsFedramp: false,
      publicSafe: false,
    },
  });
  const controller = new AbortController();
  controller.abort();

  const result = await invokeModelThroughRuntime({
    runtimeId: "runtime-abort",
    caller: { kind: "application", id: "app-abort" },
    loweredPrompt: { loweringId: "lowering-abort" },
    capability: { capabilityId: "codex-responses", kind: "responses" },
    carrier: { carrierId: "carrier-abort", provider: "openai" },
    dryRun: false,
    allowProviderCall: true,
    governance: { accepted: true },
    auth: auth.envelope,
    providerBody: { model: "gpt-5.4", input: "hello" },
    signal: controller.signal,
    openaiResponsesCaller: async () => assert.fail("provider caller should not run after abort"),
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.code, "PROVIDER_INVOCATION_FAILED");
});

test("invokeModelThroughRuntime dispatches OpenAI API responses separately from ChatGPT Codex", async () => {
  const ref = createCredentialRef({
    id: "openai-api",
    provider: "openai",
    credentialType: "openai_api_key",
    source: { kind: "test", label: "unit" },
  });
  assert.equal(ref.ok, true);
  if (!ref.ok) return;

  const auth = createApiKeyAuthEnvelope({
    credentialRef: ref.credentialRef,
    apiKey: "sk-openai-secret",
  });

  const result = await invokeModelThroughRuntime({
    runtimeId: "runtime-openai-responses",
    caller: { kind: "application", id: "app-1" },
    loweredPrompt: { loweringId: "lowering-openai-responses" },
    capability: { capabilityId: "openai-responses", kind: "responses" },
    carrier: { carrierId: "carrier-openai-responses", provider: "openai", endpointShape: "responses" },
    dryRun: false,
    allowProviderCall: true,
    governance: { accepted: true },
    auth: auth.envelope,
    providerBody: { model: "gpt-5.5", input: "hello" },
    openaiResponsesCaller: async (request) => {
      assert.equal(request.endpoint, "/v1/responses");
      assert.equal(request.url, "https://api.openai.com/v1/responses");
      assert.equal(request.headers.authorization, "[redacted:23]");
      return {
        id: "resp_1",
        output_text: "hello from openai responses",
        usage: { input_tokens: 5, output_tokens: 4, total_tokens: 9 },
      };
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.raw, {
    id: "resp_1",
    output_text: "hello from openai responses",
    usage: { input_tokens: 5, output_tokens: 4, total_tokens: 9 },
  });
  assert.equal(result.usage?.inputTokens, 5);
  assert.equal(result.usage?.outputTokens, 4);
  assert.equal(result.usage?.totalTokens, 9);
});

test("invokeModelThroughRuntime dispatches OpenAI chat completions route", async () => {
  const ref = createCredentialRef({
    id: "openai-chat",
    provider: "openai",
    credentialType: "openai_api_key",
    source: { kind: "test", label: "unit" },
  });
  assert.equal(ref.ok, true);
  if (!ref.ok) return;

  const auth = createApiKeyAuthEnvelope({
    credentialRef: ref.credentialRef,
    apiKey: "sk-chat-secret",
  });

  const result = await invokeModelThroughRuntime({
    runtimeId: "runtime-chat",
    caller: { kind: "application", id: "app-1" },
    loweredPrompt: { loweringId: "lowering-chat" },
    capability: { capabilityId: "openai-chat-completions", kind: "chat_completions" },
    carrier: {
      carrierId: "carrier-openai-chat",
      provider: "openai",
      endpointShape: "chat_completions",
      baseURL: "https://gateway.example.com/v1",
    },
    dryRun: false,
    allowProviderCall: true,
    governance: { accepted: true },
    auth: auth.envelope,
    providerBody: { model: "compatible-chat", messages: [{ role: "user", content: "hello" }] },
    openaiChatCompletionsCaller: async (request) => {
      assert.equal(request.endpoint, "/v1/chat/completions");
      assert.equal(request.url, "https://gateway.example.com/v1/chat/completions");
      return {
        choices: [{ message: { role: "assistant", content: "chat hi" } }],
        usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
      };
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.raw, {
    choices: [{ message: { role: "assistant", content: "chat hi" } }],
    usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
  });
  assert.equal(result.usage?.source, "openai.chat_completions.usage");
  assert.equal(result.usage?.totalTokens, 5);
});

test("invokeModelThroughRuntime resolves auth from runtime authPlane when only refs are provided", async () => {
  const secret = await createRuntimeAuthSecretRecord({
    secretId: "secret.compat.chat",
    provider: "openai-compatible",
    secretKind: "api_key",
    plaintext: { apiKey: "sk-compatible-secret" },
    keyProvider: () => "compat-master-key",
  });
  assert.equal(secret.ok, true);
  if (!secret.ok) return;

  const profile = createRuntimeAuthProviderProfile({
    profileId: "profile.compat.chat",
    provider: "openai-compatible",
    endpointShape: "chat_completions",
    baseURL: "https://gateway.example.com/v1",
    credentialRef: runtimeAuthCredentialRef({
      credentialRefId: "credential.compat.chat",
      secretId: "secret.compat.chat",
      provider: "openai-compatible",
      credentialType: "openai_api_key",
      secretKind: "api_key",
      publicSafe: true,
    }),
  });
  const binding = bindRuntimeAuthRole({
    role: "primary",
    providerProfileRef: "profile.compat.chat",
  });
  assert.equal(profile.ok, true);
  assert.equal(binding.ok, true);
  if (!profile.ok || !binding.ok) return;

  const runtimeAuthResolver = createRuntimeAuthResolver({
    registry: createRuntimeAuthRegistry({ profiles: [profile.value], roleBindings: [binding.value] }),
    vault: createInMemoryRuntimeAuthSecretVault([secret.value]),
    keyProvider: () => "compat-master-key",
  });

  const result = await invokeModelThroughRuntime({
    runtimeId: "runtime-auth-resolve",
    caller: { kind: "application", id: "app-1" },
    loweredPrompt: { loweringId: "lowering-auth-resolve" },
    capability: { capabilityId: "openai-compatible-chat", kind: "chat" },
    carrier: {
      carrierId: "carrier-compatible-chat",
    },
    dryRun: false,
    allowProviderCall: true,
    governance: { accepted: true },
    runtimeAuthResolver,
    authSelection: { role: "primary" },
    providerBody: { model: "compatible-chat", messages: [{ role: "user", content: "hello" }] },
    openaiChatCompletionsCaller: async (request) => {
      assert.equal(request.url, "https://gateway.example.com/v1/chat/completions");
      assert.equal(request.headers.authorization, "Bearer sk-compatible-secret");
      return {
        choices: [{ message: { role: "assistant", content: "resolved auth" } }],
        usage: { prompt_tokens: 2, completion_tokens: 2, total_tokens: 4 },
      };
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(JSON.stringify(result).includes("sk-compatible-secret"), false);
  assert.equal(result.usage?.totalTokens, 4);
});

test("invokeModelThroughRuntime accepts compatible auth profiles for canonical provider carriers", async () => {
  const secret = await createRuntimeAuthSecretRecord({
    secretId: "secret.compat.alias",
    provider: "openai-compatible",
    secretKind: "api_key",
    plaintext: { apiKey: "sk-compatible-alias-secret" },
    keyProvider: () => "compat-alias-master-key",
  });
  assert.equal(secret.ok, true);
  if (!secret.ok) return;

  const profile = createRuntimeAuthProviderProfile({
    profileId: "profile.compat.alias",
    provider: "openai-compatible",
    endpointShape: "chat_completions",
    baseURL: "https://gateway.example.com/v1",
    credentialRef: runtimeAuthCredentialRef({
      credentialRefId: "credential.compat.alias",
      secretId: "secret.compat.alias",
      provider: "openai-compatible",
      credentialType: "openai_api_key",
      secretKind: "api_key",
      publicSafe: true,
    }),
  });
  const binding = bindRuntimeAuthRole({
    role: "primary",
    providerProfileRef: "profile.compat.alias",
  });
  assert.equal(profile.ok, true);
  assert.equal(binding.ok, true);
  if (!profile.ok || !binding.ok) return;

  const runtimeAuthResolver = createRuntimeAuthResolver({
    registry: createRuntimeAuthRegistry({ profiles: [profile.value], roleBindings: [binding.value] }),
    vault: createInMemoryRuntimeAuthSecretVault([secret.value]),
    keyProvider: () => "compat-alias-master-key",
  });

  const result = await invokeModelThroughRuntime({
    runtimeId: "runtime-auth-compatible-alias",
    caller: { kind: "application", id: "app-1" },
    loweredPrompt: { loweringId: "lowering-auth-compatible-alias" },
    capability: { capabilityId: "openai-chat", kind: "chat" },
    carrier: {
      carrierId: "carrier-openai-chat",
      provider: "openai",
      endpointShape: "chat_completions",
      baseURL: "https://gateway.example.com/v1",
    },
    dryRun: false,
    allowProviderCall: true,
    governance: { accepted: true },
    runtimeAuthResolver,
    authSelection: { role: "primary" },
    providerBody: { model: "compatible-chat", messages: [{ role: "user", content: "hello" }] },
    openaiChatCompletionsCaller: async (request) => {
      assert.equal(request.url, "https://gateway.example.com/v1/chat/completions");
      assert.equal(request.headers.authorization, "Bearer sk-compatible-alias-secret");
      return {
        choices: [{ message: { role: "assistant", content: "alias auth" } }],
        usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
      };
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.usage?.totalTokens, 5);
  assert.equal(JSON.stringify(result).includes("sk-compatible-alias-secret"), false);
});

test("invokeModelThroughRuntime routes vendor-named OpenAI-compatible chat profiles by endpoint shape", async () => {
  const secret = await createRuntimeAuthSecretRecord({
    secretId: "secret.deepseek.chat",
    provider: "deepseek",
    secretKind: "api_key",
    plaintext: { apiKey: "sk-deepseek-secret-abcdef123456" },
    keyProvider: () => "deepseek-master-key",
  });
  assert.equal(secret.ok, true);
  if (!secret.ok) return;

  const profile = createRuntimeAuthProviderProfile({
    profileId: "profile.deepseek.chat",
    provider: "deepseek",
    endpointShape: "chat_completions",
    baseURL: "https://api.deepseek.com",
    credentialRef: runtimeAuthCredentialRef({
      credentialRefId: "credential.deepseek.chat",
      secretId: "secret.deepseek.chat",
      provider: "deepseek",
      credentialType: "openai_api_key",
      secretKind: "api_key",
      publicSafe: true,
    }),
  });
  const binding = bindRuntimeAuthRole({
    role: "primary",
    providerProfileRef: "profile.deepseek.chat",
  });
  assert.equal(profile.ok, true);
  assert.equal(binding.ok, true);
  if (!profile.ok || !binding.ok) return;

  const runtimeAuthResolver = createRuntimeAuthResolver({
    registry: createRuntimeAuthRegistry({ profiles: [profile.value], roleBindings: [binding.value] }),
    vault: createInMemoryRuntimeAuthSecretVault([secret.value]),
    keyProvider: () => "deepseek-master-key",
  });

  const result = await invokeModelThroughRuntime({
    runtimeId: "runtime-deepseek-chat",
    caller: { kind: "application", id: "app-1" },
    loweredPrompt: { loweringId: "lowering-deepseek-chat" },
    capability: { capabilityId: "deepseek-chat", kind: "chat" },
    carrier: { carrierId: "carrier-deepseek-chat" },
    dryRun: false,
    allowProviderCall: true,
    governance: { accepted: true },
    runtimeAuthResolver,
    authSelection: { role: "primary" },
    providerBody: { model: "deepseek-v4-pro", messages: [{ role: "user", content: "hello" }] },
    openaiChatCompletionsCaller: async (request) => {
      assert.equal(request.endpoint, "/v1/chat/completions");
      assert.equal(request.url, "https://api.deepseek.com/v1/chat/completions");
      assert.equal(request.headers.authorization, "Bearer sk-deepseek-secret-abcdef123456");
      return {
        choices: [{ message: { role: "assistant", content: "deepseek ok" } }],
        usage: { prompt_tokens: 2, completion_tokens: 2, total_tokens: 4 },
      };
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.usage?.source, "openai.chat_completions.usage");
  assert.equal(result.usage?.totalTokens, 4);
  assert.equal(JSON.stringify(result).includes("sk-deepseek-secret"), false);
});

test("invokeModelThroughRuntime rejects auth profile routes that do not match the requested carrier", async () => {
  const secret = await createRuntimeAuthSecretRecord({
    secretId: "secret.anthropic.route",
    provider: "anthropic",
    secretKind: "api_key",
    plaintext: { apiKey: "sk-ant-route-secret" },
    keyProvider: () => "route-master-key",
  });
  assert.equal(secret.ok, true);
  if (!secret.ok) return;

  const profile = createRuntimeAuthProviderProfile({
    profileId: "profile.anthropic.route",
    provider: "anthropic",
    endpointShape: "messages",
    credentialRef: runtimeAuthCredentialRef({
      credentialRefId: "credential.anthropic.route",
      secretId: "secret.anthropic.route",
      provider: "anthropic",
      credentialType: "anthropic_api_key",
      secretKind: "api_key",
      publicSafe: true,
    }),
  });
  const binding = bindRuntimeAuthRole({
    role: "primary",
    providerProfileRef: "profile.anthropic.route",
  });
  assert.equal(profile.ok, true);
  assert.equal(binding.ok, true);
  if (!profile.ok || !binding.ok) return;

  const runtimeAuthResolver = createRuntimeAuthResolver({
    registry: createRuntimeAuthRegistry({ profiles: [profile.value], roleBindings: [binding.value] }),
    vault: createInMemoryRuntimeAuthSecretVault([secret.value]),
    keyProvider: () => "route-master-key",
  });
  let providerCallerInvoked = false;

  const result = await invokeModelThroughRuntime({
    runtimeId: "runtime-auth-route-mismatch",
    caller: { kind: "application", id: "app-1" },
    loweredPrompt: { loweringId: "lowering-auth-route-mismatch" },
    capability: { capabilityId: "openai-responses", kind: "responses" },
    carrier: { carrierId: "carrier-openai-responses", provider: "openai", endpointShape: "responses" },
    dryRun: false,
    allowProviderCall: true,
    governance: { accepted: true },
    runtimeAuthResolver,
    authSelection: { role: "primary" },
    providerBody: { model: "gpt-5.5", input: "hello" },
    openaiResponsesCaller: async () => {
      providerCallerInvoked = true;
      return { id: "should-not-run" };
    },
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.code, "AUTH_ROUTE_MISMATCH");
  assert.equal(providerCallerInvoked, false);
});

test("invokeModelThroughRuntime redacts resolved OpenAI response request headers from public results", async () => {
  const secret = await createRuntimeAuthSecretRecord({
    secretId: "secret.openai.responses",
    provider: "openai",
    secretKind: "api_key",
    plaintext: { apiKey: "sk-responses-secret-material" },
    keyProvider: () => "responses-master-key",
  });
  assert.equal(secret.ok, true);
  if (!secret.ok) return;

  const profile = createRuntimeAuthProviderProfile({
    profileId: "profile.openai.responses",
    provider: "openai",
    endpointShape: "responses",
    credentialRef: runtimeAuthCredentialRef({
      credentialRefId: "credential.openai.responses",
      secretId: "secret.openai.responses",
      provider: "openai",
      credentialType: "openai_api_key",
      secretKind: "api_key",
      publicSafe: true,
    }),
  });
  const binding = bindRuntimeAuthRole({
    role: "primary",
    providerProfileRef: "profile.openai.responses",
  });
  assert.equal(profile.ok, true);
  assert.equal(binding.ok, true);
  if (!profile.ok || !binding.ok) return;

  const runtimeAuthResolver = createRuntimeAuthResolver({
    registry: createRuntimeAuthRegistry({ profiles: [profile.value], roleBindings: [binding.value] }),
    vault: createInMemoryRuntimeAuthSecretVault([secret.value]),
    keyProvider: () => "responses-master-key",
  });

  const result = await invokeModelThroughRuntime({
    runtimeId: "runtime-responses-redaction",
    caller: { kind: "application", id: "app-1" },
    loweredPrompt: { loweringId: "lowering-responses-redaction" },
    capability: { capabilityId: "openai-responses", kind: "responses" },
    carrier: { carrierId: "carrier-openai-responses", provider: "openai", endpointShape: "responses" },
    dryRun: false,
    allowProviderCall: true,
    governance: { accepted: true },
    runtimeAuthResolver,
    authSelection: { role: "primary" },
    providerBody: { model: "gpt-5.5", input: "hello", api_key: "sk-body-secret-material" },
    openaiResponsesCaller: async (request) => {
      assert.equal(request.headers.authorization, "Bearer sk-responses-secret-material");
      return {
        id: "resp_redacted",
        output_text: "ok",
        usage: { input_tokens: 1, output_tokens: 1 },
      };
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(JSON.stringify(result).includes("sk-responses-secret-material"), false);
  assert.equal(JSON.stringify(result).includes("sk-body-secret-material"), false);
  assert.equal((result.providerResult as { request?: { headers?: Record<string, string> } }).request?.headers?.authorization, "[redacted:35]");
  assert.equal((result.providerResult as { request?: { body?: { api_key?: string } } }).request?.body?.api_key, "[redacted:23]");
});

test("invokeModelThroughRuntime dispatches Anthropic messages route", async () => {
  const ref = createCredentialRef({
    id: "anthropic",
    provider: "anthropic",
    credentialType: "anthropic_api_key",
    source: { kind: "test", label: "unit" },
  });
  assert.equal(ref.ok, true);
  if (!ref.ok) return;

  const auth = createApiKeyAuthEnvelope({
    credentialRef: ref.credentialRef,
    apiKey: "sk-ant-secret",
    headerName: "x-api-key",
    extraHeaders: { "anthropic-version": "2023-06-01" },
  });

  const result = await invokeModelThroughRuntime({
    runtimeId: "runtime-anthropic",
    caller: { kind: "application", id: "app-1" },
    loweredPrompt: { loweringId: "lowering-anthropic" },
    capability: { capabilityId: "anthropic-messages", kind: "messages" },
    carrier: { carrierId: "carrier-anthropic", provider: "anthropic", endpointShape: "messages" },
    dryRun: false,
    allowProviderCall: true,
    governance: { accepted: true },
    auth: auth.envelope,
    providerBody: { model: "claude-sonnet", messages: [{ role: "user", content: "hello" }] },
    anthropicMessagesCaller: async (request) => {
      assert.equal(request.endpoint, "/v1/messages");
      assert.equal(request.urlPath, "/v1/messages");
      assert.equal(request.headers["x-api-key"], "[redacted:13]");
      assert.equal(request.headers["anthropic-version"], "2023-06-01");
      return {
        id: "msg_1",
        content: [{ type: "text", text: "anthropic hi" }],
        usage: { input_tokens: 8, output_tokens: 4 },
      };
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.raw, {
    id: "msg_1",
    content: [{ type: "text", text: "anthropic hi" }],
    usage: { input_tokens: 8, output_tokens: 4 },
  });
  assert.equal(result.usage?.source, "anthropic.messages.usage");
  assert.equal(result.usage?.inputTokens, 8);
  assert.equal(result.usage?.outputTokens, 4);
});

test("invokeModelThroughRuntime redacts resolved Anthropic request headers from public results", async () => {
  const secret = await createRuntimeAuthSecretRecord({
    secretId: "secret.anthropic.messages",
    provider: "anthropic",
    secretKind: "api_key",
    plaintext: { apiKey: "sk-ant-private-material" },
    keyProvider: () => "anthropic-master-key",
  });
  assert.equal(secret.ok, true);
  if (!secret.ok) return;

  const profile = createRuntimeAuthProviderProfile({
    profileId: "profile.anthropic.messages",
    provider: "anthropic",
    endpointShape: "messages",
    credentialRef: runtimeAuthCredentialRef({
      credentialRefId: "credential.anthropic.messages",
      secretId: "secret.anthropic.messages",
      provider: "anthropic",
      credentialType: "anthropic_api_key",
      secretKind: "api_key",
      publicSafe: true,
    }),
  });
  const binding = bindRuntimeAuthRole({
    role: "primary",
    providerProfileRef: "profile.anthropic.messages",
  });
  assert.equal(profile.ok, true);
  assert.equal(binding.ok, true);
  if (!profile.ok || !binding.ok) return;

  const runtimeAuthResolver = createRuntimeAuthResolver({
    registry: createRuntimeAuthRegistry({ profiles: [profile.value], roleBindings: [binding.value] }),
    vault: createInMemoryRuntimeAuthSecretVault([secret.value]),
    keyProvider: () => "anthropic-master-key",
  });

  const result = await invokeModelThroughRuntime({
    runtimeId: "runtime-anthropic-redaction",
    caller: { kind: "application", id: "app-1" },
    loweredPrompt: { loweringId: "lowering-anthropic-redaction" },
    capability: { capabilityId: "anthropic-messages", kind: "messages" },
    carrier: { carrierId: "carrier-anthropic", provider: "anthropic", endpointShape: "messages" },
    dryRun: false,
    allowProviderCall: true,
    governance: { accepted: true },
    runtimeAuthResolver,
    authSelection: { role: "primary" },
    providerBody: { model: "claude-sonnet", messages: [{ role: "user", content: "hello" }] },
    anthropicMessagesCaller: async (request) => {
      assert.equal(request.headers["x-api-key"], "sk-ant-private-material");
      assert.equal(request.headers["anthropic-version"], "2023-06-01");
      return {
        id: "msg_redacted",
        content: [{ type: "text", text: "ok" }],
        usage: { input_tokens: 1, output_tokens: 1 },
      };
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(JSON.stringify(result).includes("sk-ant-private-material"), false);
  assert.equal((result.providerResult as { request?: { headers?: Record<string, string> } }).request?.headers?.["x-api-key"], "[redacted:23]");
});

test("invokeModelThroughRuntime dispatches Gemini generateContent from runtime authPlane", async () => {
  const secret = await createRuntimeAuthSecretRecord({
    secretId: "secret.gemini.generate",
    provider: "gemini",
    secretKind: "api_key",
    plaintext: { apiKey: "gemini-secret-material" },
    keyProvider: () => "gemini-master-key",
  });
  assert.equal(secret.ok, true);
  if (!secret.ok) return;

  const profile = createRuntimeAuthProviderProfile({
    profileId: "profile.gemini.generate",
    provider: "gemini",
    endpointShape: "gemini_generate_content",
    baseURL: "https://generativelanguage.googleapis.com",
    credentialRef: runtimeAuthCredentialRef({
      credentialRefId: "credential.gemini.generate",
      secretId: "secret.gemini.generate",
      provider: "gemini",
      credentialType: "gemini_api_key",
      secretKind: "api_key",
      publicSafe: true,
    }),
  });
  const entry = createRuntimeAuthModelEntry({
    modelEntryId: "model.gemini.generate",
    providerProfileRef: "profile.gemini.generate",
    model: "gemini-3.5-flash",
  });
  const binding = bindRuntimeAuthRole({
    role: "primary",
    providerProfileRef: "profile.gemini.generate",
    modelEntryRef: "model.gemini.generate",
  });
  assert.equal(profile.ok, true);
  assert.equal(entry.ok, true);
  assert.equal(binding.ok, true);
  if (!profile.ok || !entry.ok || !binding.ok) return;

  const runtimeAuthResolver = createRuntimeAuthResolver({
    registry: createRuntimeAuthRegistry({ profiles: [profile.value], modelEntries: [entry.value], roleBindings: [binding.value] }),
    vault: createInMemoryRuntimeAuthSecretVault([secret.value]),
    keyProvider: () => "gemini-master-key",
  });

  const result = await invokeModelThroughRuntime({
    runtimeId: "runtime-gemini-generate",
    caller: { kind: "application", id: "app-1" },
    loweredPrompt: { loweringId: "lowering-gemini-generate" },
    capability: { capabilityId: "gemini-generate-content", kind: "chat" },
    carrier: { carrierId: "carrier-gemini" },
    dryRun: false,
    allowProviderCall: true,
    governance: { accepted: true },
    runtimeAuthResolver,
    authSelection: { role: "primary" },
    providerBody: { contents: [{ role: "user", parts: [{ text: "hello" }] }] },
    geminiGenerateContentTransport: (envelope) => {
      assert.equal(envelope.url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent");
      assert.equal(envelope.headers["x-goog-api-key"], "gemini-secret-material");
      assert.deepEqual(envelope.body, { contents: [{ role: "user", parts: [{ text: "hello" }] }] });
      return {
        statusCode: 200,
        body: { candidates: [{ content: { parts: [{ text: "gemini ok" }] } }] },
      };
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(JSON.stringify(result).includes("gemini-secret-material"), false);
  assert.equal((result.raw as { candidates?: unknown[] }).candidates?.length, 1);
});

test("invokeModelThroughRuntime rejects direct Gemini auth envelopes without private key material", async () => {
  const ref = createCredentialRef({
    id: "gemini-direct",
    provider: "gemini",
    credentialType: "gemini_api_key",
    source: { kind: "test", label: "unit" },
  });
  assert.equal(ref.ok, true);
  if (!ref.ok) return;

  const auth = createApiKeyAuthEnvelope({
    credentialRef: ref.credentialRef,
    apiKey: "gemini-direct-secret-material",
    headerName: "x-goog-api-key",
  });
  let transportCalled = false;

  const result = await invokeModelThroughRuntime({
    runtimeId: "runtime-gemini-direct-redacted",
    caller: { kind: "application", id: "app-1" },
    loweredPrompt: { loweringId: "lowering-gemini-direct-redacted" },
    capability: { capabilityId: "gemini-generate-content", kind: "chat" },
    carrier: {
      carrierId: "carrier-gemini-direct-redacted",
      provider: "gemini",
      endpointShape: "gemini_generate_content",
      baseURL: "https://generativelanguage.googleapis.com",
    },
    dryRun: false,
    allowProviderCall: true,
    governance: { accepted: true },
    auth: auth.envelope,
    providerBody: {
      model: "gemini-3.5-flash",
      contents: [{ role: "user", parts: [{ text: "hello" }] }],
    },
    geminiGenerateContentTransport: () => {
      transportCalled = true;
      return {
        statusCode: 200,
        body: { candidates: [{ content: { parts: [{ text: "should not run" }] } }] },
      };
    },
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.code, "AUTH_REQUIRED");
  assert.match(result.error.message, /private x-goog-api-key/u);
  assert.equal(transportCalled, false);
});

test("providerRoute metadata selects ChatGPT Codex responses lowering", async () => {
  let capturedBody: Record<string, unknown> | undefined;

  const result = await invokeModelThroughRuntime({
    runtimeId: "runtime.chatgpt-codex.test",
    caller: { kind: "test", id: "agent.test" },
    loweredPrompt: { loweringId: "lowering.test", materialRefs: ["prompt.test"] },
    capability: { capabilityId: "capability.test", kind: "responses" },
    carrier: {
      carrierId: "carrier.raxode.coding.primary",
      provider: "openai",
      endpointShape: "responses",
      baseURL: "https://chatgpt.com/backend-api/codex",
      metadata: { providerRoute: "chatgpt_codex_responses" },
    },
    providerBody: {
      model: "gpt-5.5",
      input: [{ role: "user", content: "你好" }],
      max_output_tokens: 1024,
      stream: true,
    },
    auth: {
      kind: "oauth",
      present: true,
      headerPlan: [{ name: "authorization", value: "Bearer sk-...", redacted: true }],
      queryPlan: [],
      credentialRef: {
        kind: "openai",
        id: "credential.test",
        provider: "openai",
        credentialType: "openai_api_key",
        source: { kind: "injected", label: "test" },
        publicSafe: true,
      },
      publicSafe: true,
    },
    dryRun: false,
    allowProviderCall: true,
    governance: { accepted: true },
    contract: { accepted: true },
    providerCaller: async (request) => {
      capturedBody = request.body as Record<string, unknown>;
      return {
        status: 200,
        headers: {},
        body: { id: "resp.test", output: [] },
        providerRawShapePromoted: false,
        publicSafe: true,
      };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(capturedBody?.store, false);
  assert.equal("max_output_tokens" in (capturedBody ?? {}), false);
});
