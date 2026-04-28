import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { BaseToolExecutorPort } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { createBaseToolRegistry } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import {
  executeScreenshotStorageCore,
  planScreenshotStorage,
  screenshotStorageDescriptor,
  screenshotStorageHandler,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/screenshot/computeruse.screenshotStorage.js";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "../../../../../../..");

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/screenshot/computeruse.screenshotStorage.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/screenshot/computeruse.screenshotStorage.md",
  testFileUrl: import.meta.url,
});

function legalDryRunInput() {
  return {
    target: {
      screenshotRef: "artifact:screenshot:latest",
      storageTarget: "session://screenshots/latest.png",
      retentionPolicy: "session-scoped",
    },
    purpose: "retain screenshot evidence for this session",
    context: {
      runtimeId: "runtime-1",
      invocationId: "store-1",
      requestedScopes: ["tool:computeruse:screenshot-storage"],
      allowedScopes: ["tool:computeruse:screenshot-storage"],
    },
  } as const;
}

test("planScreenshotStorage creates a guarded dry-run storage envelope without calling provider", async () => {
  let providerCalled = false;
  const result = await planScreenshotStorage({
    ...legalDryRunInput(),
    provider: () => {
      providerCalled = true;
      return { storedArtifactId: "should-not-be-used" };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(providerCalled, false);
  assert.equal(screenshotStorageDescriptor.defaultDryRun, true);
  assert.equal(screenshotStorageDescriptor.unsafeSideEffects, true);
  if (!result.ok) return;

  assert.equal(result.output.kind, "agentCore.basicTool.computeruse.screenshotStorage");
  assert.equal(result.output.dispatch, "dry-run");
  assert.equal(result.output.providerCalled, false);
  assert.equal(result.output.storageEnvelope.stored, false);
  assert.equal(result.output.storageEnvelope.metadataOnly, true);
  assert.equal(result.output.storageEnvelope.screenshotRef, "artifact:screenshot:latest");
  assert.equal(result.output.storageEnvelope.storageTarget, "session://screenshots/latest.png");
  assert.equal(result.output.storageEnvelope.retentionPolicy, "session-scoped");
  assert.equal(result.output.runtimeEntry.port, "BaseToolExecutorPort.artifact.store");
  assert.equal(result.output.runtimeEntry.baseToolOwnsTapStrategy, false);
});

test("planScreenshotStorage classifies malformed JSON, missing fields, invalid target, scope, and governance gaps", async () => {
  const malformedRequest = await planScreenshotStorage("bad");
  assert.equal(malformedRequest.ok, false);
  if (!malformedRequest.ok) assert.equal(malformedRequest.error.code, "INVALID_REQUEST");

  const malformedContext = await planScreenshotStorage({ target: {}, context: "bad", purpose: "retain" });
  assert.equal(malformedContext.ok, false);
  if (!malformedContext.ok) assert.equal(malformedContext.error.code, "INVALID_CONTEXT");

  const malformedTarget = await planScreenshotStorage({
    target: "bad",
    context: { runtimeId: "runtime-1" },
    purpose: "retain",
  });
  assert.equal(malformedTarget.ok, false);
  if (!malformedTarget.ok) assert.equal(malformedTarget.error.code, "INVALID_TARGET");

  const missingRuntime = await planScreenshotStorage({
    screenshotRef: "artifact:screenshot:latest",
    storageTarget: "session://screenshots/latest.png",
    purpose: "retain screenshot",
  });
  assert.equal(missingRuntime.ok, false);
  if (!missingRuntime.ok) assert.equal(missingRuntime.error.code, "MISSING_RUNTIME_ID");

  const missingRef = await planScreenshotStorage({
    context: { runtimeId: "runtime-1" },
    storageTarget: "session://screenshots/latest.png",
    purpose: "retain screenshot",
  });
  assert.equal(missingRef.ok, false);
  if (!missingRef.ok) assert.equal(missingRef.error.code, "MISSING_SCREENSHOT_REF");

  const missingTarget = await planScreenshotStorage({
    context: { runtimeId: "runtime-1" },
    screenshotRef: "artifact:screenshot:latest",
    purpose: "retain screenshot",
  });
  assert.equal(missingTarget.ok, false);
  if (!missingTarget.ok) assert.equal(missingTarget.error.code, "MISSING_STORAGE_TARGET");

  const invalidStorageTarget = await planScreenshotStorage({
    context: { runtimeId: "runtime-1" },
    screenshotRef: "artifact:screenshot:latest",
    storageTarget: "/tmp/leaky-screenshot.png",
    purpose: "retain screenshot",
  });
  assert.equal(invalidStorageTarget.ok, false);
  if (!invalidStorageTarget.ok) assert.equal(invalidStorageTarget.error.code, "INVALID_STORAGE_TARGET");

  const invalidRetention = await planScreenshotStorage({
    context: { runtimeId: "runtime-1" },
    screenshotRef: "artifact:screenshot:latest",
    storageTarget: "session://screenshots/latest.png",
    retentionPolicy: "forever",
    purpose: "retain screenshot",
  });
  assert.equal(invalidRetention.ok, false);
  if (!invalidRetention.ok) assert.equal(invalidRetention.error.code, "INVALID_RETENTION_POLICY");

  const missingPurpose = await planScreenshotStorage({
    context: { runtimeId: "runtime-1" },
    screenshotRef: "artifact:screenshot:latest",
    storageTarget: "session://screenshots/latest.png",
  });
  assert.equal(missingPurpose.ok, false);
  if (!missingPurpose.ok) assert.equal(missingPurpose.error.code, "MISSING_PURPOSE");

  const deniedScope = await planScreenshotStorage({
    ...legalDryRunInput(),
    context: {
      runtimeId: "runtime-1",
      requestedScopes: ["tool:computeruse:screenshot-storage"],
      allowedScopes: [],
    },
  });
  assert.equal(deniedScope.ok, false);
  if (!deniedScope.ok) assert.equal(deniedScope.error.code, "SCOPE_DENIED");
});

test("executeScreenshotStorageCore requires guard and maps missing or failing provider to public-safe errors", async () => {
  const noGuard = await executeScreenshotStorageCore({
    ...legalDryRunInput(),
    context: { ...legalDryRunInput().context, dryRun: false },
  });
  assert.equal(noGuard.ok, false);
  if (!noGuard.ok) assert.equal(noGuard.error.code, "GOVERNANCE_REJECTED");

  const missingProvider = await executeScreenshotStorageCore({
    ...legalDryRunInput(),
    context: { ...legalDryRunInput().context, dryRun: false, guard: { accepted: true } },
  });
  assert.equal(missingProvider.ok, false);
  if (!missingProvider.ok) {
    assert.equal(missingProvider.error.code, "PROVIDER_UNAVAILABLE");
    assert.equal(missingProvider.error.publicSafe, true);
    assert.equal(missingProvider.error.internalDetailExposed, false);
  }

  const failedProvider = await executeScreenshotStorageCore({
    ...legalDryRunInput(),
    context: { ...legalDryRunInput().context, dryRun: false, guard: { accepted: true } },
    provider: () => {
      throw new Error("private runtime artifact store path");
    },
  });
  assert.equal(failedProvider.ok, false);
  if (!failedProvider.ok) {
    assert.equal(failedProvider.error.code, "PROVIDER_FAILURE");
    assert.equal(failedProvider.error.publicSafe, true);
    assert.equal(failedProvider.error.message.includes("private runtime"), false);
  }
});

test("screenshotStorageHandler invokes runtime-owned executor.artifact.store when guarded", async () => {
  const calls: unknown[] = [];
  const executor: BaseToolExecutorPort = {
    artifact: {
      async store(request) {
        calls.push(request);
        return {
          ok: true,
          output: {
            artifactId: "artifact:screenshot:stored-1",
            storageUri: request.storageTarget,
            retentionPolicy: request.retentionPolicy,
            metadata: { runtimeCarrier: "fake-computeruse" },
          },
          metadata: { adapter: "fake-runtime" },
        };
      },
    },
  };

  const result = await screenshotStorageHandler.invoke({
    toolCallId: "tool-call-1",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    executor,
    input: {
      purpose: "retain screenshot evidence",
      target: {
        screenshotRef: "artifact:screenshot:latest",
        storageTarget: "session://screenshots/latest.png",
        retentionPolicy: "session-only",
      },
      context: { dryRun: false, guard: { accepted: true } },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  const runtimeCall = calls[0] as {
    artifactRef?: string;
    artifactKind?: string;
    storageTarget?: string;
    retentionPolicy?: string;
    purpose?: string;
    metadata?: Record<string, unknown>;
  };
  assert.equal(runtimeCall.artifactRef, "artifact:screenshot:latest");
  assert.equal(runtimeCall.artifactKind, "screenshot");
  assert.equal(runtimeCall.storageTarget, "session://screenshots/latest.png");
  assert.equal(runtimeCall.retentionPolicy, "session-only");
  assert.equal(runtimeCall.purpose, "retain screenshot evidence");
  assert.equal(runtimeCall.metadata?.runtimeId, "runtime-1");
  assert.equal(runtimeCall.metadata?.sessionId, "session-1");
  assert.equal(runtimeCall.metadata?.invocationId, "tool-call-1");
  if (!result.ok) return;
  assert.equal(result.output.dispatch, "runtime-computeruse");
  assert.equal(result.output.providerCalled, true);
  assert.equal(result.output.storageEnvelope.storedArtifactId, "artifact:screenshot:stored-1");
  assert.equal(result.output.storageEnvelope.storageUri, "session://screenshots/latest.png");
  assert.equal(result.output.storageEnvelope.retentionPolicy, "session-only");
});

test("createBaseToolRegistry resolves computeruse.screenshotStorage handler and does not fallback without executor.artifact", async () => {
  const lookup = createBaseToolRegistry().lookupHandler("computeruse.screenshotStorage");
  assert.equal(lookup.ok, true);
  if (!lookup.ok) return;

  const result = await lookup.handler.invoke({
    toolCallId: "tool-call-2",
    runtimeId: "runtime-2",
    sessionId: "session-2",
    executor: {},
    input: {
      purpose: "retain screenshot",
      screenshotRef: "artifact:screenshot:latest",
      storageTarget: "session://screenshots/latest.png",
      context: { dryRun: false, guard: { accepted: true } },
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "PROVIDER_UNAVAILABLE");
    assert.equal(result.error.publicSafe, true);
  }
});

test("computeruse.screenshotStorage keeps canonical storage shape and operational doc boundary", () => {
  const storageDir = path.join(repoRoot, "src/storagePool/baseToolStorage/computeruseBase/screenshot/computeruse.screenshotStorage");
  for (const fileName of [
    "core.ts",
    "bestPractice.ts",
    "dependencies.ts",
    "anthropic.ts",
    "openai.ts",
    "deepmind.ts",
    "computeruse.screenshotStorage.md",
  ]) {
    assert.ok(existsSync(path.join(storageDir, fileName)), "missing canonical storage file: " + fileName);
  }
  assert.equal(existsSync(path.join(repoRoot, "src/storagePool/baseToolStorage/computeruseBase/screenshot/computeruse.screenshotStorage.ts")), false);

  const entryText = readFileSync(
    path.join(repoRoot, "src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/screenshot/computeruse.screenshotStorage.ts"),
    "utf8",
  );
  assert.doesNotMatch(entryText, /export\s+\*\s+from/u);
  assert.match(entryText, /screenshotStorageHandler/u);

  const docText = readFileSync(path.join(storageDir, "computeruse.screenshotStorage.md"), "utf8");
  for (const heading of ["## Use This Tool", "## Call Shape", "## Required Inputs", "## Optional Inputs", "## Runtime Behavior", "## Returns", "## Example", "## Avoid"]) {
    assert.match(docText, new RegExp("^" + heading.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "mu"));
  }
  assert.match(docText, /BaseToolExecutorPort\.artifact\.store/u);
  assert.match(docText, /TAP\/agent owns that composition/u);
  assert.match(docText, /Do not hide local shell/u);
});
