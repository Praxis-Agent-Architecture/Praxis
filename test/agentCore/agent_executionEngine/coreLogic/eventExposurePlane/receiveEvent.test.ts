import assert from "node:assert/strict";
import test from "node:test";

import {
  receiveEventDescriptor,
  receiveExecutionEvent,
} from "../../../../../src/executionEngine/coreLogic/eventExposurePlane/receiveEvent.js";
import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";

defineAgentCoreContractTest({
  sourcePath: "src/executionEngine/coreLogic/eventExposurePlane/receiveEvent.ts",
  docPath: "docs/agentCore/agent_executionEngine/coreLogic/eventExposurePlane/receiveEvent.md",
  testFileUrl: import.meta.url,
});

test("receiveEvent accepts and normalizes an execution process event", () => {
  const result = receiveExecutionEvent({
    runtimeId: " runtime-a ",
    sessionId: " session-a ",
    eventKind: " mainLoop.tick ",
    source: "mainLoop",
    payload: { state: "running", step: 1 },
    requestedSubscribers: ["runtime.behaviorExposure", " debug.panel "],
    allowedSubscribers: ["runtime.behaviorExposure", "debug.panel"],
    contract: { accepted: true },
    governance: { accepted: true },
    metadata: { phase: "dry-run" },
  });

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  assert.equal(result.event.type, "executionEvent.received");
  assert.equal(result.event.runtimeId, "runtime-a");
  assert.equal(result.event.sessionId, "session-a");
  assert.equal(result.event.eventKind, "mainLoop.tick");
  assert.equal(result.event.source, "mainLoop");
  assert.deepEqual(result.event.payloadKeys, ["state", "step"]);
  assert.deepEqual(result.dispatch.deliverableSubscribers, ["runtime.behaviorExposure", "debug.panel"]);
  assert.equal(result.dispatch.actualSubscriberNotificationStarted, false);
  assert.equal(result.event.audit.dryRun, true);
  assert.equal(result.event.audit.unsafeSideEffects, false);
  assert.equal(receiveEventDescriptor.unsafeSideEffects, false);
});

test("receiveEvent rejects empty input with an inspection-safe error", () => {
  const result = receiveExecutionEvent();

  if (result.ok) {
    throw new Error("empty execution event input should fail");
  }

  assert.equal(result.error.code, "MISSING_RUNTIME_ID");
  assert.equal(result.error.boundary, "input");
  assert.equal(result.error.safeForRuntimeInspection, true);
  assert.equal(result.error.internalDetailExposed, false);
});

test("receiveEvent rejects invalid payloads and subscriber scope violations", () => {
  const invalidPayload = receiveExecutionEvent({
    runtimeId: "runtime-a",
    sessionId: "session-a",
    eventKind: "mainLoop.tick",
    source: "mainLoop",
    payload: [] as unknown as Record<string, unknown>,
  });

  if (invalidPayload.ok) {
    throw new Error("execution event receiver should reject non-record payloads");
  }

  assert.equal(invalidPayload.error.code, "INVALID_EVENT_PAYLOAD");
  assert.equal(invalidPayload.error.boundary, "input");

  const denied = receiveExecutionEvent({
    runtimeId: "runtime-a",
    sessionId: "session-a",
    eventKind: "mainLoop.tick",
    source: "mainLoop",
    requestedSubscribers: ["private.panel"],
    allowedSubscribers: ["runtime.behaviorExposure"],
  });

  if (denied.ok) {
    throw new Error("execution event receiver should not expose scope-denied events");
  }

  assert.equal(denied.error.code, "SUBSCRIBER_SCOPE_DENIED");
  assert.equal(denied.error.boundary, "scope");
  assert.deepEqual(denied.events, ["executionEvent.receive.rejected"]);
});
