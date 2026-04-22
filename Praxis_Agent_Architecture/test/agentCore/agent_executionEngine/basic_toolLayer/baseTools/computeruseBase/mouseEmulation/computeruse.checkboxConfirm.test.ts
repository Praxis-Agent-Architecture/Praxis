import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  checkboxConfirmDescriptor,
  planCheckboxConfirm,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/mouseEmulation/computeruse.checkboxConfirm.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/mouseEmulation/computeruse.checkboxConfirm.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/mouseEmulation/computeruse.checkboxConfirm.md",
  testFileUrl: import.meta.url,
});

test("planCheckboxConfirm creates a mouse checkbox dry-run plan", () => {
  const result = planCheckboxConfirm({
    context: {
      runtimeId: "runtime-1",
      invocationId: "checkbox-1",
      requestedScopes: ["tool:computeruse:mouse"],
      allowedScopes: ["tool:computeruse:mouse"],
    },
    target: {
      label: "I agree",
      point: { x: 120, y: 240 },
      expectedState: "checked",
      currentState: "unchecked",
    },
  });

  assert.equal(result.ok, true);
  assert.equal(checkboxConfirmDescriptor.defaultDispatch, "dry-run");
  if (!result.ok) {
    return;
  }

  assert.equal(result.plan.toolId, "computeruse.checkboxConfirm");
  assert.equal(result.plan.dispatch, "dry-run");
  assert.equal(result.plan.clickMode, "single-click");
  assert.deepEqual(result.plan.mouseAction.point, { x: 120, y: 240 });
  assert.equal(result.plan.mouseAction.clickCount, 1);
  assert.equal(result.plan.wouldConfirmCheckbox, true);
  assert.equal(result.plan.wouldToggle, true);
  assert.equal(result.plan.unsafeSideEffects, false);
});

test("planCheckboxConfirm classifies target, scope, and side-effect errors", () => {
  const missingRuntime = planCheckboxConfirm({
    target: { label: "I agree" },
  });
  assert.equal(missingRuntime.ok, false);
  if (!missingRuntime.ok) {
    assert.equal(missingRuntime.error.code, "MISSING_RUNTIME_ID");
    assert.equal(missingRuntime.error.boundary, "input");
  }

  const missingTarget = planCheckboxConfirm({ context: { runtimeId: "runtime-1" } });
  assert.equal(missingTarget.ok, false);
  if (!missingTarget.ok) {
    assert.equal(missingTarget.error.code, "MISSING_TARGET");
    assert.equal(missingTarget.error.boundary, "input");
  }

  const invalidPoint = planCheckboxConfirm({
    context: { runtimeId: "runtime-1" },
    target: { point: { x: -1, y: 20 } },
  });
  assert.equal(invalidPoint.ok, false);
  if (!invalidPoint.ok) {
    assert.equal(invalidPoint.error.code, "INVALID_POINT");
    assert.equal(invalidPoint.error.boundary, "input");
  }

  const denied = planCheckboxConfirm({
    context: {
      runtimeId: "runtime-1",
      requestedScopes: ["tool:computeruse:mouse"],
      allowedScopes: ["tool:computeruse:keyboard"],
    },
    target: { selectorHint: "input[type=checkbox]" },
  });
  assert.equal(denied.ok, false);
  if (!denied.ok) {
    assert.equal(denied.error.code, "SCOPE_DENIED");
    assert.equal(denied.error.boundary, "scope");
  }

  const realSideEffect = planCheckboxConfirm({
    context: { runtimeId: "runtime-1", dryRun: false },
    target: { label: "I agree" },
  });
  assert.equal(realSideEffect.ok, false);
  if (!realSideEffect.ok) {
    assert.equal(realSideEffect.error.code, "REAL_SIDE_EFFECT_NOT_ALLOWED");
    assert.equal(realSideEffect.error.boundary, "governance");
  }
});

test("planCheckboxConfirm rejects runtime enum values outside the contract", () => {
  const invalidClickMode = planCheckboxConfirm({
    context: { runtimeId: "runtime-1" },
    target: { label: "I agree" },
    clickMode: "triple-click" as "single-click",
  });
  assert.equal(invalidClickMode.ok, false);
  if (!invalidClickMode.ok) {
    assert.equal(invalidClickMode.error.code, "INVALID_CLICK_MODE");
    assert.equal(invalidClickMode.error.boundary, "input");
  }

  const invalidState = planCheckboxConfirm({
    context: { runtimeId: "runtime-1" },
    target: {
      label: "I agree",
      expectedState: "mixed" as "checked",
    },
  });
  assert.equal(invalidState.ok, false);
  if (!invalidState.ok) {
    assert.equal(invalidState.error.code, "INVALID_STATE");
    assert.equal(invalidState.error.boundary, "input");
  }
});
