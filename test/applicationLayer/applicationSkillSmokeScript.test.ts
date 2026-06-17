import assert from "node:assert/strict";
import test from "node:test";

import {
  runApplicationSkillSmoke,
} from "../../examples/scripts/runtime_application_skill_smoke.js";

test("application skill smoke loads skill evidence through application-owned BaseTool adapter", async () => {
  const result = await runApplicationSkillSmoke({
    now: () => "2026-06-08T00:00:00.000Z",
  });

  assert.equal(result.status, "ok");
  assert.equal(result.view.status, "completed");
  assert.equal(result.view.finalOutput, "application skill smoke completed");
  assert.equal(result.view.counters.turns, 1);
  assert.equal(result.view.counters.modelCalls, 2);
  assert.equal(result.view.counters.toolCalls, 1);
  assert.equal(result.adapter.requestName, "application.skill.runtimeMount");
  assert.equal(result.providerRoundTrip.toolOutputFedBack, true);
  assert.equal(result.providerRoundTrip.callId, "application-skill-smoke-call");
  assert.equal(result.providerRoundTrip.outputIncludesSkillSummary, true);
  assert.equal(result.providerToolExposure.exposesExpectedTool, true);
  assert.equal(result.providerToolExposure.expectedProviderName, "praxis_tool_skill_load");
  assert.equal(result.toolEvent.toolId, "skill.load");
  assert.equal(result.toolEvent.toolStatus, "completed");
  assert.equal(result.toolEvent.skillName, "application.skill.runtimeMount");
  assert.equal(result.toolEvent.familyKey, "skill");
  assert.equal(result.events.includes("tool:skill.load:completed"), true);
  assert.equal(result.events.includes("final"), true);
  assert.equal(result.officialAdapterReport.kind, "praxis.runtime.officialAdapter.report");
  assert.equal(result.officialAdapterReport.status, "ok");
  assert.equal(result.officialAdapterReport.sourceKind, "application-events");
  assert.equal(result.officialAdapterReport.coverage.hasProviderToolExposure, true);
  assert.equal(result.officialAdapterReport.coverage.hasProviderRoundTrip, true);
  assert.equal(result.officialAdapterReport.coverage.hasCompletedToolEvents, true);
  assert.equal(result.officialAdapterReport.index.totalAdapters, 1);
  assert.equal(result.officialAdapterReport.index.byFamilyKey.skill, 1);
  assert.equal(result.officialAdapterReport.index.byToolId["skill.load"], 1);
  assert.equal(result.officialAdapterReport.index.byStatus.ok, 1);
  assert.deepEqual(result.officialAdapterReport.index.completedToolIds, ["skill.load"]);
  assert.equal(result.officialAdapterReport.query.returnedAdapters, 1);
  assert.equal(result.officialAdapterReport.query.refs.includes("skill.load"), true);
  assert.equal(result.officialAdapterReport.publicSafe, true);
});
