import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import {
  definePromptPack,
  promptPackDefinerDescriptor,
} from "../../../../src/agentCore/agent_executionEngine/promptPack/promptDefiner.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/promptPack/promptDefiner.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/promptPack/promptDefiner.md",
  testFileUrl: import.meta.url,
});

test("definePromptPack creates a provider-neutral prompt contract", () => {
  const result = definePromptPack({
    runtimeId: " runtime:one ",
    sessionId: " session:one ",
    targetModel: " model:capability ",
    requestedScopes: [" prompt ", "prompt"],
    allowedScopes: ["prompt", "runtime"],
    budget: { maxMaterials: 2, maxEstimatedTokens: 20 },
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
  assert.deepEqual(result.definition.requestedScopes, ["prompt"]);
  assert.equal(result.definition.materials[0]?.id, "system");
  assert.equal(result.definition.materials[0]?.source, "runtime.contractSurface");
  assert.equal(result.definition.materials[0]?.estimatedTokens, 9);
});

test("definePromptPack rejects missing inputs, bad budgets, and scope drift", () => {
  const missingRuntime = definePromptPack();
  assert.equal(missingRuntime.ok, false);
  if (missingRuntime.ok) {
    throw new Error("expected missing runtime rejection");
  }
  assert.equal(missingRuntime.error.code, "MISSING_RUNTIME_ID");
  assert.equal(missingRuntime.error.safeForRuntimeInspection, true);

  const emptyMaterials = definePromptPack({ runtimeId: "runtime", sessionId: "session", materials: [] });
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
