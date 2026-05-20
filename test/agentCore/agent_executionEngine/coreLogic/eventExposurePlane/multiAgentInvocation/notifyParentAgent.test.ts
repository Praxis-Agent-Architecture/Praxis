import assert from "node:assert/strict";
import test from "node:test";

import { exposeNotifyParentAgentEvent } from "../../../../../../src/executionEngine/coreLogic/eventExposurePlane/multiAgentInvocation/notifyParentAgent.js";
import { defineAgentCoreContractTest } from "../../../../agentCoreContractTestHelper.js";

defineAgentCoreContractTest({
  sourcePath: "src/executionEngine/coreLogic/eventExposurePlane/multiAgentInvocation/notifyParentAgent.ts",
  docPath: "docs/agentCore/agent_executionEngine/coreLogic/eventExposurePlane/multiAgentInvocation/notifyParentAgent.md",
  testFileUrl: import.meta.url,
});

test("notifyParentAgent exposes a dry-run parent notification event", () => {
  const result = exposeNotifyParentAgentEvent({
    runtimeId: " runtime:alpha ",
    sessionId: " session:1 ",
    parentAgentId: " parent:agent ",
    sourceAgentId: " child:agent ",
    notificationId: " note:1 ",
    eventSource: "multiagentInterface",
    notificationKind: "result",
    message: " completed child task ",
    governanceContext: [" multiagent.notify ", "multiagent.notify"],
    requestedSubscribers: ["runtime.behaviorExposure"],
    allowedSubscribers: ["runtime.behaviorExposure", "debug.panel"],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected parent notification event exposure");
  }

  assert.equal(result.event.type, "multiAgent.parentAgent.notification.exposed");
  assert.equal(result.event.source, "multiagentInterface");
  assert.equal(result.event.subject.parentAgentId, "parent:agent");
  assert.equal(result.event.subject.sourceAgentId, "child:agent");
  assert.equal(result.event.payload.action, "notify-parent");
  assert.equal(result.event.payload.notificationKind, "result");
  assert.equal(result.event.payload.message, "completed child task");
  assert.deepEqual(result.event.payload.governanceContext, ["multiagent.notify"]);
  assert.equal(result.event.dryRun, true);
  assert.equal(result.event.unsafeSideEffects, false);
  assert.equal(result.dispatch.actualParentNotificationSent, false);
  assert.deepEqual(result.dispatch.deliverableSubscribers, ["runtime.behaviorExposure"]);
});

test("notifyParentAgent reports classified input, contract, and scope failures", () => {
  const missing = exposeNotifyParentAgentEvent({
    runtimeId: "runtime",
    sessionId: "session",
    parentAgentId: "parent",
  });

  assert.equal(missing.ok, false);
  if (missing.ok) {
    throw new Error("expected missing source rejection");
  }

  assert.equal(missing.error.code, "MISSING_SOURCE_AGENT_ID");
  assert.equal(missing.error.boundary, "input");

  const contractRejected = exposeNotifyParentAgentEvent({
    runtimeId: "runtime",
    sessionId: "session",
    parentAgentId: "parent",
    sourceAgentId: "child",
    notificationId: "notification",
    contract: { accepted: false, reason: "notification contract denied" },
  });

  assert.equal(contractRejected.ok, false);
  if (contractRejected.ok) {
    throw new Error("expected contract rejection");
  }

  assert.equal(contractRejected.error.code, "CONTRACT_REJECTED");
  assert.equal(contractRejected.error.boundary, "contract");

  const scopeRejected = exposeNotifyParentAgentEvent({
    runtimeId: "runtime",
    sessionId: "session",
    parentAgentId: "parent",
    sourceAgentId: "child",
    notificationId: "notification",
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
