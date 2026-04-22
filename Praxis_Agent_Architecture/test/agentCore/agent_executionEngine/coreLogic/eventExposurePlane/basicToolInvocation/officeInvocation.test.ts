import assert from "node:assert/strict";
import test from "node:test";

import {
  exposeOfficeInvocationEvent,
  officeInvocationDescriptor,
} from "../../../../../../src/agentCore/agent_executionEngine/coreLogic/eventExposurePlane/basicToolInvocation/officeInvocation.js";
import { defineAgentCoreContractTest } from "../../../../agentCoreContractTestHelper.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/coreLogic/eventExposurePlane/basicToolInvocation/officeInvocation.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/coreLogic/eventExposurePlane/basicToolInvocation/officeInvocation.md",
  testFileUrl: import.meta.url,
});

test("officeInvocation exposes a dry-run Office invocation event", () => {
  const result = exposeOfficeInvocationEvent({
    runtimeId: " runtime-a ",
    sessionId: " session-a ",
    invocationId: " invoke-a ",
    source: "basicToolLayer",
    documentId: " doc-42 ",
    action: " summarize ",
    requestedScopes: ["tool:office", "tool:office", " "],
    allowedScopes: ["tool:office"],
    contract: { accepted: true },
    governance: { accepted: true },
    trace: { callerId: " loop-a " },
    metadata: { extension: "docx" },
  });

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  assert.equal(result.event.kind, "basicToolInvocation.office");
  assert.equal(result.event.office.documentId, "doc-42");
  assert.equal(result.event.office.action, "summarize");
  assert.deepEqual(result.event.requestedScopes, ["tool:office"]);
  assert.deepEqual(result.event.grantedScopes, ["tool:office"]);
  assert.equal(result.event.dispatch, "dry-run");
  assert.equal(result.event.unsafeSideEffects, false);
  assert.equal(officeInvocationDescriptor.unsafeSideEffects, false);
});

test("officeInvocation rejects empty input with an inspection-safe error", () => {
  const result = exposeOfficeInvocationEvent();

  if (result.ok) {
    throw new Error("empty Office invocation input should fail");
  }

  assert.equal(result.error.code, "MISSING_RUNTIME_ID");
  assert.equal(result.error.boundary, "input");
  assert.equal(result.error.safeForRuntimeInspection, true);
});

test("officeInvocation rejects governance gate failures", () => {
  const result = exposeOfficeInvocationEvent({
    runtimeId: "runtime-a",
    sessionId: "session-a",
    invocationId: "invoke-a",
    source: "basicToolLayer",
    documentId: "doc-42",
    action: "summarize",
    governance: { accepted: false, reason: "office tools disabled for this runtime" },
  });

  if (result.ok) {
    throw new Error("Office invocation should not expose governance-rejected events");
  }

  assert.equal(result.error.code, "GOVERNANCE_REJECTED");
  assert.equal(result.error.boundary, "governance");
  assert.equal(result.error.message, "office tools disabled for this runtime");
});
