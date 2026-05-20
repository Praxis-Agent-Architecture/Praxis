import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { BaseToolExecutorPort } from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { createBaseToolRegistry } from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import {
  cameraPermissionRequestDescriptor,
  cameraPermissionRequestHandler,
  executeCameraPermissionRequestCore,
  planCameraPermissionRequest,
} from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/computeruseBase/cameraAccess/computeruse.cameraPermissionRequest.js";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "../../../../../../..");

defineAgentCoreContractTest({
  sourcePath: "src/executionEngine/basic_toolLayer/baseTools/computeruseBase/cameraAccess/computeruse.cameraPermissionRequest.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/cameraAccess/computeruse.cameraPermissionRequest.md",
  testFileUrl: import.meta.url,
});

function legalDryRunInput() {
  return {
    target: {
      targetApplication: "visual-capture",
      purpose: "capture a session-scoped camera photo",
      deviceId: "camera-1",
      mode: "single-capture",
      requestedDurationMs: 30_000,
    },
    context: {
      runtimeId: "runtime-1",
      invocationId: "camera-permission-1",
      requestedScopes: ["tool:computeruse:camera"],
      allowedScopes: ["tool:computeruse:camera"],
    },
  } as const;
}

test("planCameraPermissionRequest creates a guarded dry-run permission envelope without calling provider", async () => {
  let providerCalled = false;
  const result = await planCameraPermissionRequest({
    ...legalDryRunInput(),
    provider: () => {
      providerCalled = true;
      return { granted: true, leaseId: "should-not-be-used" };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(providerCalled, false);
  assert.equal(cameraPermissionRequestDescriptor.defaultDryRun, true);
  assert.equal(cameraPermissionRequestDescriptor.unsafeSideEffects, true);
  if (!result.ok) return;

  assert.equal(result.output.kind, "agentCore.basicTool.computeruse.cameraPermissionRequest");
  assert.equal(result.output.dispatch, "dry-run");
  assert.equal(result.output.target.targetApplication, "visual-capture");
  assert.equal(result.output.target.purpose, "capture a session-scoped camera photo");
  assert.equal(result.output.target.deviceId, "camera-1");
  assert.equal(result.output.target.mode, "single-capture");
  assert.equal(result.output.target.requestedDurationMs, 30_000);
  assert.equal(result.output.providerCalled, false);
  assert.equal(result.output.permissionEnvelope.resource, "camera");
  assert.equal(result.output.permissionEnvelope.requested, false);
  assert.equal(result.output.permissionEnvelope.metadataOnly, true);
  assert.equal(result.output.runtimeEntry.port, "BaseToolExecutorPort.computeruse.requestPermission");
  assert.equal(result.output.runtimeEntry.baseToolOwnsTapStrategy, false);
});

test("planCameraPermissionRequest classifies malformed JSON, missing fields, invalid target, scope, and duration gaps", async () => {
  const malformedRequest = await planCameraPermissionRequest("bad");
  assert.equal(malformedRequest.ok, false);
  if (!malformedRequest.ok) assert.equal(malformedRequest.error.code, "INVALID_REQUEST");

  const malformedContext = await planCameraPermissionRequest({ target: {}, context: "bad" });
  assert.equal(malformedContext.ok, false);
  if (!malformedContext.ok) assert.equal(malformedContext.error.code, "INVALID_CONTEXT");

  const malformedTarget = await planCameraPermissionRequest({
    target: "bad",
    context: { runtimeId: "runtime-1" },
  });
  assert.equal(malformedTarget.ok, false);
  if (!malformedTarget.ok) assert.equal(malformedTarget.error.code, "INVALID_TARGET");

  const missingRuntime = await planCameraPermissionRequest({
    targetApplication: "visual-capture",
    purpose: "capture a photo",
  });
  assert.equal(missingRuntime.ok, false);
  if (!missingRuntime.ok) assert.equal(missingRuntime.error.code, "MISSING_RUNTIME_ID");

  const missingTargetApplication = await planCameraPermissionRequest({
    context: { runtimeId: "runtime-1" },
    purpose: "capture a photo",
  });
  assert.equal(missingTargetApplication.ok, false);
  if (!missingTargetApplication.ok) assert.equal(missingTargetApplication.error.code, "MISSING_TARGET_APPLICATION");

  const missingPurpose = await planCameraPermissionRequest({
    context: { runtimeId: "runtime-1" },
    targetApplication: "visual-capture",
  });
  assert.equal(missingPurpose.ok, false);
  if (!missingPurpose.ok) assert.equal(missingPurpose.error.code, "MISSING_PURPOSE");

  const invalidDevice = await planCameraPermissionRequest({
    context: { runtimeId: "runtime-1" },
    targetApplication: "visual-capture",
    purpose: "capture a photo",
    deviceId: "\0",
  });
  assert.equal(invalidDevice.ok, false);
  if (!invalidDevice.ok) assert.equal(invalidDevice.error.code, "INVALID_DEVICE_ID");

  const invalidMode = await planCameraPermissionRequest({
    context: { runtimeId: "runtime-1" },
    targetApplication: "visual-capture",
    purpose: "capture a photo",
    mode: "scan",
  });
  assert.equal(invalidMode.ok, false);
  if (!invalidMode.ok) assert.equal(invalidMode.error.code, "INVALID_MODE");

  const overLimit = await planCameraPermissionRequest({
    context: { runtimeId: "runtime-1" },
    targetApplication: "visual-capture",
    purpose: "capture a photo",
    requestedDurationMs: 10_001,
    maxDurationMs: 10_000,
  });
  assert.equal(overLimit.ok, false);
  if (!overLimit.ok) assert.equal(overLimit.error.code, "DURATION_LIMIT_EXCEEDED");

  const deniedScope = await planCameraPermissionRequest({
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

test("executeCameraPermissionRequestCore requires guard and maps missing or failing provider to public-safe errors", async () => {
  const noGuard = await executeCameraPermissionRequestCore({
    ...legalDryRunInput(),
    context: { ...legalDryRunInput().context, dryRun: false },
  });
  assert.equal(noGuard.ok, false);
  if (!noGuard.ok) assert.equal(noGuard.error.code, "GOVERNANCE_REJECTED");

  const missingProvider = await executeCameraPermissionRequestCore({
    ...legalDryRunInput(),
    context: { ...legalDryRunInput().context, dryRun: false, guard: { accepted: true } },
  });
  assert.equal(missingProvider.ok, false);
  if (!missingProvider.ok) {
    assert.equal(missingProvider.error.code, "PROVIDER_UNAVAILABLE");
    assert.equal(missingProvider.error.publicSafe, true);
    assert.equal(missingProvider.error.internalDetailExposed, false);
  }

  const failedProvider = await executeCameraPermissionRequestCore({
    ...legalDryRunInput(),
    context: { ...legalDryRunInput().context, dryRun: false, guard: { accepted: true } },
    provider: () => {
      throw new Error("private camera permission backend path");
    },
  });
  assert.equal(failedProvider.ok, false);
  if (!failedProvider.ok) {
    assert.equal(failedProvider.error.code, "PROVIDER_FAILURE");
    assert.equal(failedProvider.error.publicSafe, true);
    assert.equal(failedProvider.error.message.includes("private camera"), false);
  }
});

test("cameraPermissionRequestHandler invokes runtime-owned executor.computeruse.requestPermission when guarded", async () => {
  const calls: unknown[] = [];
  const executor: BaseToolExecutorPort = {
    computeruse: {
      async requestPermission(request) {
        calls.push(request);
        return {
          ok: true,
          output: {
            granted: true,
            leaseId: "lease:camera:1",
            metadata: { runtimeCarrier: "fake-computeruse" },
          },
          metadata: { adapter: "fake-runtime" },
        };
      },
    },
  };

  const result = await cameraPermissionRequestHandler.invoke({
    toolCallId: "tool-call-1",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    executor,
    input: {
      target: {
        targetApplication: "visual-capture",
        purpose: "capture a camera photo",
        deviceId: "camera-1",
        mode: "single-capture",
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
  assert.equal(runtimeCall.resource, "camera");
  assert.equal(runtimeCall.purpose, "capture a camera photo");
  assert.equal(runtimeCall.deviceId, "camera-1");
  assert.equal(runtimeCall.metadata?.runtimeId, "runtime-1");
  assert.equal(runtimeCall.metadata?.sessionId, "session-1");
  assert.equal(runtimeCall.metadata?.invocationId, "tool-call-1");
  assert.equal(runtimeCall.metadata?.targetApplication, "visual-capture");
  if (!result.ok) return;
  assert.equal(result.output.dispatch, "runtime-computeruse");
  assert.equal(result.output.providerCalled, true);
  assert.equal(result.output.permissionEnvelope.granted, true);
  assert.equal(result.output.permissionEnvelope.leaseId, "lease:camera:1");
});

test("createBaseToolRegistry resolves computeruse.cameraPermissionRequest handler and does not fallback without executor.computeruse", async () => {
  const lookup = createBaseToolRegistry().lookupHandler("computeruse.cameraPermissionRequest");
  assert.equal(lookup.ok, true);
  if (!lookup.ok) return;

  const result = await lookup.handler.invoke({
    toolCallId: "tool-call-2",
    runtimeId: "runtime-2",
    sessionId: "session-2",
    executor: {},
    input: {
      targetApplication: "visual-capture",
      purpose: "capture a camera photo",
      context: { dryRun: false, guard: { accepted: true } },
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "PROVIDER_UNAVAILABLE");
    assert.equal(result.error.publicSafe, true);
  }
});

test("computeruse.cameraPermissionRequest keeps canonical storage shape and operational doc boundary", () => {
  const storageDir = path.join(repoRoot, "src/storagePool/baseToolStorage/computeruseBase/cameraAccess/computeruse.cameraPermissionRequest");
  for (const fileName of [
    "core.ts",
    "bestPractice.ts",
    "dependencies.ts",
    "anthropic.ts",
    "openai.ts",
    "deepmind.ts",
    "computeruse.cameraPermissionRequest.md",
  ]) {
    assert.ok(existsSync(path.join(storageDir, fileName)), "missing canonical storage file: " + fileName);
  }
  assert.equal(existsSync(path.join(repoRoot, "src/storagePool/baseToolStorage/computeruseBase/cameraAccess/computeruse.cameraPermissionRequest.ts")), false);

  const entryText = readFileSync(
    path.join(repoRoot, "src/executionEngine/basic_toolLayer/baseTools/computeruseBase/cameraAccess/computeruse.cameraPermissionRequest.ts"),
    "utf8",
  );
  assert.doesNotMatch(entryText, /export\s+\*\s+from/u);
  assert.match(entryText, /cameraPermissionRequestHandler/u);

  const docText = readFileSync(path.join(storageDir, "computeruse.cameraPermissionRequest.md"), "utf8");
  for (const heading of ["## Use This Tool", "## Call Shape", "## Required Inputs", "## Optional Inputs", "## Runtime Behavior", "## Returns", "## Example", "## Avoid"]) {
    assert.match(docText, new RegExp("^" + heading.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "mu"));
  }
  assert.match(docText, /BaseToolExecutorPort\.computeruse\.requestPermission/u);
  assert.match(docText, /TAP\/agent owns that composition/u);
  assert.match(docText, /Do not hide local shell/u);
});
