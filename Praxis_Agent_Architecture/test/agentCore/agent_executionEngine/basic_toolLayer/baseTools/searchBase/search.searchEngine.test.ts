import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../../agentCoreContractTestHelper.js";
import {
  planSearchEngineQuery,
  searchEngineDescriptor,
} from "../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/searchBase/search.searchEngine.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/searchBase/search.searchEngine.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/searchBase/search.searchEngine.md",
  testFileUrl: import.meta.url,
});

test("planSearchEngineQuery creates a dry-run provider request envelope", () => {
  const result = planSearchEngineQuery({
    target: {
      query: "Praxis agentCore",
      provider: "generic",
      maxResults: 5,
      recencyDays: 7,
      locale: "en-US",
    },
    context: {
      invocationId: "search-engine-1",
      allowedProviders: ["generic"],
      grantedPermissions: ["network:search"],
    },
  });

  assert.equal(result.ok, true);
  assert.equal(searchEngineDescriptor.defaultDryRun, true);
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.executionBlocked, true);
  assert.equal(result.output.unsafeSideEffects, false);
  assert.deepEqual(result.output.permissionsRequired, ["network:search"]);
  assert.deepEqual(result.output.requestPreview, {
    provider: "generic",
    query: "Praxis agentCore",
    maxResults: 5,
    recencyDays: 7,
    safeSearch: true,
    locale: "en-US",
  });
  assert.deepEqual(result.output.resultEnvelope.results, []);
  assert.deepEqual(result.events, ["basicTool.search.searchEngine.dryRun"]);
});

test("planSearchEngineQuery rejects invalid input and provider scope", () => {
  const missing = planSearchEngineQuery();
  assert.equal(missing.ok, false);
  assert.equal(missing.error.code, "MISSING_QUERY");

  const invalidProvider = planSearchEngineQuery({
    target: { query: "x", provider: "unknown" as never },
  });
  assert.equal(invalidProvider.ok, false);
  assert.equal(invalidProvider.error.code, "INVALID_PROVIDER");

  const providerScope = planSearchEngineQuery({
    target: { query: "x", provider: "custom" },
    context: { allowedProviders: ["generic"] },
  });
  assert.equal(providerScope.ok, false);
  assert.equal(providerScope.error.code, "PROVIDER_NOT_ALLOWED");
  assert.equal(providerScope.error.boundary, "scope");
});

test("planSearchEngineQuery blocks missing network permission and real provider calls", () => {
  const missingPermission = planSearchEngineQuery({
    target: { query: "x" },
    context: { grantedPermissions: [] },
  });
  assert.equal(missingPermission.ok, false);
  assert.equal(missingPermission.error.code, "PERMISSION_DENIED");
  assert.equal(missingPermission.error.boundary, "permission");

  const real = planSearchEngineQuery({
    target: { query: "x" },
    context: { dryRun: false },
  });
  assert.equal(real.ok, false);
  assert.equal(real.error.code, "REAL_EXECUTION_BLOCKED");
  assert.equal(real.error.boundary, "contract");
});
