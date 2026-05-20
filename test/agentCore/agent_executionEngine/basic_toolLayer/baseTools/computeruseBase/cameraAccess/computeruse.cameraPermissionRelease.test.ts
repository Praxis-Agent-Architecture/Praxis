import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { BaseToolExecutorPort } from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { createBaseToolRegistry } from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import {
  cameraPermissionReleaseDescriptor,
  cameraPermissionReleaseHandler,
  executeCameraPermissionReleaseCore,
  planCameraPermissionRelease,
} from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/computeruseBase/cameraAccess/computeruse.cameraPermissionRelease.js";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "../../../../../../..");

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_executionEngine/basic_toolLayer/baseTools/computeruseBase/cameraAccess/computeruse.cameraPermissionRelease.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/cameraAccess/computeruse.cameraPermissionRelease.md",
  testFileUrl: import.meta.url,
});

function legalDryRunInput() {
  return {
    target: {
      leaseId: "lease:camera:1",
      deviceId: "camera-1",
      reason: "camera workflow finished",
    },
    context: {
      runtimeId: "runtime-1",
      invocationId: "camera-release-1",
      requestedScopes: ["tool:computeruse:camera"],
      allowedScopes: ["tool:computeruse:camera"],
    },
  } as const;
}

test("planCameraPermissionRelease creates a guarded dry-run release envelope without calling provider", async () => {
  let providerCalled = false;
  const result = await planCameraPermissionRelease({
    ...legalDryRunInput(),
    provider: () => {
      providerCalled = true;
      return { released: true };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(providerCalled, false);
  assert.equal(cameraPermissionReleaseDescriptor.defaultDryRun, true);
  assert.equal(cameraPermissionReleaseDescriptor.unsafeSideEffects, true);
  if (!result.ok) return;

  assert.equal(result.output.kind, "agentCore.basicTool.computeruse.cameraPermissionRelease");
  assert.equal(result.output.dispatch, "dry-run");
  assert.equal(result.output.target.leaseId, "lease:camera:1");
  assert.equal(result.output.target.deviceId, "camera-1");
  assert.equal(result.output.target.reason, "camera workflow finished");
  assert.equal(result.output.providerCalled, false);
  assert.equal(result.output.permissionEnvelope.resource, "camera");
  assert.equal(result.output.permissionEnvelope.releaseRequested, false);
  assert.equal(result.output.permissionEnvelope.released, false);
  assert.equal(result.output.permissionEnvelope.metadataOnly, true);
  assert.equal(result.output.runtimeEntry.port, "BaseToolExecutorPort.computeruse.releasePermission");
  assert.equal(result.output.runtimeEntry.baseToolOwnsTapStrategy, false);
});

test("planCameraPermissionRelease classifies malformed JSON, missing fields, invalid target, scope, and guard gaps", async () => {
  const malformedRequest = await planCameraPermissionRelease("bad");
  assert.equal(malformedRequest.ok, false);
  if (!malformedRequest.ok) assert.equal(malformedRequest.error.code, "INVALID_REQUEST");

  const malformedContext = await planCameraPermissionRelease({ target: {}, context: "bad" });
  assert.equal(malformedContext.ok, false);
  if (!malformedContext.ok) assert.equal(malformedContext.error.code, "INVALID_CONTEXT");

  const malformedTarget = await planCameraPermissionRelease({
    target: "bad",
    context: { runtimeId: "runtime-1" },
  });
  assert.equal(malformedTarget.ok, false);
  if (!malformedTarget.ok) assert.equal(malformedTarget.error.code, "INVALID_TARGET");

  const missingRuntime = await planCameraPermissionRelease({ leaseId: "lease:camera:1" });
  assert.equal(missingRuntime.ok, false);
  if (!missingRuntime.ok) assert.equal(missingRuntime.error.code, "MISSING_RUNTIME_ID");

  const missingLease = await planCameraPermissionRelease({ context: { runtimeId: "runtime-1" } });
  assert.equal(missingLease.ok, false);
  if (!missingLease.ok) assert.equal(missingLease.error.code, "MISSING_LEASE_ID");

  const invalidLease = await planCameraPermissionRelease({
    context: { runtimeId: "runtime-1" },
    leaseId: "\0",
  });
  assert.equal(invalidLease.ok, false);
  if (!invalidLease.ok) assert.equal(invalidLease.error.code, "INVALID_LEASE_ID");

  const invalidDevice = await planCameraPermissionRelease({
    context: { runtimeId: "runtime-1" },
    leaseId: "lease:camera:1",
    deviceId: "\0",
  });
  assert.equal(invalidDevice.ok, false);
  if (!invalidDevice.ok) assert.equal(invalidDevice.error.code, "INVALID_DEVICE_ID");

  const deniedScope = await planCameraPermissionRelease({
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

test("executeCameraPermissionReleaseCore requires guard and maps missing or failing provider to public-safe errors", async () => {
  const noGuard = await executeCameraPermissionReleaseCore({
    ...legalDryRunInput(),
    context: { ...legalDryRunInput().context, dryRun: false },
  });
  assert.equal(noGuard.ok, false);
  if (!noGuard.ok) assert.equal(noGuard.error.code, "GOVERNANCE_REJECTED");

  const missingProvider = await executeCameraPermissionReleaseCore({
    ...legalDryRunInput(),
    context: { ...legalDryRunInput().context, dryRun: false, guard: { accepted: true } },
  });
  assert.equal(missingProvider.ok, false);
  if (!missingProvider.ok) {
    assert.equal(missingProvider.error.code, "PROVIDER_UNAVAILABLE");
    assert.equal(missingProvider.error.publicSafe, true);
    assert.equal(missingProvider.error.internalDetailExposed, false);
  }

  const failedProvider = await executeCameraPermissionReleaseCore({
    ...legalDryRunInput(),
    context: { ...legalDryRunInput().context, dryRun: false, guard: { accepted: true } },
    provider: () => {
      throw new Error("private camera release backend path");
    },
  });
  assert.equal(failedProvider.ok, false);
  if (!failedProvider.ok) {
    assert.equal(failedProvider.error.code, "PROVIDER_FAILURE");
    assert.equal(failedProvider.error.publicSafe, true);
    assert.equal(failedProvider.error.message.includes("private camera"), false);
  }
});

test("cameraPermissionReleaseHandler invokes runtime-owned executor.computeruse.releasePermission when guarded", async () => {
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

  const result = await cameraPermissionReleaseHandler.invoke({
    toolCallId: "tool-call-1",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    executor,
    input: {
      target: {
        leaseId: "lease:camera:1",
        deviceId: "camera-1",
        reason: "camera workflow finished",
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
  assert.equal(runtimeCall.resource, "camera");
  assert.equal(runtimeCall.leaseId, "lease:camera:1");
  assert.equal(runtimeCall.deviceId, "camera-1");
  assert.equal(runtimeCall.metadata?.runtimeId, "runtime-1");
  assert.equal(runtimeCall.metadata?.sessionId, "session-1");
  assert.equal(runtimeCall.metadata?.invocationId, "tool-call-1");
  assert.equal(runtimeCall.metadata?.reason, "camera workflow finished");
  if (!result.ok) return;
  assert.equal(result.output.dispatch, "runtime-computeruse");
  assert.equal(result.output.providerCalled, true);
  assert.equal(result.output.permissionEnvelope.released, true);
  assert.equal(result.output.permissionEnvelope.leaseId, "lease:camera:1");
});

test("createBaseToolRegistry resolves computeruse.cameraPermissionRelease handler and does not fallback without executor.computeruse", async () => {
  const lookup = createBaseToolRegistry().lookupHandler("computeruse.cameraPermissionRelease");
  assert.equal(lookup.ok, true);
  if (!lookup.ok) return;

  const result = await lookup.handler.invoke({
    toolCallId: "tool-call-2",
    runtimeId: "runtime-2",
    sessionId: "session-2",
    executor: {},
    input: {
      leaseId: "lease:camera:1",
      context: { dryRun: false, guard: { accepted: true } },
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "PROVIDER_UNAVAILABLE");
    assert.equal(result.error.publicSafe, true);
  }
});

test("computeruse.cameraPermissionRelease keeps canonical storage shape and operational doc boundary", () => {
  const storageDir = path.join(repoRoot, "src/storagePool/baseToolStorage/computeruseBase/cameraAccess/computeruse.cameraPermissionRelease");
  for (const fileName of [
    "core.ts",
    "bestPractice.ts",
    "dependencies.ts",
    "anthropic.ts",
    "openai.ts",
    "deepmind.ts",
    "computeruse.cameraPermissionRelease.md",
  ]) {
    assert.ok(existsSync(path.join(storageDir, fileName)), "missing canonical storage file: " + fileName);
  }
  assert.equal(existsSync(path.join(repoRoot, "src/storagePool/baseToolStorage/computeruseBase/cameraAccess/computeruse.cameraPermissionRelease.ts")), false);

  const entryText = readFileSync(
    path.join(repoRoot, "src/agentCore_executionEngine/basic_toolLayer/baseTools/computeruseBase/cameraAccess/computeruse.cameraPermissionRelease.ts"),
    "utf8",
  );
  assert.doesNotMatch(entryText, /export\s+\*\s+from/u);
  assert.match(entryText, /cameraPermissionReleaseHandler/u);

  const docText = readFileSync(path.join(storageDir, "computeruse.cameraPermissionRelease.md"), "utf8");
  for (const heading of ["## Use This Tool", "## Call Shape", "## Required Inputs", "## Optional Inputs", "## Runtime Behavior", "## Returns", "## Example", "## Avoid"]) {
    assert.match(docText, new RegExp("^" + heading.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "mu"));
  }
  assert.match(docText, /BaseToolExecutorPort\.computeruse\.releasePermission/u);
  assert.match(docText, /TAP\/agent owns that composition/u);
  assert.match(docText, /Do not hide local shell/u);
});
