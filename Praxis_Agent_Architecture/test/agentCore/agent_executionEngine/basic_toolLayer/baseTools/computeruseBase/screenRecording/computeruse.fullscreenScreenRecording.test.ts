import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { BaseToolExecutorPort } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { createBaseToolRegistry } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import {
  executeFullscreenScreenRecordingCore,
  fullscreenScreenRecordingDescriptor,
  fullscreenScreenRecordingHandler,
  planFullscreenScreenRecording,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/screenRecording/computeruse.fullscreenScreenRecording.js";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "../../../../../../..");

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/screenRecording/computeruse.fullscreenScreenRecording.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/screenRecording/computeruse.fullscreenScreenRecording.md",
  testFileUrl: import.meta.url,
});

function legalDryRunInput() {
  return {
    target: {
      displayId: "display-1",
      maxDurationMs: 5_000,
      includeCursor: true,
      includeAudio: true,
      outputFormat: "video/webm",
      destinationHint: "session://recordings/fullscreen.webm",
    },
    purpose: "record the visible workflow",
    context: {
      runtimeId: "runtime-1",
      invocationId: "record-fullscreen-1",
      requestedScopes: ["tool:computeruse:screen-recording"],
      allowedScopes: ["tool:computeruse:screen-recording"],
      auditMetadata: { surface: "agentCore-review" },
    },
  } as const;
}

