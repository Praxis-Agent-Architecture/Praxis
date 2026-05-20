import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { BaseToolExecutorPort } from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { createBaseToolRegistry } from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import {
  executeMicrophoneSelectCore,
  microphoneSelectDescriptor,
  microphoneSelectHandler,
  planMicrophoneSelect,
} from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/computeruseBase/microphoneAccess/computeruse.microphoneSelect.js";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "../../../../../../..");

defineAgentCoreContractTest({
  sourcePath: "src/executionEngine/basic_toolLayer/baseTools/computeruseBase/microphoneAccess/computeruse.microphoneSelect.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/microphoneAccess/computeruse.microphoneSelect.md",
  testFileUrl: import.meta.url,
});

function legalDryRunInput() {
  return {
    target: {
      deviceId: "mic-usb-1",
      targetApplication: "voice-capture",
      permissionLeaseId: "lease:microphone:1",
      selectionReason: "prefer external microphone",
      availableDevices: [
        { id: "mic-built-in", label: "Built-in Microphone", kind: "integrated" },
        { id: "mic-usb-1", label: "USB Microphone", kind: "usb" },
      ],
    },
    context: {
      runtimeId: "runtime-1",
      invocationId: "mic-select-1",
      requestedScopes: ["tool:computeruse:microphone"],
      allowedScopes: ["tool:computeruse:microphone"],
    },
  } as const;
}

