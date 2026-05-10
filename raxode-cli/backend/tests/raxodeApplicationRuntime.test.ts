import assert from "node:assert/strict";
import test from "node:test";

import {
  createRaxodeBackend,
  createRaxodeBackendRestServer,
  createRaxodeBackendWebSocketServer,
} from "../raxodeBackend.js";

test("raxode backend runs through applicationLayer", async () => {
  const backend = await createRaxodeBackend({
    now: () => "2026-05-10T00:00:00.000Z",
  });
  const result = await backend.run({
    task: "dry-run readiness",
    mode: "dry-run",
    sessionId: "session.raxode.test",
    permissionProfile: "bapr",
  });
  assert.equal(result.ok, true);
  assert.equal(result.view.applicationId, "application.raxode.coding");
  assert.equal(result.view.sessionId, "session.raxode.test");
  assert.equal(result.view.agentId, "agent.raxode.coding");
  assert.equal(result.view.permissionProfile, "bapr");
  assert.equal(result.view.model.contextWindowTokens, 400_000);
  assert.equal(result.view.model.maxInputTokens, 272_000);
  assert.equal(result.view.model.inputBudgetThreshold, 0.95);
  assert.equal(result.view.model.usableInputTokens, 258_400);
  assert.equal(result.view.tools.mounted, 175);
});

test("raxode backend exposes application REST and WebSocket servers", async () => {
  const rest = await createRaxodeBackendRestServer({
    now: () => "2026-05-10T00:00:00.000Z",
  });
  try {
    const response = await fetch(`${rest.url}/application/view`);
    assert.equal(response.status, 200);
    const view = await response.json() as { applicationId?: string };
    assert.equal(view.applicationId, "application.raxode.coding");
  } finally {
    await rest.close();
  }

  const ws = await createRaxodeBackendWebSocketServer({
    now: () => "2026-05-10T00:00:00.000Z",
  });
  const socket = new WebSocket(ws.url);
  try {
    const ready = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("timeout waiting for raxode ws ready")), 4000);
      socket.addEventListener("message", (event) => {
        clearTimeout(timeout);
        resolve(JSON.parse(String(event.data)) as Record<string, unknown>);
      }, { once: true });
    });
    assert.equal(ready.type, "application.ready");
  } finally {
    socket.close();
    await ws.close();
  }
});
