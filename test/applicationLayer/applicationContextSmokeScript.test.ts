import assert from "node:assert/strict";
import test from "node:test";

import {
  runApplicationContextSmoke,
} from "../../examples/scripts/runtime_application_context_smoke.js";

test("application context smoke loads context evidence through application-owned BaseTool adapter", async () => {
  const result = await runApplicationContextSmoke({
    now: () => "2026-06-08T00:00:00.000Z",
  });

  assert.equal(result.status, "ok");
  assert.equal(result.view.status, "completed");
  assert.equal(result.view.finalOutput, "application context smoke completed");
  assert.equal(result.view.counters.turns, 1);
  assert.equal(result.view.counters.modelCalls, 2);
  assert.equal(result.view.counters.toolCalls, 1);
  assert.equal(result.adapter.calls, 1);
  assert.equal(result.adapter.kind, "workspaceIndex");
  assert.equal(result.adapter.query, "runtime application context");
  assert.equal(result.providerRoundTrip.toolOutputFedBack, true);
  assert.equal(result.providerRoundTrip.callId, "application-context-smoke-call");
  assert.equal(result.providerRoundTrip.outputIncludesContextMaterial, true);
  assert.equal(result.providerToolExposure.exposesExpectedTool, true);
  assert.equal(result.providerToolExposure.expectedProviderName, "praxis_tool_context_load");
  assert.equal(result.toolEvent.toolId, "context.load");
  assert.equal(result.toolEvent.toolStatus, "completed");
  assert.equal(result.toolEvent.contextKind, "workspaceIndex");
  assert.equal(result.toolEvent.familyKey, "context");
  assert.equal(result.toolEvent.itemCount, 1);
  assert.equal(result.events.includes("tool:context.load:completed"), true);
  assert.equal(result.events.includes("final"), true);
  assert.equal(result.officialAdapterReport.kind, "praxis.runtime.officialAdapter.report");
  assert.equal(result.officialAdapterReport.status, "ok");
  assert.equal(result.officialAdapterReport.sourceKind, "application-events");
  assert.equal(result.officialAdapterReport.coverage.hasProviderToolExposure, true);
  assert.equal(result.officialAdapterReport.coverage.hasProviderRoundTrip, true);
  assert.equal(result.officialAdapterReport.coverage.hasCompletedToolEvents, true);
  assert.equal(result.officialAdapterReport.index.totalAdapters, 1);
  assert.equal(result.officialAdapterReport.index.byFamilyKey.context, 1);
  assert.equal(result.officialAdapterReport.index.byToolId["context.load"], 1);
  assert.equal(result.officialAdapterReport.index.byStatus.ok, 1);
  assert.deepEqual(result.officialAdapterReport.index.completedToolIds, ["context.load"]);
  assert.equal(result.officialAdapterReport.query.returnedAdapters, 1);
  assert.equal(result.officialAdapterReport.query.refs.includes("context.load"), true);
  assert.equal(result.officialAdapterReport.publicSafe, true);
});
