import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, stat, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  openPraxisProject,
  praxis,
} from "../../../../src/agentCore/index.js";
import {
  createPraxisConversationManager,
} from "../../../../src/runtimeImplementation/runtime.conversationPlane/index.js";
import {
  createPraxisSessionManager,
} from "../../../../src/runtimeImplementation/runtime.sessionPlane/index.js";

test("runtime project plane creates a chat project stub in the main workspace and upgrades it in place", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "praxis-project-foundation-"));
  const opened = await openPraxisProject({
    cwd: root,
    ownerId: "owner-a",
    runtimeId: "runtime-a",
    kind: "chat",
    now: () => "2026-05-24T00:00:00.000Z",
  });

  assert.equal(opened.ok, true);
  if (!opened.ok) return;
  try {
    assert.equal(opened.runtime.project.kind, "chat");
    assert.equal(opened.runtime.stub.schema, "praxis.project.v1");
    assert.equal(opened.runtime.paths.projectStubPath, path.join(root, ".rax_workspace", "project.json"));
    assert.equal(opened.runtime.lease?.ownerId, "owner-a");

    const upgraded = await opened.runtime.upgradeChatProject({ now: "2026-05-24T00:01:00.000Z" });
    assert.equal(upgraded.kind, "workspace-project");
    assert.equal(opened.runtime.stub.kind, "workspace-project");
  } finally {
    await opened.runtime.release();
    await rm(root, { recursive: true, force: true });
  }
});

test("runtime project lock auto-takes over a stale owner", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "praxis-project-lock-"));
  const first = await openPraxisProject({
    cwd: root,
    ownerId: "owner-a",
    now: () => "2026-05-24T00:00:00.000Z",
  });
  assert.equal(first.ok, true);
  if (!first.ok) return;
  await first.runtime.release();

  const second = await openPraxisProject({
    cwd: root,
    ownerId: "owner-b",
    now: () => "2026-05-24T00:02:00.000Z",
  });
  assert.equal(second.ok, true);
  if (!second.ok) return;
  try {
    assert.equal(second.runtime.lease?.ownerId, "owner-b");
    assert.ok(second.events.includes("runtime.projectPlane.lock.takenOver"));
  } finally {
    await second.runtime.release();
    await rm(root, { recursive: true, force: true });
  }
});

test("runtime project lock rejects concurrent owners atomically", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "praxis-project-lock-race-"));
  const [left, right] = await Promise.all([
    openPraxisProject({
      cwd: root,
      ownerId: "owner-left",
      now: () => "2026-05-24T00:00:00.000Z",
    }),
    openPraxisProject({
      cwd: root,
      ownerId: "owner-right",
      now: () => "2026-05-24T00:00:00.000Z",
    }),
  ]);
  const opened = [left, right].filter((result) => result.ok);
  try {
    assert.equal(opened.length, 1);
    assert.equal([left.ok, right.ok].includes(false), true);
  } finally {
    for (const result of opened) {
      if (result.ok) await result.runtime.release();
    }
    await rm(root, { recursive: true, force: true });
  }
});

test("runtime project lock rejects active same-owner reentry without removing the live lock", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "praxis-project-lock-same-owner-"));
  const first = await openPraxisProject({
    cwd: root,
    ownerId: "owner-same",
    now: () => "2026-05-24T00:00:00.000Z",
  });
  assert.equal(first.ok, true);
  if (!first.ok) return;
  try {
    const second = await openPraxisProject({
      cwd: root,
      ownerId: "owner-same",
      now: () => "2026-05-24T00:00:01.000Z",
    });
    assert.equal(second.ok, false);
    await stat(path.join(root, ".rax_workspace", "project.lock.d"));
  } finally {
    await first.runtime.release();
    await rm(root, { recursive: true, force: true });
  }
});

test("runtime project lock release ignores newer leases from the same owner", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "praxis-project-lock-same-owner-takeover-"));
  const first = await openPraxisProject({
    cwd: root,
    ownerId: "owner-stable",
    runtimeId: "runtime-old",
    now: () => "2026-05-24T00:00:00.000Z",
  });
  assert.equal(first.ok, true);
  if (!first.ok) return;

  const second = await openPraxisProject({
    cwd: root,
    ownerId: "owner-stable",
    runtimeId: "runtime-new",
    now: () => "2026-05-24T00:02:00.000Z",
  });
  assert.equal(second.ok, true);
  if (!second.ok) {
    await first.runtime.release();
    await rm(root, { recursive: true, force: true });
    return;
  }

  try {
    await first.runtime.release();
    await stat(path.join(root, ".rax_workspace", "project.lock.d"));
    const third = await openPraxisProject({
      cwd: root,
      ownerId: "owner-third",
      runtimeId: "runtime-third",
      now: () => "2026-05-24T00:02:01.000Z",
    });
    assert.equal(third.ok, false);
  } finally {
    await second.runtime.release();
    await rm(root, { recursive: true, force: true });
  }
});

