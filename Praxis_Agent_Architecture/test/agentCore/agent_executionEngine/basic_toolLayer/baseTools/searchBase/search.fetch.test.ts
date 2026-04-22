import { defineAgentCoreContractTest } from "../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  planSearchFetch,
  searchFetchDescriptor,
} from "../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/searchBase/search.fetch.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/searchBase/search.fetch.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/searchBase/search.fetch.md",
  testFileUrl: import.meta.url,
});

test("planSearchFetch creates a network guarded dry-run fetch plan", () => {
  const result = planSearchFetch({
    context: {
      runtimeId: "runtime-1",
      invocationId: "fetch-1",
      networkAccess: { accepted: true },
      requestedScopes: ["tool:search:fetch"],
      allowedScopes: ["tool:search:fetch"],
    },
    url: "https://example.com/docs",
    expectedContentType: "text/html",
    maxBytes: 4096,
  });

  assert.equal(result.ok, true);
  assert.equal(searchFetchDescriptor.defaultDispatch, "dry-run");
  if (!result.ok) {
    return;
  }

  assert.equal(result.plan.toolId, "search.fetch");
  assert.equal(result.plan.url, "https://example.com/docs");
  assert.equal(result.plan.origin, "https://example.com");
  assert.equal(result.plan.method, "GET");
  assert.equal(result.plan.expectedContentType, "text/html");
  assert.equal(result.plan.outputEnvelope.bytesRead, 0);
  assert.equal(result.plan.wouldFetchNetworkContent, true);
  assert.equal(result.plan.unsafeSideEffects, false);
  assert.deepEqual(result.plan.acceptedScopes, ["tool:search:fetch"]);
});

test("planSearchFetch requires runtime, network permission, and dry-run dispatch", () => {
  const missing = planSearchFetch();
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.error.code, "MISSING_RUNTIME_ID");
    assert.equal(missing.error.boundary, "input");
  }

  const permission = planSearchFetch({
    context: { runtimeId: "runtime-1" },
    url: "https://example.com/docs",
  });
  assert.equal(permission.ok, false);
  if (!permission.ok) {
    assert.equal(permission.error.code, "NETWORK_PERMISSION_REQUIRED");
    assert.equal(permission.error.boundary, "permission");
  }

  const real = planSearchFetch({
    context: { runtimeId: "runtime-1", dryRun: false, networkAccess: { accepted: true } },
    url: "https://example.com/docs",
  });
  assert.equal(real.ok, false);
  if (!real.ok) {
    assert.equal(real.error.code, "REAL_NETWORK_FETCH_NOT_ALLOWED");
    assert.equal(real.error.boundary, "contract");
  }
});

test("planSearchFetch rejects unsupported URL protocols", () => {
  const result = planSearchFetch({
    context: { runtimeId: "runtime-1", networkAccess: { accepted: true } },
    url: "file:///etc/passwd",
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "UNSUPPORTED_PROTOCOL");
    assert.equal(result.error.boundary, "scope");
  }
});
