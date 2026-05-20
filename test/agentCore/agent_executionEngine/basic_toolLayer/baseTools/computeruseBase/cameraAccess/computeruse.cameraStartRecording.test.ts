import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { BaseToolExecutorPort } from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { createBaseToolRegistry } from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import {
  cameraStartRecordingDescriptor,
  cameraStartRecordingHandler,
  executeCameraStartRecordingCore,
  planCameraStartRecording,
} from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/computeruseBase/cameraAccess/computeruse.cameraStartRecording.js";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "../../../../../../..");

defineAgentCoreContractTest({
  sourcePath: "src/executionEngine/basic_toolLayer/baseTools/computeruseBase/cameraAccess/computeruse.cameraStartRecording.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/cameraAccess/computeruse.cameraStartRecording.md",
  testFileUrl: import.meta.url,
});

function legalDryRunInput() {
  return {
    target: {
      cameraId: "front-camera",
      purpose: "record a governed camera verification clip",
      outputFormat: "video/webm",
      includeAudio: true,
      maxDurationMs: 30_000,
      recordingLabel: "demo",
      destinationHint: "recordings/demo.webm",
      permissionLeaseId: "lease:camera:1",
    },
    context: {
      runtimeId: "runtime-1",
      invocationId: "camera-recording-start-1",
      requestedScopes: ["tool:computeruse:camera"],
      allowedScopes: ["tool:computeruse:camera"],
    },
  } as const;
}

