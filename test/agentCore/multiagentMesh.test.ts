import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createBaseToolRegistry } from "../../src/basetool/index.js";
import {
  createInMemoryMultiagentRuntime,
  createProjectMultiagentRuntime,
} from "../../src/runtimeImplementation/runtime.multiagentPlane/index.js";

function executorFor(runtime: ReturnType<typeof createInMemoryMultiagentRuntime>) {
  return {
    agent: {
      spawn: async (input: unknown) => ({ ok: true, output: await runtime.spawn(input as never) }),
      message: async (input: unknown) => ({ ok: true, output: await runtime.message(input as never) }),
      inbox: async (input: unknown) => ({ ok: true, output: await runtime.inbox(input as never) }),
      list: async (input: unknown) => ({ ok: true, output: await runtime.list(input as never) }),
      inspect: async (input: unknown) => ({ ok: true, output: await runtime.inspect(input as never) }),
      wait: async (input: unknown) => ({ ok: true, output: await runtime.wait(input as never) }),
      stop: async (input: unknown) => ({ ok: true, output: await runtime.stop(input as never) }),
      kill: async (input: unknown) => ({ ok: true, output: await runtime.kill(input as never) }),
    },
  };
}

test("multiagent runtime spawns project-local agent sessions and sends initial task", async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "praxis-mesh-"));
  try {
    const runtime = createInMemoryMultiagentRuntime({
      projectId: "project.mesh",
      workspaceRoot,
      defaultModel: "gpt-test",
      initialSessions: [{
        sessionId: "session.root",
        agentId: "agent.root",
        workingDirectory: workspaceRoot,
        model: "gpt-root",
      }],
    });

    const spawnDetached = runtime.spawn;
    const detachedSpawned = await spawnDetached({
      requesterSessionId: "session.root",
      task: "Detached runtime method should still work.",
    });
    assert.equal(detachedSpawned.initialMessage.fromSessionId, "session.root");

    const spawned = await runtime.spawn({
      requesterSessionId: "session.root",
      name: "reader",
      description: "Inspect mainloop",
      task: "Read the mainloop and report back.",
      lifecycle: "oneshot",
      appendPrompt: "private behavior patch",
      metadata: { secret: "do-not-return", summary: "public summary" },
    });

    assert.equal(spawned.session.projectId, "project.mesh");
    assert.equal(spawned.session.createdBySessionId, "session.root");
    assert.equal(spawned.session.model, "gpt-root");
    assert.equal(spawned.session.status, "running");
    assert.equal(spawned.session.appendPrompt, undefined);
    assert.equal(spawned.session.metadata.secret, undefined);
    assert.equal(spawned.initialMessage.fromSessionId, "session.root");
    assert.equal(spawned.initialMessage.toSessionId, spawned.session.sessionId);
    assert.equal(spawned.initialMessage.text, "Read the mainloop and report back.");

    const inbox = await runtime.inbox({ sessionId: spawned.session.sessionId });
    assert.equal(inbox.length, 1);
    assert.equal(inbox[0]?.readAt !== undefined, true);

    const inspected = await runtime.inspect({ sessionId: spawned.session.sessionId });
    assert.equal(inspected.summary, "public summary");
    assert.equal(inspected.session?.appendPrompt, undefined);
    assert.equal(inspected.session?.metadata.secret, undefined);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test("multiagent runtime correlates replies for agent.wait and completes original messages", async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "praxis-mesh-"));
  try {
    const runtime = createInMemoryMultiagentRuntime({
      projectId: "project.mesh",
      workspaceRoot,
      initialSessions: [
        { sessionId: "session.a", agentId: "agent.a", workingDirectory: workspaceRoot },
        { sessionId: "session.b", agentId: "agent.b", workingDirectory: workspaceRoot },
      ],
    });
    const sent = await runtime.message({
      fromSessionId: "session.a",
      toSessionId: "session.b",
      text: "How is promptPack assembled?",
    });
    const waiting = runtime.wait({ requesterSessionId: "session.a", messageId: sent.messageId });
    const reply = await runtime.message({
      fromSessionId: "session.b",
      toSessionId: "session.a",
      text: "It is assembled from declared material plus observations.",
      replyToMessageId: sent.messageId,
    });
    const waited = await waiting;
    assert.equal(waited.message.messageId, reply.messageId);
    assert.equal(reply.completesMessageId, sent.messageId);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test("multiagent runtime rejects invalid replies and missing spawn requester without mutating mesh", async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "praxis-mesh-"));
  try {
    const runtime = createInMemoryMultiagentRuntime({
      projectId: "project.mesh",
      workspaceRoot,
      initialSessions: [
        { sessionId: "session.a", agentId: "agent.a", workingDirectory: workspaceRoot },
        { sessionId: "session.b", agentId: "agent.b", workingDirectory: workspaceRoot },
        { sessionId: "session.c", agentId: "agent.c", workingDirectory: workspaceRoot },
      ],
    });

    await assert.rejects(
      runtime.spawn({ requesterSessionId: "session.missing", task: "This must not create an orphan." }),
      /agent session was not found/,
    );
    await assert.rejects(
      runtime.spawn({ requesterSessionId: "session.a", task: "   " }),
      /non-empty task/,
    );
    assert.equal((await runtime.list({ includeInactive: true })).length, 3);

    const sent = await runtime.message({
      fromSessionId: "session.a",
      toSessionId: "session.b",
      text: "Reply only from session.b to session.a.",
    });
    await assert.rejects(
      runtime.message({
        fromSessionId: "session.c",
        toSessionId: "session.a",
        text: "Wrong sender.",
        replyToMessageId: sent.messageId,
      }),
      /same two sessions/,
    );
    await assert.rejects(
      runtime.message({
        fromSessionId: "session.b",
        toSessionId: "session.a",
        text: "Unknown reply target.",
        replyToMessageId: "agent-message.missing",
      }),
      /reply target message was not found/,
    );
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test("multiagent runtime rejects empty messages and treats inbox limit zero as empty", async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "praxis-mesh-"));
  try {
    const runtime = createInMemoryMultiagentRuntime({
      projectId: "project.mesh",
      workspaceRoot,
      initialSessions: [
        { sessionId: "session.a", agentId: "agent.a", workingDirectory: workspaceRoot },
        { sessionId: "session.b", agentId: "agent.b", workingDirectory: workspaceRoot },
      ],
    });

    await assert.rejects(
      runtime.message({ fromSessionId: "session.a", toSessionId: "session.b", text: "   " }),
      /requires text or message parts/,
    );
    await assert.rejects(
      runtime.message({ fromSessionId: "session.a", toSessionId: "session.b", parts: [] }),
      /requires text or message parts/,
    );
    await assert.rejects(
      runtime.message({ fromSessionId: "session.a", toSessionId: "session.b", parts: [{ type: "text", text: "   " }] }),
      /requires text or message parts/,
    );
    await assert.rejects(
      runtime.message({ fromSessionId: "session.a", toSessionId: "session.b", parts: [{}] as never }),
      /known multiagent message part shapes/,
    );

    await runtime.message({ fromSessionId: "session.a", toSessionId: "session.b", text: "hello" });
    const artifactMessage = await runtime.message({
      fromSessionId: "session.a",
      toSessionId: "session.b",
      parts: [{ type: "artifact_ref", artifactId: "artifact.1" }],
      metadata: { secret: "do-not-return", delivery: "caller-override" },
    });
    assert.equal(artifactMessage.metadata.secret, undefined);
    assert.equal(artifactMessage.metadata.delivery, "queuedUntilCurrentRunCompletes");
    assert.equal((await runtime.inbox({ sessionId: "session.b", limit: 0 })).length, 0);
    const inbox = await runtime.inbox({ sessionId: "session.b" });
    assert.equal(inbox.length, 2);
    assert.equal(inbox[1]?.metadata.secret, undefined);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test("oneshot sessions archive after replying and revive when messaged again", async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "praxis-mesh-"));
  try {
    const runtime = createInMemoryMultiagentRuntime({
      projectId: "project.mesh",
      workspaceRoot,
      initialSessions: [{ sessionId: "session.root", agentId: "agent.root", workingDirectory: workspaceRoot }],
    });
    const spawned = await runtime.spawn({
      requesterSessionId: "session.root",
      task: "Check the sandbox plan.",
      lifecycle: "oneshot",
    });

    await runtime.message({
      fromSessionId: spawned.session.sessionId,
      toSessionId: "session.root",
      text: "Sandbox plan checked.",
      replyToMessageId: spawned.initialMessage.messageId,
    });

    const archived = await runtime.inspect({ sessionId: spawned.session.sessionId });
    assert.equal(archived.session?.status, "archived");

    await runtime.message({
      fromSessionId: "session.root",
      toSessionId: spawned.session.sessionId,
      text: "One more follow-up.",
    });

    const revived = await runtime.inspect({ sessionId: spawned.session.sessionId });
    assert.equal(revived.session?.status, "running");
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test("agent basetools are registry-mounted and invoke the multiagent runtime port", async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "praxis-mesh-"));
  try {
    const runtime = createInMemoryMultiagentRuntime({
      projectId: "project.mesh",
      workspaceRoot,
      initialSessions: [{ sessionId: "session.root", agentId: "agent.root", workingDirectory: workspaceRoot }],
    });
    const registry = createBaseToolRegistry({ profileName: "agentCore" });
    const spawn = registry.lookupHandler("agent.spawn");
    assert.equal(spawn.ok, true);
    if (!spawn.ok) return;

    const result = await spawn.handler.invoke({
      runtime: { sessionId: "session.root" },
      executor: executorFor(runtime),
      input: {
        name: "docs",
        task: "Summarize docs.",
        lifecycle: "persistent",
      },
    });

    assert.equal(result.ok, true);
    assert.equal(result.toolId, "agent.spawn");
    const output = result.output as { session?: { sessionId?: string }; initialMessage?: { messageId?: string } };
    assert.equal(typeof output.session?.sessionId, "string");
    assert.equal(typeof output.initialMessage?.messageId, "string");

    const list = registry.lookupHandler("agent.list");
    assert.equal(list.ok, true);
    if (!list.ok) return;
    const listed = await list.handler.invoke({ executor: executorFor(runtime), input: {} });
    assert.equal(listed.ok, true);
    assert.equal((listed.output as unknown[]).length, 2);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test("agent basetools validate default runtime session and inbox/list booleans", async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "praxis-mesh-"));
  try {
    const runtime = createInMemoryMultiagentRuntime({
      projectId: "project.mesh",
      workspaceRoot,
      initialSessions: [{ sessionId: "session.root", agentId: "agent.root", workingDirectory: workspaceRoot }],
    });
    const registry = createBaseToolRegistry({ profileName: "agentCore" });
    const spawn = registry.lookupHandler("agent.spawn");
    assert.equal(spawn.ok, true);
    if (!spawn.ok) return;

    const missingRuntimeSession = await spawn.handler.invoke({
      executor: executorFor(runtime),
      input: { task: "No runtime session." },
    });
    assert.equal(missingRuntimeSession.ok, false);
    assert.equal(missingRuntimeSession.error?.code, "MISSING_RUNTIME_SESSION");

    const inbox = registry.lookupHandler("agent.inbox");
    assert.equal(inbox.ok, true);
    if (!inbox.ok) return;
    const badUnreadOnly = await inbox.handler.invoke({
      runtime: { sessionId: "session.root" },
      executor: executorFor(runtime),
      input: { unreadOnly: "nope" },
    });
    assert.equal(badUnreadOnly.ok, false);
    assert.equal(badUnreadOnly.error?.code, "INVALID_FIELD_TYPE");

    const badLimit = await inbox.handler.invoke({
      runtime: { sessionId: "session.root" },
      executor: executorFor(runtime),
      input: { limit: -1 },
    });
    assert.equal(badLimit.ok, false);
    assert.equal(badLimit.error?.code, "INVALID_FIELD_VALUE");

    const message = registry.lookupHandler("agent.message");
    assert.equal(message.ok, true);
    if (!message.ok) return;
    const badPart = await message.handler.invoke({
      runtime: { sessionId: "session.root" },
      executor: executorFor(runtime),
      input: { toSessionId: "session.root", parts: [{}] },
    });
    assert.equal(badPart.ok, false);
    assert.equal(badPart.error?.code, "INVALID_FIELD_TYPE");
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test("project multiagent runtime seeds the default project session for immediate spawn", async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "praxis-mesh-"));
  try {
    const projectRuntime = {
      project: {
        projectId: "project.mesh",
        mainWorkspaceRoot: workspaceRoot,
        defaultSessionId: "session.default",
        defaultAgentId: "agent.default",
      },
      stub: {
        defaultSessionId: "session.default",
        defaultAgentId: "agent.default",
      },
    } as unknown as Parameters<typeof createProjectMultiagentRuntime>[0]["projectRuntime"];
    const runtime = createProjectMultiagentRuntime({ projectRuntime });

    const spawned = await runtime.spawn({
      requesterSessionId: "session.default",
      task: "Seeded session can spawn immediately.",
    });

    assert.equal(spawned.initialMessage.fromSessionId, "session.default");
    assert.equal((await runtime.list()).length, 2);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test("multiagent runtime can ensure application-created sessions before spawn", async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "praxis-mesh-"));
  try {
    const runtime = createInMemoryMultiagentRuntime({
      projectId: "project.mesh",
      workspaceRoot,
      defaultModel: "deepseek-v4-pro",
    });

    const ensured = await runtime.ensureSession({
      sessionId: "direct-session.late",
      agentId: "agent.application.primary",
      workingDirectory: workspaceRoot,
      status: "idle",
      metadata: { source: "application.session" },
      now: "2026-05-27T00:00:00.000Z",
    });
    assert.equal(ensured.sessionId, "direct-session.late");
    assert.equal(ensured.agentId, "agent.application.primary");

    const spawned = await runtime.spawn({
      requesterSessionId: "direct-session.late",
      task: "Review the new session.",
    });
    assert.equal(spawned.initialMessage.fromSessionId, "direct-session.late");
    assert.equal((await runtime.list()).length, 2);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});
