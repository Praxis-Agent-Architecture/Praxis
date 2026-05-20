import assert from "node:assert/strict";
import test from "node:test";

import { exposeResumeSubAgentEvent } from "../../../../../../src/agentCore/agent_executionEngine/coreLogic/eventExposurePlane/multiAgentInvocation/resumeSubAgent.js";
import { defineAgentCoreContractTest } from "../../../../agentCoreContractTestHelper.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_executionEngine/coreLogic/eventExposurePlane/multiAgentInvocation/resumeSubAgent.ts",
  docPath: "docs/agentCore/agent_executionEngine/coreLogic/eventExposurePlane/multiAgentInvocation/resumeSubAgent.md",
  testFileUrl: import.meta.url,
});

test("resumeSubAgent exposes a dry-run resume event without resuming the child agent", () => {
  const result = exposeResumeSubAgentEvent({
    runtimeId: " runtime:alpha ",
    sessionId: " session:1 ",
    parentAgentId: " parent:agent ",
    subAgentId: " child:agent ",
    invocationId: " invoke:resume ",
    resumeReason: " continue after approval ",
    resumeToken: "token-value",
    governanceContext: [" multiagent.resume ", "multiagent.resume"],
    requestedSubscribers: ["runtime.behaviorExposure", "debug.panel"],
    allowedSubscribers: ["runtime.behaviorExposure", "debug.panel"],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected resume event exposure");
  }

  assert.equal(result.event.type, "multiAgent.subAgent.resume.requested");
  assert.equal(result.event.source, "runtime.execEngine");
  assert.equal(result.event.subject.invocationId, "invoke:resume");
  assert.equal(result.event.payload.action, "resume");
  assert.equal(result.event.payload.resumeReason, "continue after approval");
  assert.equal(result.event.payload.resumeTokenPresent, true);
  assert.deepEqual(result.event.payload.governanceContext, ["multiagent.resume"]);
  assert.equal(result.event.dryRun, true);
  assert.equal(result.event.unsafeSideEffects, false);
  assert.equal(result.dispatch.actualResumeStarted, false);
});

test("resumeSubAgent reports classified input, runtime, and scope failures", () => {
  const missing = exposeResumeSubAgentEvent({
    runtimeId: "runtime",
    sessionId: "session",
    parentAgentId: "parent",
  });

  assert.equal(missing.ok, false);
  if (missing.ok) {
    throw new Error("expected missing sub-agent rejection");
  }

  assert.equal(missing.error.code, "MISSING_SUB_AGENT_ID");
  assert.equal(missing.error.boundary, "input");

  const unready = exposeResumeSubAgentEvent({
    runtimeId: "runtime",
    sessionId: "session",
    parentAgentId: "parent",
    subAgentId: "child",
    invocationId: "invocation",
    runtimeReady: false,
  });

  assert.equal(unready.ok, false);
  if (unready.ok) {
    throw new Error("expected runtime rejection");
  }

  assert.equal(unready.error.code, "RUNTIME_NOT_READY");
  assert.equal(unready.error.boundary, "runtime-state");

  const scopeRejected = exposeResumeSubAgentEvent({
    runtimeId: "runtime",
    sessionId: "session",
    parentAgentId: "parent",
    subAgentId: "child",
    invocationId: "invocation",
    requestedSubscribers: ["private.panel"],
    allowedSubscribers: ["runtime.behaviorExposure"],
  });

  assert.equal(scopeRejected.ok, false);
  if (scopeRejected.ok) {
    throw new Error("expected scope rejection");
  }

  assert.equal(scopeRejected.error.code, "SUBSCRIBER_SCOPE_DENIED");
  assert.equal(scopeRejected.error.boundary, "scope");
});
