import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  cameraStartRecordingDescriptor,
  planCameraStartRecording,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/cameraAccess/computeruse.cameraStartRecording.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/cameraAccess/computeruse.cameraStartRecording.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/cameraAccess/computeruse.cameraStartRecording.md",
  testFileUrl: import.meta.url,
});

test("planCameraStartRecording creates an auditable dry-run plan", () => {
  const result = planCameraStartRecording({
    context: {
      runtimeId: "runtime-1",
      invocationId: "camera-start-1",
      allowedDeviceIds: ["front-camera"],
      requestedScopes: ["tool:computeruse:camera"],
      allowedScopes: ["tool:computeruse:camera"],
    },
    deviceId: "front-camera",
    recordingLabel: "demo",
    destinationHint: "recordings/demo.webm",
    maxDurationMs: 30_000,
    includeAudio: true,
  });

  assert.equal(result.ok, true);
  assert.equal(cameraStartRecordingDescriptor.defaultDispatch, "dry-run");
  if (!result.ok) {
    return;
  }

  assert.equal(result.plan.toolId, "computeruse.cameraStartRecording");
  assert.equal(result.plan.dispatch, "dry-run");
  assert.equal(result.plan.deviceId, "front-camera");
  assert.equal(result.plan.includeAudio, true);
  assert.equal(result.plan.wouldStartRecording, true);
  assert.equal(result.plan.unsafeSideEffects, false);
  assert.deepEqual(result.plan.acceptedScopes, ["tool:computeruse:camera"]);
  assert.equal(result.plan.requiredPermissions.includes("microphone:record"), true);
  assert.equal(result.plan.requiredPermissions.includes("filesystem:write"), true);
});

test("planCameraStartRecording classifies input, scope, and side-effect errors", () => {
  const missing = planCameraStartRecording();
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.error.code, "MISSING_RUNTIME_ID");
    assert.equal(missing.error.boundary, "input");
  }

  const scoped = planCameraStartRecording({
    context: { runtimeId: "runtime-1", allowedDeviceIds: ["front-camera"] },
    deviceId: "rear-camera",
  });
  assert.equal(scoped.ok, false);
  if (!scoped.ok) {
    assert.equal(scoped.error.code, "DEVICE_SCOPE_REJECTED");
    assert.equal(scoped.error.boundary, "scope");
  }

  const realSideEffect = planCameraStartRecording({
    context: { runtimeId: "runtime-1", dryRun: false },
  });
  assert.equal(realSideEffect.ok, false);
  if (!realSideEffect.ok) {
    assert.equal(realSideEffect.error.code, "REAL_SIDE_EFFECT_NOT_ALLOWED");
    assert.equal(realSideEffect.error.boundary, "governance");
  }
});
