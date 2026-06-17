import assert from "node:assert/strict";
import test from "node:test";

import {
  createRuntimeSessionReport,
} from "../../../../src/runtimeImplementation/runtime.sessionPlane/index.js";
import type {
  PraxisFoundationProjectSnapshot,
  PraxisFoundationSessionSnapshot,
} from "../../../../src/runtimeImplementation/runtime.projectPlane/projectStore.js";

function foundationSnapshot(): PraxisFoundationSessionSnapshot {
  return {
    session: {
      sessionId: "session.report.fork",
      projectId: "project.report",
      workspaceId: "workspace.main",
      agentId: "agent.report",
      activeAgentKey: "primary",
      parentSessionId: "session.report",
      forkedFromTurnId: "turn.1",
      status: "idle",
      title: "Session report fork",
      createdAt: "2026-06-09T00:00:00.000Z",
      updatedAt: "2026-06-09T00:00:01.000Z",
      metadata: {
        source: "application.rewind",
        forkedFromSessionId: "session.report",
        forkedFromTurnId: "turn.1",
        accessToken: "secret-session-token",
      },
    },
    bindings: [{
      bindingId: "binding.report",
      projectId: "project.report",
      sessionId: "session.report.fork",
      agentId: "agent.report",
      agentKey: "primary",
      createdAt: "2026-06-09T00:00:00.000Z",
      reason: "fork",
      metadata: { credential: "secret-binding" },
    }],
    turns: [{
      turnId: "turn.1",
      projectId: "project.report",
      sessionId: "session.report.fork",
      turnIndex: 1,
      createdAt: "2026-06-09T00:00:00.000Z",
      checkpoint: true,
      metadata: {
        sourceSessionId: "session.report",
        sourceTurnId: "turn.1",
        apiKey: "secret-turn",
      },
    }, {
      turnId: "turn.3",
      projectId: "project.report",
      sessionId: "session.report.fork",
      turnIndex: 3,
      createdAt: "2026-06-09T00:00:03.000Z",
      checkpoint: true,
      metadata: { source: "application.submitTurn" },
    }],
    messages: [{
      messageId: "message.user.1",
      projectId: "project.report",
      sessionId: "session.report.fork",
      turnId: "turn.1",
      role: "user",
      text: "private first user text",
      createdAt: "2026-06-09T00:00:00.000Z",
      artifactRefs: ["artifact.input.1"],
      metadata: {
        sourceSessionId: "session.report",
        sourceMessageId: "message.source.user.1",
        sourceTurnId: "turn.1",
        password: "secret-message",
      },
    }, {
      messageId: "message.assistant.1",
      projectId: "project.report",
      sessionId: "session.report.fork",
      turnId: "turn.1",
      role: "assistant",
      text: "private first assistant text",
      createdAt: "2026-06-09T00:00:01.000Z",
      artifactRefs: [],
      metadata: {
        sourceSessionId: "session.report",
        sourceMessageId: "message.source.assistant.1",
        sourceTurnId: "turn.1",
      },
    }, {
      messageId: "message.user.3",
      projectId: "project.report",
      sessionId: "session.report.fork",
      turnId: "turn.3",
      role: "user",
      text: "private third user text",
      createdAt: "2026-06-09T00:00:03.000Z",
      artifactRefs: [],
      metadata: {},
    }],
    summaries: [{
      summaryId: "summary.report",
      projectId: "project.report",
      sessionId: "session.report.fork",
      text: "private summary text",
      source: "application",
      compactedUntilTurnId: "turn.1",
      sourceSessionId: "session.report",
      sourceTurnId: "turn.1",
      updatedAt: "2026-06-09T00:00:02.000Z",
      metadata: { authorization: "Bearer secret-summary" },
    }],
    artifacts: [{
      artifactId: "artifact.input.1",
      projectId: "project.report",
      sessionId: "session.report.fork",
      kind: "text",
      uri: "memory://artifact.input.1",
      createdAt: "2026-06-09T00:00:00.000Z",
      metadata: { token: "secret-artifact" },
    }],
  };
}

