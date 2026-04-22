import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  planScreenRecordingStorage,
  screenRecordingStorageDescriptor,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/screenRecording/computeruse.screenRecordingStorage.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/screenRecording/computeruse.screenRecordingStorage.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/screenRecording/computeruse.screenRecordingStorage.md",
  testFileUrl: import.meta.url,
});

test("planScreenRecordingStorage creates a governed dry-run storage envelope", () => {
  const result = planScreenRecordingStorage({
    runtimeId: "runtime-1",
    invocationId: "store-recording-1",
    recordingRef: "screen-recording:runtime-1:record-1",
    storageTarget: "session://recordings/record-1.webm",
    retentionPolicy: "session-scoped",
    purpose: "review playback",
    requestedScopes: ["tool:computeruse:screen-recording-storage"],
    allowedScopes: ["tool:computeruse:screen-recording-storage"],
    permission: { accepted: true },
  });

  assert.equal(result.ok, true);
  assert.equal(screenRecordingStorageDescriptor.defaultRetentionPolicy, "session-scoped");
  if (!result.ok) {
    return;
  }

  assert.equal(result.plan.toolKind, "computeruse.screenRecordingStorage");
  assert.equal(result.plan.recordingRef, "screen-recording:runtime-1:record-1");
  assert.equal(result.plan.storageTarget, "session://recordings/record-1.webm");
  assert.equal(result.plan.purpose, "review playback");
  assert.deepEqual(result.plan.permissions, ["screen:record:read:dry-run", "storage:write:dry-run"]);
  assert.equal(result.plan.execution.dryRun, true);
  assert.equal(result.plan.execution.recordingStored, false);
  assert.equal(result.plan.execution.unsafeSideEffects, false);
  assert.equal(result.plan.audit.privacyReviewRequired, true);
  assert.deepEqual(result.events, ["basicTool.computeruse.screenRecordingStorage.planned"]);
});

test("planScreenRecordingStorage classifies input, permission, contract, and scope errors", () => {
  const missingRuntime = planScreenRecordingStorage();
  assert.equal(missingRuntime.ok, false);
  if (!missingRuntime.ok) {
    assert.equal(missingRuntime.error.code, "MISSING_RUNTIME_ID");
    assert.equal(missingRuntime.error.boundary, "input");
  }

  const missingPermission = planScreenRecordingStorage({
    runtimeId: "runtime-1",
    recordingRef: "screen-recording:1",
    storageTarget: "session://recordings/1.webm",
    purpose: "review playback",
  });
  assert.equal(missingPermission.ok, false);
  if (!missingPermission.ok) {
    assert.equal(missingPermission.error.code, "PERMISSION_REQUIRED");
    assert.equal(missingPermission.error.boundary, "permission");
  }

  const contractRejected = planScreenRecordingStorage({
    runtimeId: "runtime-1",
    recordingRef: "screen-recording:1",
    storageTarget: "session://recordings/1.webm",
    purpose: "review playback",
    permission: { accepted: true },
    contract: { accepted: false, reason: "contract gate rejected" },
  });
  assert.equal(contractRejected.ok, false);
  if (!contractRejected.ok) {
    assert.equal(contractRejected.error.code, "CONTRACT_REJECTED");
    assert.equal(contractRejected.error.boundary, "contract");
  }

  const deniedScope = planScreenRecordingStorage({
    runtimeId: "runtime-1",
    recordingRef: "screen-recording:1",
    storageTarget: "session://recordings/1.webm",
    purpose: "review playback",
    requestedScopes: ["tool:computeruse:screen-recording-storage"],
    allowedScopes: ["tool:computeruse:camera-storage"],
    permission: { accepted: true },
  });
  assert.equal(deniedScope.ok, false);
  if (!deniedScope.ok) {
    assert.equal(deniedScope.error.code, "SCOPE_DENIED");
    assert.equal(deniedScope.error.boundary, "scope");
  }

  const realSideEffect = planScreenRecordingStorage({
    runtimeId: "runtime-1",
    recordingRef: "screen-recording:1",
    storageTarget: "session://recordings/1.webm",
    purpose: "review playback",
    dryRun: false,
    permission: { accepted: true },
  });
  assert.equal(realSideEffect.ok, false);
  if (!realSideEffect.ok) {
    assert.equal(realSideEffect.error.code, "REAL_SIDE_EFFECT_NOT_ALLOWED");
    assert.equal(realSideEffect.error.boundary, "governance");
  }
});
