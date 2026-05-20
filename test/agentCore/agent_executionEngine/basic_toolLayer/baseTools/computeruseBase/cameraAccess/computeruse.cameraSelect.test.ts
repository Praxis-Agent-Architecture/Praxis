import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { BaseToolExecutorPort } from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { createBaseToolRegistry } from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import {
  cameraSelectDescriptor,
  cameraSelectHandler,
  executeCameraSelectCore,
  planCameraSelect,
} from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/computeruseBase/cameraAccess/computeruse.cameraSelect.js";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "../../../../../../..");

defineAgentCoreContractTest({
  sourcePath: "src/executionEngine/basic_toolLayer/baseTools/computeruseBase/cameraAccess/computeruse.cameraSelect.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/cameraAccess/computeruse.cameraSelect.md",
  testFileUrl: import.meta.url,
});

function legalDryRunInput() {
  return {
    target: {
      deviceId: "camera-2",
      purpose: "prepare camera capture",
      availableDevices: [
        { id: "camera-1", label: "Integrated Camera", kind: "integrated" },
        { id: "camera-2", label: "USB Camera", kind: "usb" },
      ],
    },
    context: {
      runtimeId: "runtime-1",
      invocationId: "camera-select-1",
      requestedScopes: ["tool:computeruse:camera"],
      allowedScopes: ["tool:computeruse:camera"],
    },
  } as const;
}