function projectSnapshot(): PraxisFoundationProjectSnapshot {
  return {
    project: {
      projectId: "project.report",
      kind: "chat",
      name: "Report Project",
      mainWorkspaceRoot: "/tmp/project.report",
      createdAt: "2026-06-09T00:00:00.000Z",
      updatedAt: "2026-06-09T00:00:00.000Z",
      defaultSessionId: "session.report",
      defaultAgentId: "agent.report",
      metadata: {},
    },
    workspaces: [{
      workspaceId: "workspace.main",
      projectId: "project.report",
      root: "/tmp/project.report",
      role: "main",
      createdAt: "2026-06-09T00:00:00.000Z",
      metadata: {},
    }],
    sessions: [{
      sessionId: "session.report.fork",
      projectId: "project.report",
      workspaceId: "workspace.main",
      agentId: "agent.report",
      parentSessionId: "session.report",
      forkedFromTurnId: "turn.1",
      status: "idle",
      createdAt: "2026-06-09T00:00:00.000Z",
      updatedAt: "2026-06-09T00:00:00.000Z",
      metadata: {},
    }],
    leases: [{
      leaseId: "lease.report",
      projectId: "project.report",
      ownerId: "unit-test",
      acquiredAt: "2026-06-09T00:00:00.000Z",
      heartbeatAt: "2026-06-09T00:00:00.000Z",
      expiresAt: "2026-06-09T00:10:00.000Z",
      status: "active",
      metadata: {},
    }],
    artifacts: [],
  };
}

test("runtime session report summarizes foundation session facts without owning mutation flow", () => {
  const report = createRuntimeSessionReport({
    sourceKind: "in-memory",
    foundationSnapshot: foundationSnapshot(),
    projectSnapshot: projectSnapshot(),
  });

  assert.equal(report.kind, "praxis.runtime.session.report");
  assert.equal(report.publicSafe, true);
  assert.equal(report.sourceKind, "in-memory");
  assert.equal(report.session.sessionId, "session.report.fork");
  assert.equal(report.project.projectId, "project.report");
  assert.equal(report.project.sessionCount, 1);
  assert.deepEqual(report.counts, {
    bindings: 1,
    turns: 2,
    checkpoints: 2,
    messages: 3,
    summaries: 1,
    artifacts: 1,
    projectSessions: 1,
    projectWorkspaces: 1,
    activeLeases: 1,
    copiedMessages: 2,
    copiedTurns: 1,
  });
  assert.equal(report.coverage.hasSession, true);
  assert.equal(report.coverage.hasProject, true);
  assert.equal(report.coverage.hasForkRelation, true);
  assert.equal(report.coverage.hasCopiedConversation, true);
  assert.equal(report.consistency.sessionMatchesProject, true);
  assert.equal(report.consistency.allTurnsBelongToSession, true);
  assert.equal(report.consistency.allMessagesBelongToSession, true);
  assert.equal(report.consistency.messageTurnIdsKnown, true);
  assert.equal(report.consistency.forkSourceRecorded, true);
  assert.equal(report.fork.sourceSessionId, "session.report");
  assert.equal(report.fork.targetSessionId, "session.report.fork");
  assert.equal(report.fork.forkedFromTurnId, "turn.1");
  assert.equal(report.fork.forkKind, "rewind");
  assert.deepEqual(report.fork.copiedTurnIds, ["turn.1"]);
  assert.deepEqual(report.fork.copiedMessageIds, ["message.assistant.1", "message.user.1"]);
  assert.deepEqual(report.turnIds, ["turn.1", "turn.3"]);
  assert.deepEqual(report.checkpointTurnIds, ["turn.1", "turn.3"]);
  assert.deepEqual(report.roleCounts, { assistant: 1, user: 2 });
  assert.deepEqual(report.sourceMessageIds, ["message.source.assistant.1", "message.source.user.1"]);
  assert.deepEqual(report.sourceTurnIds, ["turn.1"]);
  assert.equal(report.turns[0]?.messageCount, 2);
  assert.deepEqual(report.turns[0]?.messageRoles, ["assistant", "user"]);
  assert.equal(report.messages[0]?.role, "user");
  assert.equal(Object.hasOwn(report.messages[0] ?? {}, "text"), false);

  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes("private first user text"), false);
  assert.equal(serialized.includes("private summary text"), false);
  assert.equal(serialized.includes("secret-session-token"), false);
  assert.equal(serialized.includes("secret-binding"), false);
  assert.equal(serialized.includes("secret-turn"), false);
  assert.equal(serialized.includes("secret-message"), false);
  assert.equal(serialized.includes("secret-summary"), false);
  assert.equal(serialized.includes("secret-artifact"), false);
});
