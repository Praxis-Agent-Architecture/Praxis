import assert from "node:assert/strict";
import test from "node:test";

import { exposeLaunchSubAgentEvent } from "../../../../../../src/agentCore/agent_executionEngine/coreLogic/eventExposurePlane/multiAgentInvocation/launchSubAgent.js";
import { defineAgentCoreContractTest } from "../../../../agentCoreContractTestHelper.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/coreLogic/eventExposurePlane/multiAgentInvocation/launchSubAgent.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/coreLogic/eventExposurePlane/multiAgentInvocation/launchSubAgent.md",
  testFileUrl: import.meta.url,
});

test("launchSubAgent exposes a dry-run launch event with scoped subscribers", () => {
  const result = exposeLaunchSubAgentEvent({
    runtimeId: " runtime:alpha ",
    sessionId: " session:1 ",
    parentAgentId: " parent:agent ",
    subAgentId: " child:agent ",
    invocationId: " invoke:launch ",
    eventSource: "mainLoop",
    launchReason: " delegate research ",
    callContext: { prompt: "summarize", providerPayload: { hidden: true } },
    governanceContext: [" multiagent.delegate ", "multiagent.delegate"],
    requestedSubscribers: ["runtime.behaviorExposure", " debug.panel "],
    allowedSubscribers: ["runtime.behaviorExposure", "debug.panel"],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected launch event exposure");
  }

  assert.equal(result.event.type, "multiAgent.subAgent.launch.requested");
  assert.equal(result.event.runtimeId, "runtime:alpha");
  assert.equal(result.event.sessionId, "session:1");
  assert.equal(result.event.subject.parentAgentId, "parent:agent");
  assert.equal(result.event.subject.subAgentId, "child:agent");
  assert.equal(result.event.payload.action, "launch");
  assert.deepEqual(result.event.payload.callContextKeys, ["prompt", "providerPayload"]);
  assert.deepEqual(result.event.payload.governanceContext, ["multiagent.delegate"]);
  assert.equal(result.event.dryRun, true);
  assert.equal(result.event.unsafeSideEffects, false);
  assert.equal(result.dispatch.mode, "dry-run");
  assert.equal(result.dispatch.actualLaunchStarted, false);
  assert.deepEqual(result.dispatch.deliverableSubscribers, ["runtime.behaviorExposure", "debug.panel"]);
});

test("launchSubAgent rejects empty input and unsafe subscriber scope", () => {
  const missing = exposeLaunchSubAgentEvent();

  assert.equal(missing.ok, false);
  if (missing.ok) {
    throw new Error("expected missing input rejection");
  }

  assert.equal(missing.error.code, "MISSING_RUNTIME_ID");
  assert.equal(missing.error.boundary, "input");
  assert.equal(missing.error.safeForRuntimeInspection, true);
  assert.equal(missing.error.internalDetailExposed, false);

  const denied = exposeLaunchSubAgentEvent({
    runtimeId: "runtime",
    sessionId: "session",
    parentAgentId: "parent",
    subAgentId: "child",
    invocationId: "invocation",
    requestedSubscribers: ["private.panel"],
    allowedSubscribers: ["runtime.behaviorExposure"],
  });

  assert.equal(denied.ok, false);
  if (denied.ok) {
    throw new Error("expected scope rejection");
  }

  assert.equal(denied.error.code, "SUBSCRIBER_SCOPE_DENIED");
  assert.equal(denied.error.boundary, "scope");
});
