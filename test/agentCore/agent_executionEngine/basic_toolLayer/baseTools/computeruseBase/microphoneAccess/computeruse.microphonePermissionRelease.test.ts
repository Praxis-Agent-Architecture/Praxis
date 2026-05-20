import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { BaseToolExecutorPort } from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { createBaseToolRegistry } from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import {
  executeMicrophonePermissionReleaseCore,
  microphonePermissionReleaseDescriptor,
  microphonePermissionReleaseHandler,
  planMicrophonePermissionRelease,
} from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/computeruseBase/microphoneAccess/computeruse.microphonePermissionRelease.js";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "../../../../../../..");

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_executionEngine/basic_toolLayer/baseTools/computeruseBase/microphoneAccess/computeruse.microphonePermissionRelease.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/microphoneAccess/computeruse.microphonePermissionRelease.md",
  testFileUrl: import.meta.url,
});

function legalDryRunInput() {
  return {
    target: {
      permissionLeaseId: "lease:microphone:1",
      targetApplication: "voice-capture",
      deviceId: "default-microphone",
      releaseReason: "capture-complete",
    },
    context: {
      runtimeId: "runtime-1",
      invocationId: "mic-release-1",
      requestedScopes: ["tool:computeruse:microphone"],
      allowedScopes: ["tool:computeruse:microphone"],
    },
  } as const;
}

