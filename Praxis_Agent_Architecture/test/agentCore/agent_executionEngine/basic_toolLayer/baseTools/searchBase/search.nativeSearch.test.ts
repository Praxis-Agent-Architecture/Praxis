import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../../agentCoreContractTestHelper.js";
import type { BaseToolExecutorPort } from "../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { createBaseToolRegistry } from "../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import {
  nativeSearchDescriptor,
  planNativeSearch,
  type NativeSearchExecutor,
} from "../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/searchBase/search.nativeSearch.js";
import { createHostExecutorNativeSearchProvider } from "../../../../../../src/storagePool/baseToolStorage/searchBase/search.nativeSearch/dependencies.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/searchBase/search.nativeSearch.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/searchBase/search.nativeSearch.md",
  testFileUrl: import.meta.url,
});

test("planNativeSearch creates a provider-native dry-run web search plan", async () => {
  let providerCalled = false;
  const result = await planNativeSearch({
    target: {
      provider: "openai",
      query: "latest OpenAI Responses web_search citation docs",
      model: "gpt-5.4",
      maxResults: 3,
      allowedDomains: [" OpenAI.com "],
      searchContextSize: "low",
      citations: "preferred",
    },
    context: {
      invocationId: "native-1",
      allowedProviders: ["openai", "anthropic"],
      grantedPermissions: ["network:search", "search:native"],
    },
    executor: (() => {
      providerCalled = true;
      return { sources: [] };
    }) satisfies NativeSearchExecutor,
  });

  assert.equal(result.ok, true);
  assert.equal(providerCalled, false);
  assert.equal(nativeSearchDescriptor.defaultDryRun, true);
  if (!result.ok) {
    throw new Error("expected native search dry-run plan");
  }
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.executionBlocked, true);
  assert.equal(result.output.dispatch, "dry-run");
  assert.equal(result.output.unsafeSideEffects, false);
  assert.deepEqual(result.output.permissionsRequired, ["network:search", "search:native"]);
  assert.equal(result.output.target.provider, "openai");
  assert.equal(result.output.target.query, "latest OpenAI Responses web_search citation docs");
  assert.equal(result.output.target.model, "gpt-5.4");
  assert.deepEqual(result.output.target.allowedDomains, ["openai.com"]);
  assert.equal(result.output.target.searchContextSize, "low");
  assert.equal(result.output.target.citations, "preferred");
  assert.deepEqual(result.output.resultEnvelope.sources, []);
  assert.deepEqual(result.output.resultEnvelope.citations, []);
  assert.deepEqual(result.events, ["basicTool.search.nativeSearch.dryRun"]);
});

test("planNativeSearch rejects malformed JSON, missing fields, and provider policy violations", async () => {
  const malformed = await planNativeSearch(null as never);
  assert.equal(malformed.ok, false);
  if (!malformed.ok) {
    assert.equal(malformed.error.code, "INVALID_REQUEST");
    assert.equal(malformed.error.safeForRuntimeInspection, true);
    assert.equal(malformed.error.internalDetailExposed, false);
  }

  const arrayInput = await planNativeSearch([] as never);
  assert.equal(arrayInput.ok, false);
  if (!arrayInput.ok) {
    assert.equal(arrayInput.error.code, "INVALID_REQUEST");
  }

  const missingProvider = await planNativeSearch({ target: { query: "x" } });
  assert.equal(missingProvider.ok, false);
  if (!missingProvider.ok) {
    assert.equal(missingProvider.error.code, "MISSING_PROVIDER");
    assert.equal(missingProvider.error.boundary, "input");
  }

  const emptyQuery = await planNativeSearch({ target: { provider: "openai", query: "   " } });
  assert.equal(emptyQuery.ok, false);
  if (!emptyQuery.ok) {
    assert.equal(emptyQuery.error.code, "MISSING_QUERY");
  }

  const unsupportedProvider = await planNativeSearch({
    target: { provider: "brave", query: "x" } as never,
  });
  assert.equal(unsupportedProvider.ok, false);
  if (!unsupportedProvider.ok) {
    assert.equal(unsupportedProvider.error.code, "INVALID_PROVIDER");
  }

  const badContext = await planNativeSearch({
    target: { provider: "openai", query: "x" },
    context: { invocationId: 1 } as never,
  });
  assert.equal(badContext.ok, false);
  if (!badContext.ok) {
    assert.equal(badContext.error.code, "INVALID_CONTEXT");
  }

  const providerDenied = await planNativeSearch({
    target: { provider: "deepmind", query: "Gemini Search grounding" },
    context: { allowedProviders: ["openai", "anthropic"] },
  });
  assert.equal(providerDenied.ok, false);
  if (!providerDenied.ok) {
    assert.equal(providerDenied.error.code, "PROVIDER_NOT_ALLOWED");
    assert.equal(providerDenied.error.boundary, "scope");
  }
});

