import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  planRectangularSelectionScreenshot,
  rectangularSelectionScreenshotDescriptor,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/screenshot/computeruse.rectangularSelectionScreenshot.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/screenshot/computeruse.rectangularSelectionScreenshot.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/screenshot/computeruse.rectangularSelectionScreenshot.md",
  testFileUrl: import.meta.url,
});

test("planRectangularSelectionScreenshot creates a bounded dry-run capture plan", () => {
  const result = planRectangularSelectionScreenshot({
    context: {
      runtimeId: "runtime-1",
      invocationId: "rect-1",
      permission: { accepted: true },
      requestedScopes: ["tool:computeruse:screen"],
      allowedScopes: ["tool:computeruse:screen"],
    },
    displayId: "display-1",
    purpose: "capture selected terminal area",
    rect: { x: 20.2, y: 40.7, width: 800, height: 600 },
    outputFormat: "image/png",
  });

  assert.equal(result.ok, true);
  assert.equal(rectangularSelectionScreenshotDescriptor.defaultDispatch, "dry-run");
  if (!result.ok) {
    return;
  }

  assert.equal(result.plan.toolId, "computeruse.rectangularSelectionScreenshot");
  assert.equal(result.plan.dispatch, "dry-run");
  assert.deepEqual(result.plan.rect, { x: 20, y: 41, width: 800, height: 600 });
  assert.equal(result.plan.wouldCaptureScreen, true);
  assert.equal(result.plan.screenshotCaptured, false);
  assert.equal(result.plan.unsafeSideEffects, false);
  assert.deepEqual(result.plan.acceptedScopes, ["tool:computeruse:screen"]);
});

test("planRectangularSelectionScreenshot classifies rect, resource, and side-effect errors", () => {
  const missingRect = planRectangularSelectionScreenshot({
    context: { runtimeId: "runtime-1", permission: { accepted: true } },
    purpose: "capture selected terminal area",
  });
  assert.equal(missingRect.ok, false);
  if (!missingRect.ok) {
    assert.equal(missingRect.error.code, "MISSING_RECT");
    assert.equal(missingRect.error.boundary, "input");
  }

  const tooLarge = planRectangularSelectionScreenshot({
    context: { runtimeId: "runtime-1", permission: { accepted: true } },
    purpose: "capture selected terminal area",
    rect: { x: 0, y: 0, width: 20_000, height: 20_000 },
  });
  assert.equal(tooLarge.ok, false);
  if (!tooLarge.ok) {
    assert.equal(tooLarge.error.code, "RECT_TOO_LARGE");
    assert.equal(tooLarge.error.boundary, "resource");
  }

  const realSideEffect = planRectangularSelectionScreenshot({
    context: { runtimeId: "runtime-1", dryRun: false, permission: { accepted: true } },
    purpose: "capture selected terminal area",
    rect: { x: 0, y: 0, width: 100, height: 100 },
  });
  assert.equal(realSideEffect.ok, false);
  if (!realSideEffect.ok) {
    assert.equal(realSideEffect.error.code, "REAL_SIDE_EFFECT_NOT_ALLOWED");
    assert.equal(realSideEffect.error.boundary, "governance");
  }
});
