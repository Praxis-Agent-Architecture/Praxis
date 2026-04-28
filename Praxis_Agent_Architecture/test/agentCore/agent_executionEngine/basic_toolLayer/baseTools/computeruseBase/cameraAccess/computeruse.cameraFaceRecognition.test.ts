import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { BaseToolExecutorPort } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { createBaseToolRegistry } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import {
  cameraFaceRecognitionDescriptor,
  cameraFaceRecognitionHandler,
  executeCameraFaceRecognitionCore,
  planCameraFaceRecognition,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/cameraAccess/computeruse.cameraFaceRecognition.js";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "../../../../../../..");

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/cameraAccess/computeruse.cameraFaceRecognition.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/cameraAccess/computeruse.cameraFaceRecognition.md",
  testFileUrl: import.meta.url,
});

function legalDryRunInput() {
  return {
    target: {
      frameRef: "artifact:camera-frame:1",
      deviceId: "front-camera",
      mode: "detect-faces",
      maxFaces: 8,
    },
    context: {
      runtimeId: "runtime-1",
      invocationId: "camera-face-analysis-1",
      requestedScopes: ["tool:computeruse:camera"],
      allowedScopes: ["tool:computeruse:camera"],
      auditMetadata: { scenario: "unit" },
    },
    metadata: { reason: "face detection smoke" },
  } as const;
}

