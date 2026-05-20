import assert from "node:assert/strict";
import test from "node:test";

import {
  exposeSearchInvocationEvent,
  searchInvocationDescriptor,
} from "../../../../../../src/agentCore_executionEngine/coreLogic/eventExposurePlane/basicToolInvocation/searchInvocation.js";
import { defineAgentCoreContractTest } from "../../../../agentCoreContractTestHelper.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_executionEngine/coreLogic/eventExposurePlane/basicToolInvocation/searchInvocation.ts",
  docPath: "docs/agentCore/agent_executionEngine/coreLogic/eventExposurePlane/basicToolInvocation/searchInvocation.md",
  testFileUrl: import.meta.url,
});

test("searchInvocation exposes a dry-run search invocation event", () => {
  const result = exposeSearchInvocationEvent({
    runtimeId: " runtime-a ",
    sessionId: " session-a ",
    invocationId: " invoke-a ",
    source: "basicToolLayer",
    query: " agentCore event exposure ",
    providerHint: " web ",
    requestedScopes: ["tool:search", "tool:search", " "],
    allowedScopes: ["tool:search"],
    contract: { accepted: true },
    governance: { accepted: true },
    trace: { callerId: " loop-a " },
    metadata: { freshness: "dry-run" },
  });

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  assert.equal(result.event.kind, "basicToolInvocation.search");
  assert.equal(result.event.search.query, "agentCore event exposure");
  assert.equal(result.event.search.providerHint, "web");
  assert.equal(result.event.search.resultEnvelope, "not-executed");
  assert.deepEqual(result.event.requestedScopes, ["tool:search"]);
  assert.deepEqual(result.event.grantedScopes, ["tool:search"]);
  assert.equal(result.event.dispatch, "dry-run");
  assert.equal(result.event.unsafeSideEffects, false);
  assert.equal(searchInvocationDescriptor.unsafeSideEffects, false);
});

test("searchInvocation rejects empty input with an inspection-safe error", () => {
  const result = exposeSearchInvocationEvent();

  if (result.ok) {
    throw new Error("empty Search invocation input should fail");
  }

  assert.equal(result.error.code, "MISSING_RUNTIME_ID");
  assert.equal(result.error.boundary, "input");
  assert.equal(result.error.safeForRuntimeInspection, true);
});

test("searchInvocation rejects missing query before exposing a search event", () => {
  const result = exposeSearchInvocationEvent({
    runtimeId: "runtime-a",
    sessionId: "session-a",
    invocationId: "invoke-a",
    source: "basicToolLayer",
    query: " ",
  });

  if (result.ok) {
    throw new Error("Search invocation should not expose events without a query");
  }

  assert.equal(result.error.code, "MISSING_SEARCH_QUERY");
  assert.equal(result.error.boundary, "input");
  assert.deepEqual(result.events, ["basicToolInvocation.search.rejected"]);
});