test("runtime project release clears in-memory lease state and is idempotent", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "praxis-project-lock-release-state-"));
  const opened = await openPraxisProject({
    cwd: root,
    ownerId: "owner-release",
    runtimeId: "runtime-release",
    now: () => "2026-05-24T00:00:00.000Z",
  });
  assert.equal(opened.ok, true);
  if (!opened.ok) return;
  try {
    assert.equal(opened.runtime.lease?.ownerId, "owner-release");
    await opened.runtime.release();
    assert.equal(opened.runtime.lease, undefined);
    await assert.rejects(stat(path.join(root, ".rax_workspace", "project.lock.d")), { code: "ENOENT" });
    await opened.runtime.release();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runtime project open releases its lease when post-lock initialization fails", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "praxis-project-lock-init-fail-"));
  const workspace = path.join(root, ".rax_workspace");
  await mkdir(path.join(workspace, "project.json"), { recursive: true });
  try {
    const opened = await openPraxisProject({
      cwd: root,
      ownerId: "owner-init-fail",
      runtimeId: "runtime-init-fail",
      now: () => "2026-05-24T00:00:00.000Z",
    });
    assert.equal(opened.ok, false);
    await assert.rejects(stat(path.join(workspace, "project.lock.d")), { code: "ENOENT" });

    await rm(path.join(workspace, "project.json"), { recursive: true, force: true });
    const recovered = await openPraxisProject({
      cwd: root,
      ownerId: "owner-recovered-after-init-fail",
      runtimeId: "runtime-recovered-after-init-fail",
      now: () => "2026-05-24T00:00:01.000Z",
    });
    assert.equal(recovered.ok, true);
    if (recovered.ok) await recovered.runtime.release();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runtime project lock recovers stale initialization directories and avoids pre-lock stub writes", async () => {
  const freshRoot = await mkdtemp(path.join(os.tmpdir(), "praxis-project-lock-fresh-init-"));
  const freshWorkspace = path.join(freshRoot, ".rax_workspace");
  await mkdir(path.join(freshWorkspace, "project.lock.d"), { recursive: true });
  const blocked = await openPraxisProject({
    cwd: freshRoot,
    ownerId: "owner-blocked",
    projectId: "project.blocked",
    now: () => new Date().toISOString(),
  });
  try {
    assert.equal(blocked.ok, false);
    await assert.rejects(stat(path.join(freshWorkspace, "project.json")), { code: "ENOENT" });
  } finally {
    await rm(freshRoot, { recursive: true, force: true });
  }

  const staleRoot = await mkdtemp(path.join(os.tmpdir(), "praxis-project-lock-stale-init-"));
  const staleWorkspace = path.join(staleRoot, ".rax_workspace");
  const staleLockDir = path.join(staleWorkspace, "project.lock.d");
  await mkdir(staleLockDir, { recursive: true });
  const oldDate = new Date("2026-05-24T00:00:00.000Z");
  await utimes(staleLockDir, oldDate, oldDate);
  const opened = await openPraxisProject({
    cwd: staleRoot,
    ownerId: "owner-recovered",
    now: () => "2026-05-24T00:02:00.000Z",
  });
  assert.equal(opened.ok, true);
  if (!opened.ok) return;
  try {
    assert.equal(opened.runtime.lease?.ownerId, "owner-recovered");
    await stat(path.join(staleWorkspace, "project.json"));
  } finally {
    await opened.runtime.release();
    await rm(staleRoot, { recursive: true, force: true });
  }
});