test("planFullscreenScreenRecording creates a governed dry-run recording envelope without calling provider", async () => {
  let providerCalled = false;
  const result = await planFullscreenScreenRecording({
    ...legalDryRunInput(),
    provider: () => {
      providerCalled = true;
      return { recordingId: "should-not-be-used" };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(providerCalled, false);
  assert.equal(fullscreenScreenRecordingDescriptor.defaultDryRun, true);
  assert.equal(fullscreenScreenRecordingDescriptor.unsafeSideEffects, true);
  if (!result.ok) return;

  assert.equal(result.output.kind, "agentCore.basicTool.computeruse.fullscreenScreenRecording");
  assert.equal(result.output.dispatch, "dry-run");
  assert.equal(result.output.target.displayId, "display-1");
  assert.equal(result.output.target.maxDurationMs, 5_000);
  assert.equal(result.output.target.includeCursor, true);
  assert.equal(result.output.target.includeAudio, true);
  assert.equal(result.output.target.outputFormat, "video/webm");
  assert.deepEqual(result.output.permissionsRequired, [
    "screen:record",
    "display:capture",
    "recording:session",
    "microphone:record",
  ]);
  assert.equal(result.output.providerCalled, false);
  assert.equal(result.output.recordingEnvelope.started, false);
  assert.equal(result.output.recordingEnvelope.metadataOnly, true);
  assert.equal(result.output.runtimeEntry.port, "BaseToolExecutorPort.computeruse.startRecording");
  assert.equal(result.output.runtimeEntry.baseToolOwnsTapStrategy, false);
});

test("planFullscreenScreenRecording classifies malformed JSON, missing fields, invalid target, scope, and governance gaps", async () => {
  const malformedRequest = await planFullscreenScreenRecording("bad");
  assert.equal(malformedRequest.ok, false);
  if (!malformedRequest.ok) assert.equal(malformedRequest.error.code, "INVALID_REQUEST");

  const malformedContext = await planFullscreenScreenRecording({ target: {}, context: "bad", purpose: "record" });
  assert.equal(malformedContext.ok, false);
  if (!malformedContext.ok) assert.equal(malformedContext.error.code, "INVALID_CONTEXT");

  const malformedTarget = await planFullscreenScreenRecording({
    target: "bad",
    context: { runtimeId: "runtime-1" },
    purpose: "record",
  });
  assert.equal(malformedTarget.ok, false);
  if (!malformedTarget.ok) assert.equal(malformedTarget.error.code, "INVALID_TARGET");

  const missingRuntime = await planFullscreenScreenRecording({ purpose: "record screen" });
  assert.equal(missingRuntime.ok, false);
  if (!missingRuntime.ok) assert.equal(missingRuntime.error.code, "MISSING_RUNTIME_ID");

  const missingPurpose = await planFullscreenScreenRecording({ context: { runtimeId: "runtime-1" } });
  assert.equal(missingPurpose.ok, false);
  if (!missingPurpose.ok) assert.equal(missingPurpose.error.code, "MISSING_PURPOSE");

  const invalidDuration = await planFullscreenScreenRecording({
    context: { runtimeId: "runtime-1" },
    purpose: "record screen",
    maxDurationMs: 0,
  });
  assert.equal(invalidDuration.ok, false);
  if (!invalidDuration.ok) assert.equal(invalidDuration.error.code, "INVALID_MAX_DURATION");

  const invalidAudio = await planFullscreenScreenRecording({
    context: { runtimeId: "runtime-1" },
    purpose: "record screen",
    includeAudio: "yes",
  });
  assert.equal(invalidAudio.ok, false);
  if (!invalidAudio.ok) assert.equal(invalidAudio.error.code, "INVALID_INCLUDE_AUDIO");

  const invalidFormat = await planFullscreenScreenRecording({
    context: { runtimeId: "runtime-1" },
    purpose: "record screen",
    outputFormat: "video/avi",
  });
  assert.equal(invalidFormat.ok, false);
  if (!invalidFormat.ok) assert.equal(invalidFormat.error.code, "INVALID_OUTPUT_FORMAT");

  const invalidDestination = await planFullscreenScreenRecording({
    context: { runtimeId: "runtime-1" },
    purpose: "record screen",
    destinationHint: "/tmp/recording.webm",
  });
  assert.equal(invalidDestination.ok, false);
  if (!invalidDestination.ok) assert.equal(invalidDestination.error.code, "INVALID_DESTINATION_HINT");

  const deniedScope = await planFullscreenScreenRecording({
    ...legalDryRunInput(),
    context: {
      runtimeId: "runtime-1",
      requestedScopes: ["tool:computeruse:screen-recording"],
      allowedScopes: [],
    },
  });
  assert.equal(deniedScope.ok, false);
  if (!deniedScope.ok) assert.equal(deniedScope.error.code, "SCOPE_DENIED");
});

test("executeFullscreenScreenRecordingCore requires guard and maps missing or failing provider to public-safe errors", async () => {
  const noGuard = await executeFullscreenScreenRecordingCore({
    ...legalDryRunInput(),
    context: { ...legalDryRunInput().context, dryRun: false },
  });
  assert.equal(noGuard.ok, false);
  if (!noGuard.ok) assert.equal(noGuard.error.code, "GOVERNANCE_REJECTED");

  const missingProvider = await executeFullscreenScreenRecordingCore({
    ...legalDryRunInput(),
    context: { ...legalDryRunInput().context, dryRun: false, guard: { accepted: true } },
  });
  assert.equal(missingProvider.ok, false);
  if (!missingProvider.ok) {
    assert.equal(missingProvider.error.code, "PROVIDER_UNAVAILABLE");
    assert.equal(missingProvider.error.publicSafe, true);
    assert.equal(missingProvider.error.internalDetailExposed, false);
  }

  const failedProvider = await executeFullscreenScreenRecordingCore({
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

test("fullscreenScreenRecordingHandler invokes runtime-owned executor.computeruse.startRecording when guarded", async () => {
  const calls: unknown[] = [];
  const executor: BaseToolExecutorPort = {
    computeruse: {
      async startRecording(request) {
        calls.push(request);
        return {
          ok: true,
          output: {
            recordingId: "recording:screen:1",
            metadata: { runtimeCarrier: "fake-computeruse" },
          },
          metadata: { adapter: "fake-runtime" },
        };
      },
    },
  };

  const result = await fullscreenScreenRecordingHandler.invoke({
    toolCallId: "tool-call-1",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    executor,
    input: {
      purpose: "record app state",
      target: {
        displayId: "display-1",
        maxDurationMs: 10_000,
        includeCursor: false,
        includeAudio: false,
        outputFormat: "video/mp4",
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
  assert.equal(runtimeCall.resource, "screen");
  assert.deepEqual(runtimeCall.target, {
    target: "fullscreen",
    displayId: "display-1",
    maxDurationMs: 10_000,
    includeCursor: false,
    includeAudio: false,
    destinationHint: undefined,
  });
  assert.equal(runtimeCall.outputFormat, "video/mp4");
  assert.equal(runtimeCall.metadata?.runtimeId, "runtime-1");
  assert.equal(runtimeCall.metadata?.sessionId, "session-1");
  assert.equal(runtimeCall.metadata?.invocationId, "tool-call-1");
  assert.equal(runtimeCall.metadata?.purpose, "record app state");
  if (!result.ok) return;
  assert.equal(result.output.dispatch, "runtime-computeruse");
  assert.equal(result.output.providerCalled, true);
  assert.equal(result.output.recordingEnvelope.recordingId, "recording:screen:1");
});

test("createBaseToolRegistry resolves computeruse.fullscreenScreenRecording handler and does not fallback without executor.computeruse", async () => {
  const lookup = createBaseToolRegistry().lookupHandler("computeruse.fullscreenScreenRecording");
  assert.equal(lookup.ok, true);
  if (!lookup.ok) return;

  const result = await lookup.handler.invoke({
    toolCallId: "tool-call-2",
    runtimeId: "runtime-2",
    sessionId: "session-2",
    executor: {},
    input: {
      purpose: "record app state",
      context: { dryRun: false, guard: { accepted: true } },
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "PROVIDER_UNAVAILABLE");
    assert.equal(result.error.publicSafe, true);
  }
});

test("computeruse.fullscreenScreenRecording keeps canonical storage shape and operational doc boundary", () => {
  const storageDir = path.join(
    repoRoot,
    "src/storagePool/baseToolStorage/computeruseBase/screenRecording/computeruse.fullscreenScreenRecording",
  );
  for (const fileName of [
    "core.ts",
    "bestPractice.ts",
    "dependencies.ts",
    "anthropic.ts",
    "openai.ts",
    "deepmind.ts",
    "computeruse.fullscreenScreenRecording.md",
  ]) {
    assert.ok(existsSync(path.join(storageDir, fileName)), "missing canonical storage file: " + fileName);
  }
  assert.equal(
    existsSync(path.join(repoRoot, "src/storagePool/baseToolStorage/computeruseBase/screenRecording/computeruse.fullscreenScreenRecording.ts")),
    false,
  );

  const entryText = readFileSync(
    path.join(repoRoot, "src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/screenRecording/computeruse.fullscreenScreenRecording.ts"),
    "utf8",
  );
  assert.doesNotMatch(entryText, /export\s+\*\s+from/u);
  assert.match(entryText, /fullscreenScreenRecordingHandler/u);

  const docText = readFileSync(path.join(storageDir, "computeruse.fullscreenScreenRecording.md"), "utf8");
  for (const heading of ["## Use This Tool", "## Call Shape", "## Required Inputs", "## Optional Inputs", "## Runtime Behavior", "## Returns", "## Example", "## Avoid"]) {
    assert.match(docText, new RegExp("^" + heading.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "mu"));
  }
  assert.match(docText, /BaseToolExecutorPort\.computeruse\.startRecording/u);
  assert.match(docText, /TAP\/agent owns that composition/u);
  assert.match(docText, /Do not hide local shell/u);
});
