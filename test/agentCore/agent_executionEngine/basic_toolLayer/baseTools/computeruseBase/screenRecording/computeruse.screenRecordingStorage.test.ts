import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { BaseToolExecutorPort } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { createBaseToolRegistry } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import {
  executeScreenRecordingStorageCore,
  planScreenRecordingStorage,
  screenRecordingStorageDescriptor,
  screenRecordingStorageHandler,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/screenRecording/computeruse.screenRecordingStorage.js";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "../../../../../../..");

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/screenRecording/computeruse.screenRecordingStorage.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/screenRecording/computeruse.screenRecordingStorage.md",
  testFileUrl: import.meta.url,
});

function legalDryRunInput() {
  return {
    target: {
      recordingRef: "recording:screen:1",
      storageTarget: "session://recordings/record-1.webm",
      retentionPolicy: "session-scoped",
    },
    purpose: "review playback",
    context: {
      runtimeId: "runtime-1",
      invocationId: "store-recording-1",
      requestedScopes: ["tool:computeruse:screen-recording-storage"],
      allowedScopes: ["tool:computeruse:screen-recording-storage"],
    },
  } as const;
}

test("planScreenRecordingStorage creates a governed dry-run storage envelope without calling provider", async () => {
  let providerCalled = false;
  const result = await planScreenRecordingStorage({
    ...legalDryRunInput(),
    provider: () => {
      providerCalled = true;
      return { artifactId: "should-not-be-used", mimeType: "video/webm" };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(providerCalled, false);
  assert.equal(screenRecordingStorageDescriptor.defaultRetentionPolicy, "session-scoped");
  assert.equal(screenRecordingStorageDescriptor.unsafeSideEffects, true);
  if (!result.ok) return;

  assert.equal(result.output.kind, "agentCore.basicTool.computeruse.screenRecordingStorage");
  assert.equal(result.output.dispatch, "dry-run");
  assert.equal(result.output.target.recordingRef, "recording:screen:1");
  assert.equal(result.output.target.storageTarget, "session://recordings/record-1.webm");
  assert.equal(result.output.target.retentionPolicy, "session-scoped");
  assert.equal(result.output.providerCalled, false);
  assert.equal(result.output.storageEnvelope.metadataOnly, true);
  assert.equal(result.output.storageEnvelope.finalized, false);
  assert.equal(result.output.storageEnvelope.stored, false);
  assert.equal(result.output.runtimeEntry.port, "BaseToolExecutorPort.computeruse.stopRecording");
  assert.equal(result.output.runtimeEntry.baseToolOwnsTapStrategy, false);
});

test("planScreenRecordingStorage classifies malformed JSON, missing fields, invalid target, scope, and governance gaps", async () => {
  const malformedRequest = await planScreenRecordingStorage("bad");
  assert.equal(malformedRequest.ok, false);
  if (!malformedRequest.ok) assert.equal(malformedRequest.error.code, "INVALID_REQUEST");

  const malformedContext = await planScreenRecordingStorage({ target: {}, context: "bad", purpose: "review playback" });
  assert.equal(malformedContext.ok, false);
  if (!malformedContext.ok) assert.equal(malformedContext.error.code, "INVALID_CONTEXT");

  const malformedTarget = await planScreenRecordingStorage({
    target: "bad",
    context: { runtimeId: "runtime-1" },
    purpose: "review playback",
  });
  assert.equal(malformedTarget.ok, false);
  if (!malformedTarget.ok) assert.equal(malformedTarget.error.code, "INVALID_TARGET");

  const missingRecordingRef = await planScreenRecordingStorage({
    target: { storageTarget: "session://recordings/1.webm" },
    context: { runtimeId: "runtime-1" },
    purpose: "review playback",
  });
  assert.equal(missingRecordingRef.ok, false);
  if (!missingRecordingRef.ok) assert.equal(missingRecordingRef.error.code, "MISSING_RECORDING_REF");

  const missingStorageTarget = await planScreenRecordingStorage({
    target: { recordingRef: "recording:screen:1" },
    context: { runtimeId: "runtime-1" },
    purpose: "review playback",
  });
  assert.equal(missingStorageTarget.ok, false);
  if (!missingStorageTarget.ok) assert.equal(missingStorageTarget.error.code, "MISSING_STORAGE_TARGET");

  const missingRuntime = await planScreenRecordingStorage({
    target: { recordingRef: "recording:screen:1", storageTarget: "session://recordings/1.webm" },
    purpose: "review playback",
  });
  assert.equal(missingRuntime.ok, false);
  if (!missingRuntime.ok) assert.equal(missingRuntime.error.code, "MISSING_RUNTIME_ID");

  const missingPurpose = await planScreenRecordingStorage({
    target: { recordingRef: "recording:screen:1", storageTarget: "session://recordings/1.webm" },
    context: { runtimeId: "runtime-1" },
  });
  assert.equal(missingPurpose.ok, false);
  if (!missingPurpose.ok) assert.equal(missingPurpose.error.code, "MISSING_PURPOSE");

  const badStorageTarget = await planScreenRecordingStorage({
    target: { recordingRef: "recording:screen:1", storageTarget: "recordings/1.webm" },
    context: { runtimeId: "runtime-1" },
    purpose: "review playback",
  });
  assert.equal(badStorageTarget.ok, false);
  if (!badStorageTarget.ok) assert.equal(badStorageTarget.error.code, "INVALID_STORAGE_TARGET");

  const badRetention = await planScreenRecordingStorage({
    target: { recordingRef: "recording:screen:1", storageTarget: "session://recordings/1.webm", retentionPolicy: "forever" },
    context: { runtimeId: "runtime-1" },
    purpose: "review playback",
  });
  assert.equal(badRetention.ok, false);
  if (!badRetention.ok) assert.equal(badRetention.error.code, "INVALID_RETENTION_POLICY");

  const deniedScope = await planScreenRecordingStorage({
    ...legalDryRunInput(),
    context: {
      runtimeId: "runtime-1",
      requestedScopes: ["tool:computeruse:screen-recording-storage"],
      allowedScopes: [],
    },
  });
  assert.equal(deniedScope.ok, false);
  if (!deniedScope.ok) assert.equal(deniedScope.error.code, "SCOPE_DENIED");
});

test("executeScreenRecordingStorageCore requires guard and maps missing or failing provider to public-safe errors", async () => {
  const noGuard = await executeScreenRecordingStorageCore({
    ...legalDryRunInput(),
    context: { ...legalDryRunInput().context, dryRun: false },
  });
  assert.equal(noGuard.ok, false);
  if (!noGuard.ok) assert.equal(noGuard.error.code, "GOVERNANCE_REJECTED");

  const missingProvider = await executeScreenRecordingStorageCore({
    ...legalDryRunInput(),
    context: { ...legalDryRunInput().context, dryRun: false, guard: { accepted: true } },
  });
  assert.equal(missingProvider.ok, false);
  if (!missingProvider.ok) {
    assert.equal(missingProvider.error.code, "PROVIDER_UNAVAILABLE");
    assert.equal(missingProvider.error.publicSafe, true);
    assert.equal(missingProvider.error.internalDetailExposed, false);
  }

  const failedProvider = await executeScreenRecordingStorageCore({
    ...legalDryRunInput(),
    context: { ...legalDryRunInput().context, dryRun: false, guard: { accepted: true } },
    provider: () => {
      throw new Error("private ffmpeg path");
    },
  });
  assert.equal(failedProvider.ok, false);
  if (!failedProvider.ok) {
    assert.equal(failedProvider.error.code, "PROVIDER_FAILURE");
    assert.equal(failedProvider.error.publicSafe, true);
    assert.equal(failedProvider.error.message.includes("ffmpeg"), false);
  }
});

test("screenRecordingStorageHandler invokes runtime-owned executor.computeruse.stopRecording when guarded", async () => {
  const calls: unknown[] = [];
  const executor: BaseToolExecutorPort = {
    computeruse: {
      async stopRecording(request) {
        calls.push(request);
        return {
          ok: true,
          output: {
            artifactId: "artifact:video:1",
            mimeType: "video/webm",
            storageUri: "session://recordings/record-1.webm",
            retentionPolicy: "session-scoped",
            metadata: { adapter: "fake-runtime" },
          },
          metadata: { adapter: "fake-runtime" },
        };
      },
    },
  };

  const result = await screenRecordingStorageHandler.invoke({
    toolCallId: "tool-call-1",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    executor,
    input: {
      purpose: "review playback",
      target: {
        recordingRef: "recording:screen:1",
        storageTarget: "session://recordings/record-1.webm",
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
  assert.equal(runtimeCall.resource, "screen");
  assert.equal(runtimeCall.recordingId, "recording:screen:1");
  assert.equal(runtimeCall.storageTarget, "session://recordings/record-1.webm");
  assert.equal(runtimeCall.retentionPolicy, "session-scoped");
  assert.equal(runtimeCall.purpose, "review playback");
  assert.equal(runtimeCall.metadata?.runtimeId, "runtime-1");
  assert.equal(runtimeCall.metadata?.sessionId, "session-1");
  assert.equal(runtimeCall.metadata?.invocationId, "tool-call-1");
  if (!result.ok) return;
  assert.equal(result.output.dispatch, "runtime-computeruse");
  assert.equal(result.output.providerCalled, true);
  assert.equal(result.output.storageEnvelope.artifactId, "artifact:video:1");
  assert.equal(result.output.storageEnvelope.mimeType, "video/webm");
  assert.equal(result.output.storageEnvelope.storageUri, "session://recordings/record-1.webm");
});

test("createBaseToolRegistry resolves computeruse.screenRecordingStorage handler and does not fallback without executor.computeruse", async () => {
  const lookup = createBaseToolRegistry().lookupHandler("computeruse.screenRecordingStorage");
  assert.equal(lookup.ok, true);
  if (!lookup.ok) return;

  const result = await lookup.handler.invoke({
    toolCallId: "tool-call-2",
    runtimeId: "runtime-2",
    sessionId: "session-2",
    executor: {},
    input: {
      purpose: "review playback",
      target: { recordingRef: "recording:screen:1", storageTarget: "session://recordings/record-1.webm" },
      context: { dryRun: false, guard: { accepted: true } },
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "PROVIDER_UNAVAILABLE");
    assert.equal(result.error.publicSafe, true);
  }
});

test("computeruse.screenRecordingStorage keeps canonical storage shape and operational doc boundary", () => {
  const storageDir = path.join(
    repoRoot,
    "src/storagePool/baseToolStorage/computeruseBase/screenRecording/computeruse.screenRecordingStorage",
  );
  for (const fileName of [
    "core.ts",
    "bestPractice.ts",
    "dependencies.ts",
    "anthropic.ts",
    "openai.ts",
    "deepmind.ts",
    "computeruse.screenRecordingStorage.md",
  ]) {
    assert.ok(existsSync(path.join(storageDir, fileName)), "missing canonical storage file: " + fileName);
  }
  assert.equal(
    existsSync(path.join(repoRoot, "src/storagePool/baseToolStorage/computeruseBase/screenRecording/computeruse.screenRecordingStorage.ts")),
    false,
  );

  const entryText = readFileSync(
    path.join(repoRoot, "src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/screenRecording/computeruse.screenRecordingStorage.ts"),
    "utf8",
  );
  assert.doesNotMatch(entryText, /export\s+\*\s+from/u);
  assert.match(entryText, /screenRecordingStorageHandler/u);

  const docText = readFileSync(path.join(storageDir, "computeruse.screenRecordingStorage.md"), "utf8");
  for (const heading of ["## Use This Tool", "## Call Shape", "## Required Inputs", "## Optional Inputs", "## Runtime Behavior", "## Returns", "## Example", "## Avoid"]) {
    assert.match(docText, new RegExp("^" + heading.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "mu"));
  }
  assert.match(docText, /BaseToolExecutorPort\.computeruse\.stopRecording/u);
  assert.match(docText, /TAP\/agent owns that composition/u);
  assert.match(docText, /Do not hide local shell/u);
});
