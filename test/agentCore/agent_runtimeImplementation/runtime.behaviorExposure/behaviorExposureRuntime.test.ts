import assert from "node:assert/strict";
import test from "node:test";

import {
  behaviorExposureRuntimeDescriptor,
  createBehaviorExposureRuntime,
} from "../../../../src/agentCore_runtimeImplementation/runtime.behaviorExposure/behaviorExposureRuntime.js";
import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_runtimeImplementation/runtime.behaviorExposure/behaviorExposureRuntime.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.behaviorExposure/behaviorExposureRuntime.md",
  testFileUrl: import.meta.url,
});

test("createBehaviorExposureRuntime assembles the behavior exposure dry-run surface", () => {
  const result = createBehaviorExposureRuntime({
    runtimeId: " runtime-1 ",
    sessionId: " session-1 ",
    caller: "applicationSurface",
    requestedCapabilities: ["publish-event", "open-observation-port", "create-trace-surface"],
    allowedCapabilities: ["publish-event", "open-observation-port", "create-trace-surface"],
  });

  if (!result.ok) {
    assert.fail(result.error.message);
  }

  assert.equal(behaviorExposureRuntimeDescriptor.unsafeSideEffects, false);
  assert.equal(result.runtime.type, "behavior.exposure.runtime");
  assert.equal(result.runtime.runtimeId, "runtime-1");
  assert.equal(result.runtime.sessionId, "session-1");
  assert.equal(result.runtime.ready, true);
  assert.equal(result.runtime.unsafeSideEffects, false);
  assert.deepEqual(result.runtime.capabilities, ["publish-event", "open-observation-port", "create-trace-surface"]);

  const event = result.runtime.publishEvent({
    eventKind: "mainLoop.tick",
    source: "executionEngine",
  });

  if (!event.ok) {
    assert.fail(event.error.message);
  }

  assert.equal(event.event.runtimeId, "runtime-1");
  assert.equal(event.event.sessionId, "session-1");
  assert.equal(event.event.caller, "applicationSurface");

  const port = result.runtime.openObservationPort({
    observerId: "debug-panel",
    interestedEventKinds: ["mainLoop.tick"],
    existingEvents: [event.event],
  });

  if (!port.ok) {
    assert.fail(port.error.message);
  }

  assert.deepEqual(port.port.matchedEventIds, [event.event.eventId]);

  const trace = result.runtime.createTraceSurface({
    traceId: "trace-1",
    events: [event.event],
  });

  if (!trace.ok) {
    assert.fail(trace.error.message);
  }

  assert.equal(trace.trace.frames.length, 1);
  assert.equal(trace.trace.streamStarted, false);
});

test("createBehaviorExposureRuntime rejects empty input and runtime-not-ready state", () => {
  const empty = createBehaviorExposureRuntime();

  assert.equal(empty.ok, false);
  if (empty.ok) {
    assert.fail("empty runtime request must be rejected");
  }

  assert.equal(empty.error.code, "MISSING_RUNTIME_ID");
  assert.equal(empty.error.boundary, "input");
  assert.equal(empty.error.safeForRuntimeInspection, true);

  const notReady = createBehaviorExposureRuntime({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    caller: "applicationSurface",
    runtimeReady: false,
  });

  assert.equal(notReady.ok, false);
  if (notReady.ok) {
    assert.fail("runtime-not-ready state must be rejected");
  }

  assert.equal(notReady.error.code, "RUNTIME_NOT_READY");
  assert.equal(notReady.error.boundary, "runtime-state");
});

test("createBehaviorExposureRuntime rejects governance and capability scope failures", () => {
  const governance = createBehaviorExposureRuntime({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    caller: "applicationSurface",
    governance: { accepted: false, reason: "policy denied" },
  });

  assert.equal(governance.ok, false);
  if (governance.ok) {
    assert.fail("governance rejection must be returned");
  }

  assert.equal(governance.error.code, "GOVERNANCE_REJECTED");
  assert.equal(governance.error.boundary, "governance");

  const deniedCapability = createBehaviorExposureRuntime({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    caller: "applicationSurface",
    requestedCapabilities: ["publish-event", "create-trace-surface"],
    allowedCapabilities: ["publish-event"],
  });

  assert.equal(deniedCapability.ok, false);
  if (deniedCapability.ok) {
    assert.fail("capability scope violation must be rejected");
  }

  assert.equal(deniedCapability.error.code, "CAPABILITY_SCOPE_DENIED");
  assert.equal(deniedCapability.error.boundary, "scope");
});
