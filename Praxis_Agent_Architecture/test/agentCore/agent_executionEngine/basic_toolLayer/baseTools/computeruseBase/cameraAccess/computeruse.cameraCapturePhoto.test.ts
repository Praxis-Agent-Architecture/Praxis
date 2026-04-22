import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import {
  cameraCapturePhotoDescriptor,
  planCameraCapturePhoto,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/cameraAccess/computeruse.cameraCapturePhoto.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/cameraAccess/computeruse.cameraCapturePhoto.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/cameraAccess/computeruse.cameraCapturePhoto.md",
  testFileUrl: import.meta.url,
});

test("planCameraCapturePhoto creates a privacy guarded dry-run capture envelope", () => {
  const result = planCameraCapturePhoto({
    runtimeId: "runtime-1",
    cameraId: "front-camera",
    purpose: "visual debug snapshot",
    outputFormat: "image/png",
    permission: { accepted: true },
    requestedScopes: ["tool:computeruse.camera"],
    allowedScopes: ["tool:computeruse.camera"],
  });

  if (!result.ok) {
    assert.fail(result.error.message);
  }

  assert.equal(cameraCapturePhotoDescriptor.unsafeSideEffects, false);
  assert.equal(result.plan.toolKind, "computeruse.cameraCapturePhoto");
  assert.equal(result.plan.cameraId, "front-camera");
  assert.equal(result.plan.outputFormat, "image/png");
  assert.deepEqual(result.plan.permissions, ["camera:read:dry-run"]);
  assert.equal(result.plan.execution.dryRun, true);
  assert.equal(result.plan.execution.photoCaptured, false);
  assert.equal(result.plan.audit.privacyReviewRequired, true);
  assert.deepEqual(result.events, ["basicTool.computeruse.cameraCapturePhoto.planned"]);
});

test("planCameraCapturePhoto rejects missing runtime context", () => {
  const result = planCameraCapturePhoto();

  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("empty input must be rejected");
  }

  assert.equal(result.error.code, "MISSING_RUNTIME_ID");
  assert.equal(result.error.boundary, "input");
  assert.equal(result.error.safeForRuntimeInspection, true);
});

test("planCameraCapturePhoto requires an explicit permission gate", () => {
  const result = planCameraCapturePhoto({
    runtimeId: "runtime-1",
    cameraId: "front-camera",
    purpose: "visual debug snapshot",
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("camera capture without permission must be rejected");
  }

  assert.equal(result.error.code, "PERMISSION_REQUIRED");
  assert.equal(result.error.boundary, "permission");
  assert.deepEqual(result.events, ["basicTool.computeruse.cameraCapturePhoto.rejected"]);
});
