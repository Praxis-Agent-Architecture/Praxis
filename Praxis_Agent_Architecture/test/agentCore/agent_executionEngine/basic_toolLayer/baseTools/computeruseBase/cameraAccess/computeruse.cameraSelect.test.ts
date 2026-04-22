import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  cameraSelectDescriptor,
  planCameraSelect,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/cameraAccess/computeruse.cameraSelect.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/cameraAccess/computeruse.cameraSelect.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/cameraAccess/computeruse.cameraSelect.md",
  testFileUrl: import.meta.url,
});

test("planCameraSelect creates a dry-run camera selection envelope", () => {
  const result = planCameraSelect({
    runtimeId: " runtime-1 ",
    sessionId: " session-1 ",
    deviceId: " camera-2 ",
    availableDevices: [
      { id: " camera-1 ", label: "Integrated Camera", kind: "integrated" },
      { id: " camera-2 ", label: "USB Camera", kind: "usb" },
    ],
    requestedScopes: ["camera:select"],
    allowedScopes: ["camera:select"],
  });

  assert.equal(cameraSelectDescriptor.unsafeSideEffects, false);
  if (!result.ok) {
    assert.fail("valid camera selection must be accepted");
  }

  assert.equal(result.plan.toolName, "computeruse.cameraSelect");
  assert.equal(result.plan.runtimeId, "runtime-1");
  assert.equal(result.plan.sessionId, "session-1");
  assert.equal(result.plan.target.deviceId, "camera-2");
  assert.equal(result.plan.target.availableDeviceCount, 2);
  assert.equal(result.plan.requiredPermission, "camera:select");
  assert.equal(result.plan.execution.dryRun, true);
  assert.equal(result.plan.execution.cameraSelectionPlanned, true);
  assert.equal(result.plan.execution.cameraSelected, false);
  assert.equal(result.plan.execution.realCameraTouched, false);
});

test("planCameraSelect rejects missing devices and unavailable devices", () => {
  const missingDevice = planCameraSelect({
    runtimeId: "runtime-1",
  });
  assert.equal(missingDevice.ok, false);
  if (missingDevice.ok) {
    assert.fail("missing device must be rejected");
  }
  assert.equal(missingDevice.error.code, "MISSING_CAMERA_DEVICE");
  assert.equal(missingDevice.error.boundary, "input");

  const invalidDevice = planCameraSelect({
    runtimeId: "runtime-1",
    deviceId: "camera\0device",
  });
  assert.equal(invalidDevice.ok, false);
  if (invalidDevice.ok) {
    assert.fail("invalid target device must be rejected");
  }
  assert.equal(invalidDevice.error.code, "INVALID_CAMERA_DEVICE");
  assert.equal(invalidDevice.error.boundary, "input");

  const unavailableDevice = planCameraSelect({
    runtimeId: "runtime-1",
    deviceId: "camera-3",
    availableDevices: [{ id: "camera-1" }],
  });
  assert.equal(unavailableDevice.ok, false);
  if (unavailableDevice.ok) {
    assert.fail("unavailable device must be rejected");
  }
  assert.equal(unavailableDevice.error.code, "CAMERA_DEVICE_NOT_AVAILABLE");
  assert.equal(unavailableDevice.error.boundary, "resource");
});

test("planCameraSelect rejects real selection attempts and scope denial", () => {
  const realSelection = planCameraSelect({
    runtimeId: "runtime-1",
    deviceId: "camera-1",
    dryRun: false,
  });
  assert.equal(realSelection.ok, false);
  if (realSelection.ok) {
    assert.fail("real camera selection must be rejected");
  }
  assert.equal(realSelection.error.code, "REAL_CAMERA_SELECTION_NOT_ALLOWED");
  assert.equal(realSelection.error.boundary, "governance");

  const scopeDenied = planCameraSelect({
    runtimeId: "runtime-1",
    deviceId: "camera-1",
    requestedScopes: ["camera:select"],
    allowedScopes: [],
  });
  assert.equal(scopeDenied.ok, false);
  if (scopeDenied.ok) {
    assert.fail("scope denial must be rejected");
  }
  assert.equal(scopeDenied.error.code, "SCOPE_DENIED");
  assert.equal(scopeDenied.error.boundary, "scope");
});
