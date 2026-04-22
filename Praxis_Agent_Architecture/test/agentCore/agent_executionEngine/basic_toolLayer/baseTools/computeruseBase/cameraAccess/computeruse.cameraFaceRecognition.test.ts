import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  cameraFaceRecognitionDescriptor,
  planCameraFaceRecognition,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/cameraAccess/computeruse.cameraFaceRecognition.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/cameraAccess/computeruse.cameraFaceRecognition.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/cameraAccess/computeruse.cameraFaceRecognition.md",
  testFileUrl: import.meta.url,
});

test("planCameraFaceRecognition creates a dry-run face detection envelope", () => {
  const result = planCameraFaceRecognition({
    runtimeId: " runtime-1 ",
    sessionId: " session-1 ",
    frameRef: " frame-1 ",
    deviceId: " camera-1 ",
    mode: "detect-faces",
    maxFaces: 8,
    requestedScopes: ["camera:read"],
    allowedScopes: ["camera:read"],
  });

  assert.equal(cameraFaceRecognitionDescriptor.unsafeSideEffects, false);
  if (!result.ok) {
    assert.fail("valid face detection request must be accepted");
  }

  assert.equal(result.plan.toolName, "computeruse.cameraFaceRecognition");
  assert.equal(result.plan.runtimeId, "runtime-1");
  assert.equal(result.plan.sessionId, "session-1");
  assert.equal(result.plan.target.frameRef, "frame-1");
  assert.equal(result.plan.target.deviceId, "camera-1");
  assert.equal(result.plan.target.mode, "detect-faces");
  assert.equal(result.plan.target.maxFaces, 8);
  assert.equal(result.plan.requiredPermission, "camera:read");
  assert.equal(result.plan.execution.dryRun, true);
  assert.equal(result.plan.execution.recognitionPlanned, true);
  assert.equal(result.plan.execution.recognitionPerformed, false);
  assert.equal(result.plan.execution.identityResolved, false);
  assert.equal(result.plan.execution.faceDataStored, false);
  assert.equal(result.plan.execution.realCameraTouched, false);
});

test("planCameraFaceRecognition rejects missing frame and invalid face limits", () => {
  const missingFrame = planCameraFaceRecognition({
    runtimeId: "runtime-1",
  });
  assert.equal(missingFrame.ok, false);
  if (missingFrame.ok) {
    assert.fail("missing frameRef must be rejected");
  }
  assert.equal(missingFrame.error.code, "MISSING_FRAME_REF");
  assert.equal(missingFrame.error.boundary, "input");

  const invalidFrame = planCameraFaceRecognition({
    runtimeId: "runtime-1",
    frameRef: "frame\0ref",
  });
  assert.equal(invalidFrame.ok, false);
  if (invalidFrame.ok) {
    assert.fail("invalid frameRef must be rejected");
  }
  assert.equal(invalidFrame.error.code, "INVALID_FRAME_REF");
  assert.equal(invalidFrame.error.boundary, "input");

  const invalidLimit = planCameraFaceRecognition({
    runtimeId: "runtime-1",
    frameRef: "frame-1",
    maxFaces: 0,
  });
  assert.equal(invalidLimit.ok, false);
  if (invalidLimit.ok) {
    assert.fail("invalid face limit must be rejected");
  }
  assert.equal(invalidLimit.error.code, "INVALID_FACE_LIMIT");
});

test("planCameraFaceRecognition rejects identity recognition without consent and real execution", () => {
  const missingConsent = planCameraFaceRecognition({
    runtimeId: "runtime-1",
    frameRef: "frame-1",
    mode: "identify-consented-face",
  });
  assert.equal(missingConsent.ok, false);
  if (missingConsent.ok) {
    assert.fail("identity recognition without consent must be rejected");
  }
  assert.equal(missingConsent.error.code, "BIOMETRIC_CONSENT_REQUIRED");
  assert.equal(missingConsent.error.boundary, "governance");

  const realRecognition = planCameraFaceRecognition({
    runtimeId: "runtime-1",
    frameRef: "frame-1",
    dryRun: false,
  });
  assert.equal(realRecognition.ok, false);
  if (realRecognition.ok) {
    assert.fail("real face recognition must be rejected");
  }
  assert.equal(realRecognition.error.code, "REAL_FACE_RECOGNITION_NOT_ALLOWED");
  assert.equal(realRecognition.error.boundary, "governance");
});

test("planCameraFaceRecognition accepts consented identity planning but still stores no biometric data", () => {
  const result = planCameraFaceRecognition({
    runtimeId: "runtime-1",
    frameRef: "frame-1",
    mode: "verify-consented-face",
    subjectConsent: { accepted: true },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("consented identity-level planning must be accepted");
  }
  assert.equal(result.plan.target.mode, "verify-consented-face");
  assert.equal(result.plan.execution.identityResolved, false);
  assert.equal(result.plan.execution.faceDataStored, false);
});
