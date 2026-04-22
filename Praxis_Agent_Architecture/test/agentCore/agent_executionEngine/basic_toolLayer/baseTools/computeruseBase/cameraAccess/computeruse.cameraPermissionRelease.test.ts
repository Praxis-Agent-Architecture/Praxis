import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  cameraPermissionReleaseDescriptor,
  planCameraPermissionRelease,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/cameraAccess/computeruse.cameraPermissionRelease.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/cameraAccess/computeruse.cameraPermissionRelease.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/cameraAccess/computeruse.cameraPermissionRelease.md",
  testFileUrl: import.meta.url,
});

test("planCameraPermissionRelease creates a dry-run release envelope", () => {
  const result = planCameraPermissionRelease({
    runtimeId: " runtime-1 ",
    sessionId: " session-1 ",
    permissionToken: " camera-lease-1 ",
    deviceId: " camera-1 ",
    reason: " finished camera task ",
    requestedScopes: ["camera:release"],
    allowedScopes: ["camera:release"],
  });

  assert.equal(cameraPermissionReleaseDescriptor.unsafeSideEffects, false);
  if (!result.ok) {
    assert.fail("valid camera permission release must be accepted");
  }

  assert.equal(result.plan.toolName, "computeruse.cameraPermissionRelease");
  assert.equal(result.plan.runtimeId, "runtime-1");
  assert.equal(result.plan.target.permissionToken, "camera-lease-1");
  assert.equal(result.plan.target.deviceId, "camera-1");
  assert.equal(result.plan.target.reason, "finished camera task");
  assert.equal(result.plan.requiredPermission, "camera:release");
  assert.equal(result.plan.requiresTapApproval, false);
  assert.equal(result.plan.execution.dryRun, true);
  assert.equal(result.plan.execution.permissionReleasePlanned, true);
  assert.equal(result.plan.execution.permissionReleased, false);
  assert.equal(result.plan.execution.realCameraTouched, false);
});

test("planCameraPermissionRelease rejects missing token and real release attempts", () => {
  const missingToken = planCameraPermissionRelease({
    runtimeId: "runtime-1",
  });
  assert.equal(missingToken.ok, false);
  if (missingToken.ok) {
    assert.fail("missing permission token must be rejected");
  }
  assert.equal(missingToken.error.code, "MISSING_PERMISSION_TOKEN");
  assert.equal(missingToken.error.boundary, "input");

  const realRelease = planCameraPermissionRelease({
    runtimeId: "runtime-1",
    permissionToken: "lease-1",
    dryRun: false,
  });
  assert.equal(realRelease.ok, false);
  if (realRelease.ok) {
    assert.fail("real camera permission release must be rejected");
  }
  assert.equal(realRelease.error.code, "REAL_CAMERA_PERMISSION_RELEASE_NOT_ALLOWED");
  assert.equal(realRelease.error.boundary, "governance");
});

test("planCameraPermissionRelease rejects governance denial and scope denial", () => {
  const governanceDenied = planCameraPermissionRelease({
    runtimeId: "runtime-1",
    permissionToken: "lease-1",
    governance: { accepted: false, reason: "camera release denied by policy" },
  });
  assert.equal(governanceDenied.ok, false);
  if (governanceDenied.ok) {
    assert.fail("governance denial must be rejected");
  }
  assert.equal(governanceDenied.error.code, "GOVERNANCE_REJECTED");
  assert.equal(governanceDenied.error.message, "camera release denied by policy");

  const scopeDenied = planCameraPermissionRelease({
    runtimeId: "runtime-1",
    permissionToken: "lease-1",
    requestedScopes: ["camera:release"],
    allowedScopes: [],
  });
  assert.equal(scopeDenied.ok, false);
  if (scopeDenied.ok) {
    assert.fail("scope denial must be rejected");
  }
  assert.equal(scopeDenied.error.code, "SCOPE_DENIED");
  assert.equal(scopeDenied.error.boundary, "scope");
});
