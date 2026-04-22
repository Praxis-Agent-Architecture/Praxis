import assert from "node:assert/strict";
import test from "node:test";

import {
  cmpInvocationDescriptor,
  exposeCmpInvocationEvent,
} from "../../../../../../src/agentCore/agent_executionEngine/coreLogic/eventExposurePlane/officialPoolInvocation/cmpInvocation.js";
import { defineAgentCoreContractTest } from "../../../../agentCoreContractTestHelper.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/coreLogic/eventExposurePlane/officialPoolInvocation/cmpInvocation.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/coreLogic/eventExposurePlane/officialPoolInvocation/cmpInvocation.md",
  testFileUrl: import.meta.url,
});

test("cmpInvocation exposes a dry-run official CMP invocation event", () => {
  const result = exposeCmpInvocationEvent({
    runtimeId: " runtime-a ",
    sessionId: " session-a ",
    invocationId: " invoke-cmp ",
    source: "officialModuleBridge",
    operation: " expose-event ",
    callContext: { moduleRequestId: "cmp-a", exposureSlot: "official-pool" },
    governanceContext: [" cmp.read ", "cmp.read"],
    requestedSubscribers: ["runtime.behaviorExposure", " debug.panel "],
    allowedSubscribers: ["runtime.behaviorExposure", "debug.panel"],
    contract: { accepted: true },
    governance: { accepted: true },
    trace: { correlationId: " corr-a " },
    metadata: { phase: "planned" },
  });

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  assert.equal(result.event.type, "officialPoolInvocation.cmp.requested");
  assert.equal(result.event.runtimeId, "runtime-a");
  assert.equal(result.event.officialModule.name, "CMP");
  assert.equal(result.event.officialModule.operation, "expose-event");
  assert.equal(result.event.officialModule.resultEnvelope, "not-executed");
  assert.deepEqual(result.event.payload.callContextKeys, ["exposureSlot", "moduleRequestId"]);
  assert.deepEqual(result.event.payload.governanceContext, ["cmp.read"]);
  assert.deepEqual(result.dispatch.deliverableSubscribers, ["runtime.behaviorExposure", "debug.panel"]);
  assert.equal(result.dispatch.actualModuleCallStarted, false);
  assert.equal(result.event.dryRun, true);
  assert.equal(result.event.unsafeSideEffects, false);
  assert.equal(cmpInvocationDescriptor.unsafeSideEffects, false);
});

test("cmpInvocation rejects empty input with an inspection-safe error", () => {
  const result = exposeCmpInvocationEvent();

  if (result.ok) {
    throw new Error("empty CMP invocation input should fail");
  }

  assert.equal(result.error.code, "MISSING_RUNTIME_ID");
  assert.equal(result.error.boundary, "input");
  assert.equal(result.error.safeForRuntimeInspection, true);
  assert.equal(result.error.internalDetailExposed, false);
});

test("cmpInvocation rejects subscribers outside runtime scope", () => {
  const result = exposeCmpInvocationEvent({
    runtimeId: "runtime-a",
    sessionId: "session-a",
    invocationId: "invoke-cmp",
    source: "officialModuleBridge",
    operation: "expose-event",
    requestedSubscribers: ["private.panel"],
    allowedSubscribers: ["runtime.behaviorExposure"],
  });

  if (result.ok) {
    throw new Error("CMP invocation should not expose scope-denied events");
  }

  assert.equal(result.error.code, "SUBSCRIBER_SCOPE_DENIED");
  assert.equal(result.error.boundary, "scope");
  assert.deepEqual(result.events, ["officialPoolInvocation.cmp.rejected"]);
});
