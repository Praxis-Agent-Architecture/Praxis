import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import {
  DEEPMIND_V1BETA_FILE_SEARCH_STORES_DOCUMENTS_ENDPOINT,
  classifyDeepmindV1BetaFileSearchStoreDocumentsProviderError,
  invokeDeepmindV1BetaFileSearchStoreDocuments,
} from "../../../../../src/modelAdapter/actualInvocationLayer/deepmind/v1beta_fileSearchStores_documents.js";

defineAgentCoreContractTest({
  sourcePath: "src/modelAdapter/actualInvocationLayer/deepmind/v1beta_fileSearchStores_documents.ts",
  docPath: "docs/agentCore/agent_modelAdapter/actualInvocationLayer/deepmind/v1beta_fileSearchStores_documents.md",
  testFileUrl: import.meta.url,
});

test("DeepMind/Gemini v1beta fileSearchStores documents builds a dry-run provider envelope", async () => {
  const result = await invokeDeepmindV1BetaFileSearchStoreDocuments({
    operation: "list",
    runtime: { runtimeId: "runtime-1" },
    pathSuffix: "fileSearchStores/store-1",
    query: { pageSize: 10 },
    mockResponse: { documents: [{ name: "fileSearchStores/store-1/documents/doc-1" }] },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.request.endpoint, DEEPMIND_V1BETA_FILE_SEARCH_STORES_DOCUMENTS_ENDPOINT);
  assert.equal(result.request.urlPath, "/v1beta/fileSearchStores/documents/fileSearchStores/store-1");
  assert.equal(result.request.query.pageSize, "10");
  assert.deepEqual(result.response.raw, { documents: [{ name: "fileSearchStores/store-1/documents/doc-1" }] });
  assert.equal(result.response.providerFieldsOpaque, true);
});

test("DeepMind/Gemini v1beta fileSearchStores documents rejects missing runtime before provider access", async () => {
  const result = await invokeDeepmindV1BetaFileSearchStoreDocuments({
    operation: "list",
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.equal(result.error.code, "MISSING_RUNTIME_ID");
  assert.equal(result.error.boundary, "input");
});

test("DeepMind/Gemini v1beta fileSearchStores documents classifies response drift", async () => {
  assert.equal(
    classifyDeepmindV1BetaFileSearchStoreDocumentsProviderError({ name: "SchemaError" }),
    "RESPONSE_FORMAT_DRIFT",
  );

  const result = await invokeDeepmindV1BetaFileSearchStoreDocuments({
    operation: "list",
    runtime: { runtimeId: "runtime-1" },
    dryRun: false,
    expectResponseObject: true,
    caller: () => "not-an-object",
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.equal(result.error.code, "RESPONSE_FORMAT_DRIFT");
  assert.equal(result.error.boundary, "provider");
});
