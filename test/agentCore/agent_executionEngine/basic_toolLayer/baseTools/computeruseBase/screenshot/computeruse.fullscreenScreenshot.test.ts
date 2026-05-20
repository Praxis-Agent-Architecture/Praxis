import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { BaseToolExecutorPort } from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { createBaseToolRegistry } from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import {
  executeFullscreenScreenshotCore,
  fullscreenScreenshotDescriptor,
  fullscreenScreenshotHandler,
  planFullscreenScreenshot,
} from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/computeruseBase/screenshot/computeruse.fullscreenScreenshot.js";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "../../../../../../..");

defineAgentCoreContractTest({
  sourcePath: "src/executionEngine/basic_toolLayer/baseTools/computeruseBase/screenshot/computeruse.fullscreenScreenshot.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/screenshot/computeruse.fullscreenScreenshot.md",
  testFileUrl: import.meta.url,
});

function legalDryRunInput() {
  return {
    target: { displayId: "display-1", outputFormat: "image/jpeg" },
    purpose: "debug visual state",
    context: {
      runtimeId: "runtime-1",
      invocationId: "fullscreen-1",
      requestedScopes: ["tool:computeruse:screen"],
      allowedScopes: ["tool:computeruse:screen"],
    },
  } as const;
}

test("planFullscreenScreenshot creates a governed dry-run capture envelope without calling provider", async () => {
  let providerCalled = false;
  const result = await planFullscreenScreenshot({
    ...legalDryRunInput(),
    provider: () => {
      providerCalled = true;
      return { artifactId: "should-not-be-used", mimeType: "image/png" };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(providerCalled, false);
  assert.equal(fullscreenScreenshotDescriptor.defaultDryRun, true);
  if (!result.ok) return;

  assert.equal(result.output.kind, "agentCore.basicTool.computeruse.fullscreenScreenshot");
  assert.equal(result.output.dispatch, "dry-run");
  assert.equal(result.output.target.displayId, "display-1");
  assert.equal(result.output.target.outputFormat, "image/jpeg");
  assert.equal(result.output.providerCalled, false);
  assert.equal(result.output.captureEnvelope.captured, false);
  assert.equal(result.output.captureEnvelope.metadataOnly, true);
  assert.equal(result.output.runtimeEntry.port, "BaseToolExecutorPort.computeruse.captureScreenshot");
  assert.equal(result.output.runtimeEntry.baseToolOwnsTapStrategy, false);
  assert.equal(result.output.unsafeSideEffects, false);
  assert.deepEqual(result.output.acceptedScopes, ["tool:computeruse:screen"]);
});

test("planFullscreenScreenshot classifies malformed JSON, missing fields, invalid target, scope, and governance gaps", async () => {
  const malformedRequest = await planFullscreenScreenshot("bad");
  assert.equal(malformedRequest.ok, false);
  if (!malformedRequest.ok) assert.equal(malformedRequest.error.code, "INVALID_REQUEST");

  const malformedContext = await planFullscreenScreenshot({ target: {}, context: "bad", purpose: "debug" });
  assert.equal(malformedContext.ok, false);
  if (!malformedContext.ok) assert.equal(malformedContext.error.code, "INVALID_CONTEXT");

  const malformedTarget = await planFullscreenScreenshot({ target: "bad", context: { runtimeId: "runtime-1" }, purpose: "debug" });
  assert.equal(malformedTarget.ok, false);
  if (!malformedTarget.ok) assert.equal(malformedTarget.error.code, "INVALID_TARGET");

  const missingRuntime = await planFullscreenScreenshot({ purpose: "debug visual state" });
  assert.equal(missingRuntime.ok, false);
  if (!missingRuntime.ok) {
    assert.equal(missingRuntime.error.code, "MISSING_RUNTIME_ID");
    assert.equal(missingRuntime.error.boundary, "input");
  }

  const missingPurpose = await planFullscreenScreenshot({ context: { runtimeId: "runtime-1" } });
  assert.equal(missingPurpose.ok, false);
  if (!missingPurpose.ok) assert.equal(missingPurpose.error.code, "MISSING_PURPOSE");

  const invalidFormat = await planFullscreenScreenshot({
    context: { runtimeId: "runtime-1" },
    purpose: "debug visual state",
    target: { outputFormat: "bmp" },
  });
  assert.equal(invalidFormat.ok, false);
  if (!invalidFormat.ok) assert.equal(invalidFormat.error.code, "INVALID_OUTPUT_FORMAT");

  const deniedScope = await planFullscreenScreenshot({
    context: { runtimeId: "runtime-1", requestedScopes: ["tool:computeruse:screen"], allowedScopes: [] },
    purpose: "debug visual state",
  });
  assert.equal(deniedScope.ok, false);
  if (!deniedScope.ok) assert.equal(deniedScope.error.code, "SCOPE_DENIED");

  const governanceRejected = await planFullscreenScreenshot({
    context: { runtimeId: "runtime-1", governance: { accepted: false, reason: "blocked" } },
    purpose: "debug visual state",
  });
  assert.equal(governanceRejected.ok, false);
  if (!governanceRejected.ok) assert.equal(governanceRejected.error.code, "GOVERNANCE_REJECTED");
});

test("executeFullscreenScreenshotCore requires guard and maps missing or failing provider to public-safe errors", async () => {
  const noGuard = await executeFullscreenScreenshotCore({
    ...legalDryRunInput(),
    context: { ...legalDryRunInput().context, dryRun: false },
  });
  assert.equal(noGuard.ok, false);
  if (!noGuard.ok) assert.equal(noGuard.error.code, "GOVERNANCE_REJECTED");

  const missingProvider = await executeFullscreenScreenshotCore({
    ...legalDryRunInput(),
    context: { ...legalDryRunInput().context, dryRun: false, guard: { accepted: true } },
  });
  assert.equal(missingProvider.ok, false);
  if (!missingProvider.ok) {
    assert.equal(missingProvider.error.code, "PROVIDER_UNAVAILABLE");
    assert.equal(missingProvider.error.publicSafe, true);
    assert.equal(missingProvider.error.internalDetailExposed, false);
  }

  const failedProvider = await executeFullscreenScreenshotCore({
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

test("fullscreenScreenshotHandler invokes runtime-owned executor.computeruse.captureScreenshot when guarded", async () => {
  const calls: unknown[] = [];
  const executor: BaseToolExecutorPort = {
    computeruse: {
      async captureScreenshot(request) {
        calls.push(request);
        return {
          ok: true,
          output: {
            artifactId: "artifact:screenshot:1",
            mimeType: "image/png",
            metadata: { runtimeCarrier: "fake-computeruse" },
          },
          metadata: { adapter: "fake-runtime" },
        };
      },
    },
  };

  const result = await fullscreenScreenshotHandler.invoke({
    toolCallId: "tool-call-1",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    executor,
    input: {
      purpose: "inspect app state",
      target: { displayId: "display-1", outputFormat: "image/png" },
      context: { dryRun: false, guard: { accepted: true } },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  const runtimeCall = calls[0] as {
    target?: string;
    displayId?: string;
    purpose?: string;
    outputFormat?: string;
    metadata?: Record<string, unknown>;
  };
  assert.equal(runtimeCall.target, "fullscreen");
  assert.equal(runtimeCall.displayId, "display-1");
  assert.equal(runtimeCall.purpose, "inspect app state");
  assert.equal(runtimeCall.outputFormat, "image/png");
  assert.equal(runtimeCall.metadata?.runtimeId, "runtime-1");
  assert.equal(runtimeCall.metadata?.sessionId, "session-1");
  assert.equal(runtimeCall.metadata?.invocationId, "tool-call-1");
  if (!result.ok) return;
  assert.equal(result.output.dispatch, "runtime-computeruse");
  assert.equal(result.output.providerCalled, true);
  assert.equal(result.output.captureEnvelope.artifactId, "artifact:screenshot:1");
  assert.equal(result.output.captureEnvelope.mimeType, "image/png");
  assert.equal(result.output.providerMetadata?.runtimeCarrier, "fake-computeruse");
  assert.equal(result.output.providerMetadata?.adapter, "fake-runtime");
});

test("createBaseToolRegistry resolves computeruse.fullscreenScreenshot handler and does not fallback without executor.computeruse", async () => {
  const lookup = createBaseToolRegistry().lookupHandler("computeruse.fullscreenScreenshot");
  assert.equal(lookup.ok, true);
  if (!lookup.ok) return;

  const result = await lookup.handler.invoke({
    toolCallId: "tool-call-2",
    runtimeId: "runtime-2",
    sessionId: "session-2",
    executor: {},
    input: {
      purpose: "inspect app state",
      context: { dryRun: false, guard: { accepted: true } },
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "PROVIDER_UNAVAILABLE");
    assert.equal(result.error.publicSafe, true);
  }
});

test("computeruse.fullscreenScreenshot keeps canonical storage shape and thin explicit entry exports", () => {
  const storageDir = path.join(
    repoRoot,
    "src/storagePool/baseToolStorage/computeruseBase/screenshot/computeruse.fullscreenScreenshot",
  );
  for (const fileName of [
    "core.ts",
    "bestPractice.ts",
    "dependencies.ts",
    "anthropic.ts",
    "openai.ts",
    "deepmind.ts",
    "computeruse.fullscreenScreenshot.md",
  ]) {
    assert.ok(existsSync(path.join(storageDir, fileName)), "missing canonical storage file: " + fileName);
  }
  assert.equal(
    existsSync(path.join(repoRoot, "src/storagePool/baseToolStorage/computeruseBase/screenshot/computeruse.fullscreenScreenshot.ts")),
    false,
  );
  const entryText = readFileSync(
    path.join(
      repoRoot,
      "src/executionEngine/basic_toolLayer/baseTools/computeruseBase/screenshot/computeruse.fullscreenScreenshot.ts",
    ),
    "utf8",
  );
  assert.doesNotMatch(entryText, /export\s+\*\s+from/u);
  assert.match(entryText, /fullscreenScreenshotHandler/u);
});

test("computeruse.fullscreenScreenshot storage doc describes capability boundary without TAP strategy", () => {
  const docText = readFileSync(
    path.join(
      repoRoot,
      "src/storagePool/baseToolStorage/computeruseBase/screenshot/computeruse.fullscreenScreenshot/computeruse.fullscreenScreenshot.md",
    ),
    "utf8",
  );
  for (const heading of ["## Use This Tool", "## Call Shape", "## Required Inputs", "## Optional Inputs", "## Runtime Behavior", "## Returns", "## Example", "## Avoid"]) {
    assert.match(docText, new RegExp("^" + heading.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "mu"));
  }
  assert.match(docText, /BaseToolExecutorPort\.computeruse\.captureScreenshot/u);
  assert.match(docText, /TAP\/agent owns that composition/u);
  assert.match(docText, /Do not hide local shell/u);
});
