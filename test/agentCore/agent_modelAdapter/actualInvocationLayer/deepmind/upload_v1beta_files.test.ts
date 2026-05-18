import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  deepMindUploadV1BetaFilesDescriptor,
  planDeepMindUploadV1BetaFiles,
} from "../../../../../src/agentCore/agent_modelAdapter/actualInvocationLayer/deepmind/upload_v1beta_files.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_modelAdapter/actualInvocationLayer/deepmind/upload_v1beta_files.ts",
  docPath: "docs/agentCore/agent_modelAdapter/actualInvocationLayer/deepmind/upload_v1beta_files.md",
  testFileUrl: import.meta.url,
});

test("planDeepMindUploadV1BetaFiles creates a dry-run upload envelope", () => {
  const result = planDeepMindUploadV1BetaFiles({
    file: {
      displayName: " notes.txt ",
      mimeType: " text/plain ",
      sizeBytes: 128,
      uri: " file://local-notes ",
    },
    uploadProtocol: "resumable",
    apiKeyPresent: true,
    responseBody: { file: { name: "files/123" }, done: true },
    trace: { callerId: "runtime.modelAdapter" },
  });

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  assert.equal(result.plan.endpointPath, "/upload/v1beta/files");
  assert.equal(result.plan.file.displayName, "notes.txt");
  assert.equal(result.plan.file.mimeType, "text/plain");
  assert.deepEqual(result.plan.responseEnvelope?.keyHints, ["done", "file"]);
  assert.equal(result.plan.capabilitySignal.usableByAbstractionLayer, true);
  assert.equal(result.plan.providerCarrierHandoff.networkCallStarted, false);
  assert.equal(result.plan.abstractionHandoff.rawProviderFieldsExposed, false);
  assert.equal(result.plan.audit.unsafeSideEffects, false);
  assert.equal(deepMindUploadV1BetaFilesDescriptor.dryRun, true);
});

test("planDeepMindUploadV1BetaFiles classifies invalid input and provider errors safely", () => {
  const invalid = planDeepMindUploadV1BetaFiles({
    file: { displayName: "notes.txt", mimeType: "text/plain", sizeBytes: -1 },
  });

  if (invalid.ok) {
    throw new Error("upload planner should reject negative file sizes");
  }

  assert.equal(invalid.error.code, "INVALID_FILE_SIZE");
  assert.equal(invalid.error.rawProviderFieldsExposed, false);

  const upstream = planDeepMindUploadV1BetaFiles({
    file: { displayName: "notes.txt", mimeType: "text/plain" },
    upstreamError: { status: 401, message: "authentication failed", token: "hidden" },
  });

  if (!upstream.ok) {
    throw new Error(upstream.error.message);
  }

  assert.equal(upstream.plan.errorEnvelope?.category, "auth");
  assert.deepEqual(upstream.plan.errorEnvelope?.keyHints, ["message", "status", "token"]);
  assert.equal(upstream.plan.errorEnvelope?.rawProviderFieldsExposed, false);
  assert.equal(upstream.plan.capabilitySignal.usableByAbstractionLayer, false);
});