test("session and conversation planes support fork-as-rewind, turn checkpoints, summary, and project artifacts", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "praxis-project-session-"));
  const opened = await openPraxisProject({
    cwd: root,
    ownerId: "owner-session",
    now: () => "2026-05-24T00:00:00.000Z",
  });
  assert.equal(opened.ok, true);
  if (!opened.ok) return;
  try {
    const sessions = createPraxisSessionManager(opened.runtime);
    const conversation = createPraxisConversationManager(opened.runtime);
    const session = await sessions.create({
      sessionId: "session.main",
      title: "First request",
      agentId: "agent.primary",
      now: "2026-05-24T00:00:01.000Z",
    });
    const first = await conversation.appendUserTurn({
      sessionId: session.sessionId,
      text: "build the project base",
      now: "2026-05-24T00:00:02.000Z",
    });
    await conversation.appendAssistantTurn({
      sessionId: session.sessionId,
      turnId: first.turn.turnId,
      text: "base created",
      now: "2026-05-24T00:00:03.000Z",
    });
    const second = await conversation.appendUserTurn({
      sessionId: session.sessionId,
      text: "try a risky thing",
      now: "2026-05-24T00:00:04.000Z",
    });
    await conversation.writeSummary({
      sessionId: session.sessionId,
      text: "Project base created before risky branch.",
      source: "application",
      compactedUntilTurnId: first.turn.turnId,
      now: "2026-05-24T00:00:05.000Z",
    });

    const fork = await sessions.fork({
      sourceSessionId: session.sessionId,
      fromTurnId: first.turn.turnId,
      sessionId: "session.fork",
      now: "2026-05-24T00:00:06.000Z",
    });
    await conversation.forkMessages({
      sourceSessionId: session.sessionId,
      targetSessionId: fork.sessionId,
      untilTurnId: first.turn.turnId,
      now: "2026-05-24T00:00:07.000Z",
    });

    const forkMessages = await conversation.listMessages(fork.sessionId);
    const forkSnapshot = await opened.runtime.store.readSessionSnapshot(fork.sessionId);
    assert.equal(second.turn.checkpoint, true);
    assert.equal(fork.parentSessionId, "session.main");
    assert.equal(fork.forkedFromTurnId, "turn.1");
    assert.equal(forkMessages.length, 2);
    assert.equal(forkSnapshot.turns.length, 1);
    assert.equal(forkSnapshot.turns[0]?.turnId, "turn.1");
    assert.equal((await conversation.readSummary(fork.sessionId))?.sourceSessionId, "session.main");

    const sourceFile = path.join(root, "report.txt");
    await writeFile(sourceFile, "artifact text");
    const artifact = await opened.runtime.artifacts.importFile({
      sourcePath: sourceFile,
      sessionId: session.sessionId,
      kind: "report",
      artifactId: "artifact.report.fixed",
      now: "2026-05-24T00:00:08.000Z",
    });
    assert.equal(artifact.projectId, opened.runtime.project.projectId);
    assert.equal((await opened.runtime.artifacts.list()).length, 1);
    assert.equal((await opened.runtime.artifacts.list(fork.sessionId)).length, 1);
  } finally {
    await opened.runtime.release();
    await rm(root, { recursive: true, force: true });
  }
});

test("session manager supports resume list rename close archive and agent switch", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "praxis-project-session-crud-"));
  const opened = await openPraxisProject({
    cwd: root,
    ownerId: "owner-session-crud",
    now: () => "2026-05-24T00:00:00.000Z",
  });
  assert.equal(opened.ok, true);
  if (!opened.ok) return;
  try {
    const sessions = createPraxisSessionManager(opened.runtime);
    const created = await sessions.create({
      sessionId: "session.crud",
      title: "Initial title",
      agentId: "agent.primary",
      agentKey: "primary",
      now: "2026-05-24T00:00:01.000Z",
    });
    assert.equal((await sessions.resume("session.crud"))?.sessionId, created.sessionId);
    assert.equal((await sessions.list()).length, 1);

    const renamed = await sessions.rename("session.crud", "Renamed title", "2026-05-24T00:00:02.000Z");
    assert.equal(renamed.title, "Renamed title");

    const binding = await sessions.switchAgent({
      sessionId: "session.crud",
      agentId: "agent.reviewer",
      agentKey: "reviewer",
      now: "2026-05-24T00:00:03.000Z",
    });
    assert.equal(binding.reason, "switch");
    assert.equal((await sessions.resume("session.crud"))?.agentId, "agent.reviewer");

    const closed = await sessions.close("session.crud", "2026-05-24T00:00:04.000Z");
    assert.equal(closed.status, "closed");
    const archived = await sessions.archive("session.crud", "2026-05-24T00:00:05.000Z");
    assert.equal(archived.status, "archived");
    assert.equal((await sessions.list()).length, 0);
    assert.equal((await sessions.list({ includeArchived: true })).length, 1);
  } finally {
    await opened.runtime.release();
    await rm(root, { recursive: true, force: true });
  }
});

test("praxis.project is a pure declaration and runtime.project.open consumes it", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "praxis-project-api-"));
  const spec = praxis.project({
    id: "project.custom",
    kind: "workspace-project",
    agents: {
      primary: { agentId: "agent.custom", role: "primary" },
    },
  });
  assert.equal(spec.kind, "praxis.projectSpec");
  const opened = await praxis.runtime.project.open({
    cwd: root,
    spec,
    ownerId: "owner-api",
    now: () => "2026-05-24T00:00:00.000Z",
  });
  assert.equal(opened.ok, true);
  if (!opened.ok) return;
  try {
    assert.equal(opened.runtime.project.projectId, "project.custom");
    assert.equal(opened.runtime.project.kind, "workspace-project");
  } finally {
    await opened.runtime.release();
    await rm(root, { recursive: true, force: true });
  }
});
