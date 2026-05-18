import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import { selectAdaptiveCapability } from "../../../../src/agentCore/agent_runtimeImplementation/runtime.adaptiveRuntime/adaptiveCapabilitySelector.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_runtimeImplementation/runtime.adaptiveRuntime/adaptiveCapabilitySelector.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.adaptiveRuntime/adaptiveCapabilitySelector.md",
  testFileUrl: import.meta.url,
});

test("adaptiveCapabilitySelector chooses the best ready dry-run capability", () => {
  const result = selectAdaptiveCapability({
    runtimeId: " runtime-1 ",
    caller: { kind: "application", id: " app-1 " },
    desiredKind: "model",
    requiredScopes: ["model.invoke"],
    allowedScopes: ["model.invoke", "model.read", "tool.invoke"],
    candidates: [
      {
        capabilityId: "slow-model",
        kind: "model",
        ready: true,
        healthScore: 0.8,
        priority: 1,
        latencyMs: 1400,
        scopes: ["model.invoke"],
      },
      {
        capabilityId: "fast-model",
        kind: "model",
        ready: true,
        healthScore: 0.9,
        priority: 1,
        latencyMs: 200,
        scopes: ["model.invoke"],
      },
      {
        capabilityId: "tool-capability",
        kind: "tool",
        scopes: ["tool.invoke"],
      },
    ],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.selection.selectionId, "runtime-1:adaptiveCapability:fast-model");
  assert.equal(result.selection.route, "runtime.adaptiveRuntime.adaptiveCapabilitySelector");
  assert.equal(result.selection.selected.capabilityId, "fast-model");
  assert.deepEqual(result.selection.candidateIds, ["slow-model", "fast-model"]);
  assert.deepEqual(result.selection.rejectedCandidateIds, ["tool-capability"]);
  assert.equal(result.selection.dryRun, true);
  assert.equal(result.selection.unsafeSideEffects, false);
});

test("adaptiveCapabilitySelector rejects missing candidates and denied scopes", () => {
  const missing = selectAdaptiveCapability({
    runtimeId: "runtime-1",
    caller: { kind: "test", id: "test" },
    candidates: [],
  });

  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.error.code, "MISSING_CAPABILITIES");
    assert.equal(missing.error.boundary, "input");
  }

  const denied = selectAdaptiveCapability({
    runtimeId: "runtime-1",
    caller: { kind: "official-module", id: "cmp" },
    requiredScopes: ["model.admin"],
    allowedScopes: ["model.invoke"],
    candidates: [{ capabilityId: "model-1", kind: "model", scopes: ["model.admin"] }],
  });

  assert.equal(denied.ok, false);
  if (!denied.ok) {
    assert.equal(denied.error.code, "SCOPE_DENIED");
    assert.equal(denied.error.boundary, "scope");
  }

  const deniedCandidateScope = selectAdaptiveCapability({
    runtimeId: "runtime-1",
    caller: { kind: "official-module", id: "cmp" },
    requiredScopes: ["model.invoke"],
    allowedScopes: ["model.invoke"],
    candidates: [{ capabilityId: "model-1", kind: "model", scopes: ["model.invoke", "model.admin"] }],
  });

  assert.equal(deniedCandidateScope.ok, false);
  if (!deniedCandidateScope.ok) {
    assert.equal(deniedCandidateScope.error.code, "SCOPE_DENIED");
    assert.equal(deniedCandidateScope.error.boundary, "scope");
  }
});
