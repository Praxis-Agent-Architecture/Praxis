import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  cameraPermissionRequestDescriptor,
  planCameraPermissionRequest,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/cameraAccess/computeruse.cameraPermissionRequest.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/cameraAccess/computeruse.cameraPermissionRequest.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/cameraAccess/computeruse.cameraPermissionRequest.md",
  testFileUrl: import.meta.url,
});

test("planCameraPermissionRequest creates a dry-run permission request envelope", () => {
  const result = planCameraPermissionRequest({
    runtimeId: " runtime-1 ",
    sessionId: " session-1 ",
    deviceId: " camera-1 ",
    purpose: " visual confirmation ",
    requestedScopes: ["camera:request"],
    allowedScopes: ["camera:request"],
    metadata: { invocationId: "tool-1" },
  });

  assert.equal(cameraPermissionRequestDescriptor.unsafeSideEffects, false);
  if (!result.ok) {
    assert.fail("valid camera permission request must be accepted");
  }

  assert.equal(result.plan.toolName, "computeruse.cameraPermissionRequest");
  assert.equal(result.plan.runtimeId, "runtime-1");
  assert.equal(result.plan.sessionId, "session-1");
  assert.equal(result.plan.target.deviceId, "camera-1");
  assert.equal(result.plan.target.purpose, "visual confirmation");
  assert.equal(result.plan.requiredPermission, "camera:access");
  assert.equal(result.plan.execution.dryRun, true);
  assert.equal(result.plan.execution.permissionRequested, true);
  assert.equal(result.plan.execution.permissionGranted, false);
  assert.equal(result.plan.execution.realCameraTouched, false);
  assert.equal(result.plan.audit.event, "basicTool.computeruse.cameraPermissionRequest.planned");
});

test("planCameraPermissionRequest rejects missing purpose and real permission requests", () => {
  const missingPurpose = planCameraPermissionRequest({
    runtimeId: "runtime-1",
  });
  assert.equal(missingPurpose.ok, false);
  if (missingPurpose.ok) {
    assert.fail("missing purpose must be rejected");
  }
  assert.equal(missingPurpose.error.code, "MISSING_PERMISSION_PURPOSE");
  assert.equal(missingPurpose.error.boundary, "input");

  const realRequest = planCameraPermissionRequest({
    runtimeId: "runtime-1",
    purpose: "camera access",
    dryRun: false,
  });
  assert.equal(realRequest.ok, false);
  if (realRequest.ok) {
    assert.fail("real camera permission request must be rejected");
  }
  assert.equal(realRequest.error.code, "REAL_CAMERA_PERMISSION_REQUEST_NOT_ALLOWED");
  assert.equal(realRequest.error.boundary, "governance");
});

test("planCameraPermissionRequest rejects contract denial and scope denial", () => {
  const contractDenied = planCameraPermissionRequest({
    runtimeId: "runtime-1",
    purpose: "camera access",
    contract: { accepted: false, reason: "runtime contract denied camera access" },
  });
  assert.equal(contractDenied.ok, false);
  if (contractDenied.ok) {
    assert.fail("contract denial must be rejected");
  }
  assert.equal(contractDenied.error.code, "CONTRACT_REJECTED");
  assert.equal(contractDenied.error.message, "runtime contract denied camera access");

  const scopeDenied = planCameraPermissionRequest({
    runtimeId: "runtime-1",
    purpose: "camera access",
    requestedScopes: ["camera:request"],
    allowedScopes: [],
  });
  assert.equal(scopeDenied.ok, false);
  if (scopeDenied.ok) {
    assert.fail("scope denial must be rejected");
  }
  assert.equal(scopeDenied.error.code, "SCOPE_DENIED");
  assert.equal(scopeDenied.error.boundary, "scope");
});
