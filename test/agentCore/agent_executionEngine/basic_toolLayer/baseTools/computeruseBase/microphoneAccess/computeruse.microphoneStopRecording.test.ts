import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { BaseToolExecutorPort } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { createBaseToolRegistry } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import {
  executeMicrophoneStopRecordingCore,
  microphoneStopRecordingDescriptor,
  microphoneStopRecordingHandler,
  planMicrophoneStopRecording,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/microphoneAccess/computeruse.microphoneStopRecording.js";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "../../../../../../..");

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/microphoneAccess/computeruse.microphoneStopRecording.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/microphoneAccess/computeruse.microphoneStopRecording.md",
  testFileUrl: import.meta.url,
});

function legalDryRunInput() {
  return {
    purpose: "finish voice memo",
    target: {
      recordingId: "recording:microphone:1",
      deviceId: "studio-mic",
      persistHint: "session://recordings/demo.webm",
      releaseDevice: true,
    },
    context: {
      runtimeId: "runtime-1",
      invocationId: "microphone-stop-1",
      requestedScopes: ["tool:computeruse:microphone-recording"],
      allowedScopes: ["tool:computeruse:microphone-recording"],
      auditMetadata: { surface: "agentCore-review" },
    },
  } as const;
}

test("planMicrophoneStopRecording creates a governed dry-run stop envelope without calling provider", async () => {
  let providerCalled = false;
  const result = await planMicrophoneStopRecording({
    ...legalDryRunInput(),
    provider: () => {
      providerCalled = true;
      return { artifactId: "should-not-be-used", mimeType: "audio/webm" };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(providerCalled, false);
  assert.equal(microphoneStopRecordingDescriptor.defaultDryRun, true);
  assert.equal(microphoneStopRecordingDescriptor.unsafeSideEffects, true);
  if (!result.ok) return;

  assert.equal(result.output.kind, "agentCore.basicTool.computeruse.microphoneStopRecording");
  assert.equal(result.output.dispatch, "dry-run");
  assert.equal(result.output.target.recordingId, "recording:microphone:1");
  assert.equal(result.output.target.deviceId, "studio-mic");
  assert.equal(result.output.target.persistHint, "session://recordings/demo.webm");
  assert.equal(result.output.target.releaseDevice, true);
  assert.deepEqual(result.output.permissionsRequired, [
    "microphone:record",
    "recording:session",
    "artifact:write",
    "microphone:permission-release",
  ]);
  assert.equal(result.output.providerCalled, false);
  assert.equal(result.output.recordingEnvelope.resource, "microphone");
  assert.equal(result.output.recordingEnvelope.stopped, false);
  assert.equal(result.output.recordingEnvelope.artifactCreated, false);
  assert.equal(result.output.recordingEnvelope.metadataOnly, true);
  assert.equal(result.output.runtimeEntry.port, "BaseToolExecutorPort.computeruse.stopRecording");
  assert.equal(result.output.runtimeEntry.baseToolOwnsTapStrategy, false);
});

test("planMicrophoneStopRecording classifies malformed JSON, missing fields, invalid target, scope, and governance gaps", async () => {
  const malformedRequest = await planMicrophoneStopRecording("bad");
  assert.equal(malformedRequest.ok, false);
  if (!malformedRequest.ok) assert.equal(malformedRequest.error.code, "INVALID_REQUEST");

  const malformedContext = await planMicrophoneStopRecording({
    target: { recordingId: "recording:microphone:1" },
    context: "bad",
    purpose: "stop recording",
  });
  assert.equal(malformedContext.ok, false);
  if (!malformedContext.ok) assert.equal(malformedContext.error.code, "INVALID_CONTEXT");

  const malformedTarget = await planMicrophoneStopRecording({
    target: "bad",
    context: { runtimeId: "runtime-1" },
    purpose: "stop recording",
  });
  assert.equal(malformedTarget.ok, false);
  if (!malformedTarget.ok) assert.equal(malformedTarget.error.code, "INVALID_TARGET");

  const missingRuntime = await planMicrophoneStopRecording({
    purpose: "stop recording",
    recordingId: "recording:microphone:1",
  });
  assert.equal(missingRuntime.ok, false);
  if (!missingRuntime.ok) assert.equal(missingRuntime.error.code, "MISSING_RUNTIME_ID");

  const missingPurpose = await planMicrophoneStopRecording({
    context: { runtimeId: "runtime-1" },
    recordingId: "recording:microphone:1",
  });
  assert.equal(missingPurpose.ok, false);
  if (!missingPurpose.ok) assert.equal(missingPurpose.error.code, "MISSING_PURPOSE");

  const missingRecording = await planMicrophoneStopRecording({
    context: { runtimeId: "runtime-1" },
    purpose: "stop recording",
  });
  assert.equal(missingRecording.ok, false);
  if (!missingRecording.ok) assert.equal(missingRecording.error.code, "MISSING_RECORDING_ID");

  const invalidRecording = await planMicrophoneStopRecording({
    context: { runtimeId: "runtime-1" },
    purpose: "stop recording",
    recordingId: "bad\0recording",
  });
  assert.equal(invalidRecording.ok, false);
  if (!invalidRecording.ok) assert.equal(invalidRecording.error.code, "INVALID_RECORDING_ID");

  const invalidDevice = await planMicrophoneStopRecording({
    context: { runtimeId: "runtime-1" },
    purpose: "stop recording",
    recordingId: "recording:microphone:1",
    deviceId: "bad\0device",
  });
  assert.equal(invalidDevice.ok, false);
  if (!invalidDevice.ok) assert.equal(invalidDevice.error.code, "INVALID_DEVICE_ID");

  const invalidPersistHint = await planMicrophoneStopRecording({
    context: { runtimeId: "runtime-1" },
    purpose: "stop recording",
    recordingId: "recording:microphone:1",
    persistHint: "/tmp/demo.webm",
  });
  assert.equal(invalidPersistHint.ok, false);
  if (!invalidPersistHint.ok) assert.equal(invalidPersistHint.error.code, "INVALID_PERSIST_HINT");

  const invalidReleaseDevice = await planMicrophoneStopRecording({
    context: { runtimeId: "runtime-1" },
    purpose: "stop recording",
    recordingId: "recording:microphone:1",
    releaseDevice: "yes",
  });
  assert.equal(invalidReleaseDevice.ok, false);
  if (!invalidReleaseDevice.ok) assert.equal(invalidReleaseDevice.error.code, "INVALID_RELEASE_DEVICE");

  const deniedScope = await planMicrophoneStopRecording({
    ...legalDryRunInput(),
    context: {
      runtimeId: "runtime-1",
      requestedScopes: ["tool:computeruse:microphone-recording"],
      allowedScopes: [],
    },
  });
  assert.equal(deniedScope.ok, false);
  if (!deniedScope.ok) assert.equal(deniedScope.error.code, "SCOPE_DENIED");
});

test("executeMicrophoneStopRecordingCore requires guard and maps missing or failing provider to public-safe errors", async () => {
  const noGuard = await executeMicrophoneStopRecordingCore({
    ...legalDryRunInput(),
    context: { ...legalDryRunInput().context, dryRun: false },
  });
  assert.equal(noGuard.ok, false);
  if (!noGuard.ok) assert.equal(noGuard.error.code, "GOVERNANCE_REJECTED");

  const missingProvider = await executeMicrophoneStopRecordingCore({
    ...legalDryRunInput(),
    context: { ...legalDryRunInput().context, dryRun: false, guard: { accepted: true } },
  });
  assert.equal(missingProvider.ok, false);
  if (!missingProvider.ok) {
    assert.equal(missingProvider.error.code, "PROVIDER_UNAVAILABLE");
    assert.equal(missingProvider.error.publicSafe, true);
    assert.equal(missingProvider.error.internalDetailExposed, false);
  }

  const failedProvider = await executeMicrophoneStopRecordingCore({
    ...legalDryRunInput(),
    context: { ...legalDryRunInput().context, dryRun: false, guard: { accepted: true } },
    provider: () => {
      throw new Error("private PipeWire path");
    },
  });
  assert.equal(failedProvider.ok, false);
  if (!failedProvider.ok) {
    assert.equal(failedProvider.error.code, "PROVIDER_FAILURE");
    assert.equal(failedProvider.error.publicSafe, true);
    assert.equal(failedProvider.error.message.includes("PipeWire"), false);
  }
});

test("microphoneStopRecordingHandler invokes runtime-owned executor.computeruse.stopRecording when guarded", async () => {
  const calls: unknown[] = [];
  const executor: BaseToolExecutorPort = {
    computeruse: {
      async stopRecording(request) {
        calls.push(request);
        return {
          ok: true,
          output: {
            artifactId: "artifact:audio:1",
            mimeType: "audio/webm",
            metadata: { runtimeCarrier: "fake-computeruse" },
          },
          metadata: { adapter: "fake-runtime" },
        };
      },
    },
  };

  const result = await microphoneStopRecordingHandler.invoke({
    toolCallId: "tool-call-1",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    executor,
    input: {
      purpose: "finish narration",
      target: {
        recordingId: "recording:microphone:1",
        deviceId: "studio-mic",
        persistHint: "session://recordings/demo.webm",
        releaseDevice: true,
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
    purpose?: string;
    metadata?: Record<string, unknown>;
  };
  assert.equal(runtimeCall.resource, "microphone");
  assert.equal(runtimeCall.recordingId, "recording:microphone:1");
  assert.equal(runtimeCall.storageTarget, "session://recordings/demo.webm");
  assert.equal(runtimeCall.purpose, "finish narration");
  assert.equal(runtimeCall.metadata?.runtimeId, "runtime-1");
  assert.equal(runtimeCall.metadata?.sessionId, "session-1");
  assert.equal(runtimeCall.metadata?.invocationId, "tool-call-1");
  assert.equal(runtimeCall.metadata?.deviceId, "studio-mic");
  assert.equal(runtimeCall.metadata?.releaseDevice, true);
  if (!result.ok) return;
  assert.equal(result.output.dispatch, "runtime-computeruse");
  assert.equal(result.output.providerCalled, true);
  assert.equal(result.output.recordingEnvelope.stopped, true);
  assert.equal(result.output.recordingEnvelope.artifactCreated, true);
  assert.equal(result.output.recordingEnvelope.recordingId, "recording:microphone:1");
  assert.equal(result.output.recordingEnvelope.artifactId, "artifact:audio:1");
  assert.equal(result.output.recordingEnvelope.mimeType, "audio/webm");
});

test("createBaseToolRegistry resolves computeruse.microphoneStopRecording handler and does not fallback without executor.computeruse", async () => {
  const lookup = createBaseToolRegistry().lookupHandler("computeruse.microphoneStopRecording");
  assert.equal(lookup.ok, true);
  if (!lookup.ok) return;

  const result = await lookup.handler.invoke({
    toolCallId: "tool-call-2",
    runtimeId: "runtime-2",
    sessionId: "session-2",
    executor: {},
    input: {
      purpose: "stop recording",
      recordingId: "recording:microphone:2",
      context: { dryRun: false, guard: { accepted: true } },
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "PROVIDER_UNAVAILABLE");
    assert.equal(result.error.publicSafe, true);
  }
});

test("computeruse.microphoneStopRecording keeps canonical storage shape and operational doc boundary", () => {
  const storageDir = path.join(
    repoRoot,
    "src/storagePool/baseToolStorage/computeruseBase/microphoneAccess/computeruse.microphoneStopRecording",
  );
  for (const fileName of [
    "core.ts",
    "bestPractice.ts",
    "dependencies.ts",
    "anthropic.ts",
    "openai.ts",
    "deepmind.ts",
    "computeruse.microphoneStopRecording.md",
  ]) {
    assert.ok(existsSync(path.join(storageDir, fileName)), "missing canonical storage file " + fileName);
  }
  assert.equal(
    existsSync(path.join(repoRoot, "src/storagePool/baseToolStorage/computeruseBase/microphoneAccess/computeruse.microphoneStopRecording.ts")),
    false,
  );

  const entryText = readFileSync(
    path.join(
      repoRoot,
      "src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/microphoneAccess/computeruse.microphoneStopRecording.ts",
    ),
    "utf8",
  );
  assert.doesNotMatch(entryText, /export\s+\*\s+from/u);
  assert.match(entryText, /microphoneStopRecordingHandler/u);

  const docText = readFileSync(path.join(storageDir, "computeruse.microphoneStopRecording.md"), "utf8");
  for (const heading of ["Use This Tool", "Call Shape", "Required Inputs", "Optional Inputs", "Runtime Behavior", "Returns", "Example", "Avoid"]) {
    assert.match(docText, new RegExp("## " + heading, "u"));
  }
  assert.match(docText, /BaseToolExecutorPort\.computeruse\.stopRecording/u);
  assert.match(docText, /TAP\/agent/u);
});