test("planNativeSearch rejects invalid native web search shaping fields", async () => {
  const badDomain = await planNativeSearch({
    target: { provider: "openai", query: "x", allowedDomains: ["openai.com/path"] },
  });
  assert.equal(badDomain.ok, false);
  if (!badDomain.ok) {
    assert.equal(badDomain.error.code, "INVALID_ALLOWED_DOMAIN");
  }

  const badContextSize = await planNativeSearch({
    target: { provider: "openai", query: "x", searchContextSize: "huge" as never },
  });
  assert.equal(badContextSize.ok, false);
  if (!badContextSize.ok) {
    assert.equal(badContextSize.error.code, "INVALID_SEARCH_CONTEXT_SIZE");
  }

  const badLocation = await planNativeSearch({
    target: { provider: "openai", query: "x", userLocation: { country: "" } },
  });
  assert.equal(badLocation.ok, false);
  if (!badLocation.ok) {
    assert.equal(badLocation.error.code, "INVALID_USER_LOCATION");
  }

  const badCitations = await planNativeSearch({
    target: { provider: "openai", query: "x", citations: "always" as never },
  });
  assert.equal(badCitations.ok, false);
  if (!badCitations.ok) {
    assert.equal(badCitations.error.code, "INVALID_CITATIONS");
  }
});

test("planNativeSearch rejects missing explicit permissions when governance supplies a grant list", async () => {
  const result = await planNativeSearch({
    target: { provider: "anthropic", query: "Claude web_search_20260209" },
    context: { grantedPermissions: ["network:search"] },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "PERMISSION_DENIED");
    assert.equal(result.error.boundary, "permission");
    assert.match(result.error.message, /search:native/);
  }
});

test("planNativeSearch requires guard and provider before real execution", async () => {
  let providerCalled = false;
  const missingGuard = await planNativeSearch({
    target: { provider: "openai", query: "OpenAI web search docs" },
    context: { dryRun: false, grantedPermissions: ["network:search", "search:native"] },
    executor: (() => {
      providerCalled = true;
      return { sources: [] };
    }) satisfies NativeSearchExecutor,
  });

  assert.equal(missingGuard.ok, false);
  assert.equal(providerCalled, false);
  if (!missingGuard.ok) {
    assert.equal(missingGuard.error.code, "GOVERNANCE_REJECTED");
  }

  const missingProvider = await planNativeSearch({
    target: { provider: "deepmind", query: "Gemini google_search grounding" },
    context: { dryRun: false, guard: { accepted: true }, grantedPermissions: ["network:search", "search:native"] },
  });
  assert.equal(missingProvider.ok, false);
  if (!missingProvider.ok) {
    assert.equal(missingProvider.error.code, "PROVIDER_UNAVAILABLE");
    assert.equal(missingProvider.error.boundary, "provider");
  }

  const missingGrants = await planNativeSearch({
    target: { provider: "openai", query: "OpenAI web search docs" },
    context: { dryRun: false, guard: { accepted: true } },
    executor: (() => ({ sources: [] })) satisfies NativeSearchExecutor,
  });
  assert.equal(missingGrants.ok, false);
  if (!missingGrants.ok) assert.equal(missingGrants.error.code, "PERMISSION_DENIED");
});

test("planNativeSearch executes through injected provider and normalizes provider-native output", async () => {
  let receivedProvider: string | undefined;
  const executed = await planNativeSearch({
    target: {
      provider: "openai",
      query: "Responses API web_search_call annotations",
      maxResults: 1,
      citations: "required",
    },
    context: { dryRun: false, guard: { accepted: true }, grantedPermissions: ["network:search", "search:native"] },
    executor: ((request) => {
      receivedProvider = request.provider;
      return {
        answer: "OpenAI Responses web search returns web_search_call items and citation annotations.",
        sources: [
          {
            url: " https://developers.openai.com/api/docs/guides/tools-web-search ",
            title: " OpenAI Web Search ",
            snippet: "Responses API web search guide",
            kind: "provider_native",
          },
        ],
        citations: [
          {
            url: "https://developers.openai.com/api/docs/guides/tools-web-search",
            providerReference: "web_search_call:0",
          },
        ],
        providerMetadata: { providerCallType: "web_search_call" },
        raw: { itemType: "web_search_call" },
      };
    }) satisfies NativeSearchExecutor,
  });

  assert.equal(receivedProvider, "openai");
  assert.equal(executed.ok, true);
  if (!executed.ok) {
    throw new Error("expected injected native web search result");
  }
  assert.equal(executed.output.dispatch, "provider-native");
  assert.equal(executed.output.dryRun, false);
  assert.equal(executed.output.executionBlocked, false);
  assert.equal(executed.output.resultEnvelope.sources.length, 1);
  assert.equal(executed.output.resultEnvelope.sources[0]?.url, "https://developers.openai.com/api/docs/guides/tools-web-search");
  assert.equal(executed.output.resultEnvelope.sources[0]?.title, "OpenAI Web Search");
  assert.equal(executed.output.resultEnvelope.citations[0]?.providerReference, "web_search_call:0");
  assert.deepEqual(executed.output.resultEnvelope.providerMetadata, { providerCallType: "web_search_call" });
});

