import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { BaseToolExecutorPort } from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { createBaseToolRegistry } from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import {
  executeWindowScreenRecordingCore,
  planWindowScreenRecording,
  windowScreenRecordingDescriptor,
  windowScreenRecordingHandler,
} from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/computeruseBase/screenRecording/computeruse.windowScreenRecording.js";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "../../../../../../..");

defineAgentCoreContractTest({
  sourcePath: "src/executionEngine/basic_toolLayer/baseTools/computeruseBase/screenRecording/computeruse.windowScreenRecording.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/screenRecording/computeruse.windowScreenRecording.md",
  testFileUrl: import.meta.url,
});

function legalDryRunInput() {
  return {
    target: {
      windowId: "win-42",
      titleHint: "Terminal",
      maxDurationMs: 30_000,
      frameRate: 24,
      includeCursor: true,
      outputFormat: "video/webm",
      destinationHint: "session://recordings/window.webm",
    },
    purpose: "record a reproducible UI issue",
    context: {
      runtimeId: "runtime-1",
      invocationId: "window-rec-1",
      requestedScopes: ["tool:computeruse:window-recording"],
      allowedScopes: ["tool:computeruse:window-recording"],
    },
  } as const;
}

test("planWindowScreenRecording creates a governed dry-run recording envelope without calling provider", async () => {
  let providerCalled = false;
  const result = await planWindowScreenRecording({
    ...legalDryRunInput(),
    provider: () => {
      providerCalled = true;
      return { recordingId: "should-not-be-used" };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(providerCalled, false);
  assert.equal(windowScreenRecordingDescriptor.defaultDryRun, true);
  assert.equal(windowScreenRecordingDescriptor.unsafeSideEffects, true);
  if (!result.ok) return;

  assert.equal(result.output.kind, "agentCore.basicTool.computeruse.windowScreenRecording");
  assert.equal(result.output.dispatch, "dry-run");
  assert.equal(result.output.target.windowId, "win-42");
  assert.equal(result.output.target.titleHint, "Terminal");
  assert.equal(result.output.target.maxDurationMs, 30_000);
  assert.equal(result.output.target.frameRate, 24);
  assert.equal(result.output.providerCalled, false);
  assert.equal(result.output.recordingEnvelope.started, false);
  assert.equal(result.output.recordingEnvelope.metadataOnly, true);
  assert.equal(result.output.runtimeEntry.port, "BaseToolExecutorPort.computeruse.startRecording");
  assert.equal(result.output.runtimeEntry.baseToolOwnsTapStrategy, false);
});

test("planWindowScreenRecording classifies malformed JSON, missing fields, invalid target, scope, and governance gaps", async () => {
  const malformedRequest = await planWindowScreenRecording("bad");
  assert.equal(malformedRequest.ok, false);
  if (!malformedRequest.ok) assert.equal(malformedRequest.error.code, "INVALID_REQUEST");

  const malformedContext = await planWindowScreenRecording({ target: {}, context: "bad", purpose: "record" });
  assert.equal(malformedContext.ok, false);
  if (!malformedContext.ok) assert.equal(malformedContext.error.code, "INVALID_CONTEXT");

  const malformedTarget = await planWindowScreenRecording({
    target: "bad",
    context: { runtimeId: "runtime-1" },
    purpose: "record",
  });
  assert.equal(malformedTarget.ok, false);
  if (!malformedTarget.ok) assert.equal(malformedTarget.error.code, "INVALID_TARGET");

  const missingTarget = await planWindowScreenRecording({
    context: { runtimeId: "runtime-1" },
    purpose: "record a reproducible UI issue",
  });
  assert.equal(missingTarget.ok, false);
  if (!missingTarget.ok) assert.equal(missingTarget.error.code, "MISSING_WINDOW_TARGET");

  const missingRuntime = await planWindowScreenRecording({
    target: { titleHint: "Terminal" },
    purpose: "record a reproducible UI issue",
  });
  assert.equal(missingRuntime.ok, false);
  if (!missingRuntime.ok) assert.equal(missingRuntime.error.code, "MISSING_RUNTIME_ID");

  const missingPurpose = await planWindowScreenRecording({
    context: { runtimeId: "runtime-1" },
    target: { titleHint: "Terminal" },
  });
  assert.equal(missingPurpose.ok, false);
  if (!missingPurpose.ok) assert.equal(missingPurpose.error.code, "MISSING_PURPOSE");

  const badFrameRate = await planWindowScreenRecording({
    context: { runtimeId: "runtime-1" },
    target: { titleHint: "Terminal" },
    purpose: "record a reproducible UI issue",
    frameRate: 120,
  });
  assert.equal(badFrameRate.ok, false);
  if (!badFrameRate.ok) assert.equal(badFrameRate.error.code, "INVALID_FRAME_RATE");

  const badDestination = await planWindowScreenRecording({
    context: { runtimeId: "runtime-1" },
    target: { titleHint: "Terminal" },
    purpose: "record a reproducible UI issue",
    destinationHint: "captures/window.webm",
  });
  assert.equal(badDestination.ok, false);
  if (!badDestination.ok) assert.equal(badDestination.error.code, "INVALID_DESTINATION_HINT");

  const deniedScope = await planWindowScreenRecording({
    ...legalDryRunInput(),
    context: {
      runtimeId: "runtime-1",
      requestedScopes: ["tool:computeruse:window-recording"],
      allowedScopes: [],
    },
  });
  assert.equal(deniedScope.ok, false);
  if (!deniedScope.ok) assert.equal(deniedScope.error.code, "SCOPE_DENIED");
});

test("executeWindowScreenRecordingCore requires guard and maps missing or failing provider to public-safe errors", async () => {
  const noGuard = await executeWindowScreenRecordingCore({
    ...legalDryRunInput(),
    context: { ...legalDryRunInput().context, dryRun: false },
  });
  assert.equal(noGuard.ok, false);
  if (!noGuard.ok) assert.equal(noGuard.error.code, "GOVERNANCE_REJECTED");

  const missingProvider = await executeWindowScreenRecordingCore({
    ...legalDryRunInput(),
    context: { ...legalDryRunInput().context, dryRun: false, guard: { accepted: true } },
  });
  assert.equal(missingProvider.ok, false);
  if (!missingProvider.ok) {
    assert.equal(missingProvider.error.code, "PROVIDER_UNAVAILABLE");
    assert.equal(missingProvider.error.publicSafe, true);
    assert.equal(missingProvider.error.internalDetailExposed, false);
  }

  const failedProvider = await executeWindowScreenRecordingCore({
    ...legalDryRunInput(),
    context: { ...legalDryRunInput().context, dryRun: false, guard: { accepted: true } },
    provider: () => {
      throw new Error("private pipewire path");
    },
  });
  assert.equal(failedProvider.ok, false);
  if (!failedProvider.ok) {
    assert.equal(failedProvider.error.code, "PROVIDER_FAILURE");
    assert.equal(failedProvider.error.publicSafe, true);
    assert.equal(failedProvider.error.message.includes("pipewire"), false);
  }
});

test("windowScreenRecordingHandler invokes runtime-owned executor.computeruse.startRecording when guarded", async () => {
  const calls: unknown[] = [];
  const executor: BaseToolExecutorPort = {
    computeruse: {
      async startRecording(request) {
        calls.push(request);
        return {
          ok: true,
          output: {
            recordingId: "recording:window:1",
            metadata: { runtimeCarrier: "fake-computeruse" },
          },
          metadata: { adapter: "fake-runtime" },
        };
      },
    },
  };

  const result = await windowScreenRecordingHandler.invoke({
    toolCallId: "tool-call-1",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    executor,
    input: {
      purpose: "record active window",
      target: {
        windowId: "win-42",
        maxDurationMs: 10_000,
        frameRate: 30,
        includeCursor: false,
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
    target: "window",
    windowId: "win-42",
    titleHint: undefined,
    maxDurationMs: 10_000,
    frameRate: 30,
    includeCursor: false,
    destinationHint: undefined,
  });
  assert.equal(runtimeCall.outputFormat, "video/mp4");
  assert.equal(runtimeCall.metadata?.runtimeId, "runtime-1");
  assert.equal(runtimeCall.metadata?.sessionId, "session-1");
  assert.equal(runtimeCall.metadata?.invocationId, "tool-call-1");
  assert.equal(runtimeCall.metadata?.purpose, "record active window");
  if (!result.ok) return;
  assert.equal(result.output.dispatch, "runtime-computeruse");
  assert.equal(result.output.providerCalled, true);
  assert.equal(result.output.recordingEnvelope.recordingId, "recording:window:1");
});

test("createBaseToolRegistry resolves computeruse.windowScreenRecording handler and does not fallback without executor.computeruse", async () => {
  const lookup = createBaseToolRegistry().lookupHandler("computeruse.windowScreenRecording");
  assert.equal(lookup.ok, true);
  if (!lookup.ok) return;

  const result = await lookup.handler.invoke({
    toolCallId: "tool-call-2",
    runtimeId: "runtime-2",
    sessionId: "session-2",
    executor: {},
    input: {
      purpose: "record active window",
      target: { titleHint: "Terminal" },
      context: { dryRun: false, guard: { accepted: true } },
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "PROVIDER_UNAVAILABLE");
    assert.equal(result.error.publicSafe, true);
  }
});

test("computeruse.windowScreenRecording keeps canonical storage shape and operational doc boundary", () => {
  const storageDir = path.join(
    repoRoot,
    "src/storagePool/baseToolStorage/computeruseBase/screenRecording/computeruse.windowScreenRecording",
  );
  for (const fileName of [
    "core.ts",
    "bestPractice.ts",
    "dependencies.ts",
    "anthropic.ts",
    "openai.ts",
    "deepmind.ts",
    "computeruse.windowScreenRecording.md",
  ]) {
    assert.ok(existsSync(path.join(storageDir, fileName)), "missing canonical storage file: " + fileName);
  }
  assert.equal(
    existsSync(path.join(repoRoot, "src/storagePool/baseToolStorage/computeruseBase/screenRecording/computeruse.windowScreenRecording.ts")),
    false,
  );

  const entryText = readFileSync(
    path.join(repoRoot, "src/executionEngine/basic_toolLayer/baseTools/computeruseBase/screenRecording/computeruse.windowScreenRecording.ts"),
    "utf8",
  );
  assert.doesNotMatch(entryText, /export\s+\*\s+from/u);
  assert.match(entryText, /windowScreenRecordingHandler/u);

  const docText = readFileSync(path.join(storageDir, "computeruse.windowScreenRecording.md"), "utf8");
  for (const heading of ["## Use This Tool", "## Call Shape", "## Required Inputs", "## Optional Inputs", "## Runtime Behavior", "## Returns", "## Example", "## Avoid"]) {
    assert.match(docText, new RegExp("^" + heading.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "mu"));
  }
  assert.match(docText, /BaseToolExecutorPort\.computeruse\.startRecording/u);
  assert.match(docText, /TAP\/agent owns that composition/u);
  assert.match(docText, /Do not hide local shell/u);
});
