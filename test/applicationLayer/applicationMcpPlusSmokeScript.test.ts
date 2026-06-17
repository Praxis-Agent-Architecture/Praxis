import assert from "node:assert/strict";
import test from "node:test";

import {
  runApplicationMcpPlusSmoke,
} from "../../examples/scripts/runtime_application_mcp_plus_smoke.js";

test("application MCP+ smoke initializes profile and refreshes dynamic tools through application runtime", async () => {
  const result = await runApplicationMcpPlusSmoke({
    now: () => "2026-06-08T00:00:00.000Z",
  });

  assert.equal(result.status, "ok");
  assert.equal(result.view.status, "completed");
  assert.equal(result.view.finalOutput, "application MCP+ smoke completed");
  assert.equal(result.providerCalls, 3);
  assert.equal(result.view.counters.toolCalls, 2);
  assert.equal(result.mcpAdapter.listToolsCalls >= 1, true);
  assert.equal(result.mcpAdapter.callCalls, 1);
  assert.equal(result.mcpAdapter.calledToolName, "browser.open");
  assert.equal(result.profileStore.profileSaved, true);
  assert.equal(result.profileStore.schemaVersion, "mcp-plus.profile.v1");
  assert.equal(result.providerToolExposure.firstCallExposesInit, true);
  assert.equal(result.providerToolExposure.secondCallExposesInit, false);
  assert.equal(result.providerToolExposure.secondCallExposesPinnedTool, true);
  assert.deepEqual(result.toolEvents.completedToolIds, [
    "mcp.browser-plus.mcp_plus.init",
    "mcp.browser-plus.browser.open",
  ]);
  assert.equal(result.providerRoundTrip.initOutputFedBack, true);
  assert.equal(result.providerRoundTrip.dynamicToolOutputFedBack, true);
  assert.equal(result.providerRoundTrip.dynamicToolOutputIncludesCallResult, true);
  assert.equal(result.events.includes("final"), true);
  assert.equal(result.officialAdapterReport.kind, "praxis.runtime.officialAdapter.report");
  assert.equal(result.officialAdapterReport.status, "ok");
  assert.equal(result.officialAdapterReport.sourceKind, "application-events");
  assert.equal(result.officialAdapterReport.coverage.hasMcpPlusProfileRefresh, true);
  assert.equal(result.officialAdapterReport.coverage.hasMcpPlusDynamicTool, true);
  assert.equal(result.officialAdapterReport.coverage.hasProviderToolExposure, true);
  assert.equal(result.officialAdapterReport.coverage.hasProviderRoundTrip, true);
  assert.equal(result.officialAdapterReport.mcpPlus.status, "ok");
  assert.equal(result.officialAdapterReport.mcpPlus.serverId, "browser-plus");
  assert.equal(result.officialAdapterReport.mcpPlus.secondCallHidesInit, true);
  assert.equal(result.officialAdapterReport.mcpPlus.profileSaved, true);
  assert.deepEqual(result.officialAdapterReport.mcpPlus.dynamicToolIds, ["mcp.browser-plus.browser.open"]);
  assert.deepEqual(result.officialAdapterReport.mcpPlus.pinnedTools, ["browser.open"]);
  assert.deepEqual(result.officialAdapterReport.mcpPlus.indexedTools, ["network.status"]);
  assert.equal(result.officialAdapterReport.mcpPlus.calledToolName, "browser.open");
  assert.equal(result.officialAdapterReport.index.totalAdapters, 2);
  assert.deepEqual(result.officialAdapterReport.index.mcpPlusDynamicToolIds, ["mcp.browser-plus.browser.open"]);
  assert.equal(result.officialAdapterReport.query.returnedAdapters, 2);
  assert.equal(result.officialAdapterReport.query.refs.includes("mcp.browser-plus.browser.open"), true);
  assert.equal(result.officialAdapterReport.publicSafe, true);
});
