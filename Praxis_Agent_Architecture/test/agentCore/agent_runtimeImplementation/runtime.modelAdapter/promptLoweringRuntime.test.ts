import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import { lowerPromptForModelAdapter } from "../../../../src/agentCore/agent_runtimeImplementation/runtime.modelAdapter/promptLoweringRuntime.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_runtimeImplementation/runtime.modelAdapter/promptLoweringRuntime.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_runtimeImplementation/runtime.modelAdapter/promptLoweringRuntime.md",
  testFileUrl: import.meta.url,
});

test("promptLoweringRuntime lowers promptPack material into a model-adapter envelope", () => {
  const result = lowerPromptForModelAdapter({
    runtimeId: " runtime-1 ",
    caller: { kind: "application", id: " app-1 ", sessionId: " session-1 " },
    promptPack: {
      id: " prompt-pack-1 ",
      materials: [
        { kind: "system", ref: " system:base ", sourceCategory: "declared-built-in", priority: 100 },
        { kind: "user", text: " hello model ", sourceCategory: "user-request", priority: 50 },
        { kind: "context", ref: " cmp:ctx:1 ", sourceCategory: "process-product" },
      ],
      metadata: { source: "promptPack" },
    },
    target: { capabilityId: " capability:text ", carrierId: " openai-carrier ", outputMode: " stream " },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.loweredPrompt.loweringId, "runtime-1:promptLowering:prompt-pack-1");
  assert.equal(result.loweredPrompt.route, "runtime.modelAdapter.promptLoweringRuntime");
  assert.equal(result.loweredPrompt.target.capabilityId, "capability:text");
  assert.equal(result.loweredPrompt.target.carrierId, "openai-carrier");
  assert.deepEqual(result.loweredPrompt.materialKinds, ["system", "user", "context"]);
  assert.deepEqual(result.loweredPrompt.materialRefs, ["system:base", "prompt-pack-1:material:2", "cmp:ctx:1"]);
  assert.equal(result.loweredPrompt.materials[0]?.sourceCategory, "declared-built-in");
  assert.equal(result.loweredPrompt.materials[1]?.sourceCategory, "user-request");
  assert.equal(result.loweredPrompt.materials[1]?.text, "hello model");
  assert.equal(result.loweredPrompt.dryRun, true);
  assert.equal(result.loweredPrompt.unsafeSideEffects, false);
});

test("promptLoweringRuntime rejects empty material and governance failures", () => {
  const empty = lowerPromptForModelAdapter({
    runtimeId: "runtime-1",
    caller: { kind: "application", id: "app-1" },
    promptPack: { id: "prompt-pack-1", materials: [{ kind: "user", text: " " }] },
    target: { capabilityId: "capability:text" },
  });

  assert.equal(empty.ok, false);
  if (empty.ok) {
    return;
  }

  assert.equal(empty.error.code, "EMPTY_PROMPT_MATERIALS");
  assert.equal(empty.error.boundary, "prompt-pack");

  const rejected = lowerPromptForModelAdapter({
    runtimeId: "runtime-1",
    caller: { kind: "official-module", id: "cmp" },
    promptPack: { id: "prompt-pack-1", materials: [{ kind: "context", ref: "cmp:ctx:1" }] },
    target: { capabilityId: "capability:text" },
    governance: { accepted: false, reason: "prompt material outside model scope" },
  });

  assert.equal(rejected.ok, false);
  if (rejected.ok) {
    return;
  }

  assert.equal(rejected.error.code, "GOVERNANCE_REJECTED");
  assert.equal(rejected.error.message, "prompt material outside model scope");
});
