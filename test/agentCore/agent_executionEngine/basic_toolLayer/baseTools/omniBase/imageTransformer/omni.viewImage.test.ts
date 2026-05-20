import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { BaseToolExecutorPort } from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { createBaseToolRegistry } from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import {
  executeOmniViewImageCore,
  omniViewImageDescriptor,
  omniViewImageHandler,
  planOmniViewImage,
} from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/omniBase/imageTransformer/omni.viewImage.js";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "../../../../../../..");

defineAgentCoreContractTest({
  sourcePath: "src/executionEngine/basic_toolLayer/baseTools/omniBase/imageTransformer/omni.viewImage.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/omniBase/imageTransformer/omni.viewImage.md",
  testFileUrl: import.meta.url,
});

function legalDryRunInput() {
  return {
    target: {
      imagePath: "/workspace/assets/preview.png",
      mediaType: "image/png",
      detail: "original",
      maxBytes: 1_000_000,
    },
    context: {
      invocationId: "view-1",
      allowedImageRoots: ["/workspace/assets"],
      grantedPermissions: ["filesystem:read", "omni:image:view"],
      requestedScopes: ["tool:omni:image:view"],
      allowedScopes: ["tool:omni:image:view"],
    },
  } as const;
}

test("planOmniViewImage creates a governed dry-run image view envelope without calling provider", async () => {
  let providerCalled = false;
  const result = await planOmniViewImage({
    ...legalDryRunInput(),
    provider: () => {
      providerCalled = true;
      return { artifactId: "should-not-be-used" };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(providerCalled, false);
  if (!result.ok) return;

  assert.equal(omniViewImageDescriptor.defaultDryRun, true);
  assert.equal(result.output.kind, "agentCore.basicTool.omni.viewImage");
  assert.equal(result.output.target.imagePath, "/workspace/assets/preview.png");
  assert.equal(result.output.dispatch, "dry-run");
  assert.equal(result.output.providerCalled, false);
  assert.equal(result.output.runtimeEntry.port, "BaseToolExecutorPort.omni.transformMedia");
  assert.equal(result.output.runtimeEntry.baseToolOwnsProviderBodyLowering, false);
  assert.equal(result.output.viewEnvelope.metadataOnly, true);
  assert.equal(result.output.viewEnvelope.detail, "original");
  assert.equal(result.output.unsafeSideEffects, false);
  assert.equal(result.audit[0]?.invocationId, "view-1");
});

test("planOmniViewImage rejects missing target, malformed input, scope, permission, and governance gaps", async () => {
  const missing = await planOmniViewImage();
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.error.code, "MISSING_IMAGE_TARGET");
    assert.equal(missing.error.boundary, "input");
  }

  const malformedTarget = await planOmniViewImage({ target: "not-an-object" });
  assert.equal(malformedTarget.ok, false);
  if (!malformedTarget.ok) assert.equal(malformedTarget.error.code, "INVALID_TARGET");

  const malformedContext = await planOmniViewImage({ target: { imagePath: "/workspace/assets/preview.png" }, context: "bad" });
  assert.equal(malformedContext.ok, false);
  if (!malformedContext.ok) assert.equal(malformedContext.error.code, "INVALID_CONTEXT");

  const deniedScope = await planOmniViewImage({
    target: { imagePath: "/workspace/assets/preview.png" },
    context: { allowedImageRoots: ["/workspace/other"] },
  });
  assert.equal(deniedScope.ok, false);
  if (!deniedScope.ok) {
    assert.equal(deniedScope.error.code, "IMAGE_PATH_OUT_OF_SCOPE");
    assert.equal(deniedScope.error.boundary, "scope");
  }

  const permissionDenied = await planOmniViewImage({
    target: { imagePath: "/workspace/assets/preview.png" },
    context: { grantedPermissions: ["filesystem:read"] },
  });
  assert.equal(permissionDenied.ok, false);
  if (!permissionDenied.ok) {
    assert.equal(permissionDenied.error.code, "PERMISSION_DENIED");
    assert.equal(permissionDenied.error.publicSafe, true);
  }

  const governanceRejected = await planOmniViewImage({
    target: { imagePath: "/workspace/assets/preview.png" },
    context: { governance: { accepted: false, reason: "blocked by policy" } },
  });
  assert.equal(governanceRejected.ok, false);
  if (!governanceRejected.ok) assert.equal(governanceRejected.error.code, "GOVERNANCE_REJECTED");
});

test("executeOmniViewImageCore requires guard and maps missing or failing provider to public-safe errors", async () => {
  const noGuard = await executeOmniViewImageCore({
    target: { imagePath: "/workspace/assets/preview.png" },
    context: { dryRun: false },
  });
  assert.equal(noGuard.ok, false);
  if (!noGuard.ok) assert.equal(noGuard.error.code, "GOVERNANCE_REJECTED");

  const missingProvider = await executeOmniViewImageCore({
    target: { imagePath: "/workspace/assets/preview.png" },
    context: { dryRun: false, guard: { accepted: true } },
  });
  assert.equal(missingProvider.ok, false);
  if (!missingProvider.ok) {
    assert.equal(missingProvider.error.code, "PROVIDER_UNAVAILABLE");
    assert.equal(missingProvider.error.publicSafe, true);
    assert.equal(missingProvider.error.internalDetailExposed, false);
  }

  const failedProvider = await executeOmniViewImageCore({
    target: { imagePath: "/workspace/assets/preview.png" },
    context: { dryRun: false, guard: { accepted: true } },
    provider: () => {
      throw new Error("private stack and provider detail");
    },
  });
  assert.equal(failedProvider.ok, false);
  if (!failedProvider.ok) {
    assert.equal(failedProvider.error.code, "PROVIDER_REJECTED");
    assert.equal(failedProvider.error.publicSafe, true);
    assert.equal(failedProvider.error.internalDetailExposed, false);
    assert.equal(failedProvider.error.message.includes("private stack"), false);
  }
});

test("omniViewImageHandler invokes runtime-owned executor.omni.transformMedia when live execution is guarded", async () => {
  const calls: unknown[] = [];
  const executor: BaseToolExecutorPort = {
    omni: {
      async transformMedia(request) {
        calls.push(request);
        return {
          ok: true,
          output: { artifactId: "artifact:image:1", mimeType: "image/png" },
          metadata: { runtimeCarrier: "fake-omni" },
        };
      },
    },
  };

  const result = await omniViewImageHandler.invoke({
    toolCallId: "tool-call-1",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    executor,
    input: {
      target: { imageRef: "artifact:source:1", mediaType: "image/png", detail: "high" },
      context: { dryRun: false, guard: { accepted: true } },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  const runtimeCall = calls[0] as {
    operation?: string;
    inputArtifactId?: string;
    parameters?: Record<string, unknown>;
  };
  assert.equal(runtimeCall.operation, "omni.viewImage.prepareImageInput");
  assert.equal(runtimeCall.inputArtifactId, "artifact:source:1");
  assert.equal(runtimeCall.parameters?.mediaType, "image/png");
  assert.equal(runtimeCall.parameters?.detail, "high");
  assert.equal(runtimeCall.parameters?.runtimeId, "runtime-1");
  assert.equal(runtimeCall.parameters?.sessionId, "session-1");
  assert.equal(runtimeCall.parameters?.invocationId, "tool-call-1");
  assert.equal(typeof runtimeCall.parameters?.auditMetadata, "object");
  if (!result.ok) return;
  assert.equal(result.output.dispatch, "runtime-omni");
  assert.equal(result.output.providerCalled, true);
  assert.equal(result.output.viewEnvelope.artifactId, "artifact:image:1");
  assert.equal(result.output.providerMetadata?.runtimeCarrier, "fake-omni");
});

test("createBaseToolRegistry resolves omni.viewImage handler and does not fallback without executor.omni", async () => {
  const lookup = createBaseToolRegistry().lookupHandler("omni.viewImage");
  assert.equal(lookup.ok, true);
  if (!lookup.ok) return;

  const result = await lookup.handler.invoke({
    toolCallId: "tool-call-2",
    runtimeId: "runtime-2",
    sessionId: "session-2",
    executor: {},
    input: {
      target: { imagePath: "/workspace/assets/preview.png" },
      context: { dryRun: false, guard: { accepted: true } },
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "PROVIDER_UNAVAILABLE");
    assert.equal(result.error.publicSafe, true);
  }
});

test("omni.viewImage keeps canonical storage shape and thin explicit entry exports", () => {
  const storageDir = path.join(repoRoot, "src/storagePool/baseToolStorage/omniBase/imageTransformer/omni.viewImage");
  for (const fileName of [
    "core.ts",
    "bestPractice.ts",
    "dependencies.ts",
    "anthropic.ts",
    "openai.ts",
    "deepmind.ts",
    "omni.viewImage.md",
  ]) {
    assert.ok(existsSync(path.join(storageDir, fileName)), "missing canonical storage file: " + fileName);
  }

  assert.equal(
    existsSync(path.join(repoRoot, "src/storagePool/baseToolStorage/omniBase/imageTransformer/omni.viewImage.ts")),
    false,
    "obsolete flat storage implementation should not remain beside the canonical directory",
  );

  const entryText = readFileSync(
    path.join(repoRoot, "src/executionEngine/basic_toolLayer/baseTools/omniBase/imageTransformer/omni.viewImage.ts"),
    "utf8",
  );
  assert.doesNotMatch(entryText, /export\s+\*\s+from/u);
  assert.match(entryText, /omniViewImageHandler/u);
  assert.match(entryText, /selectOmniViewImagePractice/u);
});
