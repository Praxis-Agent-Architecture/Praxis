import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../../agentCoreContractTestHelper.js";
import type { BaseToolExecutorPort } from "../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { createBaseToolRegistry } from "../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import {
  planSearchFetch,
  searchFetchDescriptor,
  type SearchFetchExecutor,
} from "../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/searchBase/search.fetch.js";
import { createHostExecutorSearchFetchProvider } from "../../../../../../src/storagePool/baseToolStorage/searchBase/search.fetch/dependencies.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/searchBase/search.fetch.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/searchBase/search.fetch.md",
  testFileUrl: import.meta.url,
});

test("planSearchFetch creates a governed dry-run fetch plan", async () => {
  let providerCalled = false;
  const result = await planSearchFetch({
    target: { url: "https://example.com/docs", expectedContentType: "text/html", maxBytes: 4096 },
    context: { grantedPermissions: ["network:read", "search:fetch"], allowedDomains: ["example.com"] },
    executor: (() => {
      providerCalled = true;
      return { status: 200, headers: {}, body: "" };
    }) satisfies SearchFetchExecutor,
  });

  assert.equal(result.ok, true);
  assert.equal(providerCalled, false);
  assert.equal(searchFetchDescriptor.defaultDryRun, true);
  if (!result.ok) throw new Error("expected fetch dry-run");
  assert.equal(result.output.dispatch, "dry-run");
  assert.equal(result.output.executionBlocked, true);
  assert.equal(result.output.resultEnvelope.url, "https://example.com/docs");
  assert.deepEqual(result.output.permissionsRequired, ["network:read", "search:fetch"]);
});

test("planSearchFetch rejects malformed input and guarded URL boundaries", async () => {
  const malformed = await planSearchFetch(null as never);
  assert.equal(malformed.ok, false);
  if (!malformed.ok) assert.equal(malformed.error.code, "INVALID_REQUEST");

  const missing = await planSearchFetch();
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.error.code, "MISSING_URL");

  const protocol = await planSearchFetch({ target: { url: "file:///etc/passwd" } });
  assert.equal(protocol.ok, false);
  if (!protocol.ok) assert.equal(protocol.error.code, "UNSUPPORTED_PROTOCOL");

  const denied = await planSearchFetch({
    target: { url: "https://example.com/docs" },
    context: { allowedDomains: ["openai.com"] },
  });
  assert.equal(denied.ok, false);
  if (!denied.ok) assert.equal(denied.error.code, "DOMAIN_NOT_ALLOWED");

  const badContext = await planSearchFetch({
    target: { url: "https://example.com/docs" },
    context: { invocationId: 1 } as never,
  });
  assert.equal(badContext.ok, false);
  if (!badContext.ok) assert.equal(badContext.error.code, "INVALID_CONTEXT");
});

test("planSearchFetch requires permissions, guard, and provider for real execution", async () => {
  const permission = await planSearchFetch({
    target: { url: "https://example.com/docs" },
    context: { grantedPermissions: ["network:read"] },
  });
  assert.equal(permission.ok, false);
  if (!permission.ok) assert.equal(permission.error.code, "PERMISSION_DENIED");

  let providerCalled = false;
  const noGuard = await planSearchFetch({
    target: { url: "https://example.com/docs" },
    context: { dryRun: false, grantedPermissions: ["network:read", "search:fetch"] },
    executor: (() => {
      providerCalled = true;
      return { status: 200, headers: {}, body: "" };
    }) satisfies SearchFetchExecutor,
  });
  assert.equal(noGuard.ok, false);
  assert.equal(providerCalled, false);
  if (!noGuard.ok) assert.equal(noGuard.error.code, "GOVERNANCE_REJECTED");

  const noProvider = await planSearchFetch({
    target: { url: "https://example.com/docs" },
    context: { dryRun: false, guard: { accepted: true }, grantedPermissions: ["network:read", "search:fetch"] },
  });
  assert.equal(noProvider.ok, false);
  if (!noProvider.ok) assert.equal(noProvider.error.code, "PROVIDER_UNAVAILABLE");

  const noGrants = await planSearchFetch({
    target: { url: "https://example.com/docs" },
    context: { dryRun: false, guard: { accepted: true } },
    executor: (() => ({ status: 200, headers: {}, body: "" })) satisfies SearchFetchExecutor,
  });
  assert.equal(noGrants.ok, false);
  if (!noGrants.ok) assert.equal(noGrants.error.code, "PERMISSION_DENIED");
});

