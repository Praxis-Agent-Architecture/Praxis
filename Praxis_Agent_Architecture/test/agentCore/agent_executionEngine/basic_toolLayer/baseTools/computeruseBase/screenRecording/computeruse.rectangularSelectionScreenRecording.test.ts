import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { BaseToolExecutorPort } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { createBaseToolRegistry } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import {
  executeRectangularSelectionScreenRecordingCore,
  planRectangularSelectionScreenRecording,
  rectangularSelectionScreenRecordingDescriptor,
  rectangularSelectionScreenRecordingHandler,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/screenRecording/computeruse.rectangularSelectionScreenRecording.js";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "../../../../../../..");

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/screenRecording/computeruse.rectangularSelectionScreenRecording.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/screenRecording/computeruse.rectangularSelectionScreenRecording.md",
  testFileUrl: import.meta.url,
});

function legalDryRunInput() {
  return {
    target: {
      displayId: "display-1",
      rect: { x: 10, y: 20, width: 640, height: 360, coordinateSpace: "screen" },
      maxDurationMs: 30_000,
      frameRate: 24,
      includeCursor: true,
      includeAudio: false,
      outputFormat: "video/webm",
      destinationHint: "session://recordings/region.webm",
    },
    purpose: "record a reproducible UI region issue",
    context: {
      runtimeId: "runtime-1",
      invocationId: "region-rec-1",
      requestedScopes: ["tool:computeruse:region-recording"],
      allowedScopes: ["tool:computeruse:region-recording"],
    },
  } as const;
}

