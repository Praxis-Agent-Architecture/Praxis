import assert from "node:assert/strict";
import test from "node:test";

import {
  behaviorEventPublisherDescriptor,
  publishBehaviorEvent,
} from "../../../../src/runtimeImplementation/runtime.behaviorExposure/behaviorEventPublisher.js";
import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";

defineAgentCoreContractTest({
  sourcePath: "src/runtimeImplementation/runtime.behaviorExposure/behaviorEventPublisher.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.behaviorExposure/behaviorEventPublisher.md",
  testFileUrl: import.meta.url,
});

test("publishBehaviorEvent publishes a dry-run behavior event envelope", () => {
  const result = publishBehaviorEvent({
    runtimeId: " runtime-1 ",
    sessionId: " session-1 ",
    eventKind: " mainLoop.tick ",
    source: "executionEngine",
    caller: "invocationMethod",
    payload: { phase: "running", step: 1 },
    requestedSubscribers: ["inspection", " debug "],
    allowedSubscribers: ["inspection", "debug"],
    trace: { correlationId: "corr-1" },
    metadata: { owner: "agentCore" },
  });

  if (!result.ok) {
    assert.fail(result.error.message);
  }

  assert.equal(behaviorEventPublisherDescriptor.unsafeSideEffects, false);
  assert.equal(result.event.surface, "runtime.behaviorExposure");
  assert.equal(result.event.runtimeId, "runtime-1");
  assert.equal(result.event.sessionId, "session-1");
  assert.equal(result.event.eventKind, "mainLoop.tick");
  assert.deepEqual(result.event.payloadKeys, ["phase", "step"]);
  assert.deepEqual(result.publication.deliverableSubscribers, ["inspection", "debug"]);
  assert.equal(result.publication.actualSubscriberNotificationStarted, false);
  assert.equal(result.event.audit.dryRun, true);
  assert.equal(result.event.audit.delivered, false);
  assert.equal(result.event.audit.unsafeSideEffects, false);
});

test("publishBehaviorEvent rejects empty input with an inspection-safe error", () => {
  const result = publishBehaviorEvent();

  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("empty behavior event input must be rejected");
  }

  assert.equal(result.error.code, "MISSING_RUNTIME_ID");
  assert.equal(result.error.boundary, "input");
  assert.equal(result.error.safeForRuntimeInspection, true);
  assert.equal(result.error.internalDetailExposed, false);
});

test("publishBehaviorEvent rejects scope violations and real delivery", () => {
  const denied = publishBehaviorEvent({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    eventKind: "mainLoop.tick",
    source: "executionEngine",
    caller: "invocationMethod",
    requestedSubscribers: ["private-panel"],
    allowedSubscribers: ["inspection"],
  });

  assert.equal(denied.ok, false);
  if (denied.ok) {
    assert.fail("subscriber scope violation must be rejected");
  }

  assert.equal(denied.error.code, "SUBSCRIBER_SCOPE_DENIED");
  assert.equal(denied.error.boundary, "scope");

  const realDelivery = publishBehaviorEvent({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    eventKind: "mainLoop.tick",
    source: "executionEngine",
    caller: "invocationMethod",
    deliver: true,
  });

  assert.equal(realDelivery.ok, false);
  if (realDelivery.ok) {
    assert.fail("first implementation must block real delivery");
  }

  assert.equal(realDelivery.error.code, "REAL_DELIVERY_BLOCKED");
  assert.equal(realDelivery.error.boundary, "governance");
});
