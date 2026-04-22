import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import { subscribeToApplicationEvents } from "../../../../src/agentCore/agent_runtimeImplementation/runtime.applicationSurface/applicationEventSubscription.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_runtimeImplementation/runtime.applicationSurface/applicationEventSubscription.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_runtimeImplementation/runtime.applicationSurface/applicationEventSubscription.md",
  testFileUrl: import.meta.url,
});

test("subscribeToApplicationEvents accepts application-visible event types", () => {
  const result = subscribeToApplicationEvents({
    runtimeId: "spec:agent",
    applicationId: "app.main",
    sessionId: "session.1",
    eventTypes: ["output", " output ", "debug"],
    allowedEventTypes: ["output", "debug", "error"],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(
    {
      subscriptionId: result.subscription.subscriptionId,
      runtimeId: result.subscription.runtimeId,
      applicationId: result.subscription.applicationId,
      sessionId: result.subscription.sessionId,
      eventTypes: result.subscription.eventTypes,
      governanceState: result.subscription.governanceState,
    },
    {
      subscriptionId: "spec:agent:app.main:session.1:output+debug",
      runtimeId: "spec:agent",
      applicationId: "app.main",
      sessionId: "session.1",
      eventTypes: ["output", "debug"],
      governanceState: "accepted",
    },
  );
  assert.equal(
    result.subscription.accepts({
      type: "output",
      runtimeId: "spec:agent",
      applicationId: "app.main",
      sessionId: "session.1",
    }),
    true,
  );
  assert.equal(
    result.subscription.accepts({
      type: "output",
      runtimeId: "spec:agent",
      applicationId: "other.app",
      sessionId: "session.1",
    }),
    false,
  );
});

test("subscribeToApplicationEvents rejects empty event requests and denied scopes", () => {
  assert.deepEqual(
    subscribeToApplicationEvents({
      runtimeId: "spec:agent",
      applicationId: "app.main",
      eventTypes: [" ", ""],
    }),
    {
      ok: false,
      error: {
        code: "MISSING_EVENT_TYPES",
        message: "at least one event type is required for application subscription",
        boundary: "input",
      },
      events: ["application.events.subscription.rejected"],
    },
  );

  assert.deepEqual(
    subscribeToApplicationEvents({
      runtimeId: "spec:agent",
      applicationId: "app.main",
      eventTypes: ["debug"],
      allowedEventTypes: ["output"],
    }),
    {
      ok: false,
      error: {
        code: "EVENT_SCOPE_DENIED",
        message: "event type debug is outside the application visible event scope",
        boundary: "scope",
      },
      events: ["application.events.subscription.rejected"],
    },
  );
});
