import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  microphoneSelectDescriptor,
  planMicrophoneSelect,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/microphoneAccess/computeruse.microphoneSelect.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/microphoneAccess/computeruse.microphoneSelect.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/microphoneAccess/computeruse.microphoneSelect.md",
  testFileUrl: import.meta.url,
});

test("planMicrophoneSelect creates a dry-run microphone selection envelope", () => {
  const result = planMicrophoneSelect({
    runtimeId: " runtime-1 ",
    sessionId: " session-1 ",
    deviceId: " mic-2 ",
    availableDevices: [
      { id: " mic-1 ", label: "Built-in Microphone", kind: "integrated" },
      { id: " mic-2 ", label: "USB Microphone", kind: "usb" },
    ],
    requestedScopes: ["microphone:select"],
    allowedScopes: ["microphone:select"],
  });

  assert.equal(microphoneSelectDescriptor.unsafeSideEffects, false);
  if (!result.ok) {
    assert.fail("valid microphone selection must be accepted");
  }

  assert.equal(result.plan.toolName, "computeruse.microphoneSelect");
  assert.equal(result.plan.runtimeId, "runtime-1");
  assert.equal(result.plan.sessionId, "session-1");
  assert.equal(result.plan.target.deviceId, "mic-2");
  assert.equal(result.plan.target.availableDeviceCount, 2);
  assert.equal(result.plan.requiredPermission, "microphone:select");
  assert.equal(result.plan.execution.dryRun, true);
  assert.equal(result.plan.execution.microphoneSelectionPlanned, true);
  assert.equal(result.plan.execution.microphoneSelected, false);
  assert.equal(result.plan.execution.realMicrophoneTouched, false);
});

test("planMicrophoneSelect rejects missing, invalid, unavailable, real, and scoped requests", () => {
  const missingRuntime = planMicrophoneSelect({ deviceId: "mic-1" });
  assert.equal(missingRuntime.ok, false);
  if (!missingRuntime.ok) {
    assert.equal(missingRuntime.error.code, "MISSING_RUNTIME_ID");
    assert.equal(missingRuntime.error.boundary, "input");
  }

  const missingDevice = planMicrophoneSelect({ runtimeId: "runtime-1" });
  assert.equal(missingDevice.ok, false);
  if (!missingDevice.ok) {
    assert.equal(missingDevice.error.code, "MISSING_MICROPHONE_DEVICE");
    assert.equal(missingDevice.error.boundary, "input");
  }

  const invalidDevice = planMicrophoneSelect({
    runtimeId: "runtime-1",
    deviceId: "mic\0device",
  });
  assert.equal(invalidDevice.ok, false);
  if (!invalidDevice.ok) {
    assert.equal(invalidDevice.error.code, "INVALID_MICROPHONE_DEVICE");
    assert.equal(invalidDevice.error.boundary, "input");
  }

  const unavailableDevice = planMicrophoneSelect({
    runtimeId: "runtime-1",
    deviceId: "mic-3",
    availableDevices: [{ id: "mic-1" }],
  });
  assert.equal(unavailableDevice.ok, false);
  if (!unavailableDevice.ok) {
    assert.equal(unavailableDevice.error.code, "MICROPHONE_DEVICE_NOT_AVAILABLE");
    assert.equal(unavailableDevice.error.boundary, "resource");
  }

  const realSelection = planMicrophoneSelect({
    runtimeId: "runtime-1",
    deviceId: "mic-1",
    dryRun: false,
  });
  assert.equal(realSelection.ok, false);
  if (!realSelection.ok) {
    assert.equal(realSelection.error.code, "REAL_MICROPHONE_SELECTION_NOT_ALLOWED");
    assert.equal(realSelection.error.boundary, "governance");
  }

  const scopeDenied = planMicrophoneSelect({
    runtimeId: "runtime-1",
    deviceId: "mic-1",
    requestedScopes: ["microphone:select"],
    allowedScopes: [],
  });
  assert.equal(scopeDenied.ok, false);
  if (!scopeDenied.ok) {
    assert.equal(scopeDenied.error.code, "SCOPE_DENIED");
    assert.equal(scopeDenied.error.boundary, "scope");
  }
});
