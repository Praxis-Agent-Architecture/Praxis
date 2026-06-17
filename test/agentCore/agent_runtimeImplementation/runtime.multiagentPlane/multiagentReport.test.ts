import assert from "node:assert/strict";
import test from "node:test";

import {
  createRuntimeMultiagentIndex,
  createRuntimeMultiagentReport,
  queryRuntimeMultiagent,
} from "../../../../src/runtimeImplementation/runtime.multiagentPlane/index.js";

test("createRuntimeMultiagentReport normalizes public-safe mesh and application evidence", () => {
  const report = createRuntimeMultiagentReport({
    sourceKind: "test",
    smoke: {
      status: "ok",
      officialBridge: {
        ok: true,
        topology: "project-session-mesh",
        runtimeMediatedAccess: ["spawn", "message", "wait", "inspect"],
        unsafeSideEffects: false,
        events: ["runtime.officialModule.multiagentBridge.planned"],
      },
      baseTools: {
        mountedToolIds: ["agent.spawn", "agent.message", "agent.wait"],
        invokedToolIds: ["agent.spawn", "agent.message", "agent.wait"],
        runtimePortUsed: true,
      },
      mesh: {
        projectLocal: true,
        rootSessionId: "session.root",
        childSessionId: "agent-session.project.child",
        initialMessage: {
          messageId: "agent-message.initial",
          fromSessionId: "session.root",
          toSessionId: "agent-session.project.child",
        },
        waitReplyText: "child reply with secret-token material",
        listedSessionCount: 2,
        inspectStatus: "running",
        publicSafeSession: true,
      },
      guards: { workspaceEscapeRejected: true },
    },
    applicationEvents: [{
      eventId: "agent-session.project.child.multiagent.spawned",
      kind: "runtime",
      status: "running",
      message: "child",
      createdAt: "2026-06-09T00:00:00.000Z",
      sessionId: "session.root",
      publicSafe: true,
      metadata: {
        childSessionId: "agent-session.project.child",
        childAgentId: "agent.child",
        childLifecycle: "oneshot",
        accessToken: "secret-event",
      },
    }, {
      eventId: "agent-session.project.child.multiagent.completed",
      kind: "runtime",
      status: "completed",
      message: "child",
      createdAt: "2026-06-09T00:00:00.000Z",
      sessionId: "session.root",
      publicSafe: true,
      metadata: {
        childSessionId: "agent-session.project.child",
      },
    }],
    applicationFacts: {
      providerToolExposure: {
        expectedProviderName: "praxis_tool_agent_spawn",
        exposesExpectedTool: true,
        exposedProviderNames: ["praxis_tool_agent_spawn"],
        toolCount: 1,
      },
      providerRoundTrip: {
        toolOutputFedBack: true,
        callId: "call.spawn",
        outputIncludesChildSession: true,
        secondProviderInputItems: 2,
      },
      backgroundRun: {
        childProviderCalled: true,
        childRuntimeId: "runtime.parent.multiagent.child",
        childReplyText: "background reply with password-value",
      },
      toolEvent: {
        toolId: "agent.spawn",
        toolStatus: "completed",
        childSessionId: "agent-session.project.child",
        familyKey: "agent",
      },
    },
  });

  assert.equal(report.kind, "praxis.runtime.multiagent.report");
  assert.equal(report.publicSafe, true);
  assert.equal(report.status, "ok");
  assert.equal(report.counts.childSessions, 1);
  assert.equal(report.counts.spawnedEvents, 1);
  assert.equal(report.counts.completedEvents, 1);
  assert.equal(report.coverage.hasOfficialBridge, true);
  assert.equal(report.coverage.hasRuntimeMediatedAccess, true);
  assert.equal(report.coverage.hasAgentBaseTools, true);
  assert.equal(report.coverage.hasRuntimePortEvidence, true);
  assert.equal(report.coverage.hasProjectLocalMesh, true);
  assert.equal(report.coverage.hasReplyCorrelation, true);
  assert.equal(report.coverage.hasPublicSafeSessionRead, true);
  assert.equal(report.coverage.hasWorkspaceGuard, true);
  assert.equal(report.coverage.hasApplicationToolExposure, true);
  assert.equal(report.coverage.hasApplicationEventPath, true);
  assert.equal(report.coverage.hasBackgroundRuntime, true);
  assert.equal(report.session.childRuntimeId, "runtime.parent.multiagent.child");
  assert.equal(report.sessions.find((session) => session.role === "child")?.lifecycle, "oneshot");
  assert.equal(report.messages.some((message) => message.correlationRole === "reply"), true);
  assert.equal(JSON.stringify(report).includes("secret-token"), false);
  assert.equal(JSON.stringify(report).includes("password-value"), false);
  assert.equal(JSON.stringify(report).includes("secret-event"), false);

  const index = createRuntimeMultiagentIndex(report);
  assert.equal(index.totalSessions, 2);
  assert.equal(index.byToolId["agent.spawn"], 1);
  assert.equal(index.byEventKind.spawned, 1);
  assert.equal(index.byEventKind.completed, 1);
  assert.deepEqual(index.childSessionIds, ["agent-session.project.child"]);

  const query = queryRuntimeMultiagent({
    report,
    query: { sessionId: "agent-session.project.child", limit: 5 },
  });
  assert.equal(query.returnedSessions, 1);
  assert.equal(query.returnedMessages, 3);
  assert.equal(query.refs.includes("agent-session.project.child"), true);
});

test("queryRuntimeMultiagent can select tool and event refs without executing agents", () => {
  const report = createRuntimeMultiagentReport({
    applicationEvents: [{
      eventId: "agent-session.project.child.multiagent.spawned",
      kind: "runtime",
      status: "running",
      message: "child",
      createdAt: "2026-06-09T00:00:00.000Z",
      publicSafe: true,
      metadata: { childSessionId: "agent-session.project.child" },
    }, {
      eventId: "turn.1.tool.spawn.completed",
      kind: "tool",
      status: "completed",
      message: "agent.spawn completed",
      createdAt: "2026-06-09T00:00:00.000Z",
      publicSafe: true,
      metadata: { toolId: "agent.spawn", toolStatus: "completed" },
    }],
    applicationFacts: {
      providerRoundTrip: { toolOutputFedBack: true, callId: "call.spawn" },
      toolEvent: { toolId: "agent.spawn", childSessionId: "agent-session.project.child" },
    },
  });

  assert.equal(report.status, "unknown");
  const toolQuery = queryRuntimeMultiagent({
    report,
    query: { toolId: "agent.spawn", eventKind: "spawned" },
  });
  assert.equal(toolQuery.refs.includes("agent.spawn"), true);
  assert.equal(toolQuery.refs.includes("agent-session.project.child.multiagent.spawned"), true);
});
