import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { BaseToolExecutorPort } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { createBaseToolRegistry } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import {
  executeMicrophoneStartRecordingCore,
  microphoneStartRecordingDescriptor,
  microphoneStartRecordingHandler,
  planMicrophoneStartRecording,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/microphoneAccess/computeruse.microphoneStartRecording.js";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "../../../../../../..");

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/microphoneAccess/computeruse.microphoneStartRecording.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/microphoneAccess/computeruse.microphoneStartRecording.md",
  testFileUrl: import.meta.url,
});

function legalDryRunInput() {
  return {
    purpose: "record a voice note",
    target: {
      deviceId: "studio-mic",
      permissionLeaseId: "lease:microphone:1",
      recordingLabel: "demo",
      destinationHint: "session://recordings/demo.webm",
      maxDurationMs: 30_000,
      sampleRateHz: 44_100,
      channelCount: 2,
      outputFormat: "audio/webm",
    },
    context: {
      runtimeId: "runtime-1",
      invocationId: "microphone-start-1",
      allowedDeviceIds: ["studio-mic"],
      requestedScopes: ["tool:computeruse:microphone-recording"],
      allowedScopes: ["tool:computeruse:microphone-recording"],
      auditMetadata: { surface: "agentCore-review" },
    },
  } as const;
}

