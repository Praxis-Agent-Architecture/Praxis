import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import { createOpenAICompatibleProvider, createRaxModelClient, createMockTransport } from "../../../../src/modelAdapter/index.js";
import {
  invokeModelThroughRuntime,
  planModelInvocation,
} from "../../../../src/runtimeImplementation/runtime.modelAdapter/modelInvocationRuntime.js";

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
  if (!result.ok) return;

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

test("modelInvocationRuntime rejects missing envelopes and unsafe direct planning", () => {
  const missing = planModelInvocation({
    runtimeId: "runtime-1",
    caller: { kind: "application", id: "app-1" },
    capability: { capabilityId: "capability:text" },
    carrier: { carrierId: "carrier-1" },
  });

  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.error.code, "MISSING_LOWERED_PROMPT");

  const unsafe = planModelInvocation({
    runtimeId: "runtime-1",
    caller: { kind: "application", id: "app-1" },
    loweredPrompt: { loweringId: "lowering-1" },
    capability: { capabilityId: "capability:text" },
    carrier: { carrierId: "carrier-1" },
    allowProviderCall: true,
  });

  assert.equal(unsafe.ok, false);
  if (!unsafe.ok) assert.equal(unsafe.error.code, "UNSAFE_INVOCATION_DISABLED");
});

test("invokeModelThroughRuntime calls the new RaxModelClient provider route", async () => {
  const modelClient = createRaxModelClient([
    createOpenAICompatibleProvider({
      id: "openai",
      baseUrl: "https://api.openai.com/v1",
    }).routes[0]!,
  ]);
  modelClient.registerRoute({
    ...modelClient.getRoute("openai")!,
    transport: createMockTransport([
        {
          choices: [{ delta: { content: "hello from rax" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 4, completion_tokens: 3, total_tokens: 7 },
        },
      ]),
  });

  const result = await invokeModelThroughRuntime({
    runtimeId: "runtime-1",
    caller: { kind: "application", id: "app-1" },
    loweredPrompt: { loweringId: "lowering-1" },
    capability: { capabilityId: "openai-chat-completions", kind: "chat_completions" },
    carrier: { carrierId: "openai", provider: "openai", model: "gpt-test" },
    dryRun: false,
    allowProviderCall: true,
    governance: { accepted: true },
    auth: { type: "api_key", value: "sk-test" },
    providerBody: { model: "gpt-test", input: "hello" },
    modelClient,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.plan.providerCallPermitted, true);
  assert.equal(result.plan.transport, "provider");
  assert.equal(result.providerResult?.text, "hello from rax");
  assert.equal(result.usage?.inputTokens, 4);
  assert.equal(result.usage?.outputTokens, 3);
  assert.equal(result.usage?.totalTokens, 7);
});
