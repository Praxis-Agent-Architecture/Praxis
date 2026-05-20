import assert from "node:assert/strict";
import test from "node:test";

import {
  exposeMpInvocationEvent,
  mpInvocationDescriptor,
} from "../../../../../../src/agentCore_executionEngine/coreLogic/eventExposurePlane/officialPoolInvocation/mpInvocation.js";
import { defineAgentCoreContractTest } from "../../../../agentCoreContractTestHelper.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_executionEngine/coreLogic/eventExposurePlane/officialPoolInvocation/mpInvocation.ts",
  docPath: "docs/agentCore/agent_executionEngine/coreLogic/eventExposurePlane/officialPoolInvocation/mpInvocation.md",
  testFileUrl: import.meta.url,
});

test("mpInvocation exposes a dry-run official MP invocation event", () => {
  const result = exposeMpInvocationEvent({
    runtimeId: " runtime-a ",
    sessionId: " session-a ",
    invocationId: " invoke-mp ",
    source: "runtime.officialModuleSurface",
    operation: " expose-event ",
    callContext: { moduleRequestId: "mp-a", exposureSlot: "official-pool" },
    governanceContext: [" mp.read ", "mp.read"],
    requestedSubscribers: ["runtime.behaviorExposure", " inspection.panel "],
    allowedSubscribers: ["runtime.behaviorExposure", "inspection.panel"],
    contract: { accepted: true },
    governance: { accepted: true },
    trace: { callerId: " loop-a " },
    metadata: { phase: "planned" },
  });

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  assert.equal(result.event.type, "officialPoolInvocation.mp.requested");
  assert.equal(result.event.runtimeId, "runtime-a");
  assert.equal(result.event.officialModule.name, "MP");
  assert.equal(result.event.officialModule.operation, "expose-event");
  assert.equal(result.event.officialModule.resultEnvelope, "not-executed");
  assert.deepEqual(result.event.payload.callContextKeys, ["exposureSlot", "moduleRequestId"]);
  assert.deepEqual(result.event.payload.governanceContext, ["mp.read"]);
  assert.deepEqual(result.dispatch.deliverableSubscribers, ["runtime.behaviorExposure", "inspection.panel"]);
  assert.equal(result.dispatch.actualModuleCallStarted, false);
  assert.equal(result.event.dryRun, true);
  assert.equal(result.event.unsafeSideEffects, false);
  assert.equal(mpInvocationDescriptor.unsafeSideEffects, false);
});

test("mpInvocation rejects empty input with an inspection-safe error", () => {
  const result = exposeMpInvocationEvent();

  if (result.ok) {
    throw new Error("empty MP invocation input should fail");
  }

  assert.equal(result.error.code, "MISSING_RUNTIME_ID");
  assert.equal(result.error.boundary, "input");
  assert.equal(result.error.safeForRuntimeInspection, true);
  assert.equal(result.error.internalDetailExposed, false);
});

test("mpInvocation rejects missing operation before exposure", () => {
  const result = exposeMpInvocationEvent({
    runtimeId: "runtime-a",
    sessionId: "session-a",
    invocationId: "invoke-mp",
    source: "officialModuleBridge",
    operation: " ",
  });

  if (result.ok) {
    throw new Error("MP invocation should not expose events without an operation");
  }

  assert.equal(result.error.code, "MISSING_OPERATION");
  assert.equal(result.error.boundary, "input");
  assert.deepEqual(result.events, ["officialPoolInvocation.mp.rejected"]);
});
