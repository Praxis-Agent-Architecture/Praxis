import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { BaseToolExecutorPort } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { createBaseToolRegistry } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import {
  executeFreeformScreenshotCore,
  freeformScreenshotDescriptor,
  freeformScreenshotHandler,
  planFreeformScreenshot,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/screenshot/computeruse.freeformScreenshot.js";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "../../../../../../..");

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/screenshot/computeruse.freeformScreenshot.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/screenshot/computeruse.freeformScreenshot.md",
  testFileUrl: import.meta.url,
});

function legalDryRunInput() {
  return {
    target: {
      displayId: "display-1",
      points: [
        { x: 10.2, y: 10.7 },
        { x: 110, y: 20 },
        { x: 90, y: 80 },
      ],
      coordinateSpace: "screen",
      outputFormat: "image/jpeg",
    },
    purpose: "debug selected visual state",
    context: {
      runtimeId: "runtime-1",
      invocationId: "freeform-1",
      requestedScopes: ["tool:computeruse:screen"],
      allowedScopes: ["tool:computeruse:screen"],
    },
  } as const;
}

test("planFreeformScreenshot creates a governed dry-run capture envelope without calling provider", async () => {
  let providerCalled = false;
  const result = await planFreeformScreenshot({
    ...legalDryRunInput(),
    provider: () => {
      providerCalled = true;
      return { artifactId: "should-not-be-used", mimeType: "image/png" };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(providerCalled, false);
  assert.equal(freeformScreenshotDescriptor.defaultDryRun, true);
  if (!result.ok) return;

  assert.equal(result.output.kind, "agentCore.basicTool.computeruse.freeformScreenshot");
  assert.equal(result.output.dispatch, "dry-run");
  assert.equal(result.output.target.displayId, "display-1");
  assert.deepEqual(result.output.target.points, [
    { x: 10, y: 11 },
    { x: 110, y: 20 },
    { x: 90, y: 80 },
  ]);
  assert.deepEqual(result.output.target.boundingBox, { x: 10, y: 11, width: 100, height: 69, coordinateSpace: "screen" });
  assert.equal(result.output.target.outputFormat, "image/jpeg");
  assert.equal(result.output.providerCalled, false);
  assert.equal(result.output.captureEnvelope.captured, false);
  assert.equal(result.output.captureEnvelope.metadataOnly, true);
  assert.equal(result.output.runtimeEntry.port, "BaseToolExecutorPort.computeruse.captureScreenshot");
  assert.equal(result.output.runtimeEntry.baseToolOwnsTapStrategy, false);
});

test("planFreeformScreenshot classifies malformed JSON, missing fields, invalid points, scope, and governance gaps", async () => {
  const malformedRequest = await planFreeformScreenshot("bad");
  assert.equal(malformedRequest.ok, false);
  if (!malformedRequest.ok) assert.equal(malformedRequest.error.code, "INVALID_REQUEST");

  const malformedContext = await planFreeformScreenshot({ target: {}, context: "bad", purpose: "debug" });
  assert.equal(malformedContext.ok, false);
  if (!malformedContext.ok) assert.equal(malformedContext.error.code, "INVALID_CONTEXT");

  const malformedTarget = await planFreeformScreenshot({
    target: "bad",
    context: { runtimeId: "runtime-1" },
    purpose: "debug",
  });
  assert.equal(malformedTarget.ok, false);
  if (!malformedTarget.ok) assert.equal(malformedTarget.error.code, "INVALID_TARGET");

  const missingRuntime = await planFreeformScreenshot({
    purpose: "debug visual state",
    points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 8, y: 10 }],
  });
  assert.equal(missingRuntime.ok, false);
  if (!missingRuntime.ok) assert.equal(missingRuntime.error.code, "MISSING_RUNTIME_ID");

  const missingPurpose = await planFreeformScreenshot({
    context: { runtimeId: "runtime-1" },
    points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 8, y: 10 }],
  });
  assert.equal(missingPurpose.ok, false);
  if (!missingPurpose.ok) assert.equal(missingPurpose.error.code, "MISSING_PURPOSE");

  const missingPoints = await planFreeformScreenshot({ context: { runtimeId: "runtime-1" }, purpose: "debug visual state" });
  assert.equal(missingPoints.ok, false);
  if (!missingPoints.ok) assert.equal(missingPoints.error.code, "MISSING_SELECTION_POINTS");

  const invalidPoint = await planFreeformScreenshot({
    context: { runtimeId: "runtime-1" },
    purpose: "debug visual state",
    points: [{ x: 0, y: 0 }, { x: -1, y: 0 }, { x: 8, y: 10 }],
  });
  assert.equal(invalidPoint.ok, false);
  if (!invalidPoint.ok) assert.equal(invalidPoint.error.code, "INVALID_SELECTION_POINT");

  const tooManyPoints = await planFreeformScreenshot({
    context: { runtimeId: "runtime-1" },
    purpose: "debug visual state",
    points: Array.from({ length: 129 }, (_, index) => ({ x: index, y: index + 1 })),
  });
  assert.equal(tooManyPoints.ok, false);
  if (!tooManyPoints.ok) assert.equal(tooManyPoints.error.code, "TOO_MANY_SELECTION_POINTS");

  const invalidFormat = await planFreeformScreenshot({
    context: { runtimeId: "runtime-1" },
    purpose: "debug visual state",
    target: { points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 8, y: 10 }], outputFormat: "bmp" },
  });
  assert.equal(invalidFormat.ok, false);
  if (!invalidFormat.ok) assert.equal(invalidFormat.error.code, "INVALID_OUTPUT_FORMAT");

  const deniedScope = await planFreeformScreenshot({
    context: { runtimeId: "runtime-1", requestedScopes: ["tool:computeruse:screen"], allowedScopes: [] },
    purpose: "debug visual state",
    points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 8, y: 10 }],
  });
  assert.equal(deniedScope.ok, false);
  if (!deniedScope.ok) assert.equal(deniedScope.error.code, "SCOPE_DENIED");
});

