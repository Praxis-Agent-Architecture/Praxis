import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../../agentCoreContractTestHelper.js";
import type { BaseToolExecutorPort } from "../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { createBaseToolRegistry } from "../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import {
  planSearchEngineQuery,
  searchEngineBaseToolDefinition,
  searchEngineDescriptor,
  type SearchEngineExecutor,
  type SearchEngineOutput,
} from "../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/searchBase/search.searchEngine.js";
import {
  createHostExecutorSearchEngineProvider,
  createRuntimeSearchEngineProvider,
  searchEngineDependencyDeclarations,
  searchEngineRuntimePort,
} from "../../../../../../src/storagePool/baseToolStorage/searchBase/search.searchEngine/dependencies.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/searchBase/search.searchEngine.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/searchBase/search.searchEngine.md",
  testFileUrl: import.meta.url,
});

test("planSearchEngineQuery creates a dry-run provider request envelope", async () => {
  let providerCalled = false;
  const result = await planSearchEngineQuery({
    target: { query: "Praxis agentCore", provider: "generic", maxResults: 5, recencyDays: 7, locale: "en-US" },
    context: { allowedProviders: ["generic"], grantedPermissions: ["network:search"] },
    executor: (() => {
      providerCalled = true;
      return { results: [] };
    }) satisfies SearchEngineExecutor,
  });

  assert.equal(result.ok, true);
  assert.equal(providerCalled, false);
  assert.equal(searchEngineDescriptor.defaultDryRun, true);
  if (!result.ok) throw new Error("expected dry-run");
  assert.equal(result.output.dispatch, "dry-run");
  assert.equal(result.output.providerCalled, false);
  assert.equal(result.output.runtimeEntry.port, searchEngineRuntimePort);
  assert.equal(result.output.runtimeEntry.provider, "generic");
  assert.equal(result.output.runtimeEntry.runtimeOwnsNetwork, true);
  assert.equal(result.output.runtimeEntry.baseToolOwnsProviderClient, false);
  assert.equal(result.output.resultEnvelope.results.length, 0);
  assert.deepEqual(result.output.permissionsRequired, ["network:search"]);
});

test("search.searchEngine definition and dependencies expose the runtime search port", () => {
  assert.equal(searchEngineDescriptor.runtimeEntryPort, searchEngineRuntimePort);
  assert.equal(searchEngineDependencyDeclarations[0]?.dependencyId, "runtime.executor.network.search");
  assert.equal(searchEngineBaseToolDefinition.metadata?.searchRuntimePort, searchEngineRuntimePort);
  const outputSchema = searchEngineBaseToolDefinition.outputSchema.schema as { required?: readonly string[] };
  assert.ok(outputSchema.required?.includes("providerCalled"));
  assert.ok(outputSchema.required?.includes("runtimeEntry"));
});

test("planSearchEngineQuery rejects malformed input, invalid fields, and provider scope", async () => {
  const malformed = await planSearchEngineQuery(null as never);
  assert.equal(malformed.ok, false);
  if (!malformed.ok) assert.equal(malformed.error.code, "INVALID_REQUEST");

  const missing = await planSearchEngineQuery();
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.error.code, "MISSING_QUERY");

  const invalidProvider = await planSearchEngineQuery({ target: { query: "x", provider: "unknown" as never } });
  assert.equal(invalidProvider.ok, false);
  if (!invalidProvider.ok) assert.equal(invalidProvider.error.code, "INVALID_PROVIDER");

  const providerScope = await planSearchEngineQuery({
    target: { query: "x", provider: "custom" },
    context: { allowedProviders: ["generic"] },
  });
  assert.equal(providerScope.ok, false);
  if (!providerScope.ok) assert.equal(providerScope.error.code, "PROVIDER_NOT_ALLOWED");

  const badContext = await planSearchEngineQuery({
    target: { query: "x" },
    context: { invocationId: 1 } as never,
  });
  assert.equal(badContext.ok, false);
  if (!badContext.ok) assert.equal(badContext.error.code, "INVALID_CONTEXT");
});

test("planSearchEngineQuery requires permission, guard, and provider for real execution", async () => {
  const missingPermission = await planSearchEngineQuery({
    target: { query: "x" },
    context: { dryRun: false, guard: { accepted: true }, grantedPermissions: ["search:fetch" as never] },
    executor: (() => ({ results: [] })) satisfies SearchEngineExecutor,
  });
  assert.equal(missingPermission.ok, false);
  if (!missingPermission.ok) assert.equal(missingPermission.error.code, "PERMISSION_DENIED");

  let providerCalled = false;
  const noGuard = await planSearchEngineQuery({
    target: { query: "x" },
    context: { dryRun: false, grantedPermissions: ["network:search"] },
    executor: (() => {
      providerCalled = true;
      return { results: [] };
    }) satisfies SearchEngineExecutor,
  });
  assert.equal(noGuard.ok, false);
  assert.equal(providerCalled, false);
  if (!noGuard.ok) assert.equal(noGuard.error.code, "GOVERNANCE_REJECTED");

  const noProvider = await planSearchEngineQuery({
    target: { query: "x" },
    context: { dryRun: false, guard: { accepted: true }, grantedPermissions: ["network:search"] },
  });
  assert.equal(noProvider.ok, false);
  if (!noProvider.ok) assert.equal(noProvider.error.code, "PROVIDER_UNAVAILABLE");

  const noGrants = await planSearchEngineQuery({
    target: { query: "x" },
    context: { dryRun: false, guard: { accepted: true } },
    executor: (() => ({ results: [] })) satisfies SearchEngineExecutor,
  });
  assert.equal(noGrants.ok, false);
  if (!noGrants.ok) assert.equal(noGrants.error.code, "PERMISSION_DENIED");
});

