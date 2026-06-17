import assert from "node:assert/strict";
import test from "node:test";

import {
  runApplicationMultiagentSmoke,
} from "../../examples/scripts/runtime_application_multiagent_smoke.js";

test("application multiagent smoke drives agent.spawn through the public application facade", async () => {
  const result = await runApplicationMultiagentSmoke({
    now: () => "2026-06-09T00:00:00.000Z",
  });

  assert.equal(result.status, "ok");
  assert.equal(result.view.status, "completed");
  assert.equal(result.view.finalOutput, "application multiagent smoke completed");
  assert.equal(result.view.counters.turns, 1);
  assert.equal(result.view.counters.modelCalls, 2);
  assert.equal(result.view.counters.toolCalls, 1);
  assert.equal(result.providerCalls, 3);
  assert.equal(result.providerToolExposure.exposesExpectedTool, true);
  assert.equal(result.providerToolExposure.expectedProviderName, "praxis_tool_agent_spawn");
  assert.equal(result.toolEvent.toolId, "agent.spawn");
  assert.equal(result.toolEvent.toolStatus, "completed");
  assert.equal(result.toolEvent.childSessionId?.startsWith("agent-session.application-multiagent-smoke."), true);
  assert.equal(result.backgroundRun.childProviderCalled, true);
  assert.equal(result.backgroundRun.childReplyText, "application multiagent child completed");
  assert.equal(result.providerRoundTrip.toolOutputFedBack, true);
  assert.equal(result.providerRoundTrip.callId, "application-multiagent-spawn-call");
  assert.equal(result.providerRoundTrip.outputIncludesChildSession, true);
  assert.equal(result.view.agents.active, 1);
  assert.equal(result.events.includes("tool:agent.spawn:completed"), true);
  assert.equal(result.events.some((event) => event === "runtime:spawned"), true);
  assert.equal(result.events.some((event) => event === "runtime:completed"), true);
  assert.equal(result.events.includes("final"), true);
  assert.equal(result.multiagentReport.applicationCommandKind, "praxis.application.multiagentReport");
  assert.equal(result.multiagentReport.applicationSessionId, "session.application.multiagent-smoke.default");
  assert.equal(result.multiagentReport.kind, "praxis.runtime.multiagent.report");
  assert.equal(result.multiagentReport.status, "ok");
  assert.equal(result.multiagentReport.sourceKind, "application-events");
  assert.equal(result.multiagentReport.childSessionId, result.toolEvent.childSessionId);
  assert.equal(result.multiagentReport.childRuntimeId, result.backgroundRun.childRuntimeId);
  assert.equal(result.multiagentReport.coverage.hasApplicationToolExposure, true);
  assert.equal(result.multiagentReport.coverage.hasApplicationEventPath, true);
  assert.equal(result.multiagentReport.coverage.hasBackgroundRuntime, true);
  assert.equal(result.multiagentReport.coverage.hasReplyCorrelation, true);
  assert.equal(result.multiagentReport.index.totalSessions, 2);
  assert.deepEqual(result.multiagentReport.index.childSessionIds, [result.toolEvent.childSessionId]);
  assert.equal(result.multiagentReport.index.byToolId["agent.spawn"], 1);
  assert.equal(result.multiagentReport.index.byEventKind.spawned, 1);
  assert.equal(result.multiagentReport.index.byEventKind.completed, 1);
  assert.equal(result.multiagentReport.query.returnedSessions, 1);
  assert.equal(result.multiagentReport.query.returnedMessages, 1);
  assert.equal(result.multiagentReport.query.refs.includes("application-multiagent-spawn-call"), true);
  assert.equal(result.multiagentReport.publicSafe, true);
});
