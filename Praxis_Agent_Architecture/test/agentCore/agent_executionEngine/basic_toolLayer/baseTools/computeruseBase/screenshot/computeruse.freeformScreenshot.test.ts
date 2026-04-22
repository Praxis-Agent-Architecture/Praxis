import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  freeformScreenshotDescriptor,
  planFreeformScreenshot,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/screenshot/computeruse.freeformScreenshot.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/screenshot/computeruse.freeformScreenshot.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/screenshot/computeruse.freeformScreenshot.md",
  testFileUrl: import.meta.url,
});

test("planFreeformScreenshot creates a dry-run freeform capture plan", () => {
  const result = planFreeformScreenshot({
    context: {
      runtimeId: "runtime-1",
      invocationId: "freeform-1",
      permission: { accepted: true },
      requestedScopes: ["tool:computeruse:screen"],
      allowedScopes: ["tool:computeruse:screen"],
    },
    displayId: "display-1",
    purpose: "capture selected canvas",
    points: [
      { x: 10, y: 10 },
      { x: 110, y: 20 },
      { x: 90, y: 80 },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(freeformScreenshotDescriptor.defaultDispatch, "dry-run");
  if (!result.ok) {
    return;
  }

  assert.equal(result.plan.toolId, "computeruse.freeformScreenshot");
  assert.equal(result.plan.dispatch, "dry-run");
  assert.equal(result.plan.points.length, 3);
  assert.deepEqual(result.plan.boundingBox, { x: 10, y: 10, width: 100, height: 70 });
  assert.equal(result.plan.screenshotCaptured, false);
  assert.equal(result.plan.unsafeSideEffects, false);
  assert.equal(Object.isFrozen(result.plan.points), true);
});

test("planFreeformScreenshot classifies selection, scope, and side-effect errors", () => {
  const missingPoints = planFreeformScreenshot({
    context: { runtimeId: "runtime-1", permission: { accepted: true } },
    purpose: "capture selected canvas",
  });
  assert.equal(missingPoints.ok, false);
  if (!missingPoints.ok) {
    assert.equal(missingPoints.error.code, "MISSING_SELECTION_POINTS");
    assert.equal(missingPoints.error.boundary, "input");
  }

  const denied = planFreeformScreenshot({
    context: {
      runtimeId: "runtime-1",
      permission: { accepted: true },
      requestedScopes: ["tool:computeruse:screen"],
      allowedScopes: ["tool:computeruse:camera"],
    },
    purpose: "capture selected canvas",
    points: [
      { x: 10, y: 10 },
      { x: 110, y: 20 },
      { x: 90, y: 80 },
    ],
  });
  assert.equal(denied.ok, false);
  if (!denied.ok) {
    assert.equal(denied.error.code, "SCOPE_DENIED");
    assert.equal(denied.error.boundary, "scope");
  }

  const realSideEffect = planFreeformScreenshot({
    context: { runtimeId: "runtime-1", dryRun: false, permission: { accepted: true } },
    purpose: "capture selected canvas",
    points: [
      { x: 10, y: 10 },
      { x: 110, y: 20 },
      { x: 90, y: 80 },
    ],
  });
  assert.equal(realSideEffect.ok, false);
  if (!realSideEffect.ok) {
    assert.equal(realSideEffect.error.code, "REAL_SIDE_EFFECT_NOT_ALLOWED");
    assert.equal(realSideEffect.error.boundary, "governance");
  }
});
