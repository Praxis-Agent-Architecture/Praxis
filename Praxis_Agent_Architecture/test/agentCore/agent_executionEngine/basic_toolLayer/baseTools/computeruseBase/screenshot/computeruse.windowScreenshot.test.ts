import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { BaseToolExecutorPort } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { createBaseToolRegistry } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import {
  executeWindowScreenshotCore,
  planWindowScreenshot,
  windowScreenshotDescriptor,
  windowScreenshotHandler,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/screenshot/computeruse.windowScreenshot.js";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "../../../../../../..");

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/screenshot/computeruse.windowScreenshot.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/screenshot/computeruse.windowScreenshot.md",
  testFileUrl: import.meta.url,
});

function legalDryRunInput() {
  return {
    target: {
      displayId: "display-1",
      windowRef: "window:active",
      titleHint: "Browser",
      outputFormat: "image/jpeg",
      includeWindowFrame: false,
    },
    purpose: "debug window visual state",
    context: {
      runtimeId: "runtime-1",
      invocationId: "window-1",
      requestedScopes: ["tool:computeruse:screen"],
      allowedScopes: ["tool:computeruse:screen"],
    },
  } as const;
}

test("planWindowScreenshot creates a governed dry-run capture envelope without calling provider", async () => {
  let providerCalled = false;
  const result = await planWindowScreenshot({
    ...legalDryRunInput(),
    provider: () => {
      providerCalled = true;
      return { artifactId: "should-not-be-used", mimeType: "image/png" };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(providerCalled, false);
  assert.equal(windowScreenshotDescriptor.defaultDryRun, true);
  if (!result.ok) return;

  assert.equal(result.output.kind, "agentCore.basicTool.computeruse.windowScreenshot");
  assert.equal(result.output.dispatch, "dry-run");
  assert.equal(result.output.target.displayId, "display-1");
  assert.equal(result.output.target.windowRef, "window:active");
  assert.equal(result.output.target.titleHint, "Browser");
  assert.equal(result.output.target.outputFormat, "image/jpeg");
  assert.equal(result.output.target.includeWindowFrame, false);
  assert.equal(result.output.providerCalled, false);
  assert.equal(result.output.captureEnvelope.captured, false);
  assert.equal(result.output.captureEnvelope.metadataOnly, true);
  assert.equal(result.output.runtimeEntry.port, "BaseToolExecutorPort.computeruse.captureScreenshot");
  assert.equal(result.output.runtimeEntry.baseToolOwnsTapStrategy, false);
  assert.equal(result.output.unsafeSideEffects, false);
});

test("planWindowScreenshot classifies malformed JSON, missing fields, invalid target, scope, and governance gaps", async () => {
  const malformedRequest = await planWindowScreenshot("bad");
  assert.equal(malformedRequest.ok, false);
  if (!malformedRequest.ok) assert.equal(malformedRequest.error.code, "INVALID_REQUEST");

  const malformedContext = await planWindowScreenshot({ target: {}, context: "bad", purpose: "debug" });
  assert.equal(malformedContext.ok, false);
  if (!malformedContext.ok) assert.equal(malformedContext.error.code, "INVALID_CONTEXT");

  const malformedTarget = await planWindowScreenshot({ target: "bad", context: { runtimeId: "runtime-1" }, purpose: "debug" });
  assert.equal(malformedTarget.ok, false);
  if (!malformedTarget.ok) assert.equal(malformedTarget.error.code, "INVALID_TARGET");

  const missingRuntime = await planWindowScreenshot({ purpose: "debug visual state", target: { windowRef: "window:active" } });
  assert.equal(missingRuntime.ok, false);
  if (!missingRuntime.ok) assert.equal(missingRuntime.error.code, "MISSING_RUNTIME_ID");

  const missingPurpose = await planWindowScreenshot({ context: { runtimeId: "runtime-1" }, target: { windowRef: "window:active" } });
  assert.equal(missingPurpose.ok, false);
  if (!missingPurpose.ok) assert.equal(missingPurpose.error.code, "MISSING_PURPOSE");

  const missingWindow = await planWindowScreenshot({ context: { runtimeId: "runtime-1" }, purpose: "debug visual state" });
  assert.equal(missingWindow.ok, false);
  if (!missingWindow.ok) assert.equal(missingWindow.error.code, "MISSING_WINDOW_REF");

  const invalidWindow = await planWindowScreenshot({
    context: { runtimeId: "runtime-1" },
    purpose: "debug visual state",
    target: { windowRef: "bad\0ref" },
  });
  assert.equal(invalidWindow.ok, false);
  if (!invalidWindow.ok) assert.equal(invalidWindow.error.code, "INVALID_WINDOW_REF");

  const invalidFormat = await planWindowScreenshot({
    context: { runtimeId: "runtime-1" },
    purpose: "debug visual state",
    target: { windowRef: "window:active", outputFormat: "bmp" },
  });
  assert.equal(invalidFormat.ok, false);
  if (!invalidFormat.ok) assert.equal(invalidFormat.error.code, "INVALID_OUTPUT_FORMAT");

  const deniedScope = await planWindowScreenshot({
    context: { runtimeId: "runtime-1", requestedScopes: ["tool:computeruse:screen"], allowedScopes: [] },
    purpose: "debug visual state",
    target: { windowRef: "window:active" },
  });
  assert.equal(deniedScope.ok, false);
  if (!deniedScope.ok) assert.equal(deniedScope.error.code, "SCOPE_DENIED");
});

test("executeWindowScreenshotCore requires guard and maps missing or failing provider to public-safe errors", async () => {
  const noGuard = await executeWindowScreenshotCore({
    ...legalDryRunInput(),
    context: { ...legalDryRunInput().context, dryRun: false },
  });
  assert.equal(noGuard.ok, false);
  if (!noGuard.ok) assert.equal(noGuard.error.code, "GOVERNANCE_REJECTED");

  const missingProvider = await executeWindowScreenshotCore({
    ...legalDryRunInput(),
    context: { ...legalDryRunInput().context, dryRun: false, guard: { accepted: true } },
  });
  assert.equal(missingProvider.ok, false);
  if (!missingProvider.ok) {
    assert.equal(missingProvider.error.code, "PROVIDER_UNAVAILABLE");
    assert.equal(missingProvider.error.publicSafe, true);
    assert.equal(missingProvider.error.internalDetailExposed, false);
  }

  const failedProvider = await executeWindowScreenshotCore({
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

test("windowScreenshotHandler invokes runtime-owned executor.computeruse.captureScreenshot when guarded", async () => {
  const calls: unknown[] = [];
  const executor: BaseToolExecutorPort = {
    computeruse: {
      async captureScreenshot(request) {
        calls.push(request);
        return {
          ok: true,
          output: {
            artifactId: "artifact:window-screenshot:1",
            mimeType: "image/png",
            metadata: { runtimeCarrier: "fake-computeruse" },
          },
          metadata: { adapter: "fake-runtime" },
        };
      },
    },
  };

  const result = await windowScreenshotHandler.invoke({
    toolCallId: "tool-call-1",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    executor,
    input: {
      purpose: "inspect app state",
      target: { displayId: "display-1", windowRef: "window:active", outputFormat: "image/png" },
      context: { dryRun: false, guard: { accepted: true } },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  const runtimeCall = calls[0] as {
    target?: string;
    displayId?: string;
    windowId?: string;
    purpose?: string;
    outputFormat?: string;
    metadata?: Record<string, unknown>;
  };
  assert.equal(runtimeCall.target, "window");
  assert.equal(runtimeCall.displayId, "display-1");
  assert.equal(runtimeCall.windowId, "window:active");
  assert.equal(runtimeCall.purpose, "inspect app state");
  assert.equal(runtimeCall.outputFormat, "image/png");
  assert.equal(runtimeCall.metadata?.runtimeId, "runtime-1");
  assert.equal(runtimeCall.metadata?.sessionId, "session-1");
  assert.equal(runtimeCall.metadata?.invocationId, "tool-call-1");
  if (!result.ok) return;
  assert.equal(result.output.dispatch, "runtime-computeruse");
  assert.equal(result.output.providerCalled, true);
  assert.equal(result.output.captureEnvelope.artifactId, "artifact:window-screenshot:1");
  assert.equal(result.output.captureEnvelope.mimeType, "image/png");
  assert.equal(result.output.providerMetadata?.runtimeCarrier, "fake-computeruse");
  assert.equal(result.output.providerMetadata?.adapter, "fake-runtime");
});

test("createBaseToolRegistry resolves computeruse.windowScreenshot handler and does not fallback without executor.computeruse", async () => {
  const lookup = createBaseToolRegistry().lookupHandler("computeruse.windowScreenshot");
  assert.equal(lookup.ok, true);
  if (!lookup.ok) return;

  const result = await lookup.handler.invoke({
    toolCallId: "tool-call-2",
    runtimeId: "runtime-2",
    sessionId: "session-2",
    executor: {},
    input: {
      purpose: "inspect app state",
      target: { windowRef: "window:active" },
      context: { dryRun: false, guard: { accepted: true } },
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "PROVIDER_UNAVAILABLE");
    assert.equal(result.error.publicSafe, true);
  }
});

test("computeruse.windowScreenshot keeps canonical storage shape and operational doc boundary", () => {
  const storageDir = path.join(
    repoRoot,
    "src/storagePool/baseToolStorage/computeruseBase/screenshot/computeruse.windowScreenshot",
  );
  for (const fileName of [
    "core.ts",
    "bestPractice.ts",
    "dependencies.ts",
    "anthropic.ts",
    "openai.ts",
    "deepmind.ts",
    "computeruse.windowScreenshot.md",
  ]) {
    assert.ok(existsSync(path.join(storageDir, fileName)), "missing canonical storage file: " + fileName);
  }
  assert.equal(existsSync(path.join(repoRoot, "src/storagePool/baseToolStorage/computeruseBase/screenshot/computeruse.windowScreenshot.ts")), false);

  const docText = readFileSync(path.join(storageDir, "computeruse.windowScreenshot.md"), "utf8");
  for (const heading of ["## Use This Tool", "## Call Shape", "## Required Inputs", "## Optional Inputs", "## Runtime Behavior", "## Returns", "## Example", "## Avoid"]) {
    assert.match(docText, new RegExp("^" + heading.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "mu"));
  }
  assert.match(docText, /BaseToolExecutorPort\.computeruse\.captureScreenshot/u);
  assert.match(docText, /TAP\/agent owns that composition/u);
  assert.match(docText, /Do not hide local shell/u);
});