test("planCameraFaceRecognition creates a guarded dry-run recognition envelope without calling provider", async () => {
  let providerCalled = false;
  const result = await planCameraFaceRecognition({
    ...legalDryRunInput(),
    provider: () => {
      providerCalled = true;
      return { faceCount: 1, faces: [{ faceId: "face-1", confidence: 0.98 }], identityResolved: false };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(providerCalled, false);
  assert.equal(cameraFaceRecognitionDescriptor.defaultDryRun, true);
  assert.equal(cameraFaceRecognitionDescriptor.unsafeSideEffects, true);
  if (!result.ok) return;

  assert.equal(result.output.kind, "agentCore.basicTool.computeruse.cameraFaceRecognition");
  assert.equal(result.output.dispatch, "dry-run");
  assert.equal(result.output.target.frameRef, "artifact:camera-frame:1");
  assert.equal(result.output.target.mode, "detect-faces");
  assert.equal(result.output.providerCalled, false);
  assert.equal(result.output.biometricDataStored, false);
  assert.equal(result.output.recognitionEnvelope.metadataOnly, true);
  assert.equal(result.output.recognitionEnvelope.analyzed, false);
  assert.equal(result.output.recognitionEnvelope.identityResolved, false);
  assert.deepEqual(result.output.recognitionEnvelope.faces, []);
  assert.equal(result.output.runtimeEntry.port, "BaseToolExecutorPort.computeruse.analyzeCameraFrame");
  assert.equal(result.output.runtimeEntry.baseToolOwnsTapStrategy, false);
});

test("planCameraFaceRecognition classifies malformed JSON, missing fields, invalid target, consent, and scope", async () => {
  const malformedRequest = await planCameraFaceRecognition("bad");
  assert.equal(malformedRequest.ok, false);
  if (!malformedRequest.ok) assert.equal(malformedRequest.error.code, "INVALID_REQUEST");

  const malformedContext = await planCameraFaceRecognition({ target: {}, context: "bad" });
  assert.equal(malformedContext.ok, false);
  if (!malformedContext.ok) assert.equal(malformedContext.error.code, "INVALID_CONTEXT");

  const malformedTarget = await planCameraFaceRecognition({
    target: "bad",
    context: { runtimeId: "runtime-1" },
  });
  assert.equal(malformedTarget.ok, false);
  if (!malformedTarget.ok) assert.equal(malformedTarget.error.code, "INVALID_TARGET");

  const missingRuntime = await planCameraFaceRecognition({
    frameRef: "artifact:camera-frame:1",
  });
  assert.equal(missingRuntime.ok, false);
  if (!missingRuntime.ok) assert.equal(missingRuntime.error.code, "MISSING_RUNTIME_ID");

  const missingFrame = await planCameraFaceRecognition({
    context: { runtimeId: "runtime-1" },
  });
  assert.equal(missingFrame.ok, false);
  if (!missingFrame.ok) assert.equal(missingFrame.error.code, "MISSING_FRAME_REF");

  const invalidLimit = await planCameraFaceRecognition({
    context: { runtimeId: "runtime-1" },
    frameRef: "artifact:camera-frame:1",
    maxFaces: 0,
  });
  assert.equal(invalidLimit.ok, false);
  if (!invalidLimit.ok) assert.equal(invalidLimit.error.code, "INVALID_FACE_LIMIT");

  const missingConsent = await planCameraFaceRecognition({
    context: { runtimeId: "runtime-1" },
    frameRef: "artifact:camera-frame:1",
    mode: "identify-consented-face",
  });
  assert.equal(missingConsent.ok, false);
  if (!missingConsent.ok) assert.equal(missingConsent.error.code, "BIOMETRIC_CONSENT_REQUIRED");

  const deniedScope = await planCameraFaceRecognition({
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

test("executeCameraFaceRecognitionCore requires guard and maps missing or failing provider to public-safe errors", async () => {
  const noGuard = await executeCameraFaceRecognitionCore({
    ...legalDryRunInput(),
    context: { ...legalDryRunInput().context, dryRun: false },
  });
  assert.equal(noGuard.ok, false);
  if (!noGuard.ok) assert.equal(noGuard.error.code, "GOVERNANCE_REJECTED");

  const missingProvider = await executeCameraFaceRecognitionCore({
    ...legalDryRunInput(),
    context: { ...legalDryRunInput().context, dryRun: false, guard: { accepted: true } },
  });
  assert.equal(missingProvider.ok, false);
  if (!missingProvider.ok) {
    assert.equal(missingProvider.error.code, "PROVIDER_UNAVAILABLE");
    assert.equal(missingProvider.error.publicSafe, true);
    assert.equal(missingProvider.error.internalDetailExposed, false);
  }

  const failedProvider = await executeCameraFaceRecognitionCore({
    ...legalDryRunInput(),
    context: { ...legalDryRunInput().context, dryRun: false, guard: { accepted: true } },
    provider: () => {
      throw new Error("private biometric model backend path");
    },
  });
  assert.equal(failedProvider.ok, false);
  if (!failedProvider.ok) {
    assert.equal(failedProvider.error.code, "PROVIDER_FAILURE");
    assert.equal(failedProvider.error.publicSafe, true);
    assert.equal(failedProvider.error.message.includes("private biometric"), false);
  }
});

test("cameraFaceRecognitionHandler invokes runtime-owned executor.computeruse.analyzeCameraFrame when guarded", async () => {
  const calls: unknown[] = [];
  const executor: BaseToolExecutorPort = {
    computeruse: {
      async analyzeCameraFrame(request) {
        calls.push(request);
        return {
          ok: true,
          output: {
            faceCount: 1,
            faces: [{ faceId: "face-1", confidence: 0.98 }],
            identityResolved: false,
            metadata: { runtimeCarrier: "fake-vision-runtime" },
          },
          metadata: { adapter: "fake-runtime" },
        };
      },
    },
  };

  const result = await cameraFaceRecognitionHandler.invoke({
    toolCallId: "tool-call-1",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    executor,
    input: {
      target: {
        frameRef: "artifact:camera-frame:1",
        deviceId: "front-camera",
        mode: "detect-faces",
        maxFaces: 8,
      },
      context: { dryRun: false, guard: { accepted: true } },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  const runtimeCall = calls[0] as {
    frameRef?: string;
    operation?: string;
    deviceId?: string;
    maxFaces?: number;
    metadata?: Record<string, unknown>;
  };
  assert.equal(runtimeCall.frameRef, "artifact:camera-frame:1");
  assert.equal(runtimeCall.operation, "detect-faces");
  assert.equal(runtimeCall.deviceId, "front-camera");
  assert.equal(runtimeCall.maxFaces, 8);
  assert.equal(runtimeCall.metadata?.runtimeId, "runtime-1");
  assert.equal(runtimeCall.metadata?.sessionId, "session-1");
  assert.equal(runtimeCall.metadata?.invocationId, "tool-call-1");
  if (!result.ok) return;
  assert.equal(result.output.dispatch, "runtime-computeruse");
  assert.equal(result.output.providerCalled, true);
  assert.equal(result.output.recognitionEnvelope.analyzed, true);
  assert.equal(result.output.recognitionEnvelope.faceCount, 1);
  assert.equal(result.output.recognitionEnvelope.faces[0]?.faceId, "face-1");
});

test("cameraFaceRecognitionHandler supports consented identity mode without storing biometric data", async () => {
  const executor: BaseToolExecutorPort = {
    computeruse: {
      async analyzeCameraFrame() {
        return {
          ok: true,
          output: {
            faceCount: 1,
            faces: [{ faceId: "face-1", matchedSubjectRef: "subject:1", matchConfidence: 0.97 }],
            identityResolved: true,
          },
        };
      },
    },
  };

  const result = await cameraFaceRecognitionHandler.invoke({
    toolCallId: "tool-call-identity",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    executor,
    input: {
      target: {
        frameRef: "artifact:camera-frame:1",
        mode: "verify-consented-face",
        subjectRef: "subject:1",
        subjectConsent: { accepted: true },
      },
      context: { dryRun: false, guard: { accepted: true } },
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.output.biometricConsentRequired, true);
  assert.equal(result.output.biometricDataStored, false);
  assert.equal(result.output.recognitionEnvelope.identityResolved, true);
  assert.equal(result.output.recognitionEnvelope.faces[0]?.matchedSubjectRef, "subject:1");
});

test("createBaseToolRegistry resolves computeruse.cameraFaceRecognition handler and does not fallback without executor.computeruse", async () => {
  const lookup = createBaseToolRegistry().lookupHandler("computeruse.cameraFaceRecognition");
  assert.equal(lookup.ok, true);
  if (!lookup.ok) return;

  const result = await lookup.handler.invoke({
    toolCallId: "tool-call-2",
    runtimeId: "runtime-2",
    sessionId: "session-2",
    executor: {},
    input: {
      frameRef: "artifact:camera-frame:1",
      context: { dryRun: false, guard: { accepted: true } },
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "PROVIDER_UNAVAILABLE");
    assert.equal(result.error.publicSafe, true);
  }
});

test("computeruse.cameraFaceRecognition keeps canonical storage shape and operational doc boundary", () => {
  const storageDir = path.join(repoRoot, "src/storagePool/baseToolStorage/computeruseBase/cameraAccess/computeruse.cameraFaceRecognition");
  for (const fileName of [
    "core.ts",
    "bestPractice.ts",
    "dependencies.ts",
    "anthropic.ts",
    "openai.ts",
    "deepmind.ts",
    "computeruse.cameraFaceRecognition.md",
  ]) {
    assert.ok(existsSync(path.join(storageDir, fileName)), "missing canonical storage file: " + fileName);
  }
  assert.equal(existsSync(path.join(repoRoot, "src/storagePool/baseToolStorage/computeruseBase/cameraAccess/computeruse.cameraFaceRecognition.ts")), false);

  const entryText = readFileSync(
    path.join(repoRoot, "src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/cameraAccess/computeruse.cameraFaceRecognition.ts"),
    "utf8",
  );
  assert.doesNotMatch(entryText, /export\s+\*\s+from/u);
  assert.match(entryText, /cameraFaceRecognitionHandler/u);

  const docText = readFileSync(path.join(storageDir, "computeruse.cameraFaceRecognition.md"), "utf8");
  for (const heading of ["## Use This Tool", "## Call Shape", "## Required Inputs", "## Optional Inputs", "## Runtime Behavior", "## Returns", "## Example", "## Avoid"]) {
    assert.match(docText, new RegExp("^" + heading.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "mu"));
  }
  assert.match(docText, /BaseToolExecutorPort\.computeruse\.analyzeCameraFrame/u);
  assert.match(docText, /TAP\/agent/u);
});