test("planSearchEngineQuery executes through injected provider and maps failures safely", async () => {
  const executed = await planSearchEngineQuery({
    target: { query: "Praxis", maxResults: 1 },
    context: { dryRun: false, guard: { accepted: true }, grantedPermissions: ["network:search"] },
    executor: (() => ({ results: [{ title: " Praxis ", url: " https://example.com ", snippet: " result " }, { title: "Other", url: "https://example.org" }] })) satisfies SearchEngineExecutor,
  });
  assert.equal(executed.ok, true);
  if (!executed.ok) throw new Error("expected execution");
  assert.equal(executed.output.dispatch, "runtime-search");
  assert.equal(executed.output.providerCalled, true);
  assert.equal(executed.output.runtimeEntry.port, searchEngineRuntimePort);
  assert.equal(executed.output.runtimeEntry.provider, "generic");
  assert.equal(executed.output.resultEnvelope.results.length, 1);
  assert.equal(executed.output.resultEnvelope.results[0]?.title, "Praxis");

  const failed = await planSearchEngineQuery({
    target: { query: "x" },
    context: { dryRun: false, guard: { accepted: true }, grantedPermissions: ["network:search"] },
    executor: (() => {
      throw new Error("secret stack");
    }) satisfies SearchEngineExecutor,
  });
  assert.equal(failed.ok, false);
  if (!failed.ok) assert.equal(failed.error.code, "PROVIDER_REJECTED");
});

test("search.searchEngine dependency adapter and registry handler invoke runtime network.search", async () => {
  let received: Parameters<NonNullable<NonNullable<BaseToolExecutorPort["network"]>["search"]>>[0] | undefined;
  const provider = createHostExecutorSearchEngineProvider({
    network: {
      async search(request) {
        received = request;
        return { ok: true, output: { results: [{ title: "Result", url: "https://example.com" }] } };
      },
    },
  });
  assert.notEqual(provider, undefined);
  assert.equal(createRuntimeSearchEngineProvider({}), undefined);
  const result = await planSearchEngineQuery({
    target: { query: "Praxis", maxResults: 2 },
    context: { dryRun: false, guard: { accepted: true }, grantedPermissions: ["network:search"] },
    executor: provider,
  });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("expected runtime search result");
  assert.equal(result.output.providerCalled, true);
  assert.equal(result.output.runtimeEntry.port, searchEngineRuntimePort);
  assert.equal(result.output.resultEnvelope.providerMetadata?.runtimeEntry, searchEngineRuntimePort);
  assert.equal(received?.query, "Praxis");

  const lookup = createBaseToolRegistry().lookupHandler("search.searchEngine");
  assert.equal(lookup.ok, true);
  if (!lookup.ok) throw new Error("registry failed");
  let runtimeCalled = false;
  const handlerResult = await lookup.handler.invoke({
    toolCallId: "search-engine-handler-1",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    input: { target: { query: "Praxis" }, context: { dryRun: false, guard: { accepted: true }, grantedPermissions: ["network:search"] } },
    executor: {
      network: {
        async search() {
          runtimeCalled = true;
          return { ok: true, output: { results: [{ title: "Result", url: "https://example.com" }] } };
        },
      },
    },
  });
  assert.equal(runtimeCalled, true);
  assert.equal(handlerResult.ok, true);
  if (handlerResult.ok) {
    const output = handlerResult.output as SearchEngineOutput;
    assert.equal(output.providerCalled, true);
    assert.equal(output.runtimeEntry.port, searchEngineRuntimePort);
  }
});

test("search.searchEngine does not fallback when runtime network.search is absent", async () => {
  const missingProvider = createRuntimeSearchEngineProvider({ executor: { network: {} } });
  assert.equal(missingProvider, undefined);

  const result = await planSearchEngineQuery({
    target: { query: "Praxis" },
    context: { dryRun: false, guard: { accepted: true }, grantedPermissions: ["network:search"] },
    executor: missingProvider,
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "PROVIDER_UNAVAILABLE");
    assert.equal(result.error.safeForRuntimeInspection, true);
    assert.equal(result.error.internalDetailExposed, false);
  }
});
