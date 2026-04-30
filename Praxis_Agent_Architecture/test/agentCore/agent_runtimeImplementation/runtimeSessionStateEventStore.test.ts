import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { defineAgentCoreContractTest } from "../agentCoreContractTestHelper.js";
import {
  createInMemorySessionStateEventStore,
  createSqliteSessionStateEventStore,
} from "../../../src/agentCore/agent_runtimeImplementation/runtimeSessionStateEventStore.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_runtimeImplementation/runtimeSessionStateEventStore.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_runtimeImplementation/runtimeSessionStateEventStore.md",
  testFileUrl: import.meta.url,
});

async function exerciseStore(store: Awaited<ReturnType<typeof createSqliteSessionStateEventStore>>): Promise<void> {
  await store.createSession({
    sessionId: "session-1",
    runtimeId: "runtime-1",
    agentId: "agent-1",
    manifestHash: "hash-1",
    createdAt: "2026-04-30T00:00:00.000Z",
    status: "running",
    metadata: { manifestId: "manifest-1" },
  });
  await store.appendState({
    sessionId: "session-1",
    stateId: "state-1",
    phase: "model",
    createdAt: "2026-04-30T00:00:01.000Z",
    metadata: { turn: 1 },
  });
  await store.appendEvent({
    sessionId: "session-1",
    eventId: "event-1",
    type: "runtime.model.called",
    createdAt: "2026-04-30T00:00:02.000Z",
    payload: { publicSafe: true },
  });
  await store.appendInvocation({
    sessionId: "session-1",
    invocationId: "model-1",
    kind: "model",
    target: "carrier-1",
    ok: true,
    createdAt: "2026-04-30T00:00:03.000Z",
    summary: { provider: "openai" },
  });
  await store.updateSessionStatus("session-1", "completed");

  const snapshot = await store.readSession("session-1");
  assert.equal(snapshot.session?.status, "completed");
  assert.equal(snapshot.states[0]?.phase, "model");
  assert.equal(snapshot.events[0]?.type, "runtime.model.called");
  assert.equal(snapshot.invocations[0]?.target, "carrier-1");
}

test("in-memory session/state/event store records the runtime chain", async () => {
  await exerciseStore(createInMemorySessionStateEventStore());
});

test("SQLite session/state/event store records public-safe runtime data", async () => {
  const dbPath = path.join(os.tmpdir(), `praxis-runtime-${Date.now()}.sqlite`);
  const store = await createSqliteSessionStateEventStore(dbPath);
  try {
    await exerciseStore(store);
  } finally {
    await store.close?.();
    await rm(dbPath, { force: true });
  }
});
