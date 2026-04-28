import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { BaseToolExecutorPort } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { createBaseToolRegistry } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import {
  cameraContentStorageDescriptor,
  cameraContentStorageHandler,
  executeCameraContentStorageCore,
  planCameraContentStorage,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/cameraAccess/computeruse.cameraContentStorage.js";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "../../../../../../..");

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/cameraAccess/computeruse.cameraContentStorage.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/cameraAccess/computeruse.cameraContentStorage.md",
  testFileUrl: import.meta.url,
});

function legalDryRunInput() {
  return {
    target: {
      contentRef: "artifact:camera-photo:1",
      contentKind: "camera-photo",
      storageTarget: "session://camera/photo-1.png",
      retentionPolicy: "session-scoped",
    },
    purpose: "retain camera photo evidence for the current session",
    context: {
      runtimeId: "runtime-1",
      invocationId: "camera-content-storage-1",
      requestedScopes: ["tool:computeruse:camera"],
      allowedScopes: ["tool:computeruse:camera"],
      auditMetadata: { scenario: "unit" },
    },
    metadata: { reason: "debug artifact handoff" },
  } as const;
}

test("planCameraContentStorage creates a guarded dry-run storage envelope without calling provider", async () => {
  let providerCalled = false;
  const result = await planCameraContentStorage({
    ...legalDryRunInput(),
    provider: () => {
      providerCalled = true;
      return { storedArtifactId: "artifact:camera-photo:stored" };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(providerCalled, false);
  assert.equal(cameraContentStorageDescriptor.defaultDryRun, true);
  assert.equal(cameraContentStorageDescriptor.unsafeSideEffects, true);
  if (!result.ok) return;

  assert.equal(result.output.kind, "agentCore.basicTool.computeruse.cameraContentStorage");
  assert.equal(result.output.dispatch, "dry-run");
  assert.equal(result.output.target.contentRef, "artifact:camera-photo:1");
  assert.equal(result.output.target.contentKind, "camera-photo");
  assert.equal(result.output.target.storageTarget, "session://camera/photo-1.png");
  assert.equal(result.output.providerCalled, false);
  assert.equal(result.output.privacyReviewRequired, true);
  assert.equal(result.output.storageEnvelope.resource, "camera-content");
  assert.equal(result.output.storageEnvelope.stored, false);
  assert.equal(result.output.storageEnvelope.metadataOnly, true);
  assert.equal(result.output.runtimeEntry.port, "BaseToolExecutorPort.artifact.store");
  assert.equal(result.output.runtimeEntry.baseToolOwnsTapStrategy, false);
});

test("planCameraContentStorage classifies malformed JSON, missing fields, invalid target, storage, and scope", async () => {
  const malformedRequest = await planCameraContentStorage("bad");
  assert.equal(malformedRequest.ok, false);
  if (!malformedRequest.ok) assert.equal(malformedRequest.error.code, "INVALID_REQUEST");

  const malformedContext = await planCameraContentStorage({ target: {}, context: "bad" });
  assert.equal(malformedContext.ok, false);
  if (!malformedContext.ok) assert.equal(malformedContext.error.code, "INVALID_CONTEXT");

  const malformedTarget = await planCameraContentStorage({
    target: "bad",
    context: { runtimeId: "runtime-1" },
  });
  assert.equal(malformedTarget.ok, false);
  if (!malformedTarget.ok) assert.equal(malformedTarget.error.code, "INVALID_TARGET");

  const missingRuntime = await planCameraContentStorage({
    contentRef: "artifact:camera-photo:1",
    storageTarget: "session://camera/photo-1.png",
    purpose: "retain camera photo",
  });
  assert.equal(missingRuntime.ok, false);
  if (!missingRuntime.ok) assert.equal(missingRuntime.error.code, "MISSING_RUNTIME_ID");

  const missingContentRef = await planCameraContentStorage({
    context: { runtimeId: "runtime-1" },
    storageTarget: "session://camera/photo-1.png",
    purpose: "retain camera photo",
  });
  assert.equal(missingContentRef.ok, false);
  if (!missingContentRef.ok) assert.equal(missingContentRef.error.code, "MISSING_CONTENT_REF");

  const invalidKind = await planCameraContentStorage({
    context: { runtimeId: "runtime-1" },
    contentRef: "artifact:camera-photo:1",
    contentKind: "face-vector",
    storageTarget: "session://camera/photo-1.png",
    purpose: "retain camera photo",
  });
  assert.equal(invalidKind.ok, false);
  if (!invalidKind.ok) assert.equal(invalidKind.error.code, "INVALID_CONTENT_KIND");

  const invalidStorage = await planCameraContentStorage({
    context: { runtimeId: "runtime-1" },
    contentRef: "artifact:camera-photo:1",
    storageTarget: "/tmp/private.png",
    purpose: "retain camera photo",
  });
  assert.equal(invalidStorage.ok, false);
  if (!invalidStorage.ok) assert.equal(invalidStorage.error.code, "INVALID_STORAGE_TARGET");

  const deniedScope = await planCameraContentStorage({
    ...legalDryRunInput(),
    context: {
      runtimeId: "runtime-1",
      requestedScopes: ["tool:computeruse:camera"],
      allowedScopes: [],
    },
  });
  assert.equal(deniedScope.ok, false);
  if (!deniedScope.ok) assert.equal(deniedScope.error.code, "SCOPE_DENIED");
});

test("executeCameraContentStorageCore requires guard and maps missing or failing provider to public-safe errors", async () => {
  const noGuard = await executeCameraContentStorageCore({
    ...legalDryRunInput(),
    context: { ...legalDryRunInput().context, dryRun: false },
  });
  assert.equal(noGuard.ok, false);
  if (!noGuard.ok) assert.equal(noGuard.error.code, "GOVERNANCE_REJECTED");

  const missingProvider = await executeCameraContentStorageCore({
    ...legalDryRunInput(),
    context: { ...legalDryRunInput().context, dryRun: false, guard: { accepted: true } },
  });
  assert.equal(missingProvider.ok, false);
  if (!missingProvider.ok) {
    assert.equal(missingProvider.error.code, "PROVIDER_UNAVAILABLE");
    assert.equal(missingProvider.error.publicSafe, true);
    assert.equal(missingProvider.error.internalDetailExposed, false);
  }

  const failedProvider = await executeCameraContentStorageCore({
    ...legalDryRunInput(),
    context: { ...legalDryRunInput().context, dryRun: false, guard: { accepted: true } },
    provider: () => {
      throw new Error("private artifact store backend path");
    },
  });
  assert.equal(failedProvider.ok, false);
  if (!failedProvider.ok) {
    assert.equal(failedProvider.error.code, "PROVIDER_FAILURE");
    assert.equal(failedProvider.error.publicSafe, true);
    assert.equal(failedProvider.error.message.includes("private artifact"), false);
  }
});

test("cameraContentStorageHandler invokes runtime-owned executor.artifact.store when guarded", async () => {
  const calls: unknown[] = [];
  const executor: BaseToolExecutorPort = {
    artifact: {
      async store(request) {
        calls.push(request);
        return {
          ok: true,
          output: {
            artifactId: "artifact:camera-photo:stored",
            storageUri: request.storageTarget,
            retentionPolicy: request.retentionPolicy,
            metadata: { runtimeCarrier: "fake-artifact-store" },
          },
          metadata: { adapter: "fake-runtime" },
        };
      },
    },
  };

  const result = await cameraContentStorageHandler.invoke({
    toolCallId: "tool-call-1",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    executor,
    input: {
      target: {
        contentRef: "artifact:camera-photo:1",
        contentKind: "camera-photo",
        storageTarget: "session://camera/photo-1.png",
        retentionPolicy: "session-scoped",
      },
      purpose: "retain camera photo evidence for the current session",
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
  assert.equal(runtimeCall.artifactRef, "artifact:camera-photo:1");
  assert.equal(runtimeCall.artifactKind, "camera-photo");
  assert.equal(runtimeCall.storageTarget, "session://camera/photo-1.png");
  assert.equal(runtimeCall.retentionPolicy, "session-scoped");
  assert.equal(runtimeCall.purpose, "retain camera photo evidence for the current session");
  assert.equal(runtimeCall.metadata?.runtimeId, "runtime-1");
  assert.equal(runtimeCall.metadata?.sessionId, "session-1");
  assert.equal(runtimeCall.metadata?.invocationId, "tool-call-1");
  if (!result.ok) return;
  assert.equal(result.output.dispatch, "runtime-artifact");
  assert.equal(result.output.providerCalled, true);
  assert.equal(result.output.storageEnvelope.stored, true);
  assert.equal(result.output.storageEnvelope.storedArtifactId, "artifact:camera-photo:stored");
});

test("createBaseToolRegistry resolves computeruse.cameraContentStorage handler and does not fallback without executor.artifact", async () => {
  const lookup = createBaseToolRegistry().lookupHandler("computeruse.cameraContentStorage");
  assert.equal(lookup.ok, true);
  if (!lookup.ok) return;

  const result = await lookup.handler.invoke({
    toolCallId: "tool-call-2",
    runtimeId: "runtime-2",
    sessionId: "session-2",
    executor: {},
    input: {
      contentRef: "artifact:camera-photo:1",
      storageTarget: "session://camera/photo-1.png",
      purpose: "retain camera photo",
      context: { dryRun: false, guard: { accepted: true } },
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "PROVIDER_UNAVAILABLE");
    assert.equal(result.error.publicSafe, true);
  }
});

test("computeruse.cameraContentStorage keeps canonical storage shape and operational doc boundary", () => {
  const storageDir = path.join(repoRoot, "src/storagePool/baseToolStorage/computeruseBase/cameraAccess/computeruse.cameraContentStorage");
  for (const fileName of [
    "core.ts",
    "bestPractice.ts",
    "dependencies.ts",
    "anthropic.ts",
    "openai.ts",
    "deepmind.ts",
    "computeruse.cameraContentStorage.md",
  ]) {
    assert.ok(existsSync(path.join(storageDir, fileName)), "missing canonical storage file: " + fileName);
  }
  assert.equal(existsSync(path.join(repoRoot, "src/storagePool/baseToolStorage/computeruseBase/cameraAccess/computeruse.cameraContentStorage.ts")), false);

  const entryText = readFileSync(
    path.join(repoRoot, "src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/cameraAccess/computeruse.cameraContentStorage.ts"),
    "utf8",
  );
  assert.doesNotMatch(entryText, /export\s+\*\s+from/u);
  assert.match(entryText, /cameraContentStorageHandler/u);

  const docText = readFileSync(path.join(storageDir, "computeruse.cameraContentStorage.md"), "utf8");
  for (const heading of ["## Use This Tool", "## Call Shape", "## Required Inputs", "## Optional Inputs", "## Runtime Behavior", "## Returns", "## Example", "## Avoid"]) {
    assert.match(docText, new RegExp("^" + heading.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "mu"));
  }
  assert.match(docText, /BaseToolExecutorPort\.artifact\.store/u);
  assert.match(docText, /TAP\/agent/u);
});
