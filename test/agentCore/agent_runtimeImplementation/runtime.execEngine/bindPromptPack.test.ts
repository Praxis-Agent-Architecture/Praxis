import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import { bindPromptPack } from "../../../../src/runtimeImplementation/runtime.execEngine/bindPromptPack.js";

defineAgentCoreContractTest({
  sourcePath: "src/runtimeImplementation/runtime.execEngine/bindPromptPack.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.execEngine/bindPromptPack.md",
  testFileUrl: import.meta.url,
});

test("bindPromptPack creates a dry-run runtime binding for promptPack layers", () => {
  const result = bindPromptPack({
    runtimeId: " runtime-1 ",
    caller: { kind: "application", id: " app-1 " },
    promptPack: {
      id: " prompt-pack-1 ",
      source: "official-module",
      layers: [
        { kind: "system", ref: " system:base ", sourceCategory: "declared-built-in" },
        { kind: "memory", ref: " memory:recent ", sourceCategory: "process-product" },
        { kind: "memory", ref: " memory:profile ", sourceCategory: "process-product" },
      ],
      metadata: { owner: "cmp" },
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.binding.bindingId, "runtime-1:promptPack:prompt-pack-1");
  assert.equal(result.binding.route, "runtime.execEngine.promptPack");
  assert.deepEqual(result.binding.layerKinds, ["system", "memory"]);
  assert.equal(result.binding.layers[0]?.sourceCategory, "declared-built-in");
  assert.equal(result.binding.layers[1]?.sourceCategory, "process-product");
  assert.equal(result.binding.dryRun, true);
  assert.equal(result.binding.unsafeSideEffects, false);
  assert.deepEqual(result.events, ["runtime.execEngine.promptPack.bound"]);
});

test("bindPromptPack rejects missing or governance-blocked prompt packs with stable errors", () => {
  assert.deepEqual(bindPromptPack(), {
    ok: false,
    error: {
      code: "MISSING_RUNTIME_ID",
      message: "promptPack binding requires a runtimeId",
      boundary: "input",
      publicSafe: true,
    },
    events: ["runtime.execEngine.promptPack.rejected"],
  });

  const rejected = bindPromptPack({
    runtimeId: "runtime-1",
    caller: { kind: "official-module", id: "cmp" },
    promptPack: { id: "prompt-pack-1", layers: [{ kind: "context", ref: "cmp:context" }] },
    governance: { accepted: false, reason: "CMP material is outside current runtime scope" },
  });

  assert.equal(rejected.ok, false);
  if (rejected.ok) {
    return;
  }

  assert.equal(rejected.error.code, "GOVERNANCE_REJECTED");
  assert.equal(rejected.error.boundary, "governance");
  assert.equal(rejected.error.message, "CMP material is outside current runtime scope");
});