test("planMicrophonePermissionRelease creates a governed dry-run release envelope without calling provider", async () => {
  let providerCalled = false;
  const result = await planMicrophonePermissionRelease({
    ...legalDryRunInput(),
    provider: () => {
      providerCalled = true;
      return { released: true };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(providerCalled, false);
  assert.equal(microphonePermissionReleaseDescriptor.defaultDryRun, true);
  assert.equal(microphonePermissionReleaseDescriptor.unsafeSideEffects, true);
  if (!result.ok) return;

  assert.equal(result.output.kind, "agentCore.basicTool.computeruse.microphonePermissionRelease");
  assert.equal(result.output.dispatch, "dry-run");
  assert.equal(result.output.target.permissionLeaseId, "lease:microphone:1");
  assert.equal(result.output.target.targetApplication, "voice-capture");
  assert.equal(result.output.providerCalled, false);
  assert.equal(result.output.releaseEnvelope.requested, false);
  assert.equal(result.output.releaseEnvelope.released, false);
  assert.equal(result.output.releaseEnvelope.metadataOnly, true);
  assert.equal(result.output.releaseEnvelope.leaseId, "lease:microphone:1");
  assert.equal(result.output.runtimeEntry.port, "BaseToolExecutorPort.computeruse.releasePermission");
  assert.equal(result.output.runtimeEntry.baseToolOwnsTapStrategy, false);
});

test("planMicrophonePermissionRelease classifies malformed JSON, missing fields, invalid target, scope, and governance gaps", async () => {
  const malformedRequest = await planMicrophonePermissionRelease("bad");
  assert.equal(malformedRequest.ok, false);
  if (!malformedRequest.ok) assert.equal(malformedRequest.error.code, "INVALID_REQUEST");

  const malformedContext = await planMicrophonePermissionRelease({ target: {}, context: "bad" });
  assert.equal(malformedContext.ok, false);
  if (!malformedContext.ok) assert.equal(malformedContext.error.code, "INVALID_CONTEXT");

  const malformedTarget = await planMicrophonePermissionRelease({
    target: "bad",
    context: { runtimeId: "runtime-1" },
  });
  assert.equal(malformedTarget.ok, false);
  if (!malformedTarget.ok) assert.equal(malformedTarget.error.code, "INVALID_TARGET");

  const missingRuntime = await planMicrophonePermissionRelease({
    permissionLeaseId: "lease:microphone:1",
    targetApplication: "voice-capture",
  });
  assert.equal(missingRuntime.ok, false);
  if (!missingRuntime.ok) assert.equal(missingRuntime.error.code, "MISSING_RUNTIME_ID");

  const missingLease = await planMicrophonePermissionRelease({
    context: { runtimeId: "runtime-1" },
    targetApplication: "voice-capture",
  });
  assert.equal(missingLease.ok, false);
  if (!missingLease.ok) assert.equal(missingLease.error.code, "MISSING_PERMISSION_LEASE");

  const missingApplication = await planMicrophonePermissionRelease({
    context: { runtimeId: "runtime-1" },
    permissionLeaseId: "lease:microphone:1",
  });
  assert.equal(missingApplication.ok, false);
  if (!missingApplication.ok) assert.equal(missingApplication.error.code, "MISSING_TARGET_APPLICATION");

  const invalidLease = await planMicrophonePermissionRelease({
    context: { runtimeId: "runtime-1" },
    permissionLeaseId: "x".repeat(513),
    targetApplication: "voice-capture",
  });
  assert.equal(invalidLease.ok, false);
  if (!invalidLease.ok) assert.equal(invalidLease.error.code, "INVALID_PERMISSION_LEASE");

  const invalidDevice = await planMicrophonePermissionRelease({
    context: { runtimeId: "runtime-1" },
    permissionLeaseId: "lease:microphone:1",
    targetApplication: "voice-capture",
    deviceId: "bad\0device",
  });
  assert.equal(invalidDevice.ok, false);
  if (!invalidDevice.ok) assert.equal(invalidDevice.error.code, "INVALID_DEVICE_ID");

  const invalidReason = await planMicrophonePermissionRelease({
    context: { runtimeId: "runtime-1" },
    permissionLeaseId: "lease:microphone:1",
    targetApplication: "voice-capture",
    releaseReason: "bad\0reason",
  });
  assert.equal(invalidReason.ok, false);
  if (!invalidReason.ok) assert.equal(invalidReason.error.code, "INVALID_RELEASE_REASON");

  const deniedScope = await planMicrophonePermissionRelease({
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

test("executeMicrophonePermissionReleaseCore requires guard and maps missing or failing provider to public-safe errors", async () => {
  const noGuard = await executeMicrophonePermissionReleaseCore({
    ...legalDryRunInput(),
    context: { ...legalDryRunInput().context, dryRun: false },
  });
  assert.equal(noGuard.ok, false);
  if (!noGuard.ok) assert.equal(noGuard.error.code, "GOVERNANCE_REJECTED");

  const missingProvider = await executeMicrophonePermissionReleaseCore({
    ...legalDryRunInput(),
    context: { ...legalDryRunInput().context, dryRun: false, guard: { accepted: true } },
  });
  assert.equal(missingProvider.ok, false);
  if (!missingProvider.ok) {
    assert.equal(missingProvider.error.code, "PROVIDER_UNAVAILABLE");
    assert.equal(missingProvider.error.publicSafe, true);
    assert.equal(missingProvider.error.internalDetailExposed, false);
  }

  const failedProvider = await executeMicrophonePermissionReleaseCore({
    ...legalDryRunInput(),
    context: { ...legalDryRunInput().context, dryRun: false, guard: { accepted: true } },
    provider: () => {
      throw new Error("private microphone release backend path");
    },
  });
  assert.equal(failedProvider.ok, false);
  if (!failedProvider.ok) {
    assert.equal(failedProvider.error.code, "PROVIDER_FAILURE");
    assert.equal(failedProvider.error.publicSafe, true);
    assert.equal(failedProvider.error.message.includes("private microphone"), false);
  }
});

test("microphonePermissionReleaseHandler invokes runtime-owned executor.computeruse.releasePermission when guarded", async () => {
  const calls: unknown[] = [];
  const executor: BaseToolExecutorPort = {
    computeruse: {
      async releasePermission(request) {
        calls.push(request);
        return {
          ok: true,
          output: {
            released: true,
            metadata: { runtimeCarrier: "fake-computeruse" },
          },
          metadata: { adapter: "fake-runtime" },
        };
      },
    },
  };

  const result = await microphonePermissionReleaseHandler.invoke({
    toolCallId: "tool-call-1",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    executor,
    input: {
      target: {
        permissionLeaseId: "lease:microphone:1",
        targetApplication: "voice-capture",
        deviceId: "default-microphone",
        releaseReason: "capture-complete",
      },
      context: { dryRun: false, guard: { accepted: true } },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  const runtimeCall = calls[0] as {
    resource?: string;
    leaseId?: string;
    deviceId?: string;
    metadata?: Record<string, unknown>;
  };
  assert.equal(runtimeCall.resource, "microphone");
  assert.equal(runtimeCall.leaseId, "lease:microphone:1");
  assert.equal(runtimeCall.deviceId, "default-microphone");
  assert.equal(runtimeCall.metadata?.runtimeId, "runtime-1");
  assert.equal(runtimeCall.metadata?.sessionId, "session-1");
  assert.equal(runtimeCall.metadata?.invocationId, "tool-call-1");
  assert.equal(runtimeCall.metadata?.targetApplication, "voice-capture");
  assert.equal(runtimeCall.metadata?.releaseReason, "capture-complete");
  if (!result.ok) return;
  assert.equal(result.output.dispatch, "runtime-computeruse");
  assert.equal(result.output.providerCalled, true);
  assert.equal(result.output.releaseEnvelope.requested, true);
  assert.equal(result.output.releaseEnvelope.released, true);
  assert.equal(result.output.releaseEnvelope.leaseId, "lease:microphone:1");
});

test("createBaseToolRegistry resolves computeruse.microphonePermissionRelease handler and does not fallback without executor.computeruse", async () => {
  const lookup = createBaseToolRegistry().lookupHandler("computeruse.microphonePermissionRelease");
  assert.equal(lookup.ok, true);
  if (!lookup.ok) return;

  const result = await lookup.handler.invoke({
    toolCallId: "tool-call-2",
    runtimeId: "runtime-2",
    sessionId: "session-2",
    executor: {},
    input: {
      permissionLeaseId: "lease:microphone:1",
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

test("computeruse.microphonePermissionRelease keeps canonical storage shape and operational doc boundary", () => {
  const storageDir = path.join(
    repoRoot,
    "src/storagePool/baseToolStorage/computeruseBase/microphoneAccess/computeruse.microphonePermissionRelease",
  );
  for (const fileName of [
    "core.ts",
    "bestPractice.ts",
    "dependencies.ts",
    "anthropic.ts",
    "openai.ts",
    "deepmind.ts",
    "computeruse.microphonePermissionRelease.md",
  ]) {
    assert.ok(existsSync(path.join(storageDir, fileName)), "missing canonical storage file: " + fileName);
  }
  assert.equal(
    existsSync(path.join(repoRoot, "src/storagePool/baseToolStorage/computeruseBase/microphoneAccess/computeruse.microphonePermissionRelease.ts")),
    false,
  );

  const entryText = readFileSync(
    path.join(
      repoRoot,
      "src/agentCore_executionEngine/basic_toolLayer/baseTools/computeruseBase/microphoneAccess/computeruse.microphonePermissionRelease.ts",
    ),
    "utf8",
  );
  assert.doesNotMatch(entryText, /export\s+\*\s+from/u);
  assert.match(entryText, /microphonePermissionReleaseHandler/u);

  const docText = readFileSync(path.join(storageDir, "computeruse.microphonePermissionRelease.md"), "utf8");
  for (const heading of ["## Use This Tool", "## Call Shape", "## Required Inputs", "## Optional Inputs", "## Runtime Behavior", "## Returns", "## Example", "## Avoid"]) {
    assert.match(docText, new RegExp("^" + heading.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "mu"));
  }
  assert.match(docText, /BaseToolExecutorPort\.computeruse\.releasePermission/u);
  assert.match(docText, /TAP\/agent owns that composition/u);
  assert.match(docText, /Do not hide local shell/u);
});
