import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { createOfficialModuleEventBus, type OfficialModuleEvent } from "../../../../src/agentCore/agent_runtimeImplementation/runtime.officialModuleSurface/officialModuleEventBus.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_runtimeImplementation/runtime.officialModuleSurface/officialModuleEventBus.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.officialModuleSurface/officialModuleEventBus.md",
  testFileUrl: import.meta.url,
});

test("createOfficialModuleEventBus publishes governed events to matching subscribers", () => {
  const received: OfficialModuleEvent[] = [];
  const result = createOfficialModuleEventBus({
    runtimeId: "runtime-1",
    now: () => 42,
    subscribers: [
      {
        id: "inspection",
        filter: { eventTypes: ["module.ready"], moduleKinds: ["cmp"] },
        onEvent: (event) => received.push(event),
      },
      {
        id: "debug",
        filter: { eventTypes: ["module.paused"] },
        onEvent: (event) => received.push(event),
      },
    ],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  const published = result.bus.publish({
    runtimeId: "runtime-1",
    type: "module.ready",
    source: { moduleId: "cmp.main", moduleKind: "cmp" },
    scopes: ["runtime.read"],
    payload: { phase: "attached" },
  });

  assert.equal(published.ok, true);
  if (!published.ok) {
    return;
  }

  assert.equal(published.event.timestamp, 42);
  assert.equal(published.event.governanceChecked, true);
  assert.equal(published.event.unsafeSideEffects, false);
  assert.deepEqual(published.deliveries.map((delivery) => delivery.subscriberId), ["inspection"]);
  assert.equal(received.length, 1);
  assert.equal(result.bus.snapshot().length, 1);
});

test("createOfficialModuleEventBus rejects cross-runtime or ungoverned publish requests", () => {
  const result = createOfficialModuleEventBus({ runtimeId: "runtime-1" });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  const crossRuntime = result.bus.publish({
    runtimeId: "runtime-2",
    type: "module.ready",
    source: { moduleId: "cmp.main", moduleKind: "cmp" },
  });

  assert.equal(crossRuntime.ok, false);
  assert.equal(crossRuntime.error.code, "EVENT_RUNTIME_MISMATCH");
  assert.equal(crossRuntime.error.boundary, "scope");

  const governanceRejected = result.bus.publish({
    runtimeId: "runtime-1",
    type: "module.ready",
    source: { moduleId: "cmp.main", moduleKind: "cmp" },
    governance: { accepted: false, reason: "event scope denied" },
  });

  assert.equal(governanceRejected.ok, false);
  assert.equal(governanceRejected.error.code, "GOVERNANCE_REJECTED");
  assert.equal(governanceRejected.error.internalDetailExposed, false);
});
