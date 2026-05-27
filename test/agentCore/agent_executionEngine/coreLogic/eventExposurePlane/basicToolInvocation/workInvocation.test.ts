import assert from "node:assert/strict";
import test from "node:test";

import {
  exposeWorkInvocationEvent,
  workInvocationDescriptor,
} from "../../../../../../src/executionEngine/coreLogic/eventExposurePlane/basicToolInvocation/workInvocation.js";
import { defineAgentCoreContractTest } from "../../../../agentCoreContractTestHelper.js";

defineAgentCoreContractTest({
  sourcePath: "src/executionEngine/coreLogic/eventExposurePlane/basicToolInvocation/workInvocation.ts",
  docPath: "docs/agentCore/agent_executionEngine/coreLogic/eventExposurePlane/basicToolInvocation/workInvocation.md",
  testFileUrl: import.meta.url,
});

test("workInvocation exposes a dry-run Work invocation event", () => {
  const result = exposeWorkInvocationEvent({
    runtimeId: " runtime-a ",
    sessionId: " session-a ",
    invocationId: " invoke-a ",
    source: "basicToolLayer",
    documentId: " doc-42 ",
    action: " summarize ",
    requestedScopes: ["tool:work", "tool:work", " "],
    allowedScopes: ["tool:work"],
    contract: { accepted: true },
    governance: { accepted: true },
    trace: { callerId: " loop-a " },
    metadata: { extension: "docx" },
  });

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  assert.equal(result.event.kind, "basicToolInvocation.work");
  assert.equal(result.event.work.documentId, "doc-42");
  assert.equal(result.event.work.action, "summarize");
  assert.deepEqual(result.event.requestedScopes, ["tool:work"]);
  assert.deepEqual(result.event.grantedScopes, ["tool:work"]);
  assert.equal(result.event.dispatch, "dry-run");
  assert.equal(result.event.unsafeSideEffects, false);
  assert.equal(workInvocationDescriptor.unsafeSideEffects, false);
});

test("workInvocation rejects empty input with an inspection-safe error", () => {
  const result = exposeWorkInvocationEvent();

  if (result.ok) {
    throw new Error("empty Work invocation input should fail");
  }

  assert.equal(result.error.code, "MISSING_RUNTIME_ID");
  assert.equal(result.error.boundary, "input");
  assert.equal(result.error.safeForRuntimeInspection, true);
});

test("workInvocation rejects governance gate failures", () => {
  const result = exposeWorkInvocationEvent({
    runtimeId: "runtime-a",
    sessionId: "session-a",
    invocationId: "invoke-a",
    source: "basicToolLayer",
    documentId: "doc-42",
    action: "summarize",
    governance: { accepted: false, reason: "work tools disabled for this runtime" },
  });

  if (result.ok) {
    throw new Error("Work invocation should not expose governance-rejected events");
  }

  assert.equal(result.error.code, "GOVERNANCE_REJECTED");
  assert.equal(result.error.boundary, "governance");
  assert.equal(result.error.message, "work tools disabled for this runtime");
});
