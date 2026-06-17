import assert from "node:assert/strict";
import test from "node:test";

import { createMainLoopStepRecord } from "../../../../src/executionEngine/coreLogic/mainLoop.js";
import {
  createRuntimeTimelineIndex,
  createRuntimeTimelineReport,
  createRuntimeTimelineReplayPlan,
  queryRuntimeTimeline,
} from "../../../../src/runtimeImplementation/runtime.timelinePlane/index.js";
import type {
  PraxisFoundationSessionSnapshot,
} from "../../../../src/runtimeImplementation/runtime.projectPlane/projectStore.js";
import type { RuntimeSessionSnapshot } from "../../../../src/runtimeImplementation/runtimeSessionStateEventStore.js";

function snapshot(): RuntimeSessionSnapshot {
  return {
    session: {
      sessionId: "session.timeline",
      runtimeId: "runtime.timeline",
      agentId: "agent.timeline",
      manifestHash: "hash.timeline",
      createdAt: "2026-06-09T00:00:00.000Z",
      status: "completed",
    metadata: { manifestId: "manifest.timeline" },
    },
    states: [{
      sessionId: "session.timeline",
      stateId: "state.ready",
      phase: "ready",
      createdAt: "2026-06-09T00:00:01.000Z",
      metadata: { turnId: "turn.1", accessToken: "state-secret-token" },
    }],
    events: [{
      sessionId: "session.timeline",
      eventId: "event.session.created",
      type: "runtime.session.created",
      createdAt: "2026-06-09T00:00:02.000Z",
      payload: { publicSafe: true, turnId: "turn.1", apiKey: "event-secret-key" },
    }, {
      sessionId: "session.timeline",
      eventId: "event.final",
      type: "runtime.output.final",
      createdAt: "2026-06-09T00:00:06.000Z",
      payload: { publicSafe: true, outputRef: "final.1" },
    }],
    invocations: [{
      sessionId: "session.timeline",
      invocationId: "model.1",
      kind: "model",
      target: "carrier.timeline",
      ok: true,
      createdAt: "2026-06-09T00:00:03.000Z",
      summary: { provider: "openai", credential: { password: "nested-secret" } },
    }],
    mainLoopSteps: [
      createMainLoopStepRecord({
        sessionId: "session.timeline",
        turnIndex: 1,
        stepIndex: 1,
        actionPrimitive: "lowerPrompt",
        status: "completed",
        outputRefs: ["prompt.1"],
        now: "2026-06-09T00:00:04.000Z",
      }),
      createMainLoopStepRecord({
        sessionId: "session.timeline",
        turnIndex: 1,
        stepIndex: 2,
        actionPrimitive: "invokeModel",
        status: "completed",
        modelCallId: "model.1",
        inputRefs: ["prompt.1"],
        outputRefs: ["model.1"],
        now: "2026-06-09T00:00:05.000Z",
      }),
    ],
    procedures: [],
    approvals: [],
    errors: [{
      sessionId: "session.timeline",
      errorId: "error.public",
      code: "PUBLIC_SAFE_WARNING",
      message: "warning retained for timeline",
      boundary: "runtime-state",
      createdAt: "2026-06-09T00:00:07.000Z",
      metadata: { publicSafe: true, authorization: "Bearer secret" },
      publicSafe: true,
    }],
  };
}

