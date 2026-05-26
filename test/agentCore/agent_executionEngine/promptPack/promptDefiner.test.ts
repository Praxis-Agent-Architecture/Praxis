import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import {
  BASIC_CORE_PROMPT_MATERIAL_ID,
  PROMPT_PACK_INTERNAL_MATERIAL_KINDS,
  PROMPT_PACK_PROVIDER_VISIBLE_SEGMENT_KINDS,
  PROMPT_PACK_SEGMENT_KINDS,
  definePromptPack,
  promptPackDefinerDescriptor,
} from "../../../../src/executionEngine/promptPack/promptDefiner.js";

defineAgentCoreContractTest({
  sourcePath: "src/executionEngine/promptPack/promptDefiner.ts",
  docPath: "docs/agentCore/agent_executionEngine/promptPack/promptDefiner.md",
  testFileUrl: import.meta.url,
});

test("definePromptPack creates a provider-neutral prompt contract", () => {
  const result = definePromptPack({
    runtimeId: " runtime:one ",
    sessionId: " session:one ",
    targetModel: " model:capability ",
    requestedScopes: [" prompt ", "prompt"],
    allowedScopes: ["prompt", "runtime"],
    budget: { maxMaterials: 2, maxEstimatedTokens: 2000 },
    materials: [
      {
        id: " system ",
        kind: "system",
        text: "  Keep the agentCore boundary clear.  ",
        source: " runtime.contractSurface ",
        priority: 10,
        trusted: true,
      },
    ],
  });

  assert.equal(promptPackDefinerDescriptor.providerPayloadCreated, false);
  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected PromptPack definition to be accepted");
  }

  assert.equal(result.definition.kind, "prompt-pack-definition");
  assert.equal(result.definition.runtimeId, "runtime:one");
  assert.equal(result.definition.sessionId, "session:one");
  assert.equal(result.definition.providerPayloadCreated, false);
  assert.equal(result.definition.unsafeSideEffects, false);
  assert.deepEqual(promptPackDefinerDescriptor.internalMaterialKinds, PROMPT_PACK_INTERNAL_MATERIAL_KINDS);
  assert.deepEqual(promptPackDefinerDescriptor.sourceCategories, ["declared-built-in", "process-product", "user-request"]);
  assert.deepEqual(promptPackDefinerDescriptor.orderedSegmentKinds, PROMPT_PACK_SEGMENT_KINDS);
  assert.deepEqual(promptPackDefinerDescriptor.providerVisibleSegmentKinds, PROMPT_PACK_PROVIDER_VISIBLE_SEGMENT_KINDS);
  assert.equal(result.definition.basicCorePromptMaterialId, BASIC_CORE_PROMPT_MATERIAL_ID);
  assert.deepEqual(result.definition.orderedSegmentKinds, PROMPT_PACK_SEGMENT_KINDS);
  assert.deepEqual(result.definition.providerVisibleSegmentKinds, PROMPT_PACK_PROVIDER_VISIBLE_SEGMENT_KINDS);
  assert.deepEqual(result.definition.materialSourceCategories, ["declared-built-in"]);
  assert.deepEqual(result.definition.requestedScopes, ["prompt"]);
  assert.equal(result.definition.materials[0]?.id, BASIC_CORE_PROMPT_MATERIAL_ID);
  assert.equal(result.definition.materials[0]?.source, "runtime.basicCorePrompt");
  assert.equal(result.definition.materials[0]?.sourceCategory, "declared-built-in");
  assert.equal(result.definition.materials[0]?.promptSegmentKind, "stableSystemCore");
  assert.equal(result.definition.materials[0]?.metadata.protected, true);
  assert.match(result.definition.materials[0]?.text ?? "", /BaseTool Evidence Discipline/);
  assert.match(result.definition.materials[0]?.text ?? "", /repository, file, git, shell, system/);
  assert.match(result.definition.materials[0]?.text ?? "", /praxis_expand_tool_context/);
  assert.match(result.definition.materials[0]?.text ?? "", /praxis_ephemeral_procedure/);
  assert.match(result.definition.materials[0]?.text ?? "", /praxis_request_approval/);
  assert.match(result.definition.materials[0]?.text ?? "", /Prefer verified evidence over memory/);
  assert.match(result.definition.materials[0]?.text ?? "", /re-anchor on the new target/);
  assert.equal(result.definition.materials[1]?.id, "system");
  assert.equal(result.definition.materials[1]?.source, "runtime.contractSurface");
});

