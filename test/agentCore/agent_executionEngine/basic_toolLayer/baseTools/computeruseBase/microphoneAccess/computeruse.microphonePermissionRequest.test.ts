import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { BaseToolExecutorPort } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { createBaseToolRegistry } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import {
  executeMicrophonePermissionRequestCore,
  microphonePermissionRequestDescriptor,
  microphonePermissionRequestHandler,
  planMicrophonePermissionRequest,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/microphoneAccess/computeruse.microphonePermissionRequest.js";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "../../../../../../..");

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/microphoneAccess/computeruse.microphonePermissionRequest.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/microphoneAccess/computeruse.microphonePermissionRequest.md",
  testFileUrl: import.meta.url,
});

function legalDryRunInput() {
  return {
    target: {
      targetApplication: "voice-capture",
      purpose: "capture a short voice note",
      deviceId: "default-microphone",
      mode: "single-capture",
      requestedDurationMs: 30_000,
      maxDurationMs: 60_000,
    },
    context: {
      runtimeId: "runtime-1",
      invocationId: "mic-permission-1",
      requestedScopes: ["tool:computeruse:microphone"],
      allowedScopes: ["tool:computeruse:microphone"],
    },
  } as const;
}

test("planMicrophonePermissionRequest creates a governed dry-run permission envelope without calling provider", async () => {
  let providerCalled = false;
  const result = await planMicrophonePermissionRequest({
    ...legalDryRunInput(),
    provider: () => {
      providerCalled = true;
      return { granted: true, leaseId: "should-not-be-used" };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(providerCalled, false);
  assert.equal(microphonePermissionRequestDescriptor.defaultDryRun, true);
  assert.equal(microphonePermissionRequestDescriptor.unsafeSideEffects, true);
  if (!result.ok) return;

  assert.equal(result.output.kind, "agentCore.basicTool.computeruse.microphonePermissionRequest");
  assert.equal(result.output.dispatch, "dry-run");
  assert.equal(result.output.target.targetApplication, "voice-capture");
  assert.equal(result.output.target.purpose, "capture a short voice note");
  assert.equal(result.output.target.mode, "single-capture");
  assert.equal(result.output.target.requestedDurationMs, 30_000);
  assert.equal(result.output.providerCalled, false);
  assert.equal(result.output.permissionEnvelope.requested, false);
  assert.equal(result.output.permissionEnvelope.granted, false);
  assert.equal(result.output.permissionEnvelope.metadataOnly, true);
  assert.equal(result.output.runtimeEntry.port, "BaseToolExecutorPort.computeruse.requestPermission");
  assert.equal(result.output.runtimeEntry.baseToolOwnsTapStrategy, false);
});

test("planMicrophonePermissionRequest classifies malformed JSON, missing fields, invalid target, scope, and governance gaps", async () => {
  const malformedRequest = await planMicrophonePermissionRequest("bad");
  assert.equal(malformedRequest.ok, false);
  if (!malformedRequest.ok) assert.equal(malformedRequest.error.code, "INVALID_REQUEST");

  const malformedContext = await planMicrophonePermissionRequest({ target: {}, context: "bad" });
  assert.equal(malformedContext.ok, false);
  if (!malformedContext.ok) assert.equal(malformedContext.error.code, "INVALID_CONTEXT");

  const malformedTarget = await planMicrophonePermissionRequest({
    target: "bad",
    context: { runtimeId: "runtime-1" },
  });
  assert.equal(malformedTarget.ok, false);
  if (!malformedTarget.ok) assert.equal(malformedTarget.error.code, "INVALID_TARGET");

  const missingRuntime = await planMicrophonePermissionRequest({
    targetApplication: "voice-capture",
    purpose: "capture a short voice note",
  });
  assert.equal(missingRuntime.ok, false);
  if (!missingRuntime.ok) assert.equal(missingRuntime.error.code, "MISSING_RUNTIME_ID");

  const missingApplication = await planMicrophonePermissionRequest({
    context: { runtimeId: "runtime-1" },
    purpose: "capture a short voice note",
  });
  assert.equal(missingApplication.ok, false);
  if (!missingApplication.ok) assert.equal(missingApplication.error.code, "MISSING_TARGET_APPLICATION");

  const missingPurpose = await planMicrophonePermissionRequest({
    context: { runtimeId: "runtime-1" },
    targetApplication: "voice-capture",
  });
  assert.equal(missingPurpose.ok, false);
  if (!missingPurpose.ok) assert.equal(missingPurpose.error.code, "MISSING_PURPOSE");

  const invalidDevice = await planMicrophonePermissionRequest({
    context: { runtimeId: "runtime-1" },
    targetApplication: "voice-capture",
    purpose: "capture a short voice note",
    deviceId: "bad\0device",
  });
  assert.equal(invalidDevice.ok, false);
  if (!invalidDevice.ok) assert.equal(invalidDevice.error.code, "INVALID_DEVICE_ID");

  const invalidMode = await planMicrophonePermissionRequest({
    context: { runtimeId: "runtime-1" },
    targetApplication: "voice-capture",
    purpose: "capture a short voice note",
    mode: "forever",
  });
  assert.equal(invalidMode.ok, false);
  if (!invalidMode.ok) assert.equal(invalidMode.error.code, "INVALID_MODE");

  const invalidDuration = await planMicrophonePermissionRequest({
    context: { runtimeId: "runtime-1" },
    targetApplication: "voice-capture",
    purpose: "capture a short voice note",
    requestedDurationMs: 0,
  });
  assert.equal(invalidDuration.ok, false);
  if (!invalidDuration.ok) assert.equal(invalidDuration.error.code, "INVALID_DURATION");

  const overLimit = await planMicrophonePermissionRequest({
    context: { runtimeId: "runtime-1" },
    targetApplication: "voice-capture",
    purpose: "capture a short voice note",
    requestedDurationMs: 10_001,
    maxDurationMs: 10_000,
  });
  assert.equal(overLimit.ok, false);
  if (!overLimit.ok) assert.equal(overLimit.error.code, "DURATION_LIMIT_EXCEEDED");

  const deniedScope = await planMicrophonePermissionRequest({
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

test("executeMicrophonePermissionRequestCore requires guard and maps missing or failing provider to public-safe errors", async () => {
  const noGuard = await executeMicrophonePermissionRequestCore({
    ...legalDryRunInput(),
    context: { ...legalDryRunInput().context, dryRun: false },
  });
  assert.equal(noGuard.ok, false);
  if (!noGuard.ok) assert.equal(noGuard.error.code, "GOVERNANCE_REJECTED");

  const missingProvider = await executeMicrophonePermissionRequestCore({
    ...legalDryRunInput(),
    context: { ...legalDryRunInput().context, dryRun: false, guard: { accepted: true } },
  });
  assert.equal(missingProvider.ok, false);
  if (!missingProvider.ok) {
    assert.equal(missingProvider.error.code, "PROVIDER_UNAVAILABLE");
    assert.equal(missingProvider.error.publicSafe, true);
    assert.equal(missingProvider.error.internalDetailExposed, false);
  }

  const failedProvider = await executeMicrophonePermissionRequestCore({
    ...legalDryRunInput(),
    context: { ...legalDryRunInput().context, dryRun: false, guard: { accepted: true } },
    provider: () => {
      throw new Error("private microphone permission backend path");
    },
  });
  assert.equal(failedProvider.ok, false);
  if (!failedProvider.ok) {
    assert.equal(failedProvider.error.code, "PROVIDER_FAILURE");
    assert.equal(failedProvider.error.publicSafe, true);
    assert.equal(failedProvider.error.message.includes("private microphone"), false);
  }
});

test("microphonePermissionRequestHandler invokes runtime-owned executor.computeruse.requestPermission when guarded", async () => {
  const calls: unknown[] = [];
  const executor: BaseToolExecutorPort = {
    computeruse: {
      async requestPermission(request) {
        calls.push(request);
        return {
          ok: true,
          output: {
            granted: true,
            leaseId: "lease:microphone:1",
            metadata: { runtimeCarrier: "fake-computeruse" },
          },
          metadata: { adapter: "fake-runtime" },
        };
      },
    },
  };

  const result = await microphonePermissionRequestHandler.invoke({
    toolCallId: "tool-call-1",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    executor,
    input: {
      target: {
        targetApplication: "voice-capture",
        purpose: "capture a short voice note",
        deviceId: "default-microphone",
        mode: "single-capture",
        requestedDurationMs: 30_000,
      },
      context: { dryRun: false, guard: { accepted: true } },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  const runtimeCall = calls[0] as {
    resource?: string;
    purpose?: string;
    deviceId?: string;
    metadata?: Record<string, unknown>;
  };
  assert.equal(runtimeCall.resource, "microphone");
  assert.equal(runtimeCall.purpose, "capture a short voice note");
  assert.equal(runtimeCall.deviceId, "default-microphone");
  assert.equal(runtimeCall.metadata?.runtimeId, "runtime-1");
  assert.equal(runtimeCall.metadata?.sessionId, "session-1");
  assert.equal(runtimeCall.metadata?.invocationId, "tool-call-1");
  assert.equal(runtimeCall.metadata?.targetApplication, "voice-capture");
  assert.equal(runtimeCall.metadata?.mode, "single-capture");
  assert.equal(runtimeCall.metadata?.requestedDurationMs, 30_000);
  if (!result.ok) return;
  assert.equal(result.output.dispatch, "runtime-computeruse");
  assert.equal(result.output.providerCalled, true);
  assert.equal(result.output.permissionEnvelope.requested, true);
  assert.equal(result.output.permissionEnvelope.granted, true);
  assert.equal(result.output.permissionEnvelope.leaseId, "lease:microphone:1");
});

test("createBaseToolRegistry resolves computeruse.microphonePermissionRequest handler and does not fallback without executor.computeruse", async () => {
  const lookup = createBaseToolRegistry().lookupHandler("computeruse.microphonePermissionRequest");
  assert.equal(lookup.ok, true);
  if (!lookup.ok) return;

  const result = await lookup.handler.invoke({
    toolCallId: "tool-call-2",
    runtimeId: "runtime-2",
    sessionId: "session-2",
    executor: {},
    input: {
      targetApplication: "voice-capture",
      purpose: "capture a short voice note",
      context: { dryRun: false, guard: { accepted: true } },
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "PROVIDER_UNAVAILABLE");
    assert.equal(result.error.publicSafe, true);
  }
});

test("computeruse.microphonePermissionRequest keeps canonical storage shape and operational doc boundary", () => {
  const storageDir = path.join(
    repoRoot,
    "src/storagePool/baseToolStorage/computeruseBase/microphoneAccess/computeruse.microphonePermissionRequest",
  );
  for (const fileName of [
    "core.ts",
    "bestPractice.ts",
    "dependencies.ts",
    "anthropic.ts",
    "openai.ts",
    "deepmind.ts",
    "computeruse.microphonePermissionRequest.md",
  ]) {
    assert.ok(existsSync(path.join(storageDir, fileName)), "missing canonical storage file: " + fileName);
  }
  assert.equal(
    existsSync(path.join(repoRoot, "src/storagePool/baseToolStorage/computeruseBase/microphoneAccess/computeruse.microphonePermissionRequest.ts")),
    false,
  );

  const entryText = readFileSync(
    path.join(
      repoRoot,
      "src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/microphoneAccess/computeruse.microphonePermissionRequest.ts",
    ),
    "utf8",
  );
  assert.doesNotMatch(entryText, /export\s+\*\s+from/u);
  assert.match(entryText, /microphonePermissionRequestHandler/u);

  const docText = readFileSync(path.join(storageDir, "computeruse.microphonePermissionRequest.md"), "utf8");
  for (const heading of ["## Use This Tool", "## Call Shape", "## Required Inputs", "## Optional Inputs", "## Runtime Behavior", "## Returns", "## Example", "## Avoid"]) {
    assert.match(docText, new RegExp("^" + heading.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "mu"));
  }
  assert.match(docText, /BaseToolExecutorPort\.computeruse\.requestPermission/u);
  assert.match(docText, /TAP\/agent owns that composition/u);
  assert.match(docText, /Do not hide local shell/u);
});
