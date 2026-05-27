import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../../agentCoreContractTestHelper.js";
import {
  exposePatchInvocationEvent,
  patchInvocationDescriptor,
} from "../../../../../../src/executionEngine/coreLogic/eventExposurePlane/basicToolInvocation/patchInvocation.js";

defineAgentCoreContractTest({
  sourcePath: "src/executionEngine/coreLogic/eventExposurePlane/basicToolInvocation/patchInvocation.ts",
  docPath: "docs/agentCore/agent_executionEngine/coreLogic/eventExposurePlane/basicToolInvocation/patchInvocation.md",
  testFileUrl: import.meta.url,
});

test("exposePatchInvocationEvent exposes a patch invocation envelope without applying patches", () => {
  const result = exposePatchInvocationEvent({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    operation: "apply",
    eventSource: "basicToolLayer",
    workspaceHint: "/repo",
    payload: { patchId: "patch-1" },
    requestedScopes: ["tool:patch"],
    allowedScopes: ["tool:patch"],
    subscribers: ["debug", "inspection"],
  });

  if (!result.ok) {
    assert.fail(result.error.message);
  }

  assert.equal(patchInvocationDescriptor.unsafeSideEffects, false);
  assert.equal(result.invocation.toolKind, "patch");
  assert.equal(result.invocation.operation, "apply");
  assert.equal(result.invocation.workspaceHint, "/repo");
  assert.deepEqual(result.invocation.payload, { patchId: "patch-1" });
  assert.deepEqual(result.invocation.acceptedScopes, ["tool:patch"]);
  assert.equal(result.invocation.execution.dryRun, true);
  assert.equal(result.invocation.execution.invoked, false);
  assert.equal(result.invocation.execution.unsafeSideEffects, false);
});

test("exposePatchInvocationEvent rejects missing operation", () => {
  const result = exposePatchInvocationEvent({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    eventSource: "basicToolLayer",
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("missing operation must be rejected");
  }

  assert.equal(result.error.code, "MISSING_OPERATION");
  assert.equal(result.error.boundary, "input");
  assert.equal(result.error.safeForRuntimeInspection, true);
});

test("exposePatchInvocationEvent rejects patch side effects in the first-round envelope", () => {
  const result = exposePatchInvocationEvent({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    operation: "apply",
    eventSource: "basicToolLayer",
    dryRun: false,
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("real side effects must be rejected");
  }

  assert.equal(result.error.code, "REAL_SIDE_EFFECT_NOT_ALLOWED");
  assert.equal(result.error.boundary, "governance");
  assert.deepEqual(result.events, ["eventExposure.basicTool.patch.rejected"]);
});
