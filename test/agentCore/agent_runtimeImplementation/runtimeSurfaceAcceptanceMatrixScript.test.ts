import assert from "node:assert/strict";
import test from "node:test";

import {
  runRuntimeSurfaceAcceptanceMatrix,
} from "../../../examples/scripts/runtime_surface_acceptance_matrix.js";

test("runtime surface acceptance matrix keeps public runtime evidence wired", async () => {
  const result = await runRuntimeSurfaceAcceptanceMatrix({
    rootDir: process.cwd(),
    now: () => "2026-06-09T00:00:00.000Z",
  });

  assert.equal(result.status, "ok");
  assert.equal(result.startedAt, "2026-06-09T00:00:00.000Z");
  assert.equal(result.summary.missingPackageScripts, 0);
  assert.equal(result.summary.missingScriptFiles, 0);
  assert.ok(result.summary.surfaceCount >= 12);
  assert.ok(result.summary.usableSurfaces >= 5);
  assert.ok(result.summary.partialSurfaces >= 5);

  const byId = new Map(result.surfaces.map((surface) => [surface.id, surface]));
  const runtimeKernel = byId.get("runtime.kernel");
  const applicationLayer = byId.get("application.layer");
  const coreAcceptance = byId.get("runtime.coreAcceptance");
  const applicationApprovalGovernance = byId.get("application.approvalGovernance");
  const applicationSqliteSession = byId.get("application.sqliteSession");
  const applicationTimeline = byId.get("application.timeline");
  const applicationContext = byId.get("application.context");
  const applicationMcp = byId.get("application.mcp");
  const applicationSkill = byId.get("application.skill");
  const applicationOfficialAdapters = byId.get("application.officialAdapters");
  const modelAdapter = byId.get("runtime.modelAdapter");
  const promptPackCache = byId.get("runtime.promptPackCache");
  const runtimeOfficialAdapterReport = byId.get("runtime.officialAdapter.report");
  const runtimeMultiagent = byId.get("runtime.multiagent");
  const runtimeMultiagentReport = byId.get("runtime.multiagent.report");

  assert.equal(byId.has("runtime.modelCall.report"), false);

  assert.ok(runtimeKernel);
  assert.equal(runtimeKernel.state, "usable");
  assert.equal(runtimeKernel.publicEntry, "@praxis-ai/praxis:praxis.runtime.createPraxisRuntimeKernel");
  assert.ok(runtimeKernel.npmScripts.includes("smoke:kernel-shell"));
  assert.ok(runtimeKernel.npmScripts.includes("baseline:runtime-core"));
  assert.equal(runtimeKernel.coverage.manifestDeclaration, "covered");
  assert.equal(runtimeKernel.coverage.runtimeMount, "covered");
  assert.equal(runtimeKernel.coverage.realSmoke, "covered");

  assert.ok(applicationLayer);
  assert.equal(applicationLayer.state, "usable");
  assert.equal(applicationLayer.publicEntry, "@praxis-ai/praxis/application:createApplicationProjectRuntime");
  assert.ok(applicationLayer.npmScripts.includes("smoke:application-kernel-shell"));
  assert.ok(applicationLayer.npmScripts.includes("baseline:application-core"));
  assert.equal(applicationLayer.coverage.eventPath, "covered");
  assert.equal(applicationLayer.coverage.ownershipBoundary, "covered");

  assert.ok(coreAcceptance);
  assert.equal(coreAcceptance.state, "usable");
  assert.deepEqual(coreAcceptance.dependsOnSurfaceIds, ["runtime.kernel", "application.layer"]);
  assert.ok(coreAcceptance.npmScripts.includes("acceptance:runtime-core"));
  assert.equal(coreAcceptance.coverage.realSmoke, "covered");

  assert.ok(applicationApprovalGovernance);
  assert.equal(applicationApprovalGovernance.state, "usable");
  assert.equal(applicationApprovalGovernance.publicEntry.includes("application.inspectGovernance"), true);
  assert.equal(applicationApprovalGovernance.publicEntry.includes("praxis.application.governanceReport"), true);
  assert.equal(applicationApprovalGovernance.publicEntry.includes("application.inspectToolCalls"), true);
  assert.equal(applicationApprovalGovernance.publicEntry.includes("praxis.application.toolCallReport"), true);
  assert.equal(applicationApprovalGovernance.publicEntry.includes("createRuntimeToolCallReport"), true);
  assert.deepEqual(applicationApprovalGovernance.dependsOnSurfaceIds, ["application.layer", "runtime.sandboxPlane"]);
  assert.ok(applicationApprovalGovernance.npmScripts.includes("smoke:application-approval"));
  assert.ok(applicationApprovalGovernance.scriptFiles.includes("examples/scripts/runtime_application_approval_smoke.ts"));
  assert.equal(applicationApprovalGovernance.coverage.policyGate, "covered");
  assert.equal(applicationApprovalGovernance.coverage.eventPath, "covered");
  assert.equal(applicationApprovalGovernance.notes.some((note) =>
    note.includes("awaiting-approval") && note.includes("application.approvalDecision")), true);
  assert.equal(applicationApprovalGovernance.notes.some((note) =>
    note.includes("application.inspectGovernance") && note.includes("second approval store")), true);
  assert.equal(applicationApprovalGovernance.notes.some((note) =>
    note.includes("application.inspectToolCalls") && note.includes("second BaseTool implementation")), true);

  assert.ok(applicationSqliteSession);
  assert.equal(applicationSqliteSession.state, "usable");
  assert.equal(applicationSqliteSession.publicEntry.includes("application.inspectSessionReport"), true);
  assert.equal(applicationSqliteSession.publicEntry.includes("praxis.application.sessionReport"), true);
  assert.equal(applicationSqliteSession.publicEntry.includes("createRuntimeSessionReport"), true);
  assert.ok(applicationSqliteSession.npmScripts.includes("smoke:application-foundation-rewind"));
  assert.ok(applicationSqliteSession.scriptFiles.includes("examples/scripts/runtime_application_foundation_rewind_smoke.ts"));
  assert.equal(applicationSqliteSession.coverage.checkpointPath, "covered");
  assert.equal(applicationSqliteSession.notes.some((note) =>
    note.includes("application.inspectSessionReport") &&
    note.includes("praxis.application.sessionReport") &&
    note.includes("product-local session store")), true);

  assert.ok(applicationTimeline);
  assert.equal(applicationTimeline.publicEntry.includes("application.inspectTimeline"), true);
  assert.equal(applicationTimeline.publicEntry.includes("praxis.application.timelineReport"), true);
  assert.ok(applicationTimeline.npmScripts.includes("smoke:runtime-timeline"));
  assert.ok(applicationTimeline.scriptFiles.includes("examples/scripts/runtime_timeline_smoke.ts"));
  assert.equal(applicationTimeline.coverage.eventPath, "covered");
  assert.equal(applicationTimeline.notes.some((note) =>
    note.includes("application.inspectTimeline") && note.includes("read-only replay facts")), true);
  assert.equal(applicationTimeline.notes.some((note) =>
    note.includes("checkpoint turn ids") && note.includes("session fork facts")), true);
  assert.equal(applicationTimeline.notes.some((note) =>
    note.includes("createRuntimeTimelineReplayPlan") && note.includes("read-only")), true);

  assert.ok(modelAdapter);
  assert.equal(modelAdapter.publicEntry.includes("createRuntimeModelCallReport"), true);
  assert.equal(modelAdapter.publicEntry.includes("application.inspectModelCalls"), true);
  assert.equal(modelAdapter.publicEntry.includes("praxis.application.modelCallReport"), true);
  assert.ok(modelAdapter.npmScripts.includes("smoke:application-model-adapter"));
  assert.ok(modelAdapter.npmScripts.includes("smoke:application-provider-health"));
  assert.equal(modelAdapter.notes.some((note) =>
    note.includes("application.inspectModelCalls") && note.includes("second provider adapter")), true);

  assert.ok(promptPackCache);
  assert.equal(promptPackCache.publicEntry.includes("createRuntimeModelCallReport"), true);
  assert.equal(promptPackCache.publicEntry.includes("application.inspectModelCalls"), true);
  assert.equal(promptPackCache.publicEntry.includes("praxis.application.modelCallReport"), true);
  assert.ok(promptPackCache.npmScripts.includes("smoke:application-promptpack-cache"));
  assert.equal(promptPackCache.notes.some((note) =>
    note.includes("weighted cache hit rate") && note.includes("application.inspectModelCalls")), true);

  assert.ok(runtimeOfficialAdapterReport);
  assert.equal(byId.has("application.officialAdapterReport"), false);
  assert.equal(runtimeOfficialAdapterReport.publicEntry.includes("application.inspectOfficialAdapters"), true);
  assert.equal(runtimeOfficialAdapterReport.publicEntry.includes("praxis.application.officialAdapterReport"), true);
  assert.equal(runtimeOfficialAdapterReport.publicEntry.includes("createRuntimeOfficialAdapterReport"), true);
  assert.equal(runtimeOfficialAdapterReport.publicEntry.includes("queryRuntimeOfficialAdapters"), true);
  assert.equal(runtimeOfficialAdapterReport.dependsOnSurfaceIds.includes("application.officialAdapters"), true);
  assert.equal(runtimeOfficialAdapterReport.dependsOnSurfaceIds.includes("runtime.mcpPlus"), true);
  assert.ok(runtimeOfficialAdapterReport.npmScripts.includes("smoke:application-context"));
  assert.ok(runtimeOfficialAdapterReport.npmScripts.includes("smoke:application-mcp"));
  assert.ok(runtimeOfficialAdapterReport.npmScripts.includes("smoke:application-skill"));
  assert.ok(runtimeOfficialAdapterReport.npmScripts.includes("smoke:application-official-adapters"));
  assert.ok(runtimeOfficialAdapterReport.npmScripts.includes("smoke:application-mcp-plus"));
  assert.equal(runtimeOfficialAdapterReport.coverage.manifestDeclaration, "not-applicable");
  assert.equal(runtimeOfficialAdapterReport.coverage.runtimeMount, "covered");
  assert.equal(runtimeOfficialAdapterReport.coverage.policyGate, "not-applicable");
  assert.equal(runtimeOfficialAdapterReport.coverage.inspectionPath, "covered");
  assert.equal(runtimeOfficialAdapterReport.coverage.realSmoke, "covered");
  assert.equal(runtimeOfficialAdapterReport.notes.some((note) =>
    note.includes("createRuntimeOfficialAdapterReport") && note.includes("queryRuntimeOfficialAdapters")), true);
  assert.equal(runtimeOfficialAdapterReport.notes.some((note) =>
    note.includes("application.inspectOfficialAdapters") && note.includes("praxis.application.officialAdapterReport")), true);
  assert.equal(runtimeOfficialAdapterReport.notes.some((note) =>
    note.includes("does not execute adapters") && note.includes("MCP+ policy governance")), true);

  assert.ok(applicationMcp);
  assert.equal(applicationMcp.publicEntry.includes("application.inspectMcpMountMatrix"), true);
  assert.equal(applicationMcp.publicEntry.includes("praxis.application.mcpMountMatrix"), true);
  assert.equal(applicationMcp.coverage.inspectionPath, "covered");
  assert.equal(applicationMcp.notes.some((note) =>
    note.includes("inspectMcpRuntimeMountMatrix") && note.includes("runtime.mcpPlane.mountMatrix")), true);
  assert.equal(applicationMcp.notes.some((note) =>
    note.includes("resourceOperations") && note.includes("resources/templates/list") && note.includes("resources/read")), true);
  assert.equal(applicationMcp.notes.some((note) =>
    note.includes("promptOperations") && note.includes("prompts/list") && note.includes("prompts/get")), true);
  assert.equal(applicationMcp.notes.some((note) =>
    note.includes("completionOperations") && note.includes("completion/complete")), true);
  assert.equal(applicationMcp.notes.some((note) =>
    note.includes("read-only") && note.includes("does not call MCP tools")), true);

  assert.ok(applicationContext);
  assert.equal(applicationContext.publicEntry.includes("application.inspectOfficialAdapterMountMatrix"), true);
  assert.equal(applicationContext.publicEntry.includes("praxis.application.officialAdapterMountMatrix"), true);
  assert.equal(applicationContext.coverage.inspectionPath, "covered");
  assert.equal(applicationContext.notes.some((note) =>
    note.includes("context.load") && note.includes("runtime.officialAdapterPlane.mountMatrix")), true);

  assert.ok(applicationSkill);
  assert.equal(applicationSkill.publicEntry.includes("application.inspectOfficialAdapterMountMatrix"), true);
  assert.equal(applicationSkill.publicEntry.includes("praxis.application.officialAdapterMountMatrix"), true);
  assert.equal(applicationSkill.coverage.inspectionPath, "covered");
  assert.equal(applicationSkill.notes.some((note) =>
    note.includes("skill.load") && note.includes("without loading skills")), true);

  assert.ok(applicationOfficialAdapters);
  assert.equal(applicationOfficialAdapters.publicEntry.includes("application.inspectOfficialAdapterMountMatrix"), true);
  assert.equal(applicationOfficialAdapters.coverage.inspectionPath, "covered");
  assert.equal(applicationOfficialAdapters.notes.some((note) =>
    note.includes("smoke:application-official-adapters") &&
    note.includes("before submitTurn") &&
    note.includes("officialAdapterMountMatrix") &&
    note.includes("officialAdapterReport")), true);
  assert.equal(applicationOfficialAdapters.notes.some((note) =>
    note.includes("missing/declared-only/executor-backed") && note.includes("execution-after-the-fact")), true);

  assert.ok(runtimeMultiagent);
  assert.equal(runtimeMultiagent.publicEntry, "@praxis-ai/praxis:runtime.officialModuleSurface.multiagent");
  assert.ok(runtimeMultiagent.npmScripts.includes("smoke:multiagent"));
  assert.ok(runtimeMultiagent.npmScripts.includes("smoke:application-multiagent"));
  assert.equal(runtimeMultiagent.notes.some((note) =>
    note.includes("agent.spawn") && note.includes("child background runtime reply")), true);

  assert.ok(runtimeMultiagentReport);
  assert.equal(
    runtimeMultiagentReport.publicEntry,
    "@praxis-ai/praxis/application:application.inspectMultiagent -> praxis.application.multiagentReport + @praxis-ai/praxis:praxis.runtime.createRuntimeMultiagentReport",
  );
  assert.deepEqual(runtimeMultiagentReport.dependsOnSurfaceIds, ["runtime.multiagent", "application.layer"]);
  assert.ok(runtimeMultiagentReport.npmScripts.includes("smoke:multiagent"));
  assert.ok(runtimeMultiagentReport.scriptFiles.includes("examples/scripts/runtime_multiagent_smoke.ts"));
  assert.equal(runtimeMultiagentReport.coverage.inspectionPath, "covered");
  assert.equal(runtimeMultiagentReport.coverage.realSmoke, "covered");
  assert.equal(runtimeMultiagentReport.notes.some((note) =>
    note.includes("createRuntimeMultiagentReport") && note.includes("queryRuntimeMultiagent")), true);
  assert.equal(runtimeMultiagentReport.notes.some((note) =>
    note.includes("application.inspectMultiagent") && note.includes("praxis.application.multiagentReport")), true);
});
