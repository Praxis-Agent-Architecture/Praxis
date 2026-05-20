import assert from "node:assert/strict";
import test from "node:test";

import { publishBehaviorEvent } from "../../../../src/agentCore_runtimeImplementation/runtime.behaviorExposure/behaviorEventPublisher.js";
import {
  behaviorTraceSurfaceDescriptor,
  createBehaviorTraceSurface,
} from "../../../../src/agentCore_runtimeImplementation/runtime.behaviorExposure/behaviorTraceSurface.js";
import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_runtimeImplementation/runtime.behaviorExposure/behaviorTraceSurface.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.behaviorExposure/behaviorTraceSurface.md",
  testFileUrl: import.meta.url,
});

test("createBehaviorTraceSurface shapes behavior events into a dry-run trace snapshot", () => {
  const event = publishBehaviorEvent({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    eventKind: "mainLoop.tick",
    source: "executionEngine",
    caller: "invocationMethod",
    payload: { phase: "running", step: 1 },
    trace: { correlationId: "corr-1" },
    observedAt: "2026-04-23T00:00:00.000Z",
  });

  if (!event.ok) {
    assert.fail(event.error.message);
  }

  const result = createBehaviorTraceSurface({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    traceId: "trace-1",
    caller: "debug",
    events: [event.event],
    requestedScopes: ["trace:read"],
    allowedScopes: ["trace:read"],
    includePayloadKeys: true,
  });

  if (!result.ok) {
    assert.fail(result.error.message);
  }

  assert.equal(behaviorTraceSurfaceDescriptor.unsafeSideEffects, false);
  assert.equal(result.trace.type, "behavior.trace.surface");
  assert.equal(result.trace.traceId, "trace-1");
  assert.deepEqual(result.trace.eventKinds, ["mainLoop.tick"]);
  assert.deepEqual(result.trace.acceptedScopes, ["trace:read"]);
  assert.equal(result.trace.frames[0]?.correlationId, "corr-1");
  assert.deepEqual(result.trace.frames[0]?.payloadKeys, ["phase", "step"]);
  assert.equal(result.trace.streamStarted, false);
  assert.equal(result.trace.unsafeSideEffects, false);
});

test("createBehaviorTraceSurface rejects empty input and empty trace event lists", () => {
  const empty = createBehaviorTraceSurface();

  assert.equal(empty.ok, false);
  if (empty.ok) {
    assert.fail("empty trace request must be rejected");
  }

  assert.equal(empty.error.code, "MISSING_RUNTIME_ID");
  assert.equal(empty.error.boundary, "input");
  assert.equal(empty.error.safeForRuntimeInspection, true);

  const emptyEvents = createBehaviorTraceSurface({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    traceId: "trace-1",
    caller: "debug",
    events: [],
  });

  assert.equal(emptyEvents.ok, false);
  if (emptyEvents.ok) {
    assert.fail("trace surface requires events");
  }

  assert.equal(emptyEvents.error.code, "EMPTY_TRACE_EVENTS");
  assert.equal(emptyEvents.error.boundary, "input");
});

test("createBehaviorTraceSurface rejects scope violations and live streams", () => {
  const event = publishBehaviorEvent({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    eventKind: "mainLoop.tick",
    source: "executionEngine",
    caller: "invocationMethod",
  });

  if (!event.ok) {
    assert.fail(event.error.message);
  }

  const denied = createBehaviorTraceSurface({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    traceId: "trace-1",
    caller: "debug",
    events: [event.event],
    requestedScopes: ["private:trace"],
    allowedScopes: ["trace:read"],
  });

  assert.equal(denied.ok, false);
  if (denied.ok) {
    assert.fail("trace scope violation must be rejected");
  }

  assert.equal(denied.error.code, "TRACE_SCOPE_DENIED");
  assert.equal(denied.error.boundary, "scope");

  const stream = createBehaviorTraceSurface({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    traceId: "trace-1",
    caller: "debug",
    events: [event.event],
    stream: true,
  });

  assert.equal(stream.ok, false);
  if (stream.ok) {
    assert.fail("first implementation must block live trace streams");
  }

  assert.equal(stream.error.code, "REAL_STREAM_BLOCKED");
  assert.equal(stream.error.boundary, "governance");
});
