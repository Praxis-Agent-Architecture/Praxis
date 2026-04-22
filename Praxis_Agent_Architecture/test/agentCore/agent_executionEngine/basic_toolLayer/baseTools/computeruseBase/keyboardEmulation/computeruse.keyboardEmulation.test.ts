import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  keyboardEmulationDescriptor,
  planKeyboardEmulation,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/keyboardEmulation/computeruse.keyboardEmulation.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/keyboardEmulation/computeruse.keyboardEmulation.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/keyboardEmulation/computeruse.keyboardEmulation.md",
  testFileUrl: import.meta.url,
});

test("planKeyboardEmulation creates a keyboard dry-run plan", () => {
  const result = planKeyboardEmulation({
    context: {
      runtimeId: "runtime-1",
      invocationId: "keyboard-1",
      requestedScopes: ["tool:computeruse:keyboard"],
      allowedScopes: ["tool:computeruse:keyboard"],
    },
    actions: [
      { kind: "shortcut", keys: ["Control", "L"] },
      { kind: "text", text: "https://example.test" },
      { kind: "key-press", key: "Enter" },
    ],
    targetHint: "browser-address-bar",
  });

  assert.equal(result.ok, true);
  assert.equal(keyboardEmulationDescriptor.defaultDispatch, "dry-run");
  if (!result.ok) {
    return;
  }

  assert.equal(result.plan.toolId, "computeruse.keyboardEmulation");
  assert.equal(result.plan.dispatch, "dry-run");
  assert.equal(result.plan.actions.length, 3);
  assert.equal(result.plan.wouldEmitKeyboardEvents, true);
  assert.equal(result.plan.unsafeSideEffects, false);
  assert.equal(Object.isFrozen(result.plan.actions), true);
});

test("planKeyboardEmulation classifies action, scope, and side-effect errors", () => {
  const missingActions = planKeyboardEmulation({ context: { runtimeId: "runtime-1" } });
  assert.equal(missingActions.ok, false);
  if (!missingActions.ok) {
    assert.equal(missingActions.error.code, "MISSING_ACTIONS");
    assert.equal(missingActions.error.boundary, "input");
  }

  const invalidAction = planKeyboardEmulation({
    context: { runtimeId: "runtime-1" },
    actions: [{ kind: "shortcut", keys: ["Control"] }],
  });
  assert.equal(invalidAction.ok, false);
  if (!invalidAction.ok) {
    assert.equal(invalidAction.error.code, "INVALID_ACTION");
    assert.equal(invalidAction.error.boundary, "input");
  }

  const denied = planKeyboardEmulation({
    context: {
      runtimeId: "runtime-1",
      requestedScopes: ["tool:computeruse:keyboard"],
      allowedScopes: ["tool:computeruse:camera"],
    },
    actions: [{ kind: "key-press", key: "Enter" }],
  });
  assert.equal(denied.ok, false);
  if (!denied.ok) {
    assert.equal(denied.error.code, "SCOPE_DENIED");
    assert.equal(denied.error.boundary, "scope");
  }

  const realSideEffect = planKeyboardEmulation({
    context: { runtimeId: "runtime-1", dryRun: false },
    actions: [{ kind: "key-press", key: "Enter" }],
  });
  assert.equal(realSideEffect.ok, false);
  if (!realSideEffect.ok) {
    assert.equal(realSideEffect.error.code, "REAL_SIDE_EFFECT_NOT_ALLOWED");
    assert.equal(realSideEffect.error.boundary, "governance");
  }
});