test("runtime timeline report normalizes a durable session snapshot", () => {
  const report = createRuntimeTimelineReport({
    sourceKind: "sqlite",
    snapshot: snapshot(),
  });

  assert.equal(report.kind, "praxis.runtime.timeline.report");
  assert.equal(report.publicSafe, true);
  assert.equal(report.sourceKind, "sqlite");
  assert.equal(report.session.sessionId, "session.timeline");
  assert.equal(report.session.status, "completed");
  assert.deepEqual(report.counts, {
    states: 1,
    events: 2,
    invocations: 1,
    mainLoopSteps: 2,
    procedures: 0,
    approvals: 0,
    errors: 1,
    checkpoints: 0,
    sessionForks: 0,
    timelineItems: 8,
  });
  assert.equal(report.coverage.hasSession, true);
  assert.equal(report.coverage.hasRuntimeEvents, true);
  assert.equal(report.coverage.hasInvocations, true);
  assert.equal(report.coverage.hasMainLoopSteps, true);
  assert.equal(report.coverage.hasPublicSafeErrors, true);
  assert.equal(report.coverage.hasCheckpoints, false);
  assert.equal(report.coverage.hasSessionForks, false);
  assert.deepEqual(report.checkpointTurnIds, []);
  assert.deepEqual(report.eventTypes, ["runtime.output.final", "runtime.session.created"]);
  assert.deepEqual(report.invocationKinds, ["model"]);
  assert.deepEqual(report.mainLoopActions, ["invokeModel", "lowerPrompt"]);
  assert.deepEqual(report.errorCodes, ["PUBLIC_SAFE_WARNING"]);
  assert.equal(report.timelineItems[0]?.itemKind, "session");
  assert.equal(report.timelineItems.at(-1)?.itemKind, "error");
  assert.equal(report.timelineItems.some((item) =>
    item.itemKind === "mainLoopStep" &&
    item.label === "lowerPrompt" &&
    item.refs.includes("prompt.1")
  ), true);
  assert.equal(report.timelineItems.some((item) =>
    item.itemKind === "invocation" &&
    item.label === "model: carrier.timeline" &&
    item.status === "completed"
  ), true);
  const stateItem = report.timelineItems.find((item) => item.itemKind === "state");
  assert.equal(stateItem?.metadata.accessToken, "[redacted]");
  const eventItem = report.timelineItems.find((item) => item.itemKind === "event" && item.label === "runtime.session.created");
  assert.equal(eventItem?.metadata.apiKey, "[redacted]");
  const invocationItem = report.timelineItems.find((item) => item.itemKind === "invocation");
  assert.equal(invocationItem?.metadata.credential, "[redacted]");
  const errorItem = report.timelineItems.find((item) => item.itemKind === "error");
  assert.equal(errorItem?.metadata.authorization, "[redacted]");
});

function foundationSnapshot(): PraxisFoundationSessionSnapshot {
  return {
    session: {
      sessionId: "session.timeline.rewind",
      projectId: "project.timeline",
      workspaceId: "workspace.main",
      agentId: "agent.timeline",
      parentSessionId: "session.timeline",
      forkedFromTurnId: "turn.1",
      status: "idle",
      title: "timeline rewind",
      createdAt: "2026-06-09T00:00:08.000Z",
      updatedAt: "2026-06-09T00:00:08.000Z",
      metadata: {
        source: "application.rewind",
        forkedFromSessionId: "session.timeline",
        forkedFromTurnId: "turn.1",
      },
    },
    bindings: [{
      bindingId: "binding.rewind",
      projectId: "project.timeline",
      sessionId: "session.timeline.rewind",
      agentId: "agent.timeline",
      createdAt: "2026-06-09T00:00:08.000Z",
      reason: "fork",
      metadata: {},
    }],
    turns: [{
      turnId: "turn.1",
      projectId: "project.timeline",
      sessionId: "session.timeline.rewind",
      turnIndex: 1,
      createdAt: "2026-06-09T00:00:08.000Z",
      checkpoint: true,
      metadata: {
        sourceSessionId: "session.timeline",
        sourceTurnId: "turn.1",
      },
    }, {
      turnId: "turn.3",
      projectId: "project.timeline",
      sessionId: "session.timeline.rewind",
      turnIndex: 3,
      createdAt: "2026-06-09T00:00:09.000Z",
      checkpoint: true,
      metadata: {
        source: "application.submitTurn",
      },
    }],
    messages: [{
      messageId: "message.user.1",
      projectId: "project.timeline",
      sessionId: "session.timeline.rewind",
      turnId: "turn.1",
      role: "user",
      text: "first user request",
      createdAt: "2026-06-09T00:00:08.000Z",
      artifactRefs: ["artifact.input.1"],
      metadata: {
        sourceSessionId: "session.timeline",
        sourceMessageId: "message.source.user.1",
      },
    }, {
      messageId: "message.assistant.1",
      projectId: "project.timeline",
      sessionId: "session.timeline.rewind",
      turnId: "turn.1",
      role: "assistant",
      text: "first answer",
      createdAt: "2026-06-09T00:00:08.000Z",
      artifactRefs: [],
      metadata: {
        sourceSessionId: "session.timeline",
        sourceMessageId: "message.source.assistant.1",
      },
    }, {
      messageId: "message.user.3",
      projectId: "project.timeline",
      sessionId: "session.timeline.rewind",
      turnId: "turn.3",
      role: "user",
      text: "third user request",
      createdAt: "2026-06-09T00:00:09.000Z",
      artifactRefs: [],
      metadata: {},
    }],
    summaries: [{
      summaryId: "summary.rewind",
      projectId: "project.timeline",
      sessionId: "session.timeline.rewind",
      text: "summary through turn.1",
      source: "application",
      compactedUntilTurnId: "turn.1",
      sourceSessionId: "session.timeline",
      sourceTurnId: "turn.1",
      updatedAt: "2026-06-09T00:00:08.000Z",
      metadata: {},
    }],
    artifacts: [],
  };
}