test("planCameraStartRecording creates a guarded dry-run recording envelope without calling provider", async () => {
  let providerCalled = false;
  const result = await planCameraStartRecording({
    ...legalDryRunInput(),
    provider: () => {
      providerCalled = true;
      return { recordingId: "recording:camera:1" };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(providerCalled, false);
  assert.equal(cameraStartRecordingDescriptor.defaultDryRun, true);
  assert.equal(cameraStartRecordingDescriptor.unsafeSideEffects, true);
  if (!result.ok) return;

  assert.equal(result.output.kind, "agentCore.basicTool.computeruse.cameraStartRecording");
  assert.equal(result.output.dispatch, "dry-run");
  assert.equal(result.output.target.cameraId, "front-camera");
  assert.equal(result.output.target.outputFormat, "video/webm");
  assert.equal(result.output.target.includeAudio, true);
  assert.equal(result.output.target.maxDurationMs, 30_000);
  assert.equal(result.output.providerCalled, false);
  assert.equal(result.output.recordingEnvelope.resource, "camera");
  assert.equal(result.output.recordingEnvelope.startRequested, false);
  assert.equal(result.output.recordingEnvelope.started, false);
  assert.equal(result.output.recordingEnvelope.metadataOnly, true);
  assert.equal(result.output.runtimeEntry.port, "BaseToolExecutorPort.computeruse.startRecording");
  assert.equal(result.output.runtimeEntry.baseToolOwnsTapStrategy, false);
});

test("planCameraStartRecording classifies malformed JSON, missing fields, invalid target, scope, and duration", async () => {
  const malformedRequest = await planCameraStartRecording("bad");
  assert.equal(malformedRequest.ok, false);
  if (!malformedRequest.ok) assert.equal(malformedRequest.error.code, "INVALID_REQUEST");

  const malformedContext = await planCameraStartRecording({ target: {}, context: "bad" });
  assert.equal(malformedContext.ok, false);
  if (!malformedContext.ok) assert.equal(malformedContext.error.code, "INVALID_CONTEXT");

  const malformedTarget = await planCameraStartRecording({
    target: "bad",
    context: { runtimeId: "runtime-1" },
  });
  assert.equal(malformedTarget.ok, false);
  if (!malformedTarget.ok) assert.equal(malformedTarget.error.code, "INVALID_TARGET");

  const missingRuntime = await planCameraStartRecording({
    cameraId: "front-camera",
    purpose: "record a clip",
  });
  assert.equal(missingRuntime.ok, false);
  if (!missingRuntime.ok) assert.equal(missingRuntime.error.code, "MISSING_RUNTIME_ID");

  const missingCamera = await planCameraStartRecording({
    context: { runtimeId: "runtime-1" },
    purpose: "record a clip",
  });
  assert.equal(missingCamera.ok, false);
  if (!missingCamera.ok) assert.equal(missingCamera.error.code, "MISSING_CAMERA_ID");

  const missingPurpose = await planCameraStartRecording({
    context: { runtimeId: "runtime-1" },
    cameraId: "front-camera",
  });
  assert.equal(missingPurpose.ok, false);
  if (!missingPurpose.ok) assert.equal(missingPurpose.error.code, "MISSING_PURPOSE");

  const invalidFormat = await planCameraStartRecording({
    context: { runtimeId: "runtime-1" },
    cameraId: "front-camera",
    purpose: "record a clip",
    outputFormat: "video/avi",
  });
  assert.equal(invalidFormat.ok, false);
  if (!invalidFormat.ok) assert.equal(invalidFormat.error.code, "INVALID_OUTPUT_FORMAT");

  const invalidAudio = await planCameraStartRecording({
    context: { runtimeId: "runtime-1" },
    cameraId: "front-camera",
    purpose: "record a clip",
    includeAudio: "yes",
  });
  assert.equal(invalidAudio.ok, false);
  if (!invalidAudio.ok) assert.equal(invalidAudio.error.code, "INVALID_INCLUDE_AUDIO");

  const invalidDuration = await planCameraStartRecording({
    context: { runtimeId: "runtime-1" },
    cameraId: "front-camera",
    purpose: "record a clip",
    maxDurationMs: 0,
  });
  assert.equal(invalidDuration.ok, false);
  if (!invalidDuration.ok) assert.equal(invalidDuration.error.code, "INVALID_MAX_DURATION");

  const deniedScope = await planCameraStartRecording({
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

test("executeCameraStartRecordingCore requires guard and maps missing or failing provider to public-safe errors", async () => {
  const noGuard = await executeCameraStartRecordingCore({
    ...legalDryRunInput(),
    context: { ...legalDryRunInput().context, dryRun: false },
  });
  assert.equal(noGuard.ok, false);
  if (!noGuard.ok) assert.equal(noGuard.error.code, "GOVERNANCE_REJECTED");

  const missingProvider = await executeCameraStartRecordingCore({
    ...legalDryRunInput(),
    context: { ...legalDryRunInput().context, dryRun: false, guard: { accepted: true } },
  });
  assert.equal(missingProvider.ok, false);
  if (!missingProvider.ok) {
    assert.equal(missingProvider.error.code, "PROVIDER_UNAVAILABLE");
    assert.equal(missingProvider.error.publicSafe, true);
    assert.equal(missingProvider.error.internalDetailExposed, false);
  }

  const failedProvider = await executeCameraStartRecordingCore({
    ...legalDryRunInput(),
    context: { ...legalDryRunInput().context, dryRun: false, guard: { accepted: true } },
    provider: () => {
      throw new Error("private camera recording backend path");
    },
  });
  assert.equal(failedProvider.ok, false);
  if (!failedProvider.ok) {
    assert.equal(failedProvider.error.code, "PROVIDER_FAILURE");
    assert.equal(failedProvider.error.publicSafe, true);
    assert.equal(failedProvider.error.message.includes("private camera"), false);
  }
});

test("cameraStartRecordingHandler invokes runtime-owned executor.computeruse.startRecording when guarded", async () => {
  const calls: unknown[] = [];
  const executor: BaseToolExecutorPort = {
    computeruse: {
      async startRecording(request) {
        calls.push(request);
        return {
          ok: true,
          output: {
            recordingId: "recording:camera:1",
            metadata: { runtimeCarrier: "fake-computeruse" },
          },
          metadata: { adapter: "fake-runtime" },
        };
      },
    },
  };

  const result = await cameraStartRecordingHandler.invoke({
    toolCallId: "tool-call-1",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    executor,
    input: {
      target: {
        cameraId: "front-camera",
        purpose: "record a governed camera verification clip",
        outputFormat: "video/mp4",
        includeAudio: false,
        maxDurationMs: 30_000,
        recordingLabel: "demo",
        destinationHint: "recordings/demo.mp4",
        permissionLeaseId: "lease:camera:1",
      },
      context: { dryRun: false, guard: { accepted: true } },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  const runtimeCall = calls[0] as {
    resource?: string;
    target?: Record<string, unknown>;
    outputFormat?: string;
    metadata?: Record<string, unknown>;
  };
  assert.equal(runtimeCall.resource, "camera");
  assert.equal(runtimeCall.outputFormat, "video/mp4");
  assert.equal(runtimeCall.target?.cameraId, "front-camera");
  assert.equal(runtimeCall.target?.purpose, "record a governed camera verification clip");
  assert.equal(runtimeCall.target?.includeAudio, false);
  assert.equal(runtimeCall.target?.maxDurationMs, 30_000);
  assert.equal(runtimeCall.target?.permissionLeaseId, "lease:camera:1");
  assert.equal(runtimeCall.metadata?.runtimeId, "runtime-1");
  assert.equal(runtimeCall.metadata?.sessionId, "session-1");
  assert.equal(runtimeCall.metadata?.invocationId, "tool-call-1");
  if (!result.ok) return;
  assert.equal(result.output.dispatch, "runtime-computeruse");
  assert.equal(result.output.providerCalled, true);
  assert.equal(result.output.recordingEnvelope.started, true);
  assert.equal(result.output.recordingEnvelope.recordingId, "recording:camera:1");
});

test("createBaseToolRegistry resolves computeruse.cameraStartRecording handler and does not fallback without executor.computeruse", async () => {
  const lookup = createBaseToolRegistry().lookupHandler("computeruse.cameraStartRecording");
  assert.equal(lookup.ok, true);
  if (!lookup.ok) return;

  const result = await lookup.handler.invoke({
    toolCallId: "tool-call-2",
    runtimeId: "runtime-2",
    sessionId: "session-2",
    executor: {},
    input: {
      cameraId: "front-camera",
      purpose: "record a clip",
      context: { dryRun: false, guard: { accepted: true } },
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "PROVIDER_UNAVAILABLE");
    assert.equal(result.error.publicSafe, true);
  }
});

test("computeruse.cameraStartRecording keeps canonical storage shape and operational doc boundary", () => {
  const storageDir = path.join(repoRoot, "src/storagePool/baseToolStorage/computeruseBase/cameraAccess/computeruse.cameraStartRecording");
  for (const fileName of [
    "core.ts",
    "bestPractice.ts",
    "dependencies.ts",
    "anthropic.ts",
    "openai.ts",
    "deepmind.ts",
    "computeruse.cameraStartRecording.md",
  ]) {
    assert.ok(existsSync(path.join(storageDir, fileName)), "missing canonical storage file: " + fileName);
  }
  assert.equal(existsSync(path.join(repoRoot, "src/storagePool/baseToolStorage/computeruseBase/cameraAccess/computeruse.cameraStartRecording.ts")), false);

  const entryText = readFileSync(
    path.join(repoRoot, "src/executionEngine/basic_toolLayer/baseTools/computeruseBase/cameraAccess/computeruse.cameraStartRecording.ts"),
    "utf8",
  );
  assert.doesNotMatch(entryText, /export\s+\*\s+from/u);
  assert.match(entryText, /cameraStartRecordingHandler/u);

  const docText = readFileSync(path.join(storageDir, "computeruse.cameraStartRecording.md"), "utf8");
  for (const heading of ["## Use This Tool", "## Call Shape", "## Required Inputs", "## Optional Inputs", "## Runtime Behavior", "## Returns", "## Example", "## Avoid"]) {
    assert.match(docText, new RegExp("^" + heading.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "mu"));
  }
  assert.match(docText, /BaseToolExecutorPort\.computeruse\.startRecording/u);
  assert.match(docText, /TAP\/agent/u);
});