test("planMicrophoneSelect creates a dry-run microphone selection envelope without calling provider", async () => {
  let providerCalled = false;
  const result = await planMicrophoneSelect({
    ...legalDryRunInput(),
    provider: () => {
      providerCalled = true;
      return { selected: true, deviceId: "mic-usb-1" };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(providerCalled, false);
  assert.equal(microphoneSelectDescriptor.defaultDryRun, true);
  assert.equal(microphoneSelectDescriptor.unsafeSideEffects, true);
  if (!result.ok) return;

  assert.equal(result.output.kind, "agentCore.basicTool.computeruse.microphoneSelect");
  assert.equal(result.output.dispatch, "dry-run");
  assert.equal(result.output.target.deviceId, "mic-usb-1");
  assert.equal(result.output.target.targetApplication, "voice-capture");
  assert.equal(result.output.providerCalled, false);
  assert.equal(result.output.selectionEnvelope.requested, false);
  assert.equal(result.output.selectionEnvelope.selected, false);
  assert.equal(result.output.selectionEnvelope.metadataOnly, true);
  assert.equal(result.output.selectionEnvelope.deviceId, "mic-usb-1");
  assert.equal(result.output.selectionEnvelope.permissionLeaseId, "lease:microphone:1");
  assert.equal(result.output.runtimeEntry.port, "BaseToolExecutorPort.computeruse.selectDevice");
  assert.equal(result.output.runtimeEntry.baseToolOwnsTapStrategy, false);
});

test("planMicrophoneSelect classifies malformed JSON, missing fields, invalid target, scope, and governance gaps", async () => {
  const malformedRequest = await planMicrophoneSelect("bad");
  assert.equal(malformedRequest.ok, false);
  if (!malformedRequest.ok) assert.equal(malformedRequest.error.code, "INVALID_REQUEST");

  const malformedContext = await planMicrophoneSelect({ target: {}, context: "bad" });
  assert.equal(malformedContext.ok, false);
  if (!malformedContext.ok) assert.equal(malformedContext.error.code, "INVALID_CONTEXT");

  const malformedTarget = await planMicrophoneSelect({
    target: "bad",
    context: { runtimeId: "runtime-1" },
  });
  assert.equal(malformedTarget.ok, false);
  if (!malformedTarget.ok) assert.equal(malformedTarget.error.code, "INVALID_TARGET");

  const missingRuntime = await planMicrophoneSelect({
    deviceId: "mic-usb-1",
    targetApplication: "voice-capture",
  });
  assert.equal(missingRuntime.ok, false);
  if (!missingRuntime.ok) assert.equal(missingRuntime.error.code, "MISSING_RUNTIME_ID");

  const missingDevice = await planMicrophoneSelect({
    context: { runtimeId: "runtime-1" },
    targetApplication: "voice-capture",
  });
  assert.equal(missingDevice.ok, false);
  if (!missingDevice.ok) assert.equal(missingDevice.error.code, "MISSING_MICROPHONE_DEVICE");

  const missingApplication = await planMicrophoneSelect({
    context: { runtimeId: "runtime-1" },
    deviceId: "mic-usb-1",
  });
  assert.equal(missingApplication.ok, false);
  if (!missingApplication.ok) assert.equal(missingApplication.error.code, "MISSING_TARGET_APPLICATION");

  const invalidDevice = await planMicrophoneSelect({
    context: { runtimeId: "runtime-1" },
    deviceId: "bad\0device",
    targetApplication: "voice-capture",
  });
  assert.equal(invalidDevice.ok, false);
  if (!invalidDevice.ok) assert.equal(invalidDevice.error.code, "INVALID_MICROPHONE_DEVICE");

  const invalidLease = await planMicrophoneSelect({
    context: { runtimeId: "runtime-1" },
    deviceId: "mic-usb-1",
    targetApplication: "voice-capture",
    permissionLeaseId: "x".repeat(513),
  });
  assert.equal(invalidLease.ok, false);
  if (!invalidLease.ok) assert.equal(invalidLease.error.code, "INVALID_PERMISSION_LEASE");

  const invalidReason = await planMicrophoneSelect({
    context: { runtimeId: "runtime-1" },
    deviceId: "mic-usb-1",
    targetApplication: "voice-capture",
    selectionReason: "bad\0reason",
  });
  assert.equal(invalidReason.ok, false);
  if (!invalidReason.ok) assert.equal(invalidReason.error.code, "INVALID_SELECTION_REASON");

  const unavailableDevice = await planMicrophoneSelect({
    context: { runtimeId: "runtime-1" },
    deviceId: "mic-missing",
    targetApplication: "voice-capture",
    availableDevices: [{ id: "mic-usb-1" }],
  });
  assert.equal(unavailableDevice.ok, false);
  if (!unavailableDevice.ok) assert.equal(unavailableDevice.error.code, "MICROPHONE_DEVICE_NOT_AVAILABLE");

  const deniedScope = await planMicrophoneSelect({
    ...legalDryRunInput(),
    context: {
      runtimeId: "runtime-1",
      requestedScopes: ["tool:computeruse:microphone"],
      allowedScopes: [],
    },
  });
  assert.equal(deniedScope.ok, false);
  if (!deniedScope.ok) assert.equal(deniedScope.error.code, "SCOPE_DENIED");
});

test("executeMicrophoneSelectCore requires guard and maps missing or failing provider to public-safe errors", async () => {
  const noGuard = await executeMicrophoneSelectCore({
    ...legalDryRunInput(),
    context: { ...legalDryRunInput().context, dryRun: false },
  });
  assert.equal(noGuard.ok, false);
  if (!noGuard.ok) assert.equal(noGuard.error.code, "GOVERNANCE_REJECTED");

  const missingProvider = await executeMicrophoneSelectCore({
    ...legalDryRunInput(),
    context: { ...legalDryRunInput().context, dryRun: false, guard: { accepted: true } },
  });
  assert.equal(missingProvider.ok, false);
  if (!missingProvider.ok) {
    assert.equal(missingProvider.error.code, "PROVIDER_UNAVAILABLE");
    assert.equal(missingProvider.error.publicSafe, true);
    assert.equal(missingProvider.error.internalDetailExposed, false);
  }

  const failedProvider = await executeMicrophoneSelectCore({
    ...legalDryRunInput(),
    context: { ...legalDryRunInput().context, dryRun: false, guard: { accepted: true } },
    provider: () => {
      throw new Error("private microphone select backend path");
    },
  });
  assert.equal(failedProvider.ok, false);
  if (!failedProvider.ok) {
    assert.equal(failedProvider.error.code, "PROVIDER_FAILURE");
    assert.equal(failedProvider.error.publicSafe, true);
    assert.equal(failedProvider.error.message.includes("private microphone"), false);
  }
});

test("microphoneSelectHandler invokes runtime-owned executor.computeruse.selectDevice when guarded", async () => {
  const calls: unknown[] = [];
  const executor: BaseToolExecutorPort = {
    computeruse: {
      async selectDevice(request) {
        calls.push(request);
        return {
          ok: true,
          output: {
            selected: true,
            deviceId: "mic-usb-1",
            metadata: { runtimeCarrier: "fake-computeruse" },
          },
          metadata: { adapter: "fake-runtime" },
        };
      },
    },
  };

  const result = await microphoneSelectHandler.invoke({
    toolCallId: "tool-call-1",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    executor,
    input: {
      target: {
        deviceId: "mic-usb-1",
        targetApplication: "voice-capture",
        permissionLeaseId: "lease:microphone:1",
        selectionReason: "prefer external microphone",
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
  assert.equal(runtimeCall.resource, "microphone");
  assert.equal(runtimeCall.deviceId, "mic-usb-1");
  assert.equal(runtimeCall.metadata?.runtimeId, "runtime-1");
  assert.equal(runtimeCall.metadata?.sessionId, "session-1");
  assert.equal(runtimeCall.metadata?.invocationId, "tool-call-1");
  assert.equal(runtimeCall.metadata?.targetApplication, "voice-capture");
  assert.equal(runtimeCall.metadata?.permissionLeaseId, "lease:microphone:1");
  assert.equal(runtimeCall.metadata?.selectionReason, "prefer external microphone");
  if (!result.ok) return;
  assert.equal(result.output.dispatch, "runtime-computeruse");
  assert.equal(result.output.providerCalled, true);
  assert.equal(result.output.selectionEnvelope.requested, true);
  assert.equal(result.output.selectionEnvelope.selected, true);
  assert.equal(result.output.selectionEnvelope.deviceId, "mic-usb-1");
});

test("createBaseToolRegistry resolves computeruse.microphoneSelect handler and does not fallback without executor.computeruse", async () => {
  const lookup = createBaseToolRegistry().lookupHandler("computeruse.microphoneSelect");
  assert.equal(lookup.ok, true);
  if (!lookup.ok) return;

  const result = await lookup.handler.invoke({
    toolCallId: "tool-call-2",
    runtimeId: "runtime-2",
    sessionId: "session-2",
    executor: {},
    input: {
      deviceId: "mic-usb-1",
      targetApplication: "voice-capture",
      context: { dryRun: false, guard: { accepted: true } },
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "PROVIDER_UNAVAILABLE");
    assert.equal(result.error.publicSafe, true);
  }
});

test("computeruse.microphoneSelect keeps canonical storage shape and operational doc boundary", () => {
  const storageDir = path.join(
    repoRoot,
    "src/storagePool/baseToolStorage/computeruseBase/microphoneAccess/computeruse.microphoneSelect",
  );
  for (const fileName of [
    "core.ts",
    "bestPractice.ts",
    "dependencies.ts",
    "anthropic.ts",
    "openai.ts",
    "deepmind.ts",
    "computeruse.microphoneSelect.md",
  ]) {
    assert.ok(existsSync(path.join(storageDir, fileName)), "missing canonical storage file " + fileName);
  }
  assert.equal(
    existsSync(path.join(repoRoot, "src/storagePool/baseToolStorage/computeruseBase/microphoneAccess/computeruse.microphoneSelect.ts")),
    false,
  );

  const entryText = readFileSync(
    path.join(
      repoRoot,
      "src/executionEngine/basic_toolLayer/baseTools/computeruseBase/microphoneAccess/computeruse.microphoneSelect.ts",
    ),
    "utf8",
  );
  assert.doesNotMatch(entryText, /export\s+\*\s+from/u);
  assert.match(entryText, /microphoneSelectHandler/u);

  const docText = readFileSync(path.join(storageDir, "computeruse.microphoneSelect.md"), "utf8");
  for (const heading of ["Use This Tool", "Call Shape", "Required Inputs", "Optional Inputs", "Runtime Behavior", "Returns", "Example", "Avoid"]) {
    assert.match(docText, new RegExp("## " + heading, "u"));
  }
  assert.match(docText, /BaseToolExecutorPort\.computeruse\.selectDevice/u);
  assert.match(docText, /TAP\/agent/u);
});
