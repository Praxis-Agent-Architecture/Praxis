import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { BaseToolExecutorPort } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { createBaseToolRegistry } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import {
  cameraStopRecordingDescriptor,
  cameraStopRecordingHandler,
  executeCameraStopRecordingCore,
  planCameraStopRecording,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/cameraAccess/computeruse.cameraStopRecording.js";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "../../../../../../..");

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/cameraAccess/computeruse.cameraStopRecording.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/cameraAccess/computeruse.cameraStopRecording.md",
  testFileUrl: import.meta.url,
});

function legalDryRunInput() {
  return {
    target: {
      recordingId: "recording:camera:1",
      purpose: "finalize a governed camera verification clip",
      storageTarget: "session://recordings/camera-1.webm",
      retentionPolicy: "session-scoped",
      destinationHint: "recordings/camera-1.webm",
    },
    context: {
      runtimeId: "runtime-1",
      invocationId: "camera-stop-1",
      requestedScopes: ["tool:camera"],
      allowedScopes: ["tool:camera"],
      auditMetadata: { scenario: "unit" },
    },
    metadata: { reason: "done" },
  } as const;
}

test("planCameraStopRecording creates a guarded dry-run artifact envelope without calling provider", async () => {
  let providerCalled = false;
  const result = await planCameraStopRecording({
    ...legalDryRunInput(),
    provider: () => {
      providerCalled = true;
      return { artifactId: "artifact:video:camera:1", mimeType: "video/webm" };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(providerCalled, false);
  assert.equal(cameraStopRecordingDescriptor.defaultDryRun, true);
  assert.equal(cameraStopRecordingDescriptor.unsafeSideEffects, true);
  if (!result.ok) return;

  assert.equal(result.output.kind, "agentCore.basicTool.computeruse.cameraStopRecording");
  assert.equal(result.output.dispatch, "dry-run");
  assert.equal(result.output.target.recordingId, "recording:camera:1");
  assert.equal(result.output.target.purpose, "finalize a governed camera verification clip");
  assert.equal(result.output.target.storageTarget, "session://recordings/camera-1.webm");
  assert.equal(result.output.providerCalled, false);
  assert.equal(result.output.artifactEnvelope.resource, "camera-recording");
  assert.equal(result.output.artifactEnvelope.stopRequested, false);
  assert.equal(result.output.artifactEnvelope.stopped, false);
  assert.equal(result.output.artifactEnvelope.metadataOnly, true);
  assert.equal(result.output.runtimeEntry.port, "BaseToolExecutorPort.computeruse.stopRecording");
  assert.equal(result.output.runtimeEntry.baseToolOwnsTapStrategy, false);
});

test("planCameraStopRecording classifies malformed JSON, missing fields, invalid target, storage, and scope", async () => {
  const malformedRequest = await planCameraStopRecording("bad");
  assert.equal(malformedRequest.ok, false);
  if (!malformedRequest.ok) assert.equal(malformedRequest.error.code, "INVALID_REQUEST");

  const malformedContext = await planCameraStopRecording({ target: {}, context: "bad" });
  assert.equal(malformedContext.ok, false);
  if (!malformedContext.ok) assert.equal(malformedContext.error.code, "INVALID_CONTEXT");

  const malformedTarget = await planCameraStopRecording({
    target: "bad",
    context: { runtimeId: "runtime-1" },
  });
  assert.equal(malformedTarget.ok, false);
  if (!malformedTarget.ok) assert.equal(malformedTarget.error.code, "INVALID_TARGET");

  const missingRuntime = await planCameraStopRecording({
    recordingId: "recording:camera:1",
    purpose: "finalize clip",
  });
  assert.equal(missingRuntime.ok, false);
  if (!missingRuntime.ok) assert.equal(missingRuntime.error.code, "MISSING_RUNTIME_ID");

  const missingRecording = await planCameraStopRecording({
    context: { runtimeId: "runtime-1" },
    purpose: "finalize clip",
  });
  assert.equal(missingRecording.ok, false);
  if (!missingRecording.ok) assert.equal(missingRecording.error.code, "MISSING_RECORDING_ID");

  const missingPurpose = await planCameraStopRecording({
    context: { runtimeId: "runtime-1" },
    recordingId: "recording:camera:1",
  });
  assert.equal(missingPurpose.ok, false);
  if (!missingPurpose.ok) assert.equal(missingPurpose.error.code, "MISSING_PURPOSE");

  const invalidStorage = await planCameraStopRecording({
    context: { runtimeId: "runtime-1" },
    recordingId: "recording:camera:1",
    purpose: "finalize clip",
    storageTarget: "/tmp/private.webm",
  });
  assert.equal(invalidStorage.ok, false);
  if (!invalidStorage.ok) assert.equal(invalidStorage.error.code, "INVALID_STORAGE_TARGET");

  const deniedScope = await planCameraStopRecording({
    ...legalDryRunInput(),
    context: {
      runtimeId: "runtime-1",
      requestedScopes: ["tool:camera"],
      allowedScopes: [],
    },
  });
  assert.equal(deniedScope.ok, false);
  if (!deniedScope.ok) assert.equal(deniedScope.error.code, "SCOPE_DENIED");
});

test("executeCameraStopRecordingCore requires guard and maps missing or failing provider to public-safe errors", async () => {
  const noGuard = await executeCameraStopRecordingCore({
    ...legalDryRunInput(),
    context: { ...legalDryRunInput().context, dryRun: false },
  });
  assert.equal(noGuard.ok, false);
  if (!noGuard.ok) assert.equal(noGuard.error.code, "GOVERNANCE_REJECTED");

  const missingProvider = await executeCameraStopRecordingCore({
    ...legalDryRunInput(),
    context: { ...legalDryRunInput().context, dryRun: false, guard: { accepted: true } },
  });
  assert.equal(missingProvider.ok, false);
  if (!missingProvider.ok) {
    assert.equal(missingProvider.error.code, "PROVIDER_UNAVAILABLE");
    assert.equal(missingProvider.error.publicSafe, true);
    assert.equal(missingProvider.error.internalDetailExposed, false);
  }

  const failedProvider = await executeCameraStopRecordingCore({
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

test("cameraStopRecordingHandler invokes runtime-owned executor.computeruse.stopRecording when guarded", async () => {
  const calls: unknown[] = [];
  const executor: BaseToolExecutorPort = {
    computeruse: {
      async stopRecording(request) {
        calls.push(request);
        return {
          ok: true,
          output: {
            artifactId: "artifact:video:camera:1",
            mimeType: "video/webm",
            metadata: {
              storageUri: request.storageTarget,
              retentionPolicy: request.retentionPolicy,
              runtimeCarrier: "fake-computeruse",
            },
          },
          metadata: { adapter: "fake-runtime" },
        };
      },
    },
  };

  const result = await cameraStopRecordingHandler.invoke({
    toolCallId: "tool-call-1",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    executor,
    input: {
      target: {
        recordingId: "recording:camera:1",
        purpose: "finalize a governed camera verification clip",
        storageTarget: "session://recordings/camera-1.webm",
        retentionPolicy: "session-scoped",
      },
      context: { dryRun: false, guard: { accepted: true } },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  const runtimeCall = calls[0] as {
    resource?: string;
    recordingId?: string;
    storageTarget?: string;
    retentionPolicy?: string;
    purpose?: string;
    metadata?: Record<string, unknown>;
  };
  assert.equal(runtimeCall.resource, "camera");
  assert.equal(runtimeCall.recordingId, "recording:camera:1");
  assert.equal(runtimeCall.storageTarget, "session://recordings/camera-1.webm");
  assert.equal(runtimeCall.retentionPolicy, "session-scoped");
  assert.equal(runtimeCall.purpose, "finalize a governed camera verification clip");
  assert.equal(runtimeCall.metadata?.runtimeId, "runtime-1");
  assert.equal(runtimeCall.metadata?.sessionId, "session-1");
  assert.equal(runtimeCall.metadata?.invocationId, "tool-call-1");
  if (!result.ok) return;
  assert.equal(result.output.dispatch, "runtime-computeruse");
  assert.equal(result.output.providerCalled, true);
  assert.equal(result.output.artifactEnvelope.stopped, true);
  assert.equal(result.output.artifactEnvelope.artifactId, "artifact:video:camera:1");
  assert.equal(result.output.artifactEnvelope.mimeType, "video/webm");
});

test("createBaseToolRegistry resolves computeruse.cameraStopRecording handler and does not fallback without executor.computeruse", async () => {
  const lookup = createBaseToolRegistry().lookupHandler("computeruse.cameraStopRecording");
  assert.equal(lookup.ok, true);
  if (!lookup.ok) return;

  const result = await lookup.handler.invoke({
    toolCallId: "tool-call-2",
    runtimeId: "runtime-2",
    sessionId: "session-2",
    executor: {},
    input: {
      recordingId: "recording:camera:1",
      purpose: "finalize clip",
      context: { dryRun: false, guard: { accepted: true } },
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "PROVIDER_UNAVAILABLE");
    assert.equal(result.error.publicSafe, true);
  }
});

test("computeruse.cameraStopRecording keeps canonical storage shape and operational doc boundary", () => {
  const storageDir = path.join(repoRoot, "src/storagePool/baseToolStorage/computeruseBase/cameraAccess/computeruse.cameraStopRecording");
  for (const fileName of [
    "core.ts",
    "bestPractice.ts",
    "dependencies.ts",
    "anthropic.ts",
    "openai.ts",
    "deepmind.ts",
    "computeruse.cameraStopRecording.md",
  ]) {
    assert.ok(existsSync(path.join(storageDir, fileName)), "missing canonical storage file: " + fileName);
  }
  assert.equal(existsSync(path.join(repoRoot, "src/storagePool/baseToolStorage/computeruseBase/cameraAccess/computeruse.cameraStopRecording.ts")), false);

  const entryText = readFileSync(
    path.join(repoRoot, "src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/cameraAccess/computeruse.cameraStopRecording.ts"),
    "utf8",
  );
  assert.doesNotMatch(entryText, /export\s+\*\s+from/u);
  assert.match(entryText, /cameraStopRecordingHandler/u);

  const docText = readFileSync(path.join(storageDir, "computeruse.cameraStopRecording.md"), "utf8");
  for (const heading of ["## Use This Tool", "## Call Shape", "## Required Inputs", "## Optional Inputs", "## Runtime Behavior", "## Returns", "## Example", "## Avoid"]) {
    assert.match(docText, new RegExp("^" + heading.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "mu"));
  }
  assert.match(docText, /BaseToolExecutorPort\.computeruse\.stopRecording/u);
  assert.match(docText, /TAP\/agent/u);
});
