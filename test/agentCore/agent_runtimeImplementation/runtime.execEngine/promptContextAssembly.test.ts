import assert from "node:assert/strict";
import test from "node:test";

import { assemblePromptContextMaterials } from "../../../../src/runtimeImplementation/runtime.execEngine/promptContextAssembly.js";
import type { AgentManifest } from "../../../../src/runtimeImplementation/runtimeAgentManifest.js";

function manifest(): AgentManifest {
  return {
    manifestId: "manifest.test",
    identity: { id: "agent.test" },
    model: { model: "gpt-test", provider: "openai", carrierId: "carrier.test", endpointShape: "responses" },
    promptPack: {
      promptPackId: "prompt.test",
      inherits: [],
      patches: [],
      stateMachineMutations: [],
      materials: [],
    },
    harness: {
      tools: [
        {
          toolId: "file.read",
          family: "codeBase",
          group: "file",
          description: "Read a workspace file.",
          metadata: { toolProviderKind: "baseTool", riskLevel: "safe" },
        },
      ],
      loop: { maxModelTurns: 2, maxToolCalls: 4 },
    },
  } as unknown as AgentManifest;
}

test("assemblePromptContextMaterials creates recentConversation from the remaining context budget", () => {
  const result = assemblePromptContextMaterials({
    manifest: manifest(),
    task: "Continue the promptPack renew task.",
    turnIndex: 3,
    toolMappings: [{ toolId: "file.read", providerName: "praxis_tool_file_read" }],
    observations: [],
    events: ["turn.started"],
    sessionSummary: {
      summaryId: "summary.session",
      text: "Old history has been compacted into a stable session summary.",
      compactedUntilTurnId: "turn.2",
    },
    conversationWindow: [
      { messageId: "m1", role: "user", text: "older detail that should fit if budget allows" },
      { messageId: "m2", role: "assistant", text: "recent answer" },
      { messageId: "m3", role: "user", text: "latest correction" },
    ],
    budget: {
      contextWindowTokens: 4096,
      responseReserveTokens: 512,
      safetyMarginTokens: 256,
    },
  });

  assert.equal(result.kind, "praxis.promptContextAssembly");
  assert.equal(result.recentConversation.requestedMessages, 3);
  assert.equal(result.recentConversation.includedMessages, 3);
  assert.equal(result.materials.some((material) => material.promptSegmentKind === "sessionSummary"), true);
  assert.equal(result.materials.some((material) => material.promptSegmentKind === "recentConversation"), true);
  assert.equal(result.materials.some((material) => material.promptSegmentKind === "userTurn" && material.id === "task:3"), true);
  assert.equal(result.materials.some((material) => material.id === "runtime:base-tool-protocol"), true);
});

test("assemblePromptContextMaterials trims recentConversation before touching current userTurn", () => {
  const result = assemblePromptContextMaterials({
    manifest: manifest(),
    task: "This current user turn must stay exact.",
    turnIndex: 4,
    toolMappings: [],
    observations: [],
    events: [],
    conversationWindow: [
      { messageId: "old", role: "user", text: "x".repeat(2000) },
      { messageId: "new", role: "assistant", text: "y".repeat(2000) },
    ],
    budget: {
      maxRecentConversationTokens: 10,
    },
  });

  assert.equal(result.recentConversation.trimmed, true);
  assert.equal(result.materials.find((material) => material.id === "task:4")?.text, "This current user turn must stay exact.");
});

test("assemblePromptContextMaterials preserves recentConversation with default small-window reserves", () => {
  const result = assemblePromptContextMaterials({
    manifest: manifest(),
    task: "Use the current turn.",
    turnIndex: 5,
    toolMappings: [],
    observations: [],
    events: [],
    conversationWindow: [
      { messageId: "recent", role: "assistant", text: "short recent focus" },
    ],
    budget: {
      contextWindowTokens: 4096,
    },
  });

  assert.equal(result.recentConversation.includedMessages, 1);
  assert.equal(result.materials.some((material) => material.promptSegmentKind === "recentConversation"), true);
  assert.equal(result.materials.find((material) => material.id === "task:5")?.text, "Use the current turn.");
});

test("assemblePromptContextMaterials omits recentConversation when no budget remains", () => {
  const result = assemblePromptContextMaterials({
    manifest: manifest(),
    task: "Keep the active turn.",
    turnIndex: 6,
    toolMappings: [],
    observations: [],
    events: [],
    conversationWindow: [
      { messageId: "latest", role: "assistant", text: "latest detail" },
    ],
    budget: {
      maxRecentConversationTokens: 0,
    },
  });

  assert.equal(result.recentConversation.includedMessages, 0);
  assert.equal(result.recentConversation.estimatedTokens, 0);
  assert.equal(result.materials.some((material) => material.promptSegmentKind === "recentConversation"), false);
  assert.equal(result.materials.find((material) => material.id === "task:6")?.text, "Keep the active turn.");
});
