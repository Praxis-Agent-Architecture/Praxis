import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  inputCheckboxConfirmDescriptor,
  planInputCheckboxConfirm,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/keyboardEmulation/computeruse.inputCheckboxConfirm.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/keyboardEmulation/computeruse.inputCheckboxConfirm.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/keyboardEmulation/computeruse.inputCheckboxConfirm.md",
  testFileUrl: import.meta.url,
});

test("planInputCheckboxConfirm creates a focused checkbox dry-run plan", () => {
  const result = planInputCheckboxConfirm({
    context: {
      runtimeId: "runtime-1",
      invocationId: "checkbox-1",
      requestedScopes: ["tool:computeruse:keyboard"],
      allowedScopes: ["tool:computeruse:keyboard"],
    },
    target: {
      label: "I agree",
      expectedState: "checked",
      currentState: "unchecked",
    },
  });

  assert.equal(result.ok, true);
  assert.equal(inputCheckboxConfirmDescriptor.defaultDispatch, "dry-run");
  if (!result.ok) {
    return;
  }

  assert.equal(result.plan.toolId, "computeruse.inputCheckboxConfirm");
  assert.equal(result.plan.dispatch, "dry-run");
  assert.equal(result.plan.confirmationKey, "space");
  assert.deepEqual(result.plan.keySequence, ["Space"]);
  assert.equal(result.plan.wouldConfirmCheckbox, true);
  assert.equal(result.plan.wouldToggle, true);
  assert.equal(result.plan.unsafeSideEffects, false);
});

test("planInputCheckboxConfirm classifies target, scope, and side-effect errors", () => {
  const missingRuntime = planInputCheckboxConfirm({
    target: { label: "I agree" },
  });
  assert.equal(missingRuntime.ok, false);
  if (!missingRuntime.ok) {
    assert.equal(missingRuntime.error.code, "MISSING_RUNTIME_ID");
    assert.equal(missingRuntime.error.boundary, "input");
  }

  const missingTarget = planInputCheckboxConfirm({ context: { runtimeId: "runtime-1" } });
  assert.equal(missingTarget.ok, false);
  if (!missingTarget.ok) {
    assert.equal(missingTarget.error.code, "MISSING_TARGET");
    assert.equal(missingTarget.error.boundary, "input");
  }

  const denied = planInputCheckboxConfirm({
    context: {
      runtimeId: "runtime-1",
      requestedScopes: ["tool:computeruse:keyboard"],
      allowedScopes: ["tool:computeruse:camera"],
    },
    target: { selectorHint: "input[type=checkbox]" },
  });
  assert.equal(denied.ok, false);
  if (!denied.ok) {
    assert.equal(denied.error.code, "SCOPE_DENIED");
    assert.equal(denied.error.boundary, "scope");
  }

  const realSideEffect = planInputCheckboxConfirm({
    context: { runtimeId: "runtime-1", dryRun: false },
    target: { label: "I agree" },
  });
  assert.equal(realSideEffect.ok, false);
  if (!realSideEffect.ok) {
    assert.equal(realSideEffect.error.code, "REAL_SIDE_EFFECT_NOT_ALLOWED");
    assert.equal(realSideEffect.error.boundary, "governance");
  }
});
