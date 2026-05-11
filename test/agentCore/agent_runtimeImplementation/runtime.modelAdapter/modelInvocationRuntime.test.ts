import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import { createChatGPTCodexAuthEnvelope } from "../../../../src/agentCore/agent_modelAdapter/authProfileLayer/codexAuth.js";
import { createCredentialRef } from "../../../../src/agentCore/agent_modelAdapter/authProfileLayer/credentialRef.js";
import {
  invokeModelThroughRuntime,
  planModelInvocation,
} from "../../../../src/agentCore/agent_runtimeImplementation/runtime.modelAdapter/modelInvocationRuntime.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_runtimeImplementation/runtime.modelAdapter/modelInvocationRuntime.ts",
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
    providerCaller: async (request) => {
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
  assert.equal(result.usage?.reasoningTokens, 2);
});