test("runtime timeline report can include foundation checkpoints and rewind fork facts", () => {
  const report = createRuntimeTimelineReport({
    sourceKind: "sqlite",
    snapshot: snapshot(),
    foundationSnapshot: foundationSnapshot(),
  });

  assert.equal(report.coverage.hasFoundationSession, true);
  assert.equal(report.coverage.hasCheckpoints, true);
  assert.equal(report.coverage.hasSessionForks, true);
  assert.equal(report.counts.checkpoints, 2);
  assert.equal(report.counts.sessionForks, 1);
  assert.equal(report.counts.timelineItems, 11);
  assert.deepEqual(report.checkpointTurnIds, ["turn.1", "turn.3"]);
  assert.equal(report.foundation.sessionId, "session.timeline.rewind");
  assert.equal(report.foundation.parentSessionId, "session.timeline");
  assert.equal(report.foundation.forkedFromTurnId, "turn.1");
  assert.equal(report.foundation.checkpointCount, 2);
  assert.equal(report.foundation.messageCount, 3);
  assert.equal(report.foundation.summaryCount, 1);
  assert.equal(report.foundation.sessionForkCount, 1);
  assert.equal(report.sessionForks[0]?.sourceSessionId, "session.timeline");
  assert.equal(report.sessionForks[0]?.targetSessionId, "session.timeline.rewind");
  assert.equal(report.sessionForks[0]?.checkpointTurnId, "turn.1");
  assert.equal(report.sessionForks[0]?.forkKind, "rewind");
  assert.equal(report.checkpoints[0]?.turnId, "turn.1");
  assert.equal(report.checkpoints[0]?.sourceSessionId, "session.timeline");
  assert.equal(report.checkpoints[0]?.messageCount, 2);
  assert.deepEqual(report.checkpoints[0]?.messageRoles, ["assistant", "user"]);
  assert.equal(report.timelineItems.some((item) =>
    item.itemKind === "sessionFork" &&
    item.refs.includes("session.timeline") &&
    item.refs.includes("session.timeline.rewind") &&
    item.refs.includes("turn.1") &&
    item.metadata.forkKind === "rewind"
  ), true);
  assert.equal(report.timelineItems.some((item) =>
    item.itemKind === "checkpoint" &&
    item.label === "turn.3" &&
    item.status === "checkpoint"
  ), true);
});

