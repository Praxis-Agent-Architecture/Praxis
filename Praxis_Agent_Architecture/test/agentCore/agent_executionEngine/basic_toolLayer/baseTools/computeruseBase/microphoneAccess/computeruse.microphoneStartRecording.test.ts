import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  microphoneStartRecordingDescriptor,
  planMicrophoneStartRecording,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/microphoneAccess/computeruse.microphoneStartRecording.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/microphoneAccess/computeruse.microphoneStartRecording.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/microphoneAccess/computeruse.microphoneStartRecording.md",
  testFileUrl: import.meta.url,
});

test("planMicrophoneStartRecording creates an auditable dry-run plan", () => {
  const result = planMicrophoneStartRecording({
    context: {
      runtimeId: "runtime-1",
      invocationId: "microphone-start-1",
      allowedDeviceIds: ["studio-mic"],
      requestedScopes: ["tool:computeruse:microphone"],
      allowedScopes: ["tool:computeruse:microphone"],
    },
    deviceId: "studio-mic",
    recordingLabel: "demo",
    destinationHint: "recordings/demo.wav",
    maxDurationMs: 30_000,
    sampleRateHz: 44_100,
    channelCount: 2,
  });

  assert.equal(result.ok, true);
  assert.equal(microphoneStartRecordingDescriptor.defaultDispatch, "dry-run");
  if (!result.ok) {
    return;
  }

  assert.equal(result.plan.toolId, "computeruse.microphoneStartRecording");
  assert.equal(result.plan.dispatch, "dry-run");
  assert.equal(result.plan.deviceId, "studio-mic");
  assert.equal(result.plan.sampleRateHz, 44_100);
  assert.equal(result.plan.channelCount, 2);
  assert.equal(result.plan.wouldStartRecording, true);
  assert.equal(result.plan.unsafeSideEffects, false);
  assert.deepEqual(result.plan.acceptedScopes, ["tool:computeruse:microphone"]);
  assert.equal(result.plan.requiredPermissions.includes("microphone:record"), true);
  assert.equal(result.plan.requiredPermissions.includes("filesystem:write"), true);
});

test("planMicrophoneStartRecording classifies input, scope, resource, and side-effect errors", () => {
  const missing = planMicrophoneStartRecording();
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.error.code, "MISSING_RUNTIME_ID");
    assert.equal(missing.error.boundary, "input");
  }

  const scoped = planMicrophoneStartRecording({
    context: { runtimeId: "runtime-1", allowedDeviceIds: ["studio-mic"] },
    deviceId: "laptop-mic",
  });
  assert.equal(scoped.ok, false);
  if (!scoped.ok) {
    assert.equal(scoped.error.code, "DEVICE_SCOPE_REJECTED");
    assert.equal(scoped.error.boundary, "scope");
  }

  const invalidDuration = planMicrophoneStartRecording({
    context: { runtimeId: "runtime-1" },
    maxDurationMs: 0,
  });
  assert.equal(invalidDuration.ok, false);
  if (!invalidDuration.ok) {
    assert.equal(invalidDuration.error.code, "INVALID_MAX_DURATION");
    assert.equal(invalidDuration.error.boundary, "resource");
  }

  const realSideEffect = planMicrophoneStartRecording({
    context: { runtimeId: "runtime-1", dryRun: false },
  });
  assert.equal(realSideEffect.ok, false);
  if (!realSideEffect.ok) {
    assert.equal(realSideEffect.error.code, "REAL_SIDE_EFFECT_NOT_ALLOWED");
    assert.equal(realSideEffect.error.boundary, "governance");
  }
});
