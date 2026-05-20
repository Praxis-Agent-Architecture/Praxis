import assert from "node:assert/strict";
import test from "node:test";

import {
  exposeTapInvocationEvent,
  tapInvocationDescriptor,
} from "../../../../../../src/executionEngine/coreLogic/eventExposurePlane/officialPoolInvocation/tapInvocation.js";
import { defineAgentCoreContractTest } from "../../../../agentCoreContractTestHelper.js";

defineAgentCoreContractTest({
  sourcePath: "src/executionEngine/coreLogic/eventExposurePlane/officialPoolInvocation/tapInvocation.ts",
  docPath: "docs/agentCore/agent_executionEngine/coreLogic/eventExposurePlane/officialPoolInvocation/tapInvocation.md",
  testFileUrl: import.meta.url,
});

test("tapInvocation exposes a dry-run official TAP invocation event", () => {
  const result = exposeTapInvocationEvent({
    runtimeId: " runtime-a ",
    sessionId: " session-a ",
    invocationId: " invoke-tap ",
    source: "runtime.execEngine",
    operation: " expose-event ",
    callContext: { moduleRequestId: "tap-a", exposureSlot: "official-pool" },
    governanceContext: [" tap.plan ", "tap.plan"],
    requestedSubscribers: ["runtime.behaviorExposure", " debug.panel "],
    allowedSubscribers: ["runtime.behaviorExposure", "debug.panel"],
    contract: { accepted: true },
    governance: { accepted: true },
    trace: { correlationId: " corr-tap " },
    metadata: { phase: "planned" },
  });

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  assert.equal(result.event.type, "officialPoolInvocation.tap.requested");
  assert.equal(result.event.runtimeId, "runtime-a");
  assert.equal(result.event.officialModule.name, "TAP");
  assert.equal(result.event.officialModule.operation, "expose-event");
  assert.equal(result.event.officialModule.resultEnvelope, "not-executed");
  assert.deepEqual(result.event.payload.callContextKeys, ["exposureSlot", "moduleRequestId"]);
  assert.deepEqual(result.event.payload.governanceContext, ["tap.plan"]);
  assert.deepEqual(result.dispatch.deliverableSubscribers, ["runtime.behaviorExposure", "debug.panel"]);
  assert.equal(result.dispatch.actualModuleCallStarted, false);
  assert.equal(result.event.dryRun, true);
  assert.equal(result.event.unsafeSideEffects, false);
  assert.equal(tapInvocationDescriptor.unsafeSideEffects, false);
});

test("tapInvocation rejects empty input with an inspection-safe error", () => {
  const result = exposeTapInvocationEvent();

  if (result.ok) {
    throw new Error("empty TAP invocation input should fail");
  }

  assert.equal(result.error.code, "MISSING_RUNTIME_ID");
  assert.equal(result.error.boundary, "input");
  assert.equal(result.error.safeForRuntimeInspection, true);
  assert.equal(result.error.internalDetailExposed, false);
});

test("tapInvocation rejects governance failures before exposure", () => {
  const result = exposeTapInvocationEvent({
    runtimeId: "runtime-a",
    sessionId: "session-a",
    invocationId: "invoke-tap",
    source: "officialModuleBridge",
    operation: "expose-event",
    governance: { accepted: false, reason: "TAP action outside official module scope" },
  });

  if (result.ok) {
    throw new Error("TAP invocation should not expose governance-rejected events");
  }

  assert.equal(result.error.code, "GOVERNANCE_REJECTED");
  assert.equal(result.error.boundary, "governance");
  assert.deepEqual(result.events, ["officialPoolInvocation.tap.rejected"]);
});
