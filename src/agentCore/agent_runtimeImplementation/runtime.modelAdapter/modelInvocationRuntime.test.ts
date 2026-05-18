import assert from "node:assert/strict";
import { test } from "node:test";

import { invokeModelThroughRuntime } from "./modelInvocationRuntime.js";

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