test("planCameraSelect creates a guarded dry-run selection envelope without calling provider", async () => {
  let providerCalled = false;
  const result = await planCameraSelect({
    ...legalDryRunInput(),
    provider: () => {
      providerCalled = true;
      return { selected: true, deviceId: "camera-2" };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(providerCalled, false);
  assert.equal(cameraSelectDescriptor.defaultDryRun, true);
  assert.equal(cameraSelectDescriptor.unsafeSideEffects, true);
  if (!result.ok) return;

  assert.equal(result.output.kind, "agentCore.basicTool.computeruse.cameraSelect");
  assert.equal(result.output.dispatch, "dry-run");
  assert.equal(result.output.target.deviceId, "camera-2");
  assert.equal(result.output.target.availableDevices?.length, 2);
  assert.equal(result.output.providerCalled, false);
  assert.equal(result.output.selectionEnvelope.resource, "camera");
  assert.equal(result.output.selectionEnvelope.requested, false);
  assert.equal(result.output.selectionEnvelope.selected, false);
  assert.equal(result.output.selectionEnvelope.metadataOnly, true);
  assert.equal(result.output.runtimeEntry.port, "BaseToolExecutorPort.computeruse.selectDevice");
  assert.equal(result.output.runtimeEntry.baseToolOwnsTapStrategy, false);
});

test("planCameraSelect classifies malformed JSON, missing fields, invalid target, scope, and guard gaps", async () => {
  const malformedRequest = await planCameraSelect("bad");
  assert.equal(malformedRequest.ok, false);
  if (!malformedRequest.ok) assert.equal(malformedRequest.error.code, "INVALID_REQUEST");

  const malformedContext = await planCameraSelect({ target: {}, context: "bad" });
  assert.equal(malformedContext.ok, false);
  if (!malformedContext.ok) assert.equal(malformedContext.error.code, "INVALID_CONTEXT");

  const malformedTarget = await planCameraSelect({
    target: "bad",
    context: { runtimeId: "runtime-1" },
  });
  assert.equal(malformedTarget.ok, false);
  if (!malformedTarget.ok) assert.equal(malformedTarget.error.code, "INVALID_TARGET");

  const missingRuntime = await planCameraSelect({ deviceId: "camera-1" });
  assert.equal(missingRuntime.ok, false);
  if (!missingRuntime.ok) assert.equal(missingRuntime.error.code, "MISSING_RUNTIME_ID");

  const missingDevice = await planCameraSelect({ context: { runtimeId: "runtime-1" } });
  assert.equal(missingDevice.ok, false);
  if (!missingDevice.ok) assert.equal(missingDevice.error.code, "MISSING_CAMERA_DEVICE");

  const invalidDevice = await planCameraSelect({
    context: { runtimeId: "runtime-1" },
    deviceId: "\0",
  });
  assert.equal(invalidDevice.ok, false);
  if (!invalidDevice.ok) assert.equal(invalidDevice.error.code, "INVALID_CAMERA_DEVICE");

  const invalidDevices = await planCameraSelect({
    context: { runtimeId: "runtime-1" },
    deviceId: "camera-1",
    availableDevices: [{}],
  });
  assert.equal(invalidDevices.ok, false);
  if (!invalidDevices.ok) assert.equal(invalidDevices.error.code, "INVALID_AVAILABLE_DEVICES");

  const unavailableDevice = await planCameraSelect({
    context: { runtimeId: "runtime-1" },
    deviceId: "camera-3",
    availableDevices: [{ id: "camera-1" }],
  });
  assert.equal(unavailableDevice.ok, false);
  if (!unavailableDevice.ok) assert.equal(unavailableDevice.error.code, "CAMERA_DEVICE_NOT_AVAILABLE");

  const deniedScope = await planCameraSelect({
    ...legalDryRunInput(),
    context: {
      runtimeId: "runtime-1",
      requestedScopes: ["tool:computeruse:camera"],
      allowedScopes: [],
    },
  });
  assert.equal(deniedScope.ok, false);
  if (!deniedScope.ok) assert.equal(deniedScope.error.code, "SCOPE_DENIED");
});

test("executeCameraSelectCore requires guard and maps missing or failing provider to public-safe errors", async () => {
  const noGuard = await executeCameraSelectCore({
    ...legalDryRunInput(),
    context: { ...legalDryRunInput().context, dryRun: false },
  });
  assert.equal(noGuard.ok, false);
  if (!noGuard.ok) assert.equal(noGuard.error.code, "GOVERNANCE_REJECTED");

  const missingProvider = await executeCameraSelectCore({
    ...legalDryRunInput(),
    context: { ...legalDryRunInput().context, dryRun: false, guard: { accepted: true } },
  });
  assert.equal(missingProvider.ok, false);
  if (!missingProvider.ok) {
    assert.equal(missingProvider.error.code, "PROVIDER_UNAVAILABLE");
    assert.equal(missingProvider.error.publicSafe, true);
    assert.equal(missingProvider.error.internalDetailExposed, false);
  }

  const failedProvider = await executeCameraSelectCore({
    ...legalDryRunInput(),
    context: { ...legalDryRunInput().context, dryRun: false, guard: { accepted: true } },
    provider: () => {
      throw new Error("private camera select backend path");
    },
  });
  assert.equal(failedProvider.ok, false);
  if (!failedProvider.ok) {
    assert.equal(failedProvider.error.code, "PROVIDER_FAILURE");
    assert.equal(failedProvider.error.publicSafe, true);
    assert.equal(failedProvider.error.message.includes("private camera"), false);
  }
});

test("cameraSelectHandler invokes runtime-owned executor.computeruse.selectDevice when guarded", async () => {
  const calls: unknown[] = [];
  const executor: BaseToolExecutorPort = {
    computeruse: {
      async selectDevice(request) {
        calls.push(request);
        return {
          ok: true,
          output: {
            selected: true,
            deviceId: request.deviceId,
            metadata: { runtimeCarrier: "fake-computeruse" },
          },
          metadata: { adapter: "fake-runtime" },
        };
      },
    },
  };

  const result = await cameraSelectHandler.invoke({
    toolCallId: "tool-call-1",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    executor,
    input: {
      target: {
        deviceId: "camera-2",
        purpose: "prepare camera capture",
        availableDevices: [{ id: "camera-2", label: "USB Camera", kind: "usb" }],
      },
      context: { dryRun: false, guard: { accepted: true } },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  const runtimeCall = calls[0] as {
    resource?: string;
    deviceId?: string;
    metadata?: Record<string, unknown>;
  };
  assert.equal(runtimeCall.resource, "camera");
  assert.equal(runtimeCall.deviceId, "camera-2");
  assert.equal(runtimeCall.metadata?.runtimeId, "runtime-1");
  assert.equal(runtimeCall.metadata?.sessionId, "session-1");
  assert.equal(runtimeCall.metadata?.invocationId, "tool-call-1");
  assert.equal(runtimeCall.metadata?.purpose, "prepare camera capture");
  assert.equal(runtimeCall.metadata?.availableDeviceCount, 1);
  if (!result.ok) return;
  assert.equal(result.output.dispatch, "runtime-computeruse");
  assert.equal(result.output.providerCalled, true);
  assert.equal(result.output.selectionEnvelope.selected, true);
  assert.equal(result.output.selectionEnvelope.deviceId, "camera-2");
});

test("createBaseToolRegistry resolves computeruse.cameraSelect handler and does not fallback without executor.computeruse", async () => {
  const lookup = createBaseToolRegistry().lookupHandler("computeruse.cameraSelect");
  assert.equal(lookup.ok, true);
  if (!lookup.ok) return;

  const result = await lookup.handler.invoke({
    toolCallId: "tool-call-2",
    runtimeId: "runtime-2",
    sessionId: "session-2",
    executor: {},
    input: {
      deviceId: "camera-1",
      context: { dryRun: false, guard: { accepted: true } },
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "PROVIDER_UNAVAILABLE");
    assert.equal(result.error.publicSafe, true);
  }
});

test("computeruse.cameraSelect keeps canonical storage shape and operational doc boundary", () => {
  const storageDir = path.join(repoRoot, "src/storagePool/baseToolStorage/computeruseBase/cameraAccess/computeruse.cameraSelect");
  for (const fileName of [
    "core.ts",
    "bestPractice.ts",
    "dependencies.ts",
    "anthropic.ts",
    "openai.ts",
    "deepmind.ts",
    "computeruse.cameraSelect.md",
  ]) {
    assert.ok(existsSync(path.join(storageDir, fileName)), "missing canonical storage file: " + fileName);
  }
  assert.equal(existsSync(path.join(repoRoot, "src/storagePool/baseToolStorage/computeruseBase/cameraAccess/computeruse.cameraSelect.ts")), false);

  const entryText = readFileSync(
    path.join(repoRoot, "src/executionEngine/basic_toolLayer/baseTools/computeruseBase/cameraAccess/computeruse.cameraSelect.ts"),
    "utf8",
  );
  assert.doesNotMatch(entryText, /export\s+\*\s+from/u);
  assert.match(entryText, /cameraSelectHandler/u);

  const docText = readFileSync(path.join(storageDir, "computeruse.cameraSelect.md"), "utf8");
  for (const heading of ["## Use This Tool", "## Call Shape", "## Required Inputs", "## Optional Inputs", "## Runtime Behavior", "## Returns", "## Example", "## Avoid"]) {
    assert.match(docText, new RegExp("^" + heading.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "mu"));
  }
  assert.match(docText, /BaseToolExecutorPort\.computeruse\.selectDevice/u);
  assert.match(docText, /TAP\/agent/u);
});
