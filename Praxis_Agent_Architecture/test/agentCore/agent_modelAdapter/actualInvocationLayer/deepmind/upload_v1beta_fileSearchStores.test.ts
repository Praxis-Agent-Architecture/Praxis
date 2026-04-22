import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  deepMindUploadV1BetaFileSearchStoresDescriptor,
  planDeepMindUploadV1BetaFileSearchStores,
} from "../../../../../src/agentCore/agent_modelAdapter/actualInvocationLayer/deepmind/upload_v1beta_fileSearchStores.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_modelAdapter/actualInvocationLayer/deepmind/upload_v1beta_fileSearchStores.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_modelAdapter/actualInvocationLayer/deepmind/upload_v1beta_fileSearchStores.md",
  testFileUrl: import.meta.url,
});

test("planDeepMindUploadV1BetaFileSearchStores creates a dry-run file search store upload envelope", () => {
  const result = planDeepMindUploadV1BetaFileSearchStores({
    fileSearchStoreName: " stores/support ",
    file: {
      displayName: " manual.pdf ",
      mimeType: " application/pdf ",
      sizeBytes: 2048,
    },
    apiKeyPresent: true,
    responseBody: { fileSearchStore: { name: "stores/support" }, document: { name: "documents/1" } },
  });

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  assert.equal(result.plan.endpointTemplate, "/upload/v1beta/fileSearchStores/{fileSearchStoreName}:upload");
  assert.equal(result.plan.fileSearchStoreName, "stores/support");
  assert.equal(result.plan.file.displayName, "manual.pdf");
  assert.deepEqual(result.plan.responseEnvelope?.keyHints, ["document", "fileSearchStore"]);
  assert.equal(result.plan.capabilitySignal.supportsFileSearchStoreUpload, true);
  assert.equal(result.plan.capabilitySignal.usableByAbstractionLayer, true);
  assert.equal(result.plan.providerCarrierHandoff.networkCallStarted, false);
  assert.equal(result.plan.abstractionHandoff.rawProviderFieldsExposed, false);
  assert.equal(result.plan.audit.unsafeSideEffects, false);
  assert.equal(deepMindUploadV1BetaFileSearchStoresDescriptor.providerFieldsPromotedToPraxisContract, false);
});

test("planDeepMindUploadV1BetaFileSearchStores rejects missing stores and classifies upstream errors", () => {
  const missingStore = planDeepMindUploadV1BetaFileSearchStores({
    file: { displayName: "manual.pdf", mimeType: "application/pdf" },
  });

  if (missingStore.ok) {
    throw new Error("file search store upload planner should require store name");
  }

  assert.equal(missingStore.error.code, "MISSING_FILE_SEARCH_STORE_NAME");
  assert.equal(missingStore.error.safeForRuntimeInspection, true);

  const upstream = planDeepMindUploadV1BetaFileSearchStores({
    fileSearchStoreName: "stores/support",
    file: { displayName: "manual.pdf", mimeType: "application/pdf" },
    upstreamError: { status: 503, message: "endpoint unavailable", internal: "hidden" },
  });

  if (!upstream.ok) {
    throw new Error(upstream.error.message);
  }

  assert.equal(upstream.plan.errorEnvelope?.category, "endpoint-unavailable");
  assert.deepEqual(upstream.plan.errorEnvelope?.keyHints, ["internal", "message", "status"]);
  assert.equal(upstream.plan.errorEnvelope?.rawProviderFieldsExposed, false);
  assert.equal(upstream.plan.capabilitySignal.usableByAbstractionLayer, false);
});