test("planRectangularSelectionScreenRecording creates a governed dry-run recording envelope without calling provider", async () => {
  let providerCalled = false;
  const result = await planRectangularSelectionScreenRecording({
    ...legalDryRunInput(),
    provider: () => {
      providerCalled = true;
      return { recordingId: "should-not-be-used" };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(providerCalled, false);
  assert.equal(rectangularSelectionScreenRecordingDescriptor.defaultDryRun, true);
  assert.equal(rectangularSelectionScreenRecordingDescriptor.unsafeSideEffects, true);
  if (!result.ok) return;

  assert.equal(result.output.kind, "agentCore.basicTool.computeruse.rectangularSelectionScreenRecording");
  assert.equal(result.output.dispatch, "dry-run");
  assert.equal(result.output.target.displayId, "display-1");
  assert.deepEqual(result.output.target.rect, { x: 10, y: 20, width: 640, height: 360, coordinateSpace: "screen" });
  assert.equal(result.output.target.maxDurationMs, 30_000);
  assert.equal(result.output.target.frameRate, 24);
  assert.equal(result.output.target.includeAudio, false);
  assert.deepEqual(result.output.permissionsRequired, ["screen:record", "display:capture", "ui:selection", "recording:session"]);
  assert.equal(result.output.providerCalled, false);
  assert.equal(result.output.recordingEnvelope.target, "region");
  assert.equal(result.output.recordingEnvelope.started, false);
  assert.equal(result.output.recordingEnvelope.metadataOnly, true);
  assert.equal(result.output.runtimeEntry.port, "BaseToolExecutorPort.computeruse.startRecording");
  assert.equal(result.output.runtimeEntry.baseToolOwnsTapStrategy, false);
});

test("planRectangularSelectionScreenRecording classifies malformed JSON, missing fields, invalid target, scope, and governance gaps", async () => {
  const malformedRequest = await planRectangularSelectionScreenRecording("bad");
  assert.equal(malformedRequest.ok, false);
  if (!malformedRequest.ok) assert.equal(malformedRequest.error.code, "INVALID_REQUEST");

  const malformedContext = await planRectangularSelectionScreenRecording({ target: {}, context: "bad", purpose: "record" });
  assert.equal(malformedContext.ok, false);
  if (!malformedContext.ok) assert.equal(malformedContext.error.code, "INVALID_CONTEXT");

  const malformedTarget = await planRectangularSelectionScreenRecording({
    target: "bad",
    context: { runtimeId: "runtime-1" },
    purpose: "record",
  });
  assert.equal(malformedTarget.ok, false);
  if (!malformedTarget.ok) assert.equal(malformedTarget.error.code, "INVALID_TARGET");

  const missingRect = await planRectangularSelectionScreenRecording({
    context: { runtimeId: "runtime-1" },
    purpose: "record a reproducible UI issue",
  });
  assert.equal(missingRect.ok, false);
  if (!missingRect.ok) assert.equal(missingRect.error.code, "MISSING_RECT");

  const missingRuntime = await planRectangularSelectionScreenRecording({
    target: { rect: { x: 0, y: 0, width: 800, height: 600 } },
    purpose: "record a reproducible UI issue",
  });
  assert.equal(missingRuntime.ok, false);
  if (!missingRuntime.ok) assert.equal(missingRuntime.error.code, "MISSING_RUNTIME_ID");

  const missingPurpose = await planRectangularSelectionScreenRecording({
    context: { runtimeId: "runtime-1" },
    target: { rect: { x: 0, y: 0, width: 800, height: 600 } },
  });
  assert.equal(missingPurpose.ok, false);
  if (!missingPurpose.ok) assert.equal(missingPurpose.error.code, "MISSING_PURPOSE");

  const badRect = await planRectangularSelectionScreenRecording({
    context: { runtimeId: "runtime-1" },
    target: { rect: { x: 0, y: 0, width: -1, height: 600 } },
    purpose: "record a reproducible UI issue",
  });
  assert.equal(badRect.ok, false);
  if (!badRect.ok) assert.equal(badRect.error.code, "INVALID_RECT");

  const badCoordinateSpace = await planRectangularSelectionScreenRecording({
    context: { runtimeId: "runtime-1" },
    target: { rect: { x: 0, y: 0, width: 800, height: 600 }, coordinateSpace: "page" },
    purpose: "record a reproducible UI issue",
  });
  assert.equal(badCoordinateSpace.ok, false);
  if (!badCoordinateSpace.ok) assert.equal(badCoordinateSpace.error.code, "INVALID_COORDINATE_SPACE");

  const badFrameRate = await planRectangularSelectionScreenRecording({
    context: { runtimeId: "runtime-1" },
    target: { rect: { x: 0, y: 0, width: 800, height: 600 } },
    purpose: "record a reproducible UI issue",
    frameRate: 120,
  });
  assert.equal(badFrameRate.ok, false);
  if (!badFrameRate.ok) assert.equal(badFrameRate.error.code, "INVALID_FRAME_RATE");

  const badDestination = await planRectangularSelectionScreenRecording({
    context: { runtimeId: "runtime-1" },
    target: { rect: { x: 0, y: 0, width: 800, height: 600 } },
    purpose: "record a reproducible UI issue",
    destinationHint: "captures/region.webm",
  });
  assert.equal(badDestination.ok, false);
  if (!badDestination.ok) assert.equal(badDestination.error.code, "INVALID_DESTINATION_HINT");

  const deniedScope = await planRectangularSelectionScreenRecording({
    ...legalDryRunInput(),
    context: {
      runtimeId: "runtime-1",
      requestedScopes: ["tool:computeruse:region-recording"],
      allowedScopes: [],
    },
  });
  assert.equal(deniedScope.ok, false);
  if (!deniedScope.ok) assert.equal(deniedScope.error.code, "SCOPE_DENIED");
});

test("executeRectangularSelectionScreenRecordingCore requires guard and maps missing or failing provider to public-safe errors", async () => {
  const noGuard = await executeRectangularSelectionScreenRecordingCore({
    ...legalDryRunInput(),
    context: { ...legalDryRunInput().context, dryRun: false },
  });
  assert.equal(noGuard.ok, false);
  if (!noGuard.ok) assert.equal(noGuard.error.code, "GOVERNANCE_REJECTED");

  const missingProvider = await executeRectangularSelectionScreenRecordingCore({
    ...legalDryRunInput(),
    context: { ...legalDryRunInput().context, dryRun: false, guard: { accepted: true } },
  });
  assert.equal(missingProvider.ok, false);
  if (!missingProvider.ok) {
    assert.equal(missingProvider.error.code, "PROVIDER_UNAVAILABLE");
    assert.equal(missingProvider.error.publicSafe, true);
    assert.equal(missingProvider.error.internalDetailExposed, false);
  }

  const failedProvider = await executeRectangularSelectionScreenRecordingCore({
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

test("rectangularSelectionScreenRecordingHandler invokes runtime-owned executor.computeruse.startRecording when guarded", async () => {
  const calls: unknown[] = [];
  const executor: BaseToolExecutorPort = {
    computeruse: {
      async startRecording(request) {
        calls.push(request);
        return {
          ok: true,
          output: {
            recordingId: "recording:region:1",
            metadata: { runtimeCarrier: "fake-computeruse" },
          },
          metadata: { adapter: "fake-runtime" },
        };
      },
    },
  };

  const result = await rectangularSelectionScreenRecordingHandler.invoke({
    toolCallId: "tool-call-1",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    executor,
    input: {
      purpose: "record selected region",
      target: {
        displayId: "display-1",
        rect: { x: 10, y: 20, width: 640, height: 360, coordinateSpace: "screen" },
        maxDurationMs: 10_000,
        frameRate: 30,
        includeCursor: false,
        includeAudio: true,
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
    target: "region",
    displayId: "display-1",
    region: { x: 10, y: 20, width: 640, height: 360, coordinateSpace: "screen" },
    maxDurationMs: 10_000,
    frameRate: 30,
    includeCursor: false,
    includeAudio: true,
    destinationHint: undefined,
  });
  assert.equal(runtimeCall.outputFormat, "video/mp4");
  assert.equal(runtimeCall.metadata?.runtimeId, "runtime-1");
  assert.equal(runtimeCall.metadata?.sessionId, "session-1");
  assert.equal(runtimeCall.metadata?.invocationId, "tool-call-1");
  assert.equal(runtimeCall.metadata?.purpose, "record selected region");
  if (!result.ok) return;
  assert.equal(result.output.dispatch, "runtime-computeruse");
  assert.equal(result.output.providerCalled, true);
  assert.equal(result.output.recordingEnvelope.target, "region");
  assert.equal(result.output.recordingEnvelope.recordingId, "recording:region:1");
});

test("createBaseToolRegistry resolves computeruse.rectangularSelectionScreenRecording handler and does not fallback without executor.computeruse", async () => {
  const lookup = createBaseToolRegistry().lookupHandler("computeruse.rectangularSelectionScreenRecording");
  assert.equal(lookup.ok, true);
  if (!lookup.ok) return;

  const result = await lookup.handler.invoke({
    toolCallId: "tool-call-2",
    runtimeId: "runtime-2",
    sessionId: "session-2",
    executor: {},
    input: {
      purpose: "record selected region",
      target: { rect: { x: 0, y: 0, width: 320, height: 240 } },
      context: { dryRun: false, guard: { accepted: true } },
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "PROVIDER_UNAVAILABLE");
    assert.equal(result.error.publicSafe, true);
  }
});

test("computeruse.rectangularSelectionScreenRecording keeps canonical storage shape and operational doc boundary", () => {
  const storageDir = path.join(
    repoRoot,
    "src/storagePool/baseToolStorage/computeruseBase/screenRecording/computeruse.rectangularSelectionScreenRecording",
  );
  for (const fileName of [
    "core.ts",
    "bestPractice.ts",
    "dependencies.ts",
    "anthropic.ts",
    "openai.ts",
    "deepmind.ts",
    "computeruse.rectangularSelectionScreenRecording.md",
  ]) {
    assert.ok(existsSync(path.join(storageDir, fileName)), "missing canonical storage file: " + fileName);
  }
  assert.equal(
    existsSync(path.join(repoRoot, "src/storagePool/baseToolStorage/computeruseBase/screenRecording/computeruse.rectangularSelectionScreenRecording.ts")),
    false,
  );

  const entryText = readFileSync(
    path.join(
      repoRoot,
      "src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/screenRecording/computeruse.rectangularSelectionScreenRecording.ts",
    ),
    "utf8",
  );
  assert.doesNotMatch(entryText, /export\s+\*\s+from/u);
  assert.match(entryText, /rectangularSelectionScreenRecordingHandler/u);

  const docText = readFileSync(path.join(storageDir, "computeruse.rectangularSelectionScreenRecording.md"), "utf8");
  for (const heading of ["## Use This Tool", "## Call Shape", "## Required Inputs", "## Optional Inputs", "## Runtime Behavior", "## Returns", "## Example", "## Avoid"]) {
    assert.match(docText, new RegExp("^" + heading.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "mu"));
  }
  assert.match(docText, /BaseToolExecutorPort\.computeruse\.startRecording/u);
  assert.match(docText, /TAP\/agent owns that composition/u);
  assert.match(docText, /Do not hide local shell/u);
});
