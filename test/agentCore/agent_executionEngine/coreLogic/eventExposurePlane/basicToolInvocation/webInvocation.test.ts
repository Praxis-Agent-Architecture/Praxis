import assert from "node:assert/strict";
import test from "node:test";

import {
  exposeWebInvocationEvent,
  webInvocationDescriptor,
} from "../../../../../../src/executionEngine/coreLogic/eventExposurePlane/basicToolInvocation/webInvocation.js";
import { defineAgentCoreContractTest } from "../../../../agentCoreContractTestHelper.js";

defineAgentCoreContractTest({
  sourcePath: "src/executionEngine/coreLogic/eventExposurePlane/basicToolInvocation/webInvocation.ts",
  docPath: "docs/agentCore/agent_executionEngine/coreLogic/eventExposurePlane/basicToolInvocation/webInvocation.md",
  testFileUrl: import.meta.url,
});

test("webInvocation exposes a dry-run web invocation event", () => {
  const result = exposeWebInvocationEvent({
    runtimeId: " runtime-a ",
    sessionId: " session-a ",
    invocationId: " invoke-a ",
    source: "basicToolLayer",
    query: " agentCore event exposure ",
    providerHint: " web ",
    requestedScopes: ["tool:web", "tool:web", " "],
    allowedScopes: ["tool:web"],
    contract: { accepted: true },
    governance: { accepted: true },
    trace: { callerId: " loop-a " },
    metadata: { freshness: "dry-run" },
  });

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  assert.equal(result.event.kind, "basicToolInvocation.web");
  assert.equal(result.event.web.query, "agentCore event exposure");
  assert.equal(result.event.web.providerHint, "web");
  assert.equal(result.event.web.resultEnvelope, "not-executed");
  assert.deepEqual(result.event.requestedScopes, ["tool:web"]);
  assert.deepEqual(result.event.grantedScopes, ["tool:web"]);
  assert.equal(result.event.dispatch, "dry-run");
  assert.equal(result.event.unsafeSideEffects, false);
  assert.equal(webInvocationDescriptor.unsafeSideEffects, false);
});

test("webInvocation rejects empty input with an inspection-safe error", () => {
  const result = exposeWebInvocationEvent();

  if (result.ok) {
    throw new Error("empty Web invocation input should fail");
  }

  assert.equal(result.error.code, "MISSING_RUNTIME_ID");
  assert.equal(result.error.boundary, "input");
  assert.equal(result.error.safeForRuntimeInspection, true);
});

test("webInvocation rejects missing query before exposing a web event", () => {
  const result = exposeWebInvocationEvent({
    runtimeId: "runtime-a",
    sessionId: "session-a",
    invocationId: "invoke-a",
    source: "basicToolLayer",
    query: " ",
  });

  if (result.ok) {
    throw new Error("Web invocation should not expose events without a query");
  }

  assert.equal(result.error.code, "MISSING_WEB_QUERY");
  assert.equal(result.error.boundary, "input");
  assert.deepEqual(result.events, ["basicToolInvocation.web.rejected"]);
});
