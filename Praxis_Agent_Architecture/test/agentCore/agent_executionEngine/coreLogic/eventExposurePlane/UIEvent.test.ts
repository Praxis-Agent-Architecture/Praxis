import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import { exposeUIEvent, uiEventDescriptor } from "../../../../../src/agentCore/agent_executionEngine/coreLogic/eventExposurePlane/UIEvent.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/coreLogic/eventExposurePlane/UIEvent.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/coreLogic/eventExposurePlane/UIEvent.md",
  testFileUrl: import.meta.url,
});

test("exposeUIEvent builds a dry-run UI event record for runtime subscribers", () => {
  const result = exposeUIEvent({
    runtimeId: " runtime-1 ",
    sessionId: " session-1 ",
    kind: "panel.updated",
    eventSource: "mainLoop",
    payload: { panel: "chat" },
    requestedScopes: ["ui:read", "ui:read"],
    allowedScopes: ["ui:read"],
    subscribers: ["debug", "debug", "behaviorExposure"],
  });

  if (!result.ok) {
    assert.fail(result.error.message);
  }

  assert.equal(uiEventDescriptor.unsafeSideEffects, false);
  assert.equal(result.event.category, "ui");
  assert.equal(result.event.runtimeId, "runtime-1");
  assert.equal(result.event.sessionId, "session-1");
  assert.equal(result.event.kind, "panel.updated");
  assert.deepEqual(result.event.payload, { panel: "chat" });
  assert.deepEqual(result.event.acceptedScopes, ["ui:read"]);
  assert.deepEqual(result.event.subscribers, ["debug", "behaviorExposure"]);
  assert.equal(result.event.audit.dryRun, true);
  assert.equal(result.event.audit.unsafeSideEffects, false);
});

test("exposeUIEvent rejects empty input with a classified error", () => {
  const result = exposeUIEvent();

  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("empty input must be rejected");
  }

  assert.equal(result.error.code, "MISSING_RUNTIME_ID");
  assert.equal(result.error.boundary, "input");
  assert.equal(result.error.safeForRuntimeInspection, true);
});

test("exposeUIEvent rejects scope escape before exposing the event", () => {
  const result = exposeUIEvent({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    kind: "panel.updated",
    eventSource: "mainLoop",
    requestedScopes: ["ui:write"],
    allowedScopes: ["ui:read"],
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("scope escape must be rejected");
  }

  assert.equal(result.error.code, "SCOPE_DENIED");
  assert.equal(result.error.boundary, "scope");
  assert.deepEqual(result.events, ["eventExposure.ui.rejected"]);
});
