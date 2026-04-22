import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import {
  DEEPMIND_V1BETA_FILE_SEARCH_STORES_ENDPOINT,
  classifyDeepmindV1BetaFileSearchStoresProviderError,
  invokeDeepmindV1BetaFileSearchStores,
} from "../../../../../src/agentCore/agent_modelAdapter/actualInvocationLayer/deepmind/v1beta_fileSearchStores.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_modelAdapter/actualInvocationLayer/deepmind/v1beta_fileSearchStores.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_modelAdapter/actualInvocationLayer/deepmind/v1beta_fileSearchStores.md",
  testFileUrl: import.meta.url,
});

test("DeepMind/Gemini v1beta fileSearchStores builds a dry-run provider envelope", async () => {
  const result = await invokeDeepmindV1BetaFileSearchStores({
    operation: "list",
    runtime: { runtimeId: "runtime-1", callerId: " caller-1 " },
    query: { pageSize: 5 },
    requiredScopes: ["model.file-search-store.read", " model.file-search-store.read "],
    allowedScopes: ["model.file-search-store.read"],
    mockResponse: { fileSearchStores: [{ name: "fileSearchStores/store-1" }] },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.request.endpoint, DEEPMIND_V1BETA_FILE_SEARCH_STORES_ENDPOINT);
  assert.equal(result.request.urlPath, "/v1beta/fileSearchStores");
  assert.equal(result.request.runtime.callerId, "caller-1");
  assert.deepEqual(result.request.requestedScopes, ["model.file-search-store.read"]);
  assert.deepEqual(result.request.grantedScopes, ["model.file-search-store.read"]);
  assert.deepEqual(result.response.raw, { fileSearchStores: [{ name: "fileSearchStores/store-1" }] });
  assert.equal(result.response.providerFieldsOpaque, true);
});

test("DeepMind/Gemini v1beta fileSearchStores rejects scope overflow before provider access", async () => {
  const result = await invokeDeepmindV1BetaFileSearchStores({
    operation: "delete",
    runtime: { runtimeId: "runtime-1" },
    requiredScopes: ["model.file-search-store.delete"],
    allowedScopes: ["model.file-search-store.read"],
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.equal(result.error.code, "SCOPE_DENIED");
  assert.equal(result.error.boundary, "scope");
});

test("DeepMind/Gemini v1beta fileSearchStores classifies retryable provider failures", async () => {
  assert.equal(classifyDeepmindV1BetaFileSearchStoresProviderError({ statusCode: 503 }), "PROVIDER_UNAVAILABLE");

  const result = await invokeDeepmindV1BetaFileSearchStores({
    operation: "list",
    runtime: { runtimeId: "runtime-1" },
    dryRun: false,
    caller: () => {
      throw { statusCode: 503 };
    },
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.equal(result.error.code, "PROVIDER_UNAVAILABLE");
  assert.equal(result.error.retryable, true);
});
