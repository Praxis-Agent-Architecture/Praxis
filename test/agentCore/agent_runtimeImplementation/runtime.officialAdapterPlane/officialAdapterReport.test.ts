import assert from "node:assert/strict";
import test from "node:test";

import {
  inspectRuntimeOfficialAdapterMountMatrix,
  createRuntimeOfficialAdapterIndex,
  createRuntimeOfficialAdapterReport,
  queryRuntimeOfficialAdapters,
} from "../../../../src/runtimeImplementation/runtime.officialAdapterPlane/index.js";
import {
  createRuntimeBaseToolExecutorPort,
  listRuntimeBaseToolImplementedPortPaths,
} from "../../../../src/runtimeImplementation/runtime.execEngine/baseToolExecutorPortFactory.js";

test("inspectRuntimeOfficialAdapterMountMatrix distinguishes mounted official adapter ports", () => {
  const mountedExecutor = createRuntimeBaseToolExecutorPort({
    runtimeId: "runtime.officialAdapterMountMatrix",
    sessionId: "session.officialAdapterMountMatrix",
    adapters: {
      context: {
        load: async () => ({ ok: true, output: { kind: "workspaceIndex" } }),
      },
      skill: {
        load: async () => ({ ok: true, output: { name: "application.skill" } }),
      },
    },
    mcpServers: [{
      serverId: "app-mcp",
      transport: "stdio",
      command: "node",
      args: ["server.js"],
    }],
  });

  const ready = inspectRuntimeOfficialAdapterMountMatrix({
    executor: mountedExecutor,
    implementedPortPaths: listRuntimeBaseToolImplementedPortPaths({
      adapters: mountedExecutor,
      mcpServers: [{
        serverId: "app-mcp",
        transport: "stdio",
        command: "node",
        args: ["server.js"],
      }],
    }),
  });

  assert.equal(ready.surface, "runtime.officialAdapterPlane.mountMatrix");
  assert.equal(ready.status, "ready");
  assert.deepEqual(ready.adapters.map((adapter) => adapter.toolId), ["context.load", "mcp.resources", "skill.load"]);
  assert.deepEqual([...new Set(ready.adapters.map((adapter) => adapter.evidenceStatus))], ["executor-backed"]);
  assert.equal(ready.totals.missingPorts, 0);
  assert.equal(ready.totals.declaredOnlyPorts, 0);
  assert.equal(ready.guardrails.executesAdapters, false);

  const missing = inspectRuntimeOfficialAdapterMountMatrix({
    executor: createRuntimeBaseToolExecutorPort({
      runtimeId: "runtime.officialAdapterMountMatrix.missing",
      sessionId: "session.officialAdapterMountMatrix.missing",
    }),
    implementedPortPaths: listRuntimeBaseToolImplementedPortPaths(),
  });
  assert.equal(missing.status, "degraded");
  assert.deepEqual(missing.adapters.filter((adapter) => adapter.evidenceStatus === "missing").map((adapter) => adapter.toolId), [
    "context.load",
    "mcp.resources",
    "skill.load",
  ]);

  const declaredOnly = inspectRuntimeOfficialAdapterMountMatrix({
    implementedPortPaths: ["context.load", "mcp.listResources", "skill.load"],
  });
  assert.equal(declaredOnly.status, "degraded");
  assert.deepEqual([...new Set(declaredOnly.adapters.map((adapter) => adapter.evidenceStatus))], ["declared-only"]);
  assert.equal(declaredOnly.totals.declaredOnlyPorts, 3);
});

