import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { BaseToolExecutorPort } from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { createBaseToolRegistry } from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import {
  cameraCapturePhotoDescriptor,
  cameraCapturePhotoHandler,
  executeCameraCapturePhotoCore,
  planCameraCapturePhoto,
} from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/computeruseBase/cameraAccess/computeruse.cameraCapturePhoto.js";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "../../../../../../..");

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_executionEngine/basic_toolLayer/baseTools/computeruseBase/cameraAccess/computeruse.cameraCapturePhoto.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/cameraAccess/computeruse.cameraCapturePhoto.md",
  testFileUrl: import.meta.url,
});

function legalDryRunInput() {
  return {
    target: {
      cameraId: "front-camera",
      purpose: "visual debug snapshot",
      outputFormat: "image/png",
      permissionLeaseId: "lease:camera:1",
    },
    context: {
      runtimeId: "runtime-1",
      invocationId: "camera-photo-1",
      requestedScopes: ["tool:computeruse:camera"],
      allowedScopes: ["tool:computeruse:camera"],
    },
  } as const;
}

test("planCameraCapturePhoto creates a guarded dry-run artifact envelope without calling provider", async () => {
  let providerCalled = false;
  const result = await planCameraCapturePhoto({
    ...legalDryRunInput(),
    provider: () => {
      providerCalled = true;
      return { artifactId: "artifact:camera-photo:1", mimeType: "image/png" };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(providerCalled, false);
  assert.equal(cameraCapturePhotoDescriptor.defaultDryRun, true);
  assert.equal(cameraCapturePhotoDescriptor.unsafeSideEffects, true);
  if (!result.ok) return;

  assert.equal(result.output.kind, "agentCore.basicTool.computeruse.cameraCapturePhoto");
  assert.equal(result.output.dispatch, "dry-run");
  assert.equal(result.output.target.cameraId, "front-camera");
  assert.equal(result.output.target.purpose, "visual debug snapshot");
  assert.equal(result.output.target.outputFormat, "image/png");
  assert.equal(result.output.providerCalled, false);
  assert.equal(result.output.artifactEnvelope.resource, "camera-photo");
  assert.equal(result.output.artifactEnvelope.captured, false);
  assert.equal(result.output.artifactEnvelope.metadataOnly, true);
  assert.equal(result.output.runtimeEntry.port, "BaseToolExecutorPort.computeruse.captureCameraPhoto");
  assert.equal(result.output.runtimeEntry.baseToolOwnsTapStrategy, false);
});

test("planCameraCapturePhoto classifies malformed JSON, missing fields, invalid target, scope, and guard gaps", async () => {
  const malformedRequest = await planCameraCapturePhoto("bad");
  assert.equal(malformedRequest.ok, false);
  if (!malformedRequest.ok) assert.equal(malformedRequest.error.code, "INVALID_REQUEST");

  const malformedContext = await planCameraCapturePhoto({ target: {}, context: "bad" });
  assert.equal(malformedContext.ok, false);
  if (!malformedContext.ok) assert.equal(malformedContext.error.code, "INVALID_CONTEXT");

  const malformedTarget = await planCameraCapturePhoto({
    target: "bad",
    context: { runtimeId: "runtime-1" },
  });
  assert.equal(malformedTarget.ok, false);
  if (!malformedTarget.ok) assert.equal(malformedTarget.error.code, "INVALID_TARGET");

  const missingRuntime = await planCameraCapturePhoto({
    cameraId: "front-camera",
    purpose: "visual debug snapshot",
  });
  assert.equal(missingRuntime.ok, false);
  if (!missingRuntime.ok) assert.equal(missingRuntime.error.code, "MISSING_RUNTIME_ID");

  const missingCamera = await planCameraCapturePhoto({
    context: { runtimeId: "runtime-1" },
    purpose: "visual debug snapshot",
  });
  assert.equal(missingCamera.ok, false);
  if (!missingCamera.ok) assert.equal(missingCamera.error.code, "MISSING_CAMERA_ID");

  const missingPurpose = await planCameraCapturePhoto({
    context: { runtimeId: "runtime-1" },
    cameraId: "front-camera",
  });
  assert.equal(missingPurpose.ok, false);
  if (!missingPurpose.ok) assert.equal(missingPurpose.error.code, "MISSING_PURPOSE");

  const invalidCamera = await planCameraCapturePhoto({
    context: { runtimeId: "runtime-1" },
    cameraId: "\0",
    purpose: "visual debug snapshot",
  });
  assert.equal(invalidCamera.ok, false);
  if (!invalidCamera.ok) assert.equal(invalidCamera.error.code, "INVALID_CAMERA_ID");

  const invalidFormat = await planCameraCapturePhoto({
    context: { runtimeId: "runtime-1" },
    cameraId: "front-camera",
    purpose: "visual debug snapshot",
    outputFormat: "image/gif",
  });
  assert.equal(invalidFormat.ok, false);
  if (!invalidFormat.ok) assert.equal(invalidFormat.error.code, "INVALID_OUTPUT_FORMAT");

  const deniedScope = await planCameraCapturePhoto({
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

test("executeCameraCapturePhotoCore requires guard and maps missing or failing provider to public-safe errors", async () => {
  const noGuard = await executeCameraCapturePhotoCore({
    ...legalDryRunInput(),
    context: { ...legalDryRunInput().context, dryRun: false },
  });
  assert.equal(noGuard.ok, false);
  if (!noGuard.ok) assert.equal(noGuard.error.code, "GOVERNANCE_REJECTED");

  const missingProvider = await executeCameraCapturePhotoCore({
    ...legalDryRunInput(),
    context: { ...legalDryRunInput().context, dryRun: false, guard: { accepted: true } },
  });
  assert.equal(missingProvider.ok, false);
  if (!missingProvider.ok) {
    assert.equal(missingProvider.error.code, "PROVIDER_UNAVAILABLE");
    assert.equal(missingProvider.error.publicSafe, true);
    assert.equal(missingProvider.error.internalDetailExposed, false);
  }

  const failedProvider = await executeCameraCapturePhotoCore({
    ...legalDryRunInput(),
    context: { ...legalDryRunInput().context, dryRun: false, guard: { accepted: true } },
    provider: () => {
      throw new Error("private camera capture backend path");
    },
  });
  assert.equal(failedProvider.ok, false);
  if (!failedProvider.ok) {
    assert.equal(failedProvider.error.code, "PROVIDER_FAILURE");
    assert.equal(failedProvider.error.publicSafe, true);
    assert.equal(failedProvider.error.message.includes("private camera"), false);
  }
});

test("cameraCapturePhotoHandler invokes runtime-owned executor.computeruse.captureCameraPhoto when guarded", async () => {
  const calls: unknown[] = [];
  const executor: BaseToolExecutorPort = {
    computeruse: {
      async captureCameraPhoto(request) {
        calls.push(request);
        return {
          ok: true,
          output: {
            artifactId: "artifact:camera-photo:1",
            mimeType: request.outputFormat ?? "image/jpeg",
            metadata: { runtimeCarrier: "fake-computeruse" },
          },
          metadata: { adapter: "fake-runtime" },
        };
      },
    },
  };

  const result = await cameraCapturePhotoHandler.invoke({
    toolCallId: "tool-call-1",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    executor,
    input: {
      target: {
        cameraId: "front-camera",
        purpose: "visual debug snapshot",
        outputFormat: "image/png",
        permissionLeaseId: "lease:camera:1",
      },
      context: { dryRun: false, guard: { accepted: true } },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  const runtimeCall = calls[0] as {
    cameraId?: string;
    purpose?: string;
    outputFormat?: string;
    metadata?: Record<string, unknown>;
  };
  assert.equal(runtimeCall.cameraId, "front-camera");
  assert.equal(runtimeCall.purpose, "visual debug snapshot");
  assert.equal(runtimeCall.outputFormat, "image/png");
  assert.equal(runtimeCall.metadata?.runtimeId, "runtime-1");
  assert.equal(runtimeCall.metadata?.sessionId, "session-1");
  assert.equal(runtimeCall.metadata?.invocationId, "tool-call-1");
  assert.equal(runtimeCall.metadata?.permissionLeaseId, "lease:camera:1");
  if (!result.ok) return;
  assert.equal(result.output.dispatch, "runtime-computeruse");
  assert.equal(result.output.providerCalled, true);
  assert.equal(result.output.artifactEnvelope.captured, true);
  assert.equal(result.output.artifactEnvelope.artifactId, "artifact:camera-photo:1");
  assert.equal(result.output.artifactEnvelope.mimeType, "image/png");
});

test("createBaseToolRegistry resolves computeruse.cameraCapturePhoto handler and does not fallback without executor.computeruse", async () => {
  const lookup = createBaseToolRegistry().lookupHandler("computeruse.cameraCapturePhoto");
  assert.equal(lookup.ok, true);
  if (!lookup.ok) return;

  const result = await lookup.handler.invoke({
    toolCallId: "tool-call-2",
    runtimeId: "runtime-2",
    sessionId: "session-2",
    executor: {},
    input: {
      cameraId: "front-camera",
      purpose: "visual debug snapshot",
      context: { dryRun: false, guard: { accepted: true } },
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "PROVIDER_UNAVAILABLE");
    assert.equal(result.error.publicSafe, true);
  }
});

test("computeruse.cameraCapturePhoto keeps canonical storage shape and operational doc boundary", () => {
  const storageDir = path.join(repoRoot, "src/storagePool/baseToolStorage/computeruseBase/cameraAccess/computeruse.cameraCapturePhoto");
  for (const fileName of [
    "core.ts",
    "bestPractice.ts",
    "dependencies.ts",
    "anthropic.ts",
    "openai.ts",
    "deepmind.ts",
    "computeruse.cameraCapturePhoto.md",
  ]) {
    assert.ok(existsSync(path.join(storageDir, fileName)), "missing canonical storage file: " + fileName);
  }
  assert.equal(existsSync(path.join(repoRoot, "src/storagePool/baseToolStorage/computeruseBase/cameraAccess/computeruse.cameraCapturePhoto.ts")), false);

  const entryText = readFileSync(
    path.join(repoRoot, "src/agentCore_executionEngine/basic_toolLayer/baseTools/computeruseBase/cameraAccess/computeruse.cameraCapturePhoto.ts"),
    "utf8",
  );
  assert.doesNotMatch(entryText, /export\s+\*\s+from/u);
  assert.match(entryText, /cameraCapturePhotoHandler/u);

  const docText = readFileSync(path.join(storageDir, "computeruse.cameraCapturePhoto.md"), "utf8");
  for (const heading of ["## Use This Tool", "## Call Shape", "## Required Inputs", "## Optional Inputs", "## Runtime Behavior", "## Returns", "## Example", "## Avoid"]) {
    assert.match(docText, new RegExp("^" + heading.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "mu"));
  }
  assert.match(docText, /BaseToolExecutorPort\.computeruse\.captureCameraPhoto/u);
  assert.match(docText, /TAP\/agent/u);
});