test("planSearchFetch executes through injected provider and maps failures safely", async () => {
  const executed = await planSearchFetch({
    target: { url: "https://example.com/docs", maxBytes: 5 },
    context: { dryRun: false, guard: { accepted: true }, grantedPermissions: ["network:read", "search:fetch"] },
    executor: (() => ({
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
      body: "hello world",
      finalUrl: "https://example.com/docs",
    })) satisfies SearchFetchExecutor,
  });
  assert.equal(executed.ok, true);
  if (!executed.ok) throw new Error("expected fetch execution");
  assert.equal(executed.output.dispatch, "runtime-fetch");
  assert.equal(executed.output.resultEnvelope.bodyPreview, "hello");
  assert.equal(executed.output.resultEnvelope.truncated, true);

  const redirectedOutsideAllowlist = await planSearchFetch({
    target: { url: "https://example.com/docs" },
    context: { dryRun: false, guard: { accepted: true }, grantedPermissions: ["network:read", "search:fetch"], allowedDomains: ["example.com"] },
    executor: (() => ({
      status: 200,
      headers: {},
      body: "redirected",
      finalUrl: "https://evil.example.net/docs",
    })) satisfies SearchFetchExecutor,
  });
  assert.equal(redirectedOutsideAllowlist.ok, false);
  if (!redirectedOutsideAllowlist.ok) assert.equal(redirectedOutsideAllowlist.error.code, "DOMAIN_NOT_ALLOWED");

  const failed = await planSearchFetch({
    target: { url: "https://example.com/docs" },
    context: { dryRun: false, guard: { accepted: true }, grantedPermissions: ["network:read", "search:fetch"] },
    executor: (() => {
      throw new Error("TOKEN=/tmp/private");
    }) satisfies SearchFetchExecutor,
  });
  assert.equal(failed.ok, false);
  if (!failed.ok) {
    assert.equal(failed.error.code, "PROVIDER_REJECTED");
    assert.equal(failed.error.message.includes("TOKEN"), false);
  }
});

test("search.fetch dependency adapter and registry handler invoke runtime network.fetch", async () => {
  let received: Parameters<NonNullable<NonNullable<BaseToolExecutorPort["network"]>["fetch"]>>[0] | undefined;
  const provider = createHostExecutorSearchFetchProvider({
    network: {
      async fetch(request) {
        received = request;
        return { ok: true, output: { status: 200, headers: { "content-type": "text/plain" }, body: "ok" } };
      },
    },
  });
  assert.notEqual(provider, undefined);
  const result = await planSearchFetch({
    target: { url: "https://example.com/docs" },
    context: { dryRun: false, guard: { accepted: true }, grantedPermissions: ["network:read", "search:fetch"] },
    executor: provider,
  });
  assert.equal(result.ok, true);
  assert.equal(received?.url, "https://example.com/docs");

  const lookup = createBaseToolRegistry().lookupHandler("search.fetch");
  assert.equal(lookup.ok, true);
  if (!lookup.ok) throw new Error("registry failed");
  let runtimeCalled = false;
  const handlerResult = await lookup.handler.invoke({
    toolCallId: "fetch-handler-1",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    input: { target: { url: "https://example.com/docs" }, context: { dryRun: false, guard: { accepted: true }, grantedPermissions: ["network:read", "search:fetch"] } },
    executor: {
      network: {
        async fetch() {
          runtimeCalled = true;
          return { ok: true, output: { status: 200, headers: {}, body: "body" } };
        },
      },
    },
  });
  assert.equal(runtimeCalled, true);
  assert.equal(handlerResult.ok, true);
});
