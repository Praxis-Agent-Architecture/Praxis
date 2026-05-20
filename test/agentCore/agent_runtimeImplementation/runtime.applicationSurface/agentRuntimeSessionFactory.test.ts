import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import { createAgentRuntimeSession } from "../../../../src/agentCore_runtimeImplementation/runtime.applicationSurface/agentRuntimeSessionFactory.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_runtimeImplementation/runtime.applicationSurface/agentRuntimeSessionFactory.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.applicationSurface/agentRuntimeSessionFactory.md",
  testFileUrl: import.meta.url,
});

test("createAgentRuntimeSession creates an isolated runtime session", () => {
  const result = createAgentRuntimeSession({
    runtimeId: "spec:agent",
    applicationId: "app.main",
    agentId: "agent.a",
    sessionKey: "conversation.1",
    initialContextKeys: ["cmp", " cmp ", "memory"],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.session, {
    sessionId: "spec:agent:app.main:agent.a:conversation.1",
    runtimeId: "spec:agent",
    applicationId: "app.main",
    agentId: "agent.a",
    sessionKey: "conversation.1",
    contextKeys: ["cmp", "memory"],
    callState: "idle",
    isolation: "runtime-session",
    unsafeSideEffects: false,
  });
  assert.deepEqual(result.events, ["runtime.session.created"]);
});

test("createAgentRuntimeSession supports multiple sessions for the same agent", () => {
  const left = createAgentRuntimeSession({
    runtimeId: "spec:agent",
    applicationId: "app.main",
    agentId: "agent.a",
    sessionKey: "left",
  });
  const right = createAgentRuntimeSession({
    runtimeId: "spec:agent",
    applicationId: "app.main",
    agentId: "agent.a",
    sessionKey: "right",
  });

  assert.equal(left.ok, true);
  assert.equal(right.ok, true);
  assert.notEqual(left.session.sessionId, right.session.sessionId);
});

test("createAgentRuntimeSession returns classified failures", () => {
  assert.deepEqual(createAgentRuntimeSession({ runtimeId: "spec:agent", applicationId: "", agentId: "agent.a" }), {
    ok: false,
    error: {
      code: "MISSING_APPLICATION_ID",
      message: "applicationId is required before creating a runtime session",
      boundary: "input",
    },
    events: ["runtime.session.rejected"],
  });

  assert.deepEqual(
    createAgentRuntimeSession({
      runtimeId: "spec:agent",
      applicationId: "app.main",
      agentId: "agent.a",
      runtimeReady: false,
    }),
    {
      ok: false,
      error: {
        code: "RUNTIME_NOT_READY",
        message: "runtime session requires a ready runtime",
        boundary: "runtime-state",
      },
      events: ["runtime.session.rejected"],
    },
  );
});