test("createRuntimeOfficialAdapterReport normalizes public-safe adapter and MCP+ evidence", () => {
  const report = createRuntimeOfficialAdapterReport({
    sourceKind: "test",
    adapters: [{
      familyKey: "context",
      toolId: "context.load",
      toolStatus: "completed",
      expectedProviderName: "praxis_tool_context_load",
      providerToolExposed: true,
      exposedProviderNames: ["praxis_tool_context_load"],
      adapterCalls: 1,
      callId: "call.context",
      outputFedBack: true,
      outputIncludesEvidence: true,
      resultKind: "workspaceIndex",
      itemCount: 1,
      humanResultSummary: "loaded context with secret-token content",
      metadata: { source: "test", accessToken: "secret-event-token" },
    }, {
      familyKey: "mcp",
      toolId: "mcp.resources",
      toolStatus: "completed",
      expectedProviderName: "praxis_tool_mcp_resources",
      providerToolExposed: true,
      exposedProviderNames: ["praxis_tool_mcp_resources"],
      adapterCalls: 1,
      callId: "call.mcp",
      outputFedBack: true,
      outputIncludesEvidence: true,
      resourceCount: 1,
      serverId: "app-mcp",
    }, {
      familyKey: "skill",
      toolId: "skill.load",
      toolStatus: "completed",
      expectedProviderName: "praxis_tool_skill_load",
      providerToolExposed: true,
      exposedProviderNames: ["praxis_tool_skill_load"],
      adapterCalls: 1,
      callId: "call.skill",
      outputFedBack: true,
      outputIncludesEvidence: true,
      skillName: "application.skill.runtimeMount",
      requestName: "application.skill.runtimeMount",
    }],
    mcpPlus: {
      serverId: "browser-plus",
      initToolId: "mcp.browser-plus.mcp_plus.init",
      dynamicToolIds: ["mcp.browser-plus.browser.open"],
      firstCallExposesInit: true,
      secondCallExposesInit: false,
      secondCallExposesPinnedTool: true,
      exposedProviderNamesByCall: [
        ["praxis_tool_mcp_browser-plus_mcp_plus_init"],
        ["praxis_tool_mcp_browser-plus_browser_open"],
      ],
      profileSaved: true,
      schemaVersion: "mcp-plus.profile.v1",
      pinnedTools: ["browser.open"],
      indexedTools: ["network.status"],
      listToolsCalls: 1,
      callCalls: 1,
      calledServerId: "browser-plus",
      calledToolName: "browser.open",
      callIds: ["call.init", "call.dynamic"],
      initOutputFedBack: true,
      dynamicToolOutputFedBack: true,
      dynamicToolOutputIncludesCallResult: true,
    },
    composition: {
      callOrder: ["context.load", "mcp.resources", "skill.load"],
      expectedCallOrder: ["context.load", "mcp.resources", "skill.load"],
      providerCalls: 4,
      toolCalls: 3,
      finalEventSeen: true,
      finalOutput: "final output with password-value",
    },
    applicationEvents: [{
      eventId: "event.tool.context.completed",
      kind: "tool",
      status: "completed",
      message: "context.load completed",
      createdAt: "2026-06-09T00:00:00.000Z",
      publicSafe: true,
      metadata: {
        toolId: "context.load",
        toolStatus: "completed",
        familyKey: "context",
        resultMetadata: { humanResultSummary: "event summary with authorization-value" },
      },
    }],
  });

  assert.equal(report.kind, "praxis.runtime.officialAdapter.report");
  assert.equal(report.publicSafe, true);
  assert.equal(report.status, "ok");
  assert.equal(report.counts.adapters, 3);
  assert.equal(report.counts.adapterCalls, 5);
  assert.equal(report.counts.providerRoundTrips, 5);
  assert.equal(report.counts.mcpPlusProfiles, 1);
  assert.equal(report.counts.dynamicTools, 1);
  assert.equal(report.coverage.hasAdapterCalls, true);
  assert.equal(report.coverage.hasProviderToolExposure, true);
  assert.equal(report.coverage.hasCompletedToolEvents, true);
  assert.equal(report.coverage.hasProviderRoundTrip, true);
  assert.equal(report.coverage.hasCompositionOrder, true);
  assert.equal(report.coverage.compositionOrderMatches, true);
  assert.equal(report.coverage.hasMcpPlusProfileRefresh, true);
  assert.equal(report.coverage.hasMcpPlusDynamicTool, true);
  assert.equal(report.coverage.hasApplicationEventPath, true);
  assert.equal(report.mcpPlus.exposure.secondCallHidesInit, true);
  assert.equal(report.guardrails.executesAdapters, false);
  assert.equal(report.guardrails.ownsContextRetrievalStrategy, false);
  assert.equal(report.guardrails.ownsSkillRegistryGovernance, false);
  assert.equal(report.guardrails.ownsMcpPlusPolicyGovernance, false);
  assert.equal(JSON.stringify(report).includes("secret-token"), false);
  assert.equal(JSON.stringify(report).includes("secret-event-token"), false);
  assert.equal(JSON.stringify(report).includes("password-value"), false);
  assert.equal(JSON.stringify(report).includes("authorization-value"), false);

  const index = createRuntimeOfficialAdapterIndex(report);
  assert.equal(index.totalAdapters, 3);
  assert.equal(index.byFamilyKey.context, 1);
  assert.equal(index.byFamilyKey.mcp, 1);
  assert.equal(index.byFamilyKey.skill, 1);
  assert.equal(index.byToolId["context.load"], 1);
  assert.equal(index.byStatus.ok, 3);
  assert.equal(index.providerToolNames.includes("praxis_tool_context_load"), true);
  assert.deepEqual(index.completedToolIds, ["context.load", "mcp.resources", "skill.load"]);
  assert.deepEqual(index.mcpPlusDynamicToolIds, ["mcp.browser-plus.browser.open"]);

  const query = queryRuntimeOfficialAdapters({
    report,
    query: { familyKey: "mcp", hasProviderRoundTrip: true },
  });
  assert.equal(query.returnedAdapters, 1);
  assert.equal(query.adapters[0]?.toolId, "mcp.resources");
  assert.equal(query.refs.includes("mcp.resources"), true);
});

test("createRuntimeOfficialAdapterReport can derive completed tool events without executing adapters", () => {
  const report = createRuntimeOfficialAdapterReport({
    applicationEvents: [{
      eventId: "event.skill.completed",
      kind: "tool",
      status: "completed",
      message: "skill.load completed",
      createdAt: "2026-06-09T00:00:00.000Z",
      turnId: "turn.1",
      sessionId: "session.1",
      publicSafe: true,
      metadata: {
        toolId: "skill.load",
        toolStatus: "completed",
        familyKey: "skill",
        skillName: "application.skill.runtimeMount",
      },
    }],
  });

  assert.equal(report.status, "unknown");
  assert.equal(report.counts.adapters, 1);
  assert.equal(report.coverage.hasApplicationEventPath, true);
  assert.equal(report.coverage.hasCompletedToolEvents, true);

  const query = queryRuntimeOfficialAdapters({
    report,
    query: { toolId: "skill.load", ref: "event.skill.completed" },
  });
  assert.equal(query.returnedAdapters, 1);
  assert.equal(query.adapters[0]?.familyKey, "skill");
});
