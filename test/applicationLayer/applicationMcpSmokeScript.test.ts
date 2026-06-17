import assert from "node:assert/strict";
import test from "node:test";

import {
  runApplicationMcpSmoke,
} from "../../examples/scripts/runtime_application_mcp_smoke.js";

test("application MCP smoke lists resources through runtime-mounted MCP adapter", async () => {
  const result = await runApplicationMcpSmoke({
    now: () => "2026-06-08T00:00:00.000Z",
  });

  assert.equal(result.status, "ok");
  assert.equal(result.view.status, "completed");
  assert.equal(result.view.finalOutput, "application MCP smoke completed");
  assert.equal(result.view.counters.turns, 1);
  assert.equal(result.view.counters.modelCalls, 2);
  assert.equal(result.view.counters.toolCalls, 1);
  assert.equal(result.adapter.calls, 1);
  assert.equal(result.adapter.serverId, "app-mcp");
  assert.equal(result.providerRoundTrip.toolOutputFedBack, true);
  assert.equal(result.providerRoundTrip.callId, "application-mcp-smoke-call");
  assert.equal(result.providerRoundTrip.outputIncludesResource, true);
  assert.equal(result.providerToolExposure.exposesExpectedTool, true);
  assert.equal(result.providerToolExposure.expectedProviderName, "praxis_tool_mcp_resources");
  assert.equal(result.mcpMountMatrix.kind, "praxis.application.mcpMountMatrix");
  assert.equal(result.mcpMountMatrix.runtimeSurface, "runtime.mcpPlane.mountMatrix");
  assert.equal(result.mcpMountMatrix.status, "degraded");
  assert.deepEqual(result.mcpMountMatrix.resourceOperations, [
    "list:mcp.listResources:executor-backed",
    "templates:mcp.listResourceTemplates:executor-backed",
    "read:mcp.readResource:executor-backed",
  ]);
  assert.equal(result.mcpMountMatrix.resourceOperationsReady, true);
  assert.deepEqual(result.mcpMountMatrix.promptOperations, [
    "list:mcp.listPrompts:executor-backed",
    "get:mcp.getPrompt:executor-backed",
  ]);
  assert.equal(result.mcpMountMatrix.promptOperationsReady, true);
  assert.deepEqual(result.mcpMountMatrix.completionOperations, [
    "complete:mcp.complete:executor-backed",
  ]);
  assert.equal(result.mcpMountMatrix.completionOperationsReady, true);
  assert.equal(result.mcpMountMatrix.missingPorts > 0, true);
  assert.equal(result.mcpMountMatrix.resourceOperationMissingPorts, 0);
  assert.equal(result.mcpMountMatrix.promptOperationMissingPorts, 0);
  assert.equal(result.mcpMountMatrix.completionOperationMissingPorts, 0);
  assert.equal(result.mcpMountMatrix.declaredOnlyPorts, 0);
  assert.equal(result.mcpMountMatrix.missingNativeInventories, 0);
  assert.equal(result.mcpMountMatrix.inspectedBeforeSubmitTurn, true);
  assert.equal(result.mcpMountMatrix.publicSafe, true);
  assert.equal(result.toolEvent.toolId, "mcp.resources");
  assert.equal(result.toolEvent.toolStatus, "completed");
  assert.equal(result.toolEvent.familyKey, "mcp");
  assert.equal(result.toolEvent.resourceCount, 1);
  assert.equal(result.events.includes("tool:mcp.resources:completed"), true);
  assert.equal(result.events.includes("final"), true);
  assert.equal(result.officialAdapterReport.kind, "praxis.runtime.officialAdapter.report");
  assert.equal(result.officialAdapterReport.status, "ok");
  assert.equal(result.officialAdapterReport.sourceKind, "application-events");
  assert.equal(result.officialAdapterReport.coverage.hasProviderToolExposure, true);
  assert.equal(result.officialAdapterReport.coverage.hasProviderRoundTrip, true);
  assert.equal(result.officialAdapterReport.coverage.hasCompletedToolEvents, true);
  assert.equal(result.officialAdapterReport.index.totalAdapters, 1);
  assert.equal(result.officialAdapterReport.index.byFamilyKey.mcp, 1);
  assert.equal(result.officialAdapterReport.index.byToolId["mcp.resources"], 1);
  assert.equal(result.officialAdapterReport.index.byStatus.ok, 1);
  assert.deepEqual(result.officialAdapterReport.index.completedToolIds, ["mcp.resources"]);
  assert.equal(result.officialAdapterReport.query.returnedAdapters, 1);
  assert.equal(result.officialAdapterReport.query.refs.includes("mcp.resources"), true);
  assert.equal(result.officialAdapterReport.publicSafe, true);
});
