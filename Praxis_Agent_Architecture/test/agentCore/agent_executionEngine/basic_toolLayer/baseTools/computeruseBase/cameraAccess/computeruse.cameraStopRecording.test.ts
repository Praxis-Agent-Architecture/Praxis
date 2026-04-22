import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  cameraStopRecordingDescriptor,
  planCameraStopRecording,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/cameraAccess/computeruse.cameraStopRecording.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/cameraAccess/computeruse.cameraStopRecording.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/cameraAccess/computeruse.cameraStopRecording.md",
  testFileUrl: import.meta.url,
});

test("planCameraStopRecording creates an auditable dry-run stop plan", () => {
  const result = planCameraStopRecording({
    context: {
      runtimeId: "runtime-1",
      invocationId: "camera-stop-1",
      requestedScopes: ["tool:computeruse:camera"],
      allowedScopes: ["tool:computeruse:camera"],
    },
    recordingId: "camera-recording:runtime-1:camera-start-1:front-camera",
    deviceId: "front-camera",
    persistHint: "recordings/demo.webm",
  });

  assert.equal(result.ok, true);
  assert.equal(cameraStopRecordingDescriptor.defaultDispatch, "dry-run");
  if (!result.ok) {
    return;
  }

  assert.equal(result.plan.toolId, "computeruse.cameraStopRecording");
  assert.equal(result.plan.recordingId, "camera-recording:runtime-1:camera-start-1:front-camera");
  assert.equal(result.plan.dispatch, "dry-run");
  assert.equal(result.plan.wouldStopRecording, true);
  assert.equal(result.plan.wouldReleaseCamera, true);
  assert.equal(result.plan.unsafeSideEffects, false);
  assert.equal(result.plan.requiredPermissions.includes("filesystem:write"), true);
});

test("planCameraStopRecording classifies input, governance, scope, and side-effect errors", () => {
  const missingRuntime = planCameraStopRecording({ recordingId: "rec-1" });
  assert.equal(missingRuntime.ok, false);
  if (!missingRuntime.ok) {
    assert.equal(missingRuntime.error.code, "MISSING_RUNTIME_ID");
    assert.equal(missingRuntime.error.boundary, "input");
  }

  const missingRecording = planCameraStopRecording({ context: { runtimeId: "runtime-1" } });
  assert.equal(missingRecording.ok, false);
  if (!missingRecording.ok) {
    assert.equal(missingRecording.error.code, "MISSING_RECORDING_ID");
    assert.equal(missingRecording.error.boundary, "input");
  }

  const deniedScope = planCameraStopRecording({
    context: {
      runtimeId: "runtime-1",
      requestedScopes: ["tool:computeruse:camera"],
      allowedScopes: ["tool:computeruse:keyboard"],
    },
    recordingId: "rec-1",
  });
  assert.equal(deniedScope.ok, false);
  if (!deniedScope.ok) {
    assert.equal(deniedScope.error.code, "SCOPE_DENIED");
    assert.equal(deniedScope.error.boundary, "scope");
  }

  const realSideEffect = planCameraStopRecording({
    context: { runtimeId: "runtime-1", dryRun: false },
    recordingId: "rec-1",
  });
  assert.equal(realSideEffect.ok, false);
  if (!realSideEffect.ok) {
    assert.equal(realSideEffect.error.code, "REAL_SIDE_EFFECT_NOT_ALLOWED");
    assert.equal(realSideEffect.error.boundary, "governance");
  }
});
