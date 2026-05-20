import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import { createAgentRuntime } from "../../../../src/agentCore_runtimeImplementation/runtime.applicationSurface/agentRuntimeFactory.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_runtimeImplementation/runtime.applicationSurface/agentRuntimeFactory.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.applicationSurface/agentRuntimeFactory.md",
  testFileUrl: import.meta.url,
});

test("createAgentRuntime assembles a ready runtime with default session and handle", () => {
  const result = createAgentRuntime({
    source: { kind: "spec", name: "agent", version: "0.1.0" },
    applicationId: "app.main",
    requestedSurfaces: ["runtime.applicationSurface", " runtime.invocationMethod ", "runtime.invocationMethod"],
    visibleEventTypes: ["output", "debug"],
  });

  assert.equal(result.ok, true);
  assert.equal(result.runtime.runtimeId, "spec:agent");
  assert.equal(result.runtime.readiness, "ready");
  assert.equal(result.runtime.unsafeSideEffects, false);
  assert.deepEqual(result.runtime.assembledSurfaces, ["runtime.applicationSurface", "runtime.invocationMethod"]);
  assert.deepEqual(result.runtime.sessions.map((session) => session.sessionId), ["spec:agent:app.main:agent:default"]);
  assert.deepEqual(result.runtime.handle.getStatus(), {
    runtimeId: "spec:agent",
    applicationId: "app.main",
    status: "ready",
    enabledOperations: ["invoke", "subscribe", "inspect", "close"],
    visibleSessions: ["spec:agent:app.main:agent:default"],
    visibleEventTypes: ["output", "debug"],
  });
  assert.deepEqual(result.events, [
    "runtime.factory.created",
    "runtime.session.created",
    "runtime.handle.ready",
  ]);
});

test("createAgentRuntime rejects missing input and governance failures", () => {
  assert.deepEqual(createAgentRuntime({ applicationId: "app.main" }), {
    ok: false,
    error: {
      code: "MISSING_SOURCE",
      message: "runtime factory requires a DSL, spec, class, manifest, or configuration source",
      boundary: "input",
    },
    events: ["runtime.factory.rejected"],
  });

  assert.deepEqual(
    createAgentRuntime({
      source: { kind: "manifest", name: "agent" },
      applicationId: "app.main",
      governance: { accepted: false, reason: "scope denied" },
    }),
    {
      ok: false,
      error: {
        code: "GOVERNANCE_REJECTED",
        message: "scope denied",
        boundary: "governance",
      },
      events: ["runtime.factory.rejected"],
    },
  );
});

test("createAgentRuntime keeps multiple session seeds isolated", () => {
  const result = createAgentRuntime({
    source: { kind: "configuration", name: "agent" },
    applicationId: "app.main",
    sessions: [
      { agentId: "agent.a", sessionKey: "left", initialContextKeys: ["cmp", " cmp "] },
      { agentId: "agent.a", sessionKey: "right" },
    ],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(
    result.runtime.sessions.map((session) => ({
      sessionId: session.sessionId,
      contextKeys: session.contextKeys,
      isolation: session.isolation,
    })),
    [
      {
        sessionId: "configuration:agent:app.main:agent.a:left",
        contextKeys: ["cmp"],
        isolation: "runtime-session",
      },
      {
        sessionId: "configuration:agent:app.main:agent.a:right",
        contextKeys: [],
        isolation: "runtime-session",
      },
    ],
  );
});