test("definePromptPack supports the fixed PromptPack sections and internal scratchpad plans", () => {
  const result = definePromptPack({
    runtimeId: "runtime",
    sessionId: "session",
    includeBasicCorePrompt: false,
    materials: PROMPT_PACK_SEGMENT_KINDS.map((segmentKind, index) => {
      const material = {
        id: segmentKind,
        kind: segmentKind === "userTurn" ? "user" as const : segmentKind === "toolDeclarations" ? "tool" as const : "system" as const,
        text: `material for ${segmentKind}`,
        source: segmentKind === "userTurn" ? "user" : "manifest.promptPack",
        promptSegmentKind: segmentKind,
        priority: index,
      };
      return segmentKind === "assistantScratchpadPlan"
        ? { ...material, metadata: { decisionTree: { root: "plan", alternatives: ["fallback"] } } }
        : material;
    }),
  });

  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("expected fixed-section PromptPack definition");

  assert.deepEqual(
    result.definition.materials.map((material) => material.promptSegmentKind),
    PROMPT_PACK_SEGMENT_KINDS,
  );
  assert.equal(result.definition.materials.at(-1)?.promptSegmentKind, "assistantScratchpadPlan");
  assert.equal(result.definition.materials.at(-1)?.internalOnly, true);
});

test("definePromptPack classifies formal material sources without provider payloads", () => {
  const result = definePromptPack({
    runtimeId: "runtime",
    sessionId: "session",
    includeBasicCorePrompt: false,
    materials: [
      { id: "declared", kind: "system", text: "base", source: "manifest.promptPack" },
      { id: "observation", kind: "tool-summary", text: "tool result", source: "observation.tool" },
      { id: "user", kind: "user", text: "please inspect", source: "user" },
    ],
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.definition.materialSourceCategories, ["declared-built-in", "process-product", "user-request"]);
  assert.deepEqual(
    result.definition.materials.map((material) => material.sourceCategory),
    ["declared-built-in", "process-product", "user-request"],
  );
  assert.equal(result.definition.providerPayloadCreated, false);
});

test("definePromptPack rejects missing inputs, bad budgets, and scope drift", () => {
  const missingRuntime = definePromptPack();
  assert.equal(missingRuntime.ok, false);
  if (missingRuntime.ok) {
    throw new Error("expected missing runtime rejection");
  }
  assert.equal(missingRuntime.error.code, "MISSING_RUNTIME_ID");
  assert.equal(missingRuntime.error.safeForRuntimeInspection, true);

  const emptyMaterials = definePromptPack({
    runtimeId: "runtime",
    sessionId: "session",
    includeBasicCorePrompt: false,
    materials: [],
  });
  assert.equal(emptyMaterials.ok, false);
  if (emptyMaterials.ok) {
    throw new Error("expected empty material rejection");
  }
  assert.equal(emptyMaterials.error.code, "EMPTY_MATERIALS");

  const badBudget = definePromptPack({
    runtimeId: "runtime",
    sessionId: "session",
    budget: { maxEstimatedTokens: 0 },
    materials: [{ kind: "user", text: "hello" }],
  });
  assert.equal(badBudget.ok, false);
  if (badBudget.ok) {
    throw new Error("expected budget rejection");
  }
  assert.equal(badBudget.error.code, "INVALID_BUDGET");

  const deniedScope = definePromptPack({
    runtimeId: "runtime",
    sessionId: "session",
    requestedScopes: ["private-memory"],
    allowedScopes: ["prompt"],
    materials: [{ kind: "user", text: "hello" }],
  });
  assert.equal(deniedScope.ok, false);
  if (deniedScope.ok) {
    throw new Error("expected scope rejection");
  }
  assert.equal(deniedScope.error.code, "SCOPE_DENIED");
});