test("runtime timeline checkpoint items expose public-safe conversation and rewind relationships", () => {
  const report = createRuntimeTimelineReport({
    sourceKind: "sqlite",
    snapshot: snapshot(),
    foundationSnapshot: foundationSnapshot(),
  });

  const rewindCheckpoint = report.checkpoints.find((checkpoint) => checkpoint.turnId === "turn.1");
  assert.equal(rewindCheckpoint?.sourceSessionId, "session.timeline");
  assert.deepEqual(rewindCheckpoint?.messageIds, ["message.user.1", "message.assistant.1"]);
  assert.deepEqual(rewindCheckpoint?.summaryIds, ["summary.rewind"]);
  assert.deepEqual(rewindCheckpoint?.artifactRefs, ["artifact.input.1"]);
  assert.deepEqual(rewindCheckpoint?.sourceMessageIds, [
    "message.source.user.1",
    "message.source.assistant.1",
  ]);
  assert.deepEqual(rewindCheckpoint?.sourceTurnIds, ["turn.1"]);

  const checkpointItem = report.timelineItems.find((item) => item.itemId === "checkpoint:session.timeline.rewind:turn.1");
  assert.equal(checkpointItem?.metadata.relationKind, "checkpoint");
  assert.deepEqual(checkpointItem?.metadata.messageIds, ["message.user.1", "message.assistant.1"]);
  assert.deepEqual(checkpointItem?.metadata.summaryIds, ["summary.rewind"]);
  assert.deepEqual(checkpointItem?.metadata.artifactRefs, ["artifact.input.1"]);
  assert.deepEqual(checkpointItem?.metadata.sourceMessageIds, [
    "message.source.user.1",
    "message.source.assistant.1",
  ]);
  assert.deepEqual(checkpointItem?.metadata.sourceTurnIds, ["turn.1"]);
  assert.equal(checkpointItem?.refs.includes("message.user.1"), true);
  assert.equal(checkpointItem?.refs.includes("summary.rewind"), true);
  assert.equal(checkpointItem?.refs.includes("artifact.input.1"), true);
  assert.equal(checkpointItem?.refs.includes("message.source.user.1"), true);
});

test("runtime timeline query, index, and replay plan stay read-only", () => {
  const report = createRuntimeTimelineReport({
    sourceKind: "foundation-memory",
    snapshot: snapshot(),
    foundationSnapshot: foundationSnapshot(),
  });

  const index = createRuntimeTimelineIndex(report);
  assert.equal(index.kind, "praxis.runtime.timeline.index");
  assert.equal(index.publicSafe, true);
  assert.equal(index.totalItems, report.timelineItems.length);
  assert.equal(index.byItemKind.checkpoint, 2);
  assert.equal(index.byItemKind.sessionFork, 1);
  assert.equal(index.byTurnId["turn.1"], 4);
  assert.equal(index.byRef["message.user.1"], 1);
  assert.deepEqual(index.checkpointTurnIds, ["turn.1", "turn.3"]);
  assert.deepEqual(index.sessionForkIds, ["sessionFork:session.timeline:session.timeline.rewind"]);

  const checkpointQuery = queryRuntimeTimeline({
    report,
    query: {
      itemKinds: ["checkpoint"],
      turnId: "turn.1",
    },
  });
  assert.equal(checkpointQuery.kind, "praxis.runtime.timeline.queryResult");
  assert.equal(checkpointQuery.totalItems, report.timelineItems.length);
  assert.equal(checkpointQuery.matchedItems, 1);
  assert.equal(checkpointQuery.returnedItems, 1);
  assert.equal(checkpointQuery.timelineItems[0]?.itemId, "checkpoint:session.timeline.rewind:turn.1");

  const limited = queryRuntimeTimeline({
    report,
    query: {
      labelIncludes: "turn.",
      limit: 1,
    },
  });
  assert.equal(limited.matchedItems, 2);
  assert.equal(limited.returnedItems, 1);

  const replayPlan = createRuntimeTimelineReplayPlan({
    report,
    checkpointTurnId: "turn.1",
    targetSessionId: "session.timeline.rewind",
  });
  assert.equal(replayPlan.kind, "praxis.runtime.timeline.replayPlan");
  assert.equal(replayPlan.publicSafe, true);
  assert.equal(replayPlan.status, "ready");
  assert.equal(replayPlan.mode, "read-only-plan");
  assert.equal(replayPlan.sourceSessionId, "session.timeline");
  assert.equal(replayPlan.targetSessionId, "session.timeline.rewind");
  assert.equal(replayPlan.checkpointTurnId, "turn.1");
  assert.equal(replayPlan.checkpointItemId, "checkpoint:session.timeline.rewind:turn.1");
  assert.equal(replayPlan.sessionForkId, "sessionFork:session.timeline:session.timeline.rewind");
  assert.equal(replayPlan.requiredPolicy.execution, "none");
  assert.equal(replayPlan.requiredPolicy.requiresApplicationRewind, true);
  assert.equal(replayPlan.requiredPolicy.requiresConversationPlane, true);
  assert.equal(replayPlan.requiredPolicy.requiresSessionPlane, true);
  assert.deepEqual(replayPlan.replayItemIds, [
    "state:state.ready",
    "event:event.session.created",
    "sessionFork:session.timeline:session.timeline.rewind",
    "checkpoint:session.timeline.rewind:turn.1",
  ]);

  const unavailable = createRuntimeTimelineReplayPlan({
    report,
    checkpointTurnId: "turn.missing",
  });
  assert.equal(unavailable.status, "unavailable");
  assert.equal(unavailable.reason, "checkpoint was not found in timeline report");
});

