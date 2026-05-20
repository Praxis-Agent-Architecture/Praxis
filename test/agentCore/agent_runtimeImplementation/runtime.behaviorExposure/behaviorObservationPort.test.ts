import assert from "node:assert/strict";
import test from "node:test";

import { publishBehaviorEvent } from "../../../../src/agentCore_runtimeImplementation/runtime.behaviorExposure/behaviorEventPublisher.js";
import {
  behaviorObservationPortDescriptor,
  openBehaviorObservationPort,
} from "../../../../src/agentCore_runtimeImplementation/runtime.behaviorExposure/behaviorObservationPort.js";
import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_runtimeImplementation/runtime.behaviorExposure/behaviorObservationPort.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.behaviorExposure/behaviorObservationPort.md",
  testFileUrl: import.meta.url,
});

test("openBehaviorObservationPort opens a dry-run observation port and previews matching events", () => {
  const event = publishBehaviorEvent({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    eventKind: "mainLoop.tick",
    source: "executionEngine",
    caller: "invocationMethod",
    payload: { phase: "running" },
  });

  if (!event.ok) {
    assert.fail(event.error.message);
  }

  const result = openBehaviorObservationPort({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    observerId: "debug-panel",
    caller: "debug",
    interestedEventKinds: ["mainLoop.tick"],
    requestedScopes: ["behavior:read"],
    allowedScopes: ["behavior:read"],
    existingEvents: [event.event],
  });

  if (!result.ok) {
    assert.fail(result.error.message);
  }

  assert.equal(behaviorObservationPortDescriptor.unsafeSideEffects, false);
  assert.equal(result.port.type, "behavior.observation.port");
  assert.equal(result.port.observerId, "debug-panel");
  assert.deepEqual(result.port.interestedEventKinds, ["mainLoop.tick"]);
  assert.deepEqual(result.port.acceptedScopes, ["behavior:read"]);
  assert.deepEqual(result.port.matchedEventIds, [event.event.eventId]);
  assert.equal(result.port.liveSubscriptionStarted, false);
  assert.equal(result.port.unsafeSideEffects, false);
});

test("openBehaviorObservationPort rejects empty input and missing observation interest", () => {
  const empty = openBehaviorObservationPort();

  assert.equal(empty.ok, false);
  if (empty.ok) {
    assert.fail("empty observation request must be rejected");
  }

  assert.equal(empty.error.code, "MISSING_RUNTIME_ID");
  assert.equal(empty.error.boundary, "input");
  assert.equal(empty.error.safeForRuntimeInspection, true);

  const missingInterest = openBehaviorObservationPort({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    observerId: "debug-panel",
    caller: "debug",
  });

  assert.equal(missingInterest.ok, false);
  if (missingInterest.ok) {
    assert.fail("observation interest must be required");
  }

  assert.equal(missingInterest.error.code, "MISSING_OBSERVATION_INTEREST");
  assert.equal(missingInterest.error.boundary, "input");
});

test("openBehaviorObservationPort rejects scope violations and live subscriptions", () => {
  const denied = openBehaviorObservationPort({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    observerId: "debug-panel",
    caller: "debug",
    interestedSources: ["executionEngine"],
    requestedScopes: ["private:behavior"],
    allowedScopes: ["behavior:read"],
  });

  assert.equal(denied.ok, false);
  if (denied.ok) {
    assert.fail("observation scope violation must be rejected");
  }

  assert.equal(denied.error.code, "OBSERVATION_SCOPE_DENIED");
  assert.equal(denied.error.boundary, "scope");

  const live = openBehaviorObservationPort({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    observerId: "debug-panel",
    caller: "debug",
    interestedSources: ["executionEngine"],
    subscribe: true,
  });

  assert.equal(live.ok, false);
  if (live.ok) {
    assert.fail("first implementation must block live subscriptions");
  }

  assert.equal(live.error.code, "REAL_SUBSCRIPTION_BLOCKED");
  assert.equal(live.error.boundary, "governance");
});
