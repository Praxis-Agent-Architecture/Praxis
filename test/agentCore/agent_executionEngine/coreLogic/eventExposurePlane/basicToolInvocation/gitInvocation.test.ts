import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../../agentCoreContractTestHelper.js";
import {
  exposeGitInvocationEvent,
  gitInvocationDescriptor,
} from "../../../../../../src/agentCore/agent_executionEngine/coreLogic/eventExposurePlane/basicToolInvocation/gitInvocation.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_executionEngine/coreLogic/eventExposurePlane/basicToolInvocation/gitInvocation.ts",
  docPath: "docs/agentCore/agent_executionEngine/coreLogic/eventExposurePlane/basicToolInvocation/gitInvocation.md",
  testFileUrl: import.meta.url,
});

test("exposeGitInvocationEvent exposes a git invocation envelope without running git", () => {
  const result = exposeGitInvocationEvent({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    operation: "status",
    eventSource: "basicToolLayer",
    repositoryHint: "/repo",
    payload: { porcelain: true },
    requestedScopes: ["tool:git"],
    allowedScopes: ["tool:git"],
    subscribers: ["debug", "inspection"],
  });

  if (!result.ok) {
    assert.fail(result.error.message);
  }

  assert.equal(gitInvocationDescriptor.unsafeSideEffects, false);
  assert.equal(result.invocation.toolKind, "git");
  assert.equal(result.invocation.operation, "status");
  assert.equal(result.invocation.repositoryHint, "/repo");
  assert.deepEqual(result.invocation.payload, { porcelain: true });
  assert.deepEqual(result.invocation.acceptedScopes, ["tool:git"]);
  assert.equal(result.invocation.execution.dryRun, true);
  assert.equal(result.invocation.execution.invoked, false);
  assert.equal(result.invocation.execution.unsafeSideEffects, false);
});

test("exposeGitInvocationEvent rejects missing operation", () => {
  const result = exposeGitInvocationEvent({
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

test("exposeGitInvocationEvent rejects git side effects in the first-round envelope", () => {
  const result = exposeGitInvocationEvent({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    operation: "commit",
    eventSource: "basicToolLayer",
    dryRun: false,
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("real side effects must be rejected");
  }

  assert.equal(result.error.code, "REAL_SIDE_EFFECT_NOT_ALLOWED");
  assert.equal(result.error.boundary, "governance");
  assert.deepEqual(result.events, ["eventExposure.basicTool.git.rejected"]);
});
