import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../../agentCoreContractTestHelper.js";
import {
  codeInvocationDescriptor,
  exposeCodeInvocationEvent,
} from "../../../../../../src/agentCore_executionEngine/coreLogic/eventExposurePlane/basicToolInvocation/codeInvocation.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_executionEngine/coreLogic/eventExposurePlane/basicToolInvocation/codeInvocation.ts",
  docPath: "docs/agentCore/agent_executionEngine/coreLogic/eventExposurePlane/basicToolInvocation/codeInvocation.md",
  testFileUrl: import.meta.url,
});

test("exposeCodeInvocationEvent exposes a code invocation envelope without running code", () => {
  const result = exposeCodeInvocationEvent({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    operation: "evaluate-snippet",
    eventSource: "basicToolLayer",
    languageHint: "typescript",
    payload: { snippetId: "draft-1" },
    requestedScopes: ["tool:code"],
    allowedScopes: ["tool:code"],
    subscribers: ["inspection", "debug"],
  });

  if (!result.ok) {
    assert.fail(result.error.message);
  }

  assert.equal(codeInvocationDescriptor.unsafeSideEffects, false);
  assert.equal(result.invocation.toolKind, "code");
  assert.equal(result.invocation.operation, "evaluate-snippet");
  assert.equal(result.invocation.languageHint, "typescript");
  assert.deepEqual(result.invocation.payload, { snippetId: "draft-1" });
  assert.deepEqual(result.invocation.acceptedScopes, ["tool:code"]);
  assert.equal(result.invocation.execution.dryRun, true);
  assert.equal(result.invocation.execution.invoked, false);
  assert.equal(result.invocation.execution.unsafeSideEffects, false);
});

test("exposeCodeInvocationEvent rejects missing runtime context", () => {
  const result = exposeCodeInvocationEvent();

  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("empty input must be rejected");
  }

  assert.equal(result.error.code, "MISSING_RUNTIME_ID");
  assert.equal(result.error.boundary, "input");
  assert.equal(result.error.safeForRuntimeInspection, true);
});

test("exposeCodeInvocationEvent rejects attempts to leave dry-run mode", () => {
  const result = exposeCodeInvocationEvent({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    operation: "execute-file",
    eventSource: "basicToolLayer",
    dryRun: false,
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("real side effects must be rejected");
  }

  assert.equal(result.error.code, "REAL_SIDE_EFFECT_NOT_ALLOWED");
  assert.equal(result.error.boundary, "governance");
  assert.deepEqual(result.events, ["eventExposure.basicTool.code.rejected"]);
});