test("executeFreeformScreenshotCore requires guard and maps missing or failing provider to public-safe errors", async () => {
  const noGuard = await executeFreeformScreenshotCore({
    ...legalDryRunInput(),
    context: { ...legalDryRunInput().context, dryRun: false },
  });
  assert.equal(noGuard.ok, false);
  if (!noGuard.ok) assert.equal(noGuard.error.code, "GOVERNANCE_REJECTED");

  const missingProvider = await executeFreeformScreenshotCore({
    ...legalDryRunInput(),
    context: { ...legalDryRunInput().context, dryRun: false, guard: { accepted: true } },
  });
  assert.equal(missingProvider.ok, false);
  if (!missingProvider.ok) {
    assert.equal(missingProvider.error.code, "PROVIDER_UNAVAILABLE");
    assert.equal(missingProvider.error.publicSafe, true);
    assert.equal(missingProvider.error.internalDetailExposed, false);
  }

  const failedProvider = await executeFreeformScreenshotCore({
    ...legalDryRunInput(),
    context: { ...legalDryRunInput().context, dryRun: false, guard: { accepted: true } },
    provider: () => {
      throw new Error("private provider path and stack");
    },
  });
  assert.equal(failedProvider.ok, false);
  if (!failedProvider.ok) {
    assert.equal(failedProvider.error.code, "PROVIDER_FAILURE");
    assert.equal(failedProvider.error.publicSafe, true);
    assert.equal(failedProvider.error.message.includes("private provider"), false);
  }
});

