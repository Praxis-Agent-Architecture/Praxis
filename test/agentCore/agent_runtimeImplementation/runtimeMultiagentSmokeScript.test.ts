import assert from "node:assert/strict";
import test from "node:test";

import {
  runRuntimeMultiagentSmoke,
} from "../../../examples/scripts/runtime_multiagent_smoke.js";

test("runtime multiagent smoke proves official bridge and agent baseTool runtime port", async () => {
  const result = await runRuntimeMultiagentSmoke();

  assert.equal(result.status, "ok");
  assert.equal(result.officialBridge.ok, true);
  assert.equal(result.officialBridge.topology, "project-session-mesh");
  assert.deepEqual(result.officialBridge.runtimeMediatedAccess, [
    "spawn",
    "message",
    "inbox",
    "wait",
    "stop",
    "kill",
    "list",
    "inspect",
  ]);
  assert.equal(result.officialBridge.unsafeSideEffects, false);
  assert.equal(result.officialBridge.events.includes("runtime.officialModule.multiagentBridge.planned"), true);

  assert.deepEqual(result.baseTools.mountedToolIds, [
    "agent.spawn",
    "agent.message",
    "agent.inbox",
    "agent.list",
    "agent.inspect",
    "agent.wait",
    "agent.stop",
    "agent.kill",
  ]);
  assert.deepEqual(result.baseTools.invokedToolIds, [
    "agent.spawn",
    "agent.inbox",
    "agent.message",
    "agent.wait",
    "agent.list",
    "agent.inspect",
    "agent.stop",
    "agent.kill",
  ]);
  assert.equal(result.baseTools.runtimePortUsed, true);

  assert.equal(result.mesh.projectLocal, true);
  assert.equal(result.mesh.rootSessionId, "session.root");
  assert.equal(result.mesh.childSessionId.startsWith("agent-session.project.multiagent-smoke."), true);
  assert.equal(result.mesh.initialMessage.toSessionId, result.mesh.childSessionId);
  assert.equal(result.mesh.childInboxBeforeReply, 2);
  assert.equal(result.mesh.waitReplyText, "Docs agent acknowledged runtime-mediated mesh.");
  assert.equal(result.mesh.rootInboxUnreadAfterWait, 1);
  assert.equal(result.mesh.listedSessionCount, 2);
  assert.equal(result.mesh.inspectStatus, "running");
  assert.equal(result.mesh.stoppedStatus, "stopped");
  assert.equal(result.mesh.killedStatus, "killed");
  assert.equal(result.mesh.publicSafeSession, true);
  assert.equal(result.guards.workspaceEscapeRejected, true);

  assert.equal(result.multiagentReport.kind, "praxis.runtime.multiagent.report");
  assert.equal(result.multiagentReport.status, "ok");
  assert.equal(result.multiagentReport.sourceKind, "runtime-smoke");
  assert.equal(result.multiagentReport.childSessionId, result.mesh.childSessionId);
  assert.equal(result.multiagentReport.coverage.hasOfficialBridge, true);
  assert.equal(result.multiagentReport.coverage.hasRuntimeMediatedAccess, true);
  assert.equal(result.multiagentReport.coverage.hasAgentBaseTools, true);
  assert.equal(result.multiagentReport.coverage.hasRuntimePortEvidence, true);
  assert.equal(result.multiagentReport.coverage.hasProjectLocalMesh, true);
  assert.equal(result.multiagentReport.coverage.hasReplyCorrelation, true);
  assert.equal(result.multiagentReport.coverage.hasPublicSafeSessionRead, true);
  assert.equal(result.multiagentReport.coverage.hasWorkspaceGuard, true);
  assert.equal(result.multiagentReport.index.totalSessions, 2);
  assert.deepEqual(result.multiagentReport.index.childSessionIds, [result.mesh.childSessionId]);
  assert.equal(result.multiagentReport.index.byToolId["agent.spawn"], 1);
  assert.equal(result.multiagentReport.query.returnedSessions, 1);
  assert.equal(result.multiagentReport.query.returnedMessages, 2);
  assert.equal(result.multiagentReport.publicSafe, true);
});