test("planNativeSearch maps provider failures and invalid provider output safely", async () => {
  const failed = await planNativeSearch({
    target: { provider: "anthropic", query: "Claude web search" },
    context: { dryRun: false, guard: { accepted: true }, grantedPermissions: ["network:search", "search:native"] },
    executor: (() => {
      throw new Error("leaked /tmp/private/path TOKEN=abc");
    }) satisfies NativeSearchExecutor,
  });

  assert.equal(failed.ok, false);
  if (!failed.ok) {
    assert.equal(failed.error.code, "PROVIDER_REJECTED");
    assert.equal(failed.error.message, "search.nativeSearch provider rejected the request");
    assert.equal(failed.error.message.includes("/tmp/private"), false);
    assert.equal(failed.error.internalDetailExposed, false);
  }

  const invalid = await planNativeSearch({
    target: { provider: "deepmind", query: "Gemini groundingMetadata" },
    context: { dryRun: false, guard: { accepted: true }, grantedPermissions: ["network:search", "search:native"] },
    executor: (() => ({ sources: "bad" }) as never) satisfies NativeSearchExecutor,
  });

  assert.equal(invalid.ok, false);
  if (!invalid.ok) {
    assert.equal(invalid.error.code, "PROVIDER_RESULT_INVALID");
    assert.equal(invalid.error.publicSafe, true);
  }
});

test("search.nativeSearch dependency adapter forwards runtime nativeWebSearch options", async () => {
  let received: Parameters<NonNullable<NonNullable<BaseToolExecutorPort["network"]>["nativeWebSearch"]>>[0] | undefined;
  const provider = createHostExecutorNativeSearchProvider({
    network: {
      async nativeWebSearch(request) {
        received = request;
        return {
          ok: true,
          output: {
            answer: "Gemini returned grounded search material.",
            sources: [{ url: "https://ai.google.dev/gemini-api/docs/google-search", title: "Gemini Google Search" }],
            citations: [{ url: "https://ai.google.dev/gemini-api/docs/google-search", providerReference: "groundingMetadata" }],
            providerMetadata: { nativeShape: "groundingMetadata" },
          },
        };
      },
    },
  });

  assert.notEqual(provider, undefined);
  const result = await planNativeSearch({
    target: {
      provider: "deepmind",
      query: "Gemini Google Search groundingMetadata",
      model: "gemini-2.5-pro",
      allowedDomains: ["ai.google.dev"],
      citations: "required",
    },
    context: { dryRun: false, guard: { accepted: true }, grantedPermissions: ["network:search", "search:native"] },
    executor: provider,
  });

  assert.equal(result.ok, true);
  assert.equal(received?.provider, "deepmind");
  assert.equal(received?.query, "Gemini Google Search groundingMetadata");
  assert.equal(received?.model, "gemini-2.5-pro");
  assert.deepEqual(received?.allowedDomains, ["ai.google.dev"]);
  assert.equal(received?.citations, "required");
});

test("search.nativeSearch registry handler invokes runtime network nativeWebSearch port", async () => {
  const lookup = createBaseToolRegistry().lookupHandler("search.nativeSearch");
  assert.equal(lookup.ok, true);
  if (!lookup.ok) {
    throw new Error("search.nativeSearch registry lookup failed");
  }

  let runtimeCalled = false;
  const result = await lookup.handler.invoke({
    toolCallId: "tool-search-1",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    input: {
      target: { provider: "anthropic", query: "Claude web search server tool", maxResults: 2 },
      context: { dryRun: false, guard: { accepted: true }, grantedPermissions: ["network:search", "search:native"] },
    },
    executor: {
      network: {
        async nativeWebSearch(request) {
          runtimeCalled = true;
          assert.equal(request.provider, "anthropic");
          assert.equal(request.query, "Claude web search server tool");
          return {
            ok: true,
            output: {
              answer: "Anthropic web search returned cited material.",
              sources: [{ url: "https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool", title: "Claude Web Search" }],
              citations: [{ url: "https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool", providerReference: "web_search_20260209" }],
              providerMetadata: { serverTool: "web_search_20260209" },
            },
          };
        },
      },
    },
  });

  assert.equal(runtimeCalled, true);
  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected registry handler success");
  }
  assert.equal(result.toolId, "search.nativeSearch");
  const output = result.output as { resultEnvelope: { sources: Array<{ url: string }> } };
  assert.equal(output.resultEnvelope.sources[0]?.url, "https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool");
});

test("search.nativeSearch registry handler preserves malformed input boundary", async () => {
  const lookup = createBaseToolRegistry().lookupHandler("search.nativeSearch");
  assert.equal(lookup.ok, true);
  if (!lookup.ok) {
    throw new Error("search.nativeSearch registry lookup failed");
  }

  const result = await lookup.handler.invoke({
    toolCallId: "tool-search-2",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    input: null,
    executor: {},
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "INVALID_REQUEST");
    assert.equal(result.error.publicSafe, true);
  }
});
