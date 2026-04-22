import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  fullscreenScreenRecordingDescriptor,
  planFullscreenScreenRecording,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/screenRecording/computeruse.fullscreenScreenRecording.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/screenRecording/computeruse.fullscreenScreenRecording.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/screenRecording/computeruse.fullscreenScreenRecording.md",
  testFileUrl: import.meta.url,
});

test("planFullscreenScreenRecording creates a governed dry-run recording envelope", () => {
  const result = planFullscreenScreenRecording({
    context: {
      runtimeId: "runtime-1",
      invocationId: "record-fullscreen-1",
      requestedScopes: ["tool:computeruse:screen"],
      allowedScopes: ["tool:computeruse:screen"],
      auditMetadata: { surface: "agentCore-review" },
    },
    permission: { accepted: true },
    displayId: "display-1",
    destinationHint: "session://recordings/fullscreen.webm",
    maxDurationMs: 5_000,
    includeAudio: true,
    metadata: { fileTask: "AC-F-0066" },
  });

  assert.equal(result.ok, true);
  assert.equal(fullscreenScreenRecordingDescriptor.defaultDispatch, "dry-run");
  if (!result.ok) {
    return;
  }

  assert.equal(result.plan.toolId, "computeruse.fullscreenScreenRecording");
  assert.equal(result.plan.displayId, "display-1");
  assert.equal(result.plan.maxDurationMs, 5_000);
  assert.equal(result.plan.includeCursor, true);
  assert.equal(result.plan.includeAudio, true);
  assert.deepEqual(result.plan.requiredPermissions, ["screen:record", "microphone:record", "filesystem:write"]);
  assert.equal(result.plan.dryRun, true);
  assert.equal(result.plan.wouldStartRecording, true);
  assert.equal(result.plan.unsafeSideEffects, false);
  assert.equal(result.plan.audit.privacyReviewRequired, true);
  assert.deepEqual(result.events, ["basicTool.computeruse.fullscreenScreenRecording.planned"]);
});

test("planFullscreenScreenRecording classifies permission, scope, and side-effect errors", () => {
  const missingRuntime = planFullscreenScreenRecording();
  assert.equal(missingRuntime.ok, false);
  if (!missingRuntime.ok) {
    assert.equal(missingRuntime.error.code, "MISSING_RUNTIME_ID");
    assert.equal(missingRuntime.error.boundary, "input");
  }

  const missingPermission = planFullscreenScreenRecording({ context: { runtimeId: "runtime-1" } });
  assert.equal(missingPermission.ok, false);
  if (!missingPermission.ok) {
    assert.equal(missingPermission.error.code, "PERMISSION_REQUIRED");
    assert.equal(missingPermission.error.boundary, "permission");
  }

  const deniedScope = planFullscreenScreenRecording({
    context: {
      runtimeId: "runtime-1",
      requestedScopes: ["tool:computeruse:screen"],
      allowedScopes: ["tool:computeruse:mouse"],
    },
    permission: { accepted: true },
  });
  assert.equal(deniedScope.ok, false);
  if (!deniedScope.ok) {
    assert.equal(deniedScope.error.code, "SCOPE_DENIED");
    assert.equal(deniedScope.error.boundary, "scope");
  }

  const realSideEffect = planFullscreenScreenRecording({
    context: { runtimeId: "runtime-1", dryRun: false },
    permission: { accepted: true },
  });
  assert.equal(realSideEffect.ok, false);
  if (!realSideEffect.ok) {
    assert.equal(realSideEffect.error.code, "REAL_SIDE_EFFECT_NOT_ALLOWED");
    assert.equal(realSideEffect.error.boundary, "governance");
  }
});
