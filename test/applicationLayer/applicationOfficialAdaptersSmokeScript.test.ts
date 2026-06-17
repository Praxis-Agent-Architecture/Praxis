import assert from "node:assert/strict";
import test from "node:test";

import {
  runApplicationOfficialAdaptersSmoke,
} from "../../examples/scripts/runtime_application_official_adapters_smoke.js";

test("application official adapters smoke mounts context, MCP, and skill in one runtime turn", async () => {
  const result = await runApplicationOfficialAdaptersSmoke({
    now: () => "2026-06-08T00:00:00.000Z",
  });

  assert.equal(result.status, "ok");
  assert.equal(result.view.status, "completed");
  assert.equal(result.view.finalOutput, "application official adapters smoke completed");
  assert.equal(result.view.counters.turns, 1);
  assert.equal(result.view.counters.modelCalls, 4);
  assert.equal(result.view.counters.toolCalls, 3);
  assert.equal(result.providerCalls, 4);
  assert.deepEqual(result.adapter.callOrder, ["context.load", "mcp.resources", "skill.load"]);
  assert.equal(result.adapter.context.calls, 1);
  assert.equal(result.adapter.mcp.calls, 1);
  assert.equal(result.adapter.skill.calls, 1);
  assert.equal(result.providerRoundTrip.contextOutputFedBack, true);
  assert.equal(result.providerRoundTrip.mcpOutputFedBack, true);
  assert.equal(result.providerRoundTrip.skillOutputFedBack, true);
  assert.equal(result.providerRoundTrip.contextOutputIncludesMaterial, true);
  assert.equal(result.providerRoundTrip.mcpOutputIncludesResource, true);
  assert.equal(result.providerRoundTrip.skillOutputIncludesSummary, true);
  assert.deepEqual(result.providerRoundTrip.callIds, [
    "application-official-adapters-context-call",
    "application-official-adapters-mcp-call",
    "application-official-adapters-skill-call",
  ]);
  assert.equal(result.providerToolExposure.exposesContextTool, true);
  assert.equal(result.providerToolExposure.exposesMcpTool, true);
  assert.equal(result.providerToolExposure.exposesSkillTool, true);
  assert.deepEqual(result.toolEvents.completedToolIds, ["context.load", "mcp.resources", "skill.load"]);
  assert.equal(result.toolEvents.familyKeys.includes("context"), true);
  assert.equal(result.toolEvents.familyKeys.includes("mcp"), true);
  assert.equal(result.toolEvents.familyKeys.includes("skill"), true);
  assert.equal(result.events.includes("final"), true);
  assert.equal(result.officialAdapterReport.kind, "praxis.runtime.officialAdapter.report");
  assert.equal(result.officialAdapterReport.status, "ok");
  assert.equal(result.officialAdapterReport.sourceKind, "application-events");
  assert.equal(result.officialAdapterReport.applicationCommand.kind, "praxis.application.officialAdapterReport");
  assert.equal(result.officialAdapterReport.applicationCommand.sessionId.startsWith("session.application.official-adapters-smoke"), true);
  assert.equal(result.officialAdapterReport.applicationCommand.runtimeId, "runtime.application.official-adapters-smoke");
  assert.deepEqual(result.officialAdapterReport.composition.callOrder, ["context.load", "mcp.resources", "skill.load"]);
  assert.deepEqual(result.officialAdapterReport.composition.expectedCallOrder, ["context.load", "mcp.resources", "skill.load"]);
  assert.equal(result.officialAdapterReport.composition.orderMatches, true);
  assert.equal(result.officialAdapterReport.coverage.hasCompositionOrder, true);
  assert.equal(result.officialAdapterReport.coverage.compositionOrderMatches, true);
  assert.equal(result.officialAdapterReport.coverage.hasProviderToolExposure, true);
  assert.equal(result.officialAdapterReport.coverage.hasProviderRoundTrip, true);
  assert.equal(result.officialAdapterReport.coverage.hasCompletedToolEvents, true);
  assert.equal(result.officialAdapterReport.index.totalAdapters, 3);
  assert.equal(result.officialAdapterReport.index.byFamilyKey.context, 1);
  assert.equal(result.officialAdapterReport.index.byFamilyKey.mcp, 1);
  assert.equal(result.officialAdapterReport.index.byFamilyKey.skill, 1);
  assert.equal(result.officialAdapterReport.index.byToolId["context.load"], 1);
  assert.equal(result.officialAdapterReport.index.byToolId["mcp.resources"], 1);
  assert.equal(result.officialAdapterReport.index.byToolId["skill.load"], 1);
  assert.equal(result.officialAdapterReport.index.byStatus.ok, 3);
  assert.deepEqual(result.officialAdapterReport.index.completedToolIds, ["context.load", "mcp.resources", "skill.load"]);
  assert.equal(result.officialAdapterReport.query.returnedAdapters, 1);
  assert.equal(result.officialAdapterReport.query.refs.includes("mcp.resources"), true);
  assert.equal(result.officialAdapterReport.publicSafe, true);
  assert.equal(result.officialAdapterMountMatrix.kind, "praxis.application.officialAdapterMountMatrix");
  assert.equal(result.officialAdapterMountMatrix.runtimeSurface, "runtime.officialAdapterPlane.mountMatrix");
  assert.equal(result.officialAdapterMountMatrix.status, "ready");
  assert.deepEqual(result.officialAdapterMountMatrix.toolIds, ["context.load", "mcp.resources", "skill.load"]);
  assert.deepEqual([...new Set(result.officialAdapterMountMatrix.evidenceStatuses)], ["executor-backed"]);
  assert.equal(result.officialAdapterMountMatrix.readyAdapters, 3);
  assert.equal(result.officialAdapterMountMatrix.missingPorts, 0);
  assert.equal(result.officialAdapterMountMatrix.declaredOnlyPorts, 0);
  assert.equal(result.officialAdapterMountMatrix.executesAdapters, false);
  assert.equal(result.officialAdapterMountMatrix.inspectedBeforeSubmitTurn, true);
  assert.equal(result.officialAdapterMountMatrix.publicSafe, true);
});
