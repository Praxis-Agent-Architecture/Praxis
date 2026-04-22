import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import {
  keyboardSubmitInputDescriptor,
  planKeyboardSubmitInput,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/keyboardEmulation/computeruse.keyboardSubmitInput.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/keyboardEmulation/computeruse.keyboardSubmitInput.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/keyboardEmulation/computeruse.keyboardSubmitInput.md",
  testFileUrl: import.meta.url,
});

test("planKeyboardSubmitInput creates a guarded dry-run submit plan", () => {
  const result = planKeyboardSubmitInput({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    submitKey: "NumpadEnter",
    repeat: 2,
    targetHint: "active-input",
    requestedScopes: ["tool:computeruse:keyboard"],
    allowedScopes: ["tool:computeruse:keyboard"],
  });

  if (!result.ok) {
    assert.fail(result.error.message);
  }

  assert.equal(keyboardSubmitInputDescriptor.requiresTapApproval, true);
  assert.equal(result.plan.tool, "computeruse.keyboardSubmitInput");
  assert.equal(result.plan.submitKey, "NumpadEnter");
  assert.equal(result.plan.repeat, 2);
  assert.equal(result.plan.dispatch, "dry-run");
  assert.equal(result.plan.wouldSubmit, true);
  assert.equal(result.plan.unsafeSideEffects, false);
});

test("planKeyboardSubmitInput rejects invalid repeat and real keyboard submit", () => {
  const invalidRepeat = planKeyboardSubmitInput({
    repeat: 0,
  });
  assert.equal(invalidRepeat.ok, false);
  if (invalidRepeat.ok) {
    assert.fail("invalid repeat must be rejected");
  }
  assert.equal(invalidRepeat.error.code, "INVALID_REPEAT");
  assert.equal(invalidRepeat.error.boundary, "resource");

  const realSideEffect = planKeyboardSubmitInput({
    dryRun: false,
  });
  assert.equal(realSideEffect.ok, false);
  if (realSideEffect.ok) {
    assert.fail("real submit side effects must be rejected");
  }
  assert.equal(realSideEffect.error.code, "REAL_SIDE_EFFECT_NOT_ALLOWED");
  assert.equal(realSideEffect.error.boundary, "governance");
});
