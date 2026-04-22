import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  planRectangularSelectionScreenRecording,
  rectangularSelectionScreenRecordingDescriptor,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/screenRecording/computeruse.rectangularSelectionScreenRecording.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/screenRecording/computeruse.rectangularSelectionScreenRecording.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/screenRecording/computeruse.rectangularSelectionScreenRecording.md",
  testFileUrl: import.meta.url,
});

test("planRectangularSelectionScreenRecording creates a bounded dry-run recording envelope", () => {
  const result = planRectangularSelectionScreenRecording({
    context: {
      runtimeId: "runtime-1",
      invocationId: "record-rect-1",
      requestedScopes: ["tool:computeruse:screen"],
      allowedScopes: ["tool:computeruse:screen"],
    },
    permission: { accepted: true },
    displayId: "display-1",
    rectangle: { x: 10, y: 20, width: 640, height: 360 },
    maxDurationMs: 10_000,
    includeCursor: false,
  });

  assert.equal(result.ok, true);
  assert.equal(rectangularSelectionScreenRecordingDescriptor.defaultDispatch, "dry-run");
  if (!result.ok) {
    return;
  }

  assert.equal(result.plan.toolId, "computeruse.rectangularSelectionScreenRecording");
  assert.deepEqual(result.plan.rectangle, { x: 10, y: 20, width: 640, height: 360 });
  assert.equal(result.plan.maxDurationMs, 10_000);
  assert.equal(result.plan.includeCursor, false);
  assert.equal(result.plan.includeAudio, false);
  assert.deepEqual(result.plan.requiredPermissions, ["screen:record"]);
  assert.equal(result.plan.dryRun, true);
  assert.equal(result.plan.wouldStartRecording, true);
  assert.equal(result.plan.unsafeSideEffects, false);
  assert.equal(result.plan.audit.privacyReviewRequired, true);
  assert.deepEqual(result.events, ["basicTool.computeruse.rectangularSelectionScreenRecording.planned"]);
});

test("planRectangularSelectionScreenRecording classifies rectangle, scope, and side-effect errors", () => {
  const missingRuntime = planRectangularSelectionScreenRecording();
  assert.equal(missingRuntime.ok, false);
  if (!missingRuntime.ok) {
    assert.equal(missingRuntime.error.code, "MISSING_RUNTIME_ID");
    assert.equal(missingRuntime.error.boundary, "input");
  }

  const missingRectangle = planRectangularSelectionScreenRecording({
    context: { runtimeId: "runtime-1" },
    permission: { accepted: true },
  });
  assert.equal(missingRectangle.ok, false);
  if (!missingRectangle.ok) {
    assert.equal(missingRectangle.error.code, "MISSING_RECTANGLE");
    assert.equal(missingRectangle.error.boundary, "input");
  }

  const deniedScope = planRectangularSelectionScreenRecording({
    context: {
      runtimeId: "runtime-1",
      requestedScopes: ["tool:computeruse:screen"],
      allowedScopes: ["tool:computeruse:keyboard"],
    },
    permission: { accepted: true },
    rectangle: { x: 0, y: 0, width: 800, height: 600 },
  });
  assert.equal(deniedScope.ok, false);
  if (!deniedScope.ok) {
    assert.equal(deniedScope.error.code, "SCOPE_DENIED");
    assert.equal(deniedScope.error.boundary, "scope");
  }

  const realSideEffect = planRectangularSelectionScreenRecording({
    context: { runtimeId: "runtime-1", dryRun: false },
    permission: { accepted: true },
    rectangle: { x: 0, y: 0, width: 800, height: 600 },
  });
  assert.equal(realSideEffect.ok, false);
  if (!realSideEffect.ok) {
    assert.equal(realSideEffect.error.code, "REAL_SIDE_EFFECT_NOT_ALLOWED");
    assert.equal(realSideEffect.error.boundary, "governance");
  }
});