test("freeformScreenshotHandler invokes runtime-owned executor.computeruse.captureScreenshot when guarded", async () => {
  const calls: unknown[] = [];
  const executor: BaseToolExecutorPort = {
    computeruse: {
      async captureScreenshot(request) {
        calls.push(request);
        return {
          ok: true,
          output: {
            artifactId: "artifact:freeform-screenshot:1",
            mimeType: "image/png",
            metadata: { runtimeCarrier: "fake-computeruse" },
          },
          metadata: { adapter: "fake-runtime" },
        };
      },
    },
  };

  const result = await freeformScreenshotHandler.invoke({
    toolCallId: "tool-call-1",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    executor,
    input: {
      purpose: "inspect app state",
      target: {
        displayId: "display-1",
        points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 80, y: 80 }],
        outputFormat: "image/png",
      },
      context: { dryRun: false, guard: { accepted: true } },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  const runtimeCall = calls[0] as {
    target?: string;
    displayId?: string;
    region?: { x: number; y: number; width: number; height: number; coordinateSpace?: string };
    purpose?: string;
    outputFormat?: string;
    metadata?: Record<string, unknown>;
  };
  assert.equal(runtimeCall.target, "freeform");
  assert.equal(runtimeCall.displayId, "display-1");
  assert.deepEqual(runtimeCall.region, { x: 0, y: 0, width: 100, height: 80, coordinateSpace: "screen" });
  assert.deepEqual(runtimeCall.metadata?.points, [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 80, y: 80 }]);
  assert.equal(runtimeCall.purpose, "inspect app state");
  assert.equal(runtimeCall.outputFormat, "image/png");
  assert.equal(runtimeCall.metadata?.runtimeId, "runtime-1");
  assert.equal(runtimeCall.metadata?.sessionId, "session-1");
  assert.equal(runtimeCall.metadata?.invocationId, "tool-call-1");
  if (!result.ok) return;
  assert.equal(result.output.dispatch, "runtime-computeruse");
  assert.equal(result.output.providerCalled, true);
  assert.equal(result.output.captureEnvelope.artifactId, "artifact:freeform-screenshot:1");
  assert.equal(result.output.captureEnvelope.mimeType, "image/png");
});

test("createBaseToolRegistry resolves computeruse.freeformScreenshot handler and does not fallback without executor.computeruse", async () => {
  const lookup = createBaseToolRegistry().lookupHandler("computeruse.freeformScreenshot");
  assert.equal(lookup.ok, true);
  if (!lookup.ok) return;

  const result = await lookup.handler.invoke({
    toolCallId: "tool-call-2",
    runtimeId: "runtime-2",
    sessionId: "session-2",
    executor: {},
    input: {
      purpose: "inspect app state",
      points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 8, y: 10 }],
      context: { dryRun: false, guard: { accepted: true } },
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "PROVIDER_UNAVAILABLE");
    assert.equal(result.error.publicSafe, true);
  }
});

test("computeruse.freeformScreenshot keeps canonical storage shape and operational doc boundary", () => {
  const storageDir = path.join(repoRoot, "src/storagePool/baseToolStorage/computeruseBase/screenshot/computeruse.freeformScreenshot");
  for (const fileName of [
    "core.ts",
    "bestPractice.ts",
    "dependencies.ts",
    "anthropic.ts",
    "openai.ts",
    "deepmind.ts",
    "computeruse.freeformScreenshot.md",
  ]) {
    assert.ok(existsSync(path.join(storageDir, fileName)), "missing canonical storage file: " + fileName);
  }
  assert.equal(existsSync(path.join(repoRoot, "src/storagePool/baseToolStorage/computeruseBase/screenshot/computeruse.freeformScreenshot.ts")), false);

  const docText = readFileSync(path.join(storageDir, "computeruse.freeformScreenshot.md"), "utf8");
  for (const heading of ["## Use This Tool", "## Call Shape", "## Required Inputs", "## Optional Inputs", "## Runtime Behavior", "## Returns", "## Example", "## Avoid"]) {
    assert.match(docText, new RegExp("^" + heading.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "mu"));
  }
  assert.match(docText, /BaseToolExecutorPort\.computeruse\.captureScreenshot/u);
  assert.match(docText, /TAP\/agent owns that composition/u);
  assert.match(docText, /Do not hide local shell/u);
});
