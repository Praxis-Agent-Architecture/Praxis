import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { defineAgentCoreContractTest } from "../agentCoreContractTestHelper.js";
import { createMainLoopStepRecord } from "../../../src/agentCore/agent_executionEngine/coreLogic/mainLoop.js";
import {
  createInMemorySessionStateEventStore,
  createSqliteSessionStateEventStore,
} from "../../../src/agentCore/agent_runtimeImplementation/runtimeSessionStateEventStore.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_runtimeImplementation/runtimeSessionStateEventStore.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtimeSessionStateEventStore.md",
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
  await store.appendMainLoopStep(createMainLoopStepRecord({
    sessionId: "session-1",
    turnIndex: 0,
    stepIndex: 1,
    actionPrimitive: "invokeModel",
    status: "completed",
    inputRefs: ["prompt-1"],
    outputRefs: ["model-1"],
    modelCallId: "model-1",
    now: "2026-04-30T00:00:04.000Z",
  }));
  await store.appendProcedure({
    sessionId: "session-1",
    procedureId: "procedure-1",
    status: "completed",
    createdAt: "2026-04-30T00:00:05.000Z",
    summary: { recordCount: 1 },
  });
  await store.appendApproval({
    sessionId: "session-1",
    approvalId: "approval-1",
    source: "baseTool",
    status: "pending",
    reason: "write action requires approval",
    requestedScopes: ["code.write"],
    interfaceSurface: "test-harness",
    createdAt: "2026-04-30T00:00:06.000Z",
    metadata: { toolId: "code.write" },
  });
  assert.equal((await store.readPendingApprovals("session-1")).length, 1);
  await store.resolveApproval("session-1", "approval-1", {
    status: "approved",
    resolvedAt: "2026-04-30T00:00:07.000Z",
    resolution: { resolvedBy: "unit-test", reason: "covered by test harness" },
  });
  await store.appendPublicSafeError({
    sessionId: "session-1",
    errorId: "error-1",
    code: "PUBLIC_SAFE_FAILURE",
    message: "public safe failure",
    boundary: "tool",
    publicSafe: true,
    createdAt: "2026-04-30T00:00:08.000Z",
    metadata: { toolId: "code.write" },
  });
  await store.updateSessionStatus("session-1", "completed");

  const snapshot = await store.readSession("session-1");
  assert.equal(snapshot.session?.status, "completed");
  assert.equal(snapshot.states[0]?.phase, "model");
  assert.equal(snapshot.events[0]?.type, "runtime.model.called");
  assert.equal(snapshot.invocations[0]?.target, "carrier-1");
  assert.equal(snapshot.mainLoopSteps[0]?.actionPrimitive, "invokeModel");
  assert.equal(snapshot.procedures[0]?.procedureId, "procedure-1");
  assert.equal(snapshot.approvals[0]?.status, "approved");
  assert.equal(snapshot.errors[0]?.code, "PUBLIC_SAFE_FAILURE");
  assert.equal((await store.readLatestState("session-1"))?.stateId, "state-1");
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