test("planMicrophoneStartRecording creates a governed dry-run recording envelope without calling provider", async () => {
  let providerCalled = false;
  const result = await planMicrophoneStartRecording({
    ...legalDryRunInput(),
    provider: () => {
      providerCalled = true;
      return { recordingId: "should-not-be-used" };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(providerCalled, false);
  assert.equal(microphoneStartRecordingDescriptor.defaultDryRun, true);
  assert.equal(microphoneStartRecordingDescriptor.unsafeSideEffects, true);
  if (!result.ok) return;

  assert.equal(result.output.kind, "agentCore.basicTool.computeruse.microphoneStartRecording");
  assert.equal(result.output.dispatch, "dry-run");
  assert.equal(result.output.target.deviceId, "studio-mic");
  assert.equal(result.output.target.permissionLeaseId, "lease:microphone:1");
  assert.equal(result.output.target.maxDurationMs, 30_000);
  assert.equal(result.output.target.sampleRateHz, 44_100);
  assert.equal(result.output.target.channelCount, 2);
  assert.equal(result.output.target.outputFormat, "audio/webm");
  assert.deepEqual(result.output.permissionsRequired, [
    "microphone:read",
    "microphone:record",
    "recording:session",
    "artifact:write",
  ]);
  assert.equal(result.output.providerCalled, false);
  assert.equal(result.output.recordingEnvelope.started, false);
  assert.equal(result.output.recordingEnvelope.metadataOnly, true);
  assert.equal(result.output.runtimeEntry.port, "BaseToolExecutorPort.computeruse.startRecording");
  assert.equal(result.output.runtimeEntry.baseToolOwnsTapStrategy, false);
});

test("planMicrophoneStartRecording classifies malformed JSON, missing fields, invalid target, scope, and governance gaps", async () => {
  const malformedRequest = await planMicrophoneStartRecording("bad");
  assert.equal(malformedRequest.ok, false);
  if (!malformedRequest.ok) assert.equal(malformedRequest.error.code, "INVALID_REQUEST");

  const malformedContext = await planMicrophoneStartRecording({ target: {}, context: "bad", purpose: "record" });
  assert.equal(malformedContext.ok, false);
  if (!malformedContext.ok) assert.equal(malformedContext.error.code, "INVALID_CONTEXT");

  const malformedTarget = await planMicrophoneStartRecording({
    target: "bad",
    context: { runtimeId: "runtime-1" },
    purpose: "record",
  });
  assert.equal(malformedTarget.ok, false);
  if (!malformedTarget.ok) assert.equal(malformedTarget.error.code, "INVALID_TARGET");

  const missingRuntime = await planMicrophoneStartRecording({ purpose: "record audio" });
  assert.equal(missingRuntime.ok, false);
  if (!missingRuntime.ok) assert.equal(missingRuntime.error.code, "MISSING_RUNTIME_ID");

  const missingPurpose = await planMicrophoneStartRecording({ context: { runtimeId: "runtime-1" } });
  assert.equal(missingPurpose.ok, false);
  if (!missingPurpose.ok) assert.equal(missingPurpose.error.code, "MISSING_PURPOSE");

  const invalidDevice = await planMicrophoneStartRecording({
    context: { runtimeId: "runtime-1" },
    purpose: "record audio",
    deviceId: "bad\0device",
  });
  assert.equal(invalidDevice.ok, false);
  if (!invalidDevice.ok) assert.equal(invalidDevice.error.code, "INVALID_DEVICE_ID");

  const scoped = await planMicrophoneStartRecording({
    context: { runtimeId: "runtime-1", allowedDeviceIds: ["studio-mic"] },
    purpose: "record audio",
    deviceId: "laptop-mic",
  });
  assert.equal(scoped.ok, false);
  if (!scoped.ok) assert.equal(scoped.error.code, "DEVICE_SCOPE_REJECTED");

  const invalidLease = await planMicrophoneStartRecording({
    context: { runtimeId: "runtime-1" },
    purpose: "record audio",
    permissionLeaseId: "x".repeat(513),
  });
  assert.equal(invalidLease.ok, false);
  if (!invalidLease.ok) assert.equal(invalidLease.error.code, "INVALID_PERMISSION_LEASE");

  const invalidDestination = await planMicrophoneStartRecording({
    context: { runtimeId: "runtime-1" },
    purpose: "record audio",
    destinationHint: "/tmp/recording.wav",
  });
  assert.equal(invalidDestination.ok, false);
  if (!invalidDestination.ok) assert.equal(invalidDestination.error.code, "INVALID_DESTINATION_HINT");

  const invalidDuration = await planMicrophoneStartRecording({
    context: { runtimeId: "runtime-1" },
    purpose: "record audio",
    maxDurationMs: 0,
  });
  assert.equal(invalidDuration.ok, false);
  if (!invalidDuration.ok) assert.equal(invalidDuration.error.code, "INVALID_MAX_DURATION");

  const invalidFormat = await planMicrophoneStartRecording({
    context: { runtimeId: "runtime-1" },
    purpose: "record audio",
    outputFormat: "audio/flac",
  });
  assert.equal(invalidFormat.ok, false);
  if (!invalidFormat.ok) assert.equal(invalidFormat.error.code, "INVALID_OUTPUT_FORMAT");

  const deniedScope = await planMicrophoneStartRecording({
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

test("executeMicrophoneStartRecordingCore requires guard and maps missing or failing provider to public-safe errors", async () => {
  const noGuard = await executeMicrophoneStartRecordingCore({
    ...legalDryRunInput(),
    context: { ...legalDryRunInput().context, dryRun: false },
  });
  assert.equal(noGuard.ok, false);
  if (!noGuard.ok) assert.equal(noGuard.error.code, "GOVERNANCE_REJECTED");

  const missingProvider = await executeMicrophoneStartRecordingCore({
    ...legalDryRunInput(),
    context: { ...legalDryRunInput().context, dryRun: false, guard: { accepted: true } },
  });
  assert.equal(missingProvider.ok, false);
  if (!missingProvider.ok) {
    assert.equal(missingProvider.error.code, "PROVIDER_UNAVAILABLE");
    assert.equal(missingProvider.error.publicSafe, true);
    assert.equal(missingProvider.error.internalDetailExposed, false);
  }

  const failedProvider = await executeMicrophoneStartRecordingCore({
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

test("microphoneStartRecordingHandler invokes runtime-owned executor.computeruse.startRecording when guarded", async () => {
  const calls: unknown[] = [];
  const executor: BaseToolExecutorPort = {
    computeruse: {
      async startRecording(request) {
        calls.push(request);
        return {
          ok: true,
          output: {
            recordingId: "recording:microphone:1",
            metadata: { runtimeCarrier: "fake-computeruse" },
          },
          metadata: { adapter: "fake-runtime" },
        };
      },
    },
  };

  const result = await microphoneStartRecordingHandler.invoke({
    toolCallId: "tool-call-1",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    executor,
    input: {
      purpose: "record narration",
      target: {
        deviceId: "studio-mic",
        permissionLeaseId: "lease:microphone:1",
        maxDurationMs: 10_000,
        sampleRateHz: 48_000,
        channelCount: 1,
        outputFormat: "audio/wav",
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
  assert.equal(runtimeCall.resource, "microphone");
  assert.deepEqual(runtimeCall.target, {
    target: "microphone",
    microphoneId: "studio-mic",
    deviceId: "studio-mic",
    maxDurationMs: 10_000,
    sampleRateHz: 48_000,
    channelCount: 1,
    permissionLeaseId: "lease:microphone:1",
    recordingLabel: undefined,
    destinationHint: undefined,
  });
  assert.equal(runtimeCall.outputFormat, "audio/wav");
  assert.equal(runtimeCall.metadata?.runtimeId, "runtime-1");
  assert.equal(runtimeCall.metadata?.sessionId, "session-1");
  assert.equal(runtimeCall.metadata?.invocationId, "tool-call-1");
  assert.equal(runtimeCall.metadata?.purpose, "record narration");
  if (!result.ok) return;
  assert.equal(result.output.dispatch, "runtime-computeruse");
  assert.equal(result.output.providerCalled, true);
  assert.equal(result.output.recordingEnvelope.started, true);
  assert.equal(result.output.recordingEnvelope.recordingId, "recording:microphone:1");
});

test("createBaseToolRegistry resolves computeruse.microphoneStartRecording handler and does not fallback without executor.computeruse", async () => {
  const lookup = createBaseToolRegistry().lookupHandler("computeruse.microphoneStartRecording");
  assert.equal(lookup.ok, true);
  if (!lookup.ok) return;

  const result = await lookup.handler.invoke({
    toolCallId: "tool-call-2",
    runtimeId: "runtime-2",
    sessionId: "session-2",
    executor: {},
    input: {
      purpose: "record audio",
      context: { dryRun: false, guard: { accepted: true } },
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "PROVIDER_UNAVAILABLE");
    assert.equal(result.error.publicSafe, true);
  }
});

test("computeruse.microphoneStartRecording keeps canonical storage shape and operational doc boundary", () => {
  const storageDir = path.join(
    repoRoot,
    "src/storagePool/baseToolStorage/computeruseBase/microphoneAccess/computeruse.microphoneStartRecording",
  );
  for (const fileName of [
    "core.ts",
    "bestPractice.ts",
    "dependencies.ts",
    "anthropic.ts",
    "openai.ts",
    "deepmind.ts",
    "computeruse.microphoneStartRecording.md",
  ]) {
    assert.ok(existsSync(path.join(storageDir, fileName)), "missing canonical storage file " + fileName);
  }
  assert.equal(
    existsSync(path.join(repoRoot, "src/storagePool/baseToolStorage/computeruseBase/microphoneAccess/computeruse.microphoneStartRecording.ts")),
    false,
  );

  const entryText = readFileSync(
    path.join(
      repoRoot,
      "src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/microphoneAccess/computeruse.microphoneStartRecording.ts",
    ),
    "utf8",
  );
  assert.doesNotMatch(entryText, /export\s+\*\s+from/u);
  assert.match(entryText, /microphoneStartRecordingHandler/u);

  const docText = readFileSync(path.join(storageDir, "computeruse.microphoneStartRecording.md"), "utf8");
  for (const heading of ["Use This Tool", "Call Shape", "Required Inputs", "Optional Inputs", "Runtime Behavior", "Returns", "Example", "Avoid"]) {
    assert.match(docText, new RegExp("## " + heading, "u"));
  }
  assert.match(docText, /BaseToolExecutorPort\.computeruse\.startRecording/u);
  assert.match(docText, /TAP\/agent/u);
});
