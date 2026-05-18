import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import { lowerPromptForModelAdapter } from "../../../../src/agentCore/agent_runtimeImplementation/runtime.modelAdapter/promptLoweringRuntime.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_runtimeImplementation/runtime.modelAdapter/promptLoweringRuntime.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.modelAdapter/promptLoweringRuntime.md",
  testFileUrl: import.meta.url,
});

test("promptLoweringRuntime lowers promptPack material into a model-adapter envelope", () => {
  const result = lowerPromptForModelAdapter({
    runtimeId: " runtime-1 ",
    caller: { kind: "application", id: " app-1 ", sessionId: " session-1 " },
    promptPack: {
      id: " prompt-pack-1 ",
      materials: [
        { kind: "system", ref: " system:base ", sourceCategory: "declared-built-in", promptSegmentKind: "stableSystemCore", priority: 100 },
        { kind: "user", text: " hello model ", sourceCategory: "user-request", promptSegmentKind: "userTurn", priority: 50 },
        { kind: "context", ref: " cmp:ctx:1 ", sourceCategory: "process-product", promptSegmentKind: "sessionSummary" },
        { kind: "command", text: "{\"root\":\"internal plan\"}", promptSegmentKind: "assistantScratchpadPlan" },
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
  assert.deepEqual(result.loweredPrompt.providerVisibleSegmentKinds, ["stableSystemCore", "userTurn", "sessionSummary"]);
  assert.deepEqual(result.loweredPrompt.hiddenInternalSegmentKinds, ["assistantScratchpadPlan"]);
  assert.equal(result.loweredPrompt.materials[0]?.sourceCategory, "declared-built-in");
  assert.equal(result.loweredPrompt.materials[1]?.sourceCategory, "user-request");
  assert.equal(result.loweredPrompt.materials[1]?.text, "hello model");
  assert.equal(result.loweredPrompt.visibleFallbackCreated, false);
  assert.equal(result.loweredPrompt.policy.degraded, false);
  assert.equal(result.loweredPrompt.dryRun, true);
  assert.equal(result.loweredPrompt.unsafeSideEffects, false);
});

test("promptLoweringRuntime exposes assistantScratchpadPlan only in explicit JSON fallback mode", () => {
  const result = lowerPromptForModelAdapter({
    runtimeId: "runtime-1",
    caller: { kind: "application", id: "app-1" },
    promptPack: {
      id: "prompt-pack-1",
      materials: [
        { kind: "user", text: "run task", promptSegmentKind: "userTurn" },
        { kind: "command", text: "{\"root\":\"fallback tool plan\"}", promptSegmentKind: "assistantScratchpadPlan" },
      ],
    },
    target: { capabilityId: "capability:text" },
    fallbackMode: "json-tool-plan",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.loweredPrompt.materialKinds, ["user", "command"]);
  assert.equal(result.loweredPrompt.materials[1]?.promptSegmentKind, "assistantScratchpadPlan");
  assert.equal(result.loweredPrompt.fallbackMode, "json-tool-plan");
  assert.equal(result.loweredPrompt.visibleFallbackCreated, true);
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

test("promptLoweringRuntime fails closed for safety and tool semantics but degrades best-effort cache formatting gaps", () => {
  const toolRejected = lowerPromptForModelAdapter({
    runtimeId: "runtime-1",
    caller: { kind: "application", id: "app-1" },
    promptPack: { id: "prompt-pack-1", materials: [{ kind: "tool-summary", ref: "tool:read", promptSegmentKind: "toolDeclarations" }] },
    target: { capabilityId: "capability:text" },
    loweringPolicyIssues: [{ kind: "tool-semantics", accepted: false, reason: "provider cannot preserve tool schema" }],
  });
  assert.equal(toolRejected.ok, false);
  if (toolRejected.ok) return;
  assert.equal(toolRejected.error.code, "LOWERING_POLICY_REJECTED");
  assert.equal(toolRejected.error.boundary, "prompt-pack");

  const degraded = lowerPromptForModelAdapter({
    runtimeId: "runtime-1",
    caller: { kind: "application", id: "app-1" },
    promptPack: { id: "prompt-pack-1", materials: [{ kind: "user", text: "hello", promptSegmentKind: "userTurn" }] },
    target: { capabilityId: "capability:text" },
    loweringPolicyIssues: [
      { kind: "cache", accepted: false, reason: "provider only supports implicit cache" },
      { kind: "formatting", accepted: false, reason: "provider merged adjacent text blocks" },
    ],
  });
  assert.equal(degraded.ok, true);
  if (!degraded.ok) return;
  assert.equal(degraded.loweredPrompt.policy.degraded, true);
  assert.deepEqual(
    degraded.loweredPrompt.policy.degradationRecords.map((record) => record.kind),
    ["cache", "formatting"],
  );
  assert.ok(degraded.events.includes("runtime.modelAdapter.promptLoweringRuntime.degraded"));
});
