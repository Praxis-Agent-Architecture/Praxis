import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  mouseScrollDescriptor,
  planMouseScroll,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/mouseEmulation/computeruse.mouseScroll.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/mouseEmulation/computeruse.mouseScroll.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/mouseEmulation/computeruse.mouseScroll.md",
  testFileUrl: import.meta.url,
});

test("planMouseScroll creates a dry-run scroll event envelope", () => {
  const result = planMouseScroll({
    context: {
      runtimeId: "runtime-1",
      invocationId: "scroll-1",
      requestedScopes: ["tool:computeruse:mouse"],
      allowedScopes: ["tool:computeruse:mouse"],
    },
    direction: "down",
    amount: 3,
    unit: "line",
    targetHint: "main-scroll-view",
  });

  assert.equal(result.ok, true);
  assert.equal(mouseScrollDescriptor.defaultDispatch, "dry-run");
  if (!result.ok) {
    return;
  }

  assert.equal(result.plan.toolId, "computeruse.mouseScroll");
  assert.deepEqual(result.plan.vector, { deltaX: 0, deltaY: 3, unit: "line" });
  assert.equal(result.plan.wouldEmitWheelEvents, true);
  assert.equal(result.plan.unsafeSideEffects, false);
  assert.deepEqual(result.events, ["basicTool.computeruse.mouseScroll.planned"]);
});

test("planMouseScroll classifies missing input and side-effect errors", () => {
  const missingRuntime = planMouseScroll();
  assert.equal(missingRuntime.ok, false);
  if (!missingRuntime.ok) {
    assert.equal(missingRuntime.error.code, "MISSING_RUNTIME_ID");
    assert.equal(missingRuntime.error.boundary, "input");
  }

  const missingVector = planMouseScroll({ context: { runtimeId: "runtime-1" } });
  assert.equal(missingVector.ok, false);
  if (!missingVector.ok) {
    assert.equal(missingVector.error.code, "MISSING_SCROLL_VECTOR");
    assert.equal(missingVector.error.boundary, "input");
  }

  const denied = planMouseScroll({
    context: {
      runtimeId: "runtime-1",
      requestedScopes: ["tool:computeruse:mouse"],
      allowedScopes: ["tool:computeruse:keyboard"],
    },
    deltaY: 5,
  });
  assert.equal(denied.ok, false);
  if (!denied.ok) {
    assert.equal(denied.error.code, "SCOPE_DENIED");
    assert.equal(denied.error.boundary, "scope");
  }

  const realSideEffect = planMouseScroll({
    context: { runtimeId: "runtime-1", dryRun: false },
    deltaY: 5,
  });
  assert.equal(realSideEffect.ok, false);
  if (!realSideEffect.ok) {
    assert.equal(realSideEffect.error.code, "REAL_SIDE_EFFECT_NOT_ALLOWED");
    assert.equal(realSideEffect.error.boundary, "governance");
  }
});
