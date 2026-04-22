import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import {
  keyboardInputEmulationDescriptor,
  planKeyboardInputEmulation,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/keyboardEmulation/computeruse.keyboardInputEmulation.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/keyboardEmulation/computeruse.keyboardInputEmulation.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/keyboardEmulation/computeruse.keyboardInputEmulation.md",
  testFileUrl: import.meta.url,
});

test("planKeyboardInputEmulation creates a guarded dry-run typing plan", () => {
  const result = planKeyboardInputEmulation({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    text: "hello",
    targetHint: "active-input",
    requestedScopes: ["tool:computeruse:keyboard"],
    allowedScopes: ["tool:computeruse:keyboard"],
  });

  if (!result.ok) {
    assert.fail(result.error.message);
  }

  assert.equal(keyboardInputEmulationDescriptor.unsafeSideEffects, false);
  assert.equal(result.plan.tool, "computeruse.keyboardInputEmulation");
  assert.equal(result.plan.textCharacters, 5);
  assert.equal(result.plan.textBytes, 5);
  assert.equal(result.plan.dispatch, "dry-run");
  assert.equal(result.plan.wouldType, true);
  assert.equal(result.plan.unsafeSideEffects, false);
  assert.deepEqual(result.plan.acceptedScopes, ["tool:computeruse:keyboard"]);
});

test("planKeyboardInputEmulation rejects empty text and real keyboard side effects", () => {
  const missingText = planKeyboardInputEmulation({
    targetHint: "active-input",
  });
  assert.equal(missingText.ok, false);
  if (missingText.ok) {
    assert.fail("missing text must be rejected");
  }
  assert.equal(missingText.error.code, "MISSING_TEXT");
  assert.equal(missingText.error.boundary, "input");

  const realSideEffect = planKeyboardInputEmulation({
    text: "submit",
    dryRun: false,
  });
  assert.equal(realSideEffect.ok, false);
  if (realSideEffect.ok) {
    assert.fail("real keyboard input must be rejected");
  }
  assert.equal(realSideEffect.error.code, "REAL_SIDE_EFFECT_NOT_ALLOWED");
  assert.equal(realSideEffect.error.boundary, "governance");
});
