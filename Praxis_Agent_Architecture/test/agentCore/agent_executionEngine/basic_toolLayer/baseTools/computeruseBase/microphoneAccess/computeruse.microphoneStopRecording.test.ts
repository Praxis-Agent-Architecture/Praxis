import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  microphoneStopRecordingDescriptor,
  planMicrophoneStopRecording,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/microphoneAccess/computeruse.microphoneStopRecording.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/microphoneAccess/computeruse.microphoneStopRecording.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/microphoneAccess/computeruse.microphoneStopRecording.md",
  testFileUrl: import.meta.url,
});

test("planMicrophoneStopRecording creates an auditable dry-run stop plan", () => {
  const result = planMicrophoneStopRecording({
    context: {
      runtimeId: "runtime-1",
      invocationId: "microphone-stop-1",
      requestedScopes: ["tool:computeruse:microphone"],
      allowedScopes: ["tool:computeruse:microphone"],
    },
    recordingId: "microphone-recording-1",
    deviceId: "studio-mic",
    persistHint: "recordings/demo.wav",
  });

  assert.equal(result.ok, true);
  assert.equal(microphoneStopRecordingDescriptor.defaultDispatch, "dry-run");
  if (!result.ok) {
    return;
  }

  assert.equal(result.plan.toolId, "computeruse.microphoneStopRecording");
  assert.equal(result.plan.dispatch, "dry-run");
  assert.equal(result.plan.recordingId, "microphone-recording-1");
  assert.equal(result.plan.deviceId, "studio-mic");
  assert.equal(result.plan.wouldStopRecording, true);
  assert.equal(result.plan.wouldReleaseMicrophone, true);
  assert.equal(result.plan.unsafeSideEffects, false);
  assert.deepEqual(result.plan.acceptedScopes, ["tool:computeruse:microphone"]);
  assert.equal(result.plan.requiredPermissions.includes("filesystem:write"), true);
});

test("planMicrophoneStopRecording classifies input, scope, and side-effect errors", () => {
  const missingRuntime = planMicrophoneStopRecording({ recordingId: "recording-1" });
  assert.equal(missingRuntime.ok, false);
  if (!missingRuntime.ok) {
    assert.equal(missingRuntime.error.code, "MISSING_RUNTIME_ID");
    assert.equal(missingRuntime.error.boundary, "input");
  }

  const missingRecording = planMicrophoneStopRecording({
    context: { runtimeId: "runtime-1" },
  });
  assert.equal(missingRecording.ok, false);
  if (!missingRecording.ok) {
    assert.equal(missingRecording.error.code, "MISSING_RECORDING_ID");
    assert.equal(missingRecording.error.boundary, "input");
  }

  const denied = planMicrophoneStopRecording({
    context: {
      runtimeId: "runtime-1",
      requestedScopes: ["tool:computeruse:microphone"],
      allowedScopes: [],
    },
    recordingId: "recording-1",
  });
  assert.equal(denied.ok, false);
  if (!denied.ok) {
    assert.equal(denied.error.code, "SCOPE_DENIED");
    assert.equal(denied.error.boundary, "scope");
  }

  const realSideEffect = planMicrophoneStopRecording({
    context: { runtimeId: "runtime-1", dryRun: false },
    recordingId: "recording-1",
  });
  assert.equal(realSideEffect.ok, false);
  if (!realSideEffect.ok) {
    assert.equal(realSideEffect.error.code, "REAL_SIDE_EFFECT_NOT_ALLOWED");
    assert.equal(realSideEffect.error.boundary, "governance");
  }
});