test("runtime timeline query handles boundaries without widening into storage", () => {
  const report = createRuntimeTimelineReport({
    sourceKind: "foundation-memory",
    snapshot: snapshot(),
    foundationSnapshot: foundationSnapshot(),
  });

  const all = queryRuntimeTimeline({ report });
  assert.equal(all.matchedItems, report.timelineItems.length);
  assert.equal(all.returnedItems, report.timelineItems.length);
  assert.deepEqual(all.timelineItems.map((item) => item.itemId), report.timelineItems.map((item) => item.itemId));

  const timeRange = queryRuntimeTimeline({
    report,
    query: {
      createdAtFrom: "2026-06-09T00:00:03.000Z",
      createdAtTo: "2026-06-09T00:00:05.000Z",
    },
  });
  assert.deepEqual(timeRange.timelineItems.map((item) => item.itemId), [
    "invocation:model.1",
    "mainLoopStep:session.timeline:turn:1:step:1:lowerPrompt",
    "mainLoopStep:session.timeline:turn:1:step:2:invokeModel",
  ]);

  const statusAndRef = queryRuntimeTimeline({
    report,
    query: {
      status: "completed",
      ref: "model.1",
    },
  });
  assert.deepEqual(statusAndRef.timelineItems.map((item) => item.itemId), [
    "invocation:model.1",
    "mainLoopStep:session.timeline:turn:1:step:2:invokeModel",
  ]);

  const zeroLimit = queryRuntimeTimeline({
    report,
    query: { limit: 0 },
  });
  assert.equal(zeroLimit.matchedItems, report.timelineItems.length);
  assert.equal(zeroLimit.returnedItems, 0);

  const negativeLimit = queryRuntimeTimeline({
    report,
    query: { limit: -1 },
  });
  assert.equal(negativeLimit.returnedItems, 0);

  const fractionalLimit = queryRuntimeTimeline({
    report,
    query: { limit: 1.9 },
  });
  assert.equal(fractionalLimit.returnedItems, 1);

  const infiniteLimit = queryRuntimeTimeline({
    report,
    query: { limit: Infinity },
  });
  assert.equal(infiniteLimit.returnedItems, report.timelineItems.length);
});
