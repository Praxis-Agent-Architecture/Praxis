import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../../agentCoreContractTestHelper.js";
import {
  fileInvocationDescriptor,
  exposeFileInvocationEvent,
} from "../../../../../../src/executionEngine/coreLogic/eventExposurePlane/basicToolInvocation/fileInvocation.js";

defineAgentCoreContractTest({
  sourcePath: "src/executionEngine/coreLogic/eventExposurePlane/basicToolInvocation/fileInvocation.ts",
  docPath: "docs/agentCore/agent_executionEngine/coreLogic/eventExposurePlane/basicToolInvocation/fileInvocation.md",
  testFileUrl: import.meta.url,
});

test("exposeFileInvocationEvent exposes a file invocation envelope without reading files", () => {
  const result = exposeFileInvocationEvent({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    operation: "read",
    eventSource: "basicToolLayer",
    pathHint: "src/index.ts",
    payload: { targetPath: "src/index.ts" },
    requestedScopes: ["tool:file"],
    allowedScopes: ["tool:file"],
    subscribers: ["inspection", "debug"],
  });

  if (!result.ok) {
    assert.fail(result.error.message);
  }

  assert.equal(fileInvocationDescriptor.unsafeSideEffects, false);
  assert.equal(result.invocation.toolKind, "file");
  assert.equal(result.invocation.operation, "read");
  assert.equal(result.invocation.pathHint, "src/index.ts");
  assert.deepEqual(result.invocation.payload, { targetPath: "src/index.ts" });
  assert.deepEqual(result.invocation.acceptedScopes, ["tool:file"]);
  assert.equal(result.invocation.execution.dryRun, true);
  assert.equal(result.invocation.execution.invoked, false);
  assert.equal(result.invocation.execution.unsafeSideEffects, false);
});

test("exposeFileInvocationEvent rejects missing runtime context", () => {
  const result = exposeFileInvocationEvent();

  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("empty input must be rejected");
  }

  assert.equal(result.error.code, "MISSING_RUNTIME_ID");
  assert.equal(result.error.boundary, "input");
  assert.equal(result.error.safeForRuntimeInspection, true);
});

test("exposeFileInvocationEvent rejects attempts to leave dry-run mode", () => {
  const result = exposeFileInvocationEvent({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    operation: "write",
    eventSource: "basicToolLayer",
    dryRun: false,
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("real side effects must be rejected");
  }

  assert.equal(result.error.code, "REAL_SIDE_EFFECT_NOT_ALLOWED");
  assert.equal(result.error.boundary, "governance");
  assert.deepEqual(result.events, ["eventExposure.basicTool.file.rejected"]);
});
