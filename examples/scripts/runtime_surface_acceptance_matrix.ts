import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

export type RuntimeSurfaceAcceptanceState = "usable" | "partial" | "future";

export type RuntimeSurfaceAcceptanceCoverageState = "covered" | "partial" | "missing" | "not-applicable";

export type RuntimeSurfaceAcceptanceCoverage = {
  manifestDeclaration: RuntimeSurfaceAcceptanceCoverageState;
  runtimeMount: RuntimeSurfaceAcceptanceCoverageState;
  policyGate: RuntimeSurfaceAcceptanceCoverageState;
  eventPath: RuntimeSurfaceAcceptanceCoverageState;
  checkpointPath: RuntimeSurfaceAcceptanceCoverageState;
  inspectionPath: RuntimeSurfaceAcceptanceCoverageState;
  realSmoke: RuntimeSurfaceAcceptanceCoverageState;
  ownershipBoundary: RuntimeSurfaceAcceptanceCoverageState;
};

export type RuntimeSurfaceAcceptanceEntry = {
  id: string;
  title: string;
  state: RuntimeSurfaceAcceptanceState;
  publicEntry: string;
  owner: "agentCore" | "applicationLayer" | "runtimePlane" | "officialModule" | "frameworkHarness";
  dependsOnSurfaceIds: readonly string[];
  npmScripts: readonly string[];
  scriptFiles: readonly string[];
  coverage: RuntimeSurfaceAcceptanceCoverage;
  notes: readonly string[];
};

export type RuntimeSurfaceAcceptanceMatrixResult = {
  status: "ok" | "failed";
  startedAt: string;
  finishedAt: string;
  rootDir: string;
  summary: {
    surfaceCount: number;
    usableSurfaces: number;
    partialSurfaces: number;
    futureSurfaces: number;
    packageScriptsChecked: number;
    missingPackageScripts: number;
    scriptFilesChecked: number;
    missingScriptFiles: number;
  };
  surfaces: readonly RuntimeSurfaceAcceptanceEntry[];
  missingPackageScripts: readonly {
    surfaceId: string;
    script: string;
  }[];
  missingScriptFiles: readonly {
    surfaceId: string;
    file: string;
  }[];
};

export type RuntimeSurfaceAcceptanceMatrixInput = {
  rootDir?: string;
  now?: () => string;
};

const covered: RuntimeSurfaceAcceptanceCoverage = {
  manifestDeclaration: "covered",
  runtimeMount: "covered",
  policyGate: "covered",
  eventPath: "covered",
  checkpointPath: "covered",
  inspectionPath: "covered",
  realSmoke: "covered",
  ownershipBoundary: "covered",
};

function coverage(input: Partial<RuntimeSurfaceAcceptanceCoverage>): RuntimeSurfaceAcceptanceCoverage {
  return { ...covered, ...input };
}

const surfaces: readonly RuntimeSurfaceAcceptanceEntry[] = [
  {
    id: "runtime.kernel",
    title: "Runtime Kernel",
    state: "usable",
    publicEntry: "@praxis-ai/praxis:praxis.runtime.createPraxisRuntimeKernel",
    owner: "agentCore",
    dependsOnSurfaceIds: [],
    npmScripts: ["smoke:kernel-shell", "baseline:runtime-core"],
    scriptFiles: ["examples/scripts/runtime_kernel_shell_tool_smoke.ts", "examples/scripts/runtime_core_baseline.ts"],
    coverage: coverage({ inspectionPath: "partial" }),
    notes: [
      "Agent definitions compile to AgentManifest and run through PraxisRuntimeKernel before model/tool/session evidence is read back.",
    ],
  },
  {
    id: "application.layer",
    title: "Application Layer",
    state: "usable",
    publicEntry: "@praxis-ai/praxis/application:createApplicationProjectRuntime",
    owner: "applicationLayer",
    dependsOnSurfaceIds: ["runtime.kernel"],
    npmScripts: ["smoke:application-kernel-shell", "baseline:application-core"],
    scriptFiles: [
      "examples/scripts/runtime_application_kernel_shell_smoke.ts",
      "examples/scripts/runtime_application_core_baseline_smoke.ts",
    ],
    coverage: coverage({ inspectionPath: "partial" }),
    notes: [
      "Temporary rax.project.json applications enter through start/submitTurn and do not require callers to import runtime internals.",
    ],
  },
  {
    id: "runtime.coreAcceptance",
    title: "Runtime Core Acceptance Suite",
    state: "usable",
    publicEntry: "npm:acceptance:runtime-core",
    owner: "frameworkHarness",
    dependsOnSurfaceIds: ["runtime.kernel", "application.layer"],
    npmScripts: ["acceptance:runtime-core"],
    scriptFiles: ["examples/scripts/runtime_core_acceptance_suite.ts"],
    coverage: coverage({
      manifestDeclaration: "not-applicable",
      policyGate: "not-applicable",
      eventPath: "partial",
      checkpointPath: "partial",
      inspectionPath: "partial",
    }),
    notes: [
      "Delegates to the runtime and application baselines so upper acceptance does not create another execution path.",
    ],
  },
  {
    id: "runtime.sandboxPlane",
    title: "Sandbox Plane",
    state: "partial",
    publicEntry: "@praxis-ai/praxis:praxis.runtime.sandbox",
    owner: "runtimePlane",
    dependsOnSurfaceIds: ["runtime.kernel"],
    npmScripts: ["smoke:sandbox-shell", "smoke:application-sandbox"],
    scriptFiles: [
      "examples/scripts/runtime_sandbox_shell_smoke.ts",
      "examples/scripts/runtime_application_sandbox_smoke.ts",
    ],
    coverage: coverage({ manifestDeclaration: "partial", ownershipBoundary: "partial" }),
    notes: [
      "Workspace rollback and injected Raxcell-like execution are smoke-proven; final Raxcell live dependency remains a later gate.",
      "application.inspectSandboxMountMatrix returns a public-safe praxis.application.sandboxMountMatrix wrapper over runtime.sandboxPlane.mountMatrix, proving upper applications can inspect SandboxSpec/provider/Raxcell readiness before command execution without creating a second sandbox path.",
    ],
  },
  {
    id: "application.rollback",
    title: "Application Rollback Evidence",
    state: "usable",
    publicEntry: "@praxis-ai/praxis/application:application.submitTurn + application.inspectRollbackPlan -> praxis.application.rollbackPlan + @praxis-ai/praxis:praxis.runtime.planRuntimeRollback",
    owner: "applicationLayer",
    dependsOnSurfaceIds: ["application.layer", "runtime.sandboxPlane", "application.timeline"],
    npmScripts: ["smoke:application-rollback", "smoke:application-rollback-plan"],
    scriptFiles: [
      "examples/scripts/runtime_application_rollback_smoke.ts",
      "examples/scripts/runtime_application_rollback_plan_smoke.ts",
    ],
    coverage: coverage({ inspectionPath: "partial", policyGate: "partial", checkpointPath: "partial" }),
    notes: [
      "Failed shell writes are restored by workspace rollback and exposed through public application tool events.",
      "application.inspectRollbackPlan returns a public-safe praxis.application.rollbackPlan wrapper over runtime.managementPlane.rollbackController, proving upper applications can dry-run checkpoint rollback decisions and read accepted/rejected boundaries without mutating conversation history or executing filesystem rollback.",
    ],
  },
  {
    id: "application.managementPlane",
    title: "Application Runtime Management Plane",
    state: "partial",
    publicEntry: "@praxis-ai/praxis/application:application.inspectManagementPlane -> praxis.application.managementPlane + @praxis-ai/praxis:praxis.runtime.createRuntimeManagementPlane",
    owner: "applicationLayer",
    dependsOnSurfaceIds: ["application.layer", "application.rollback"],
    npmScripts: ["smoke:application-management-plane"],
    scriptFiles: ["examples/scripts/runtime_application_management_plane_smoke.ts"],
    coverage: coverage({
      manifestDeclaration: "not-applicable",
      eventPath: "partial",
      checkpointPath: "partial",
      inspectionPath: "covered",
      realSmoke: "covered",
      ownershipBoundary: "covered",
    }),
    notes: [
      "application.inspectManagementPlane returns a public-safe praxis.application.managementPlane wrapper over runtime.managementPlane and its dry-run accessSession, operatorConsole, commandRouter, policyGate, resourceGovernor, mutationPlanner, rollbackController, and governanceBridge components.",
      "The smoke proves upper applications can inspect the mounted runtime control bundle without importing managementPlane internals, submitting model turns, mutating the application session, or executing management commands.",
      "This is the read-only application control surface; executable external management commands, durable management timeline retention, and richer framework control policy remain later gates.",
    ],
  },
  {
    id: "application.approvalGovernance",
    title: "Application Approval And Runtime Governance",
    state: "usable",
    publicEntry: "@praxis-ai/praxis/application:application.approvalDecision + application.inspectGovernance -> praxis.application.governanceReport + application.inspectToolCalls -> praxis.application.toolCallReport + @praxis-ai/praxis:praxis.runtime.createRuntimeGovernanceReport + praxis.runtime.createRuntimeToolCallReport",
    owner: "applicationLayer",
    dependsOnSurfaceIds: ["application.layer", "runtime.sandboxPlane"],
    npmScripts: ["smoke:application-approval"],
    scriptFiles: ["examples/scripts/runtime_application_approval_smoke.ts"],
    coverage: coverage({ checkpointPath: "partial" }),
    notes: [
      "Application approval smoke proves a standard-policy shell.run request enters awaiting-approval, appears in the public application view, resumes through application.approvalDecision, and then completes through the same model/tool round trip.",
      "The same smoke dispatches application.inspectGovernance and reads praxis.application.governanceReport over praxis.runtime.createRuntimeGovernanceReport, createRuntimeGovernanceIndex, and queryRuntimeGovernance, proving approval, interface envelope, and BaseTool policy facts can be inspected without creating a second approval store.",
      "The same smoke dispatches application.inspectToolCalls and reads praxis.application.toolCallReport over praxis.runtime.createRuntimeToolCallReport, createRuntimeToolCallIndex, and queryRuntimeToolCalls, proving shell.run invocation, policy profile, dependency preflight, approval status, workspace rollback, and sandbox mode facts can be inspected without turning runtime into a second BaseTool implementation.",
    ],
  },
  {
    id: "application.sqliteSession",
    title: "Application SQLite Session Store",
    state: "usable",
    publicEntry: "@praxis-ai/praxis/application:session({ persistence: 'sqlite' }) + application.inspectSessionReport -> praxis.application.sessionReport + @praxis-ai/praxis:praxis.runtime.createRuntimeSessionReport",
    owner: "applicationLayer",
    dependsOnSurfaceIds: ["application.layer"],
    npmScripts: ["smoke:application-sqlite", "smoke:application-foundation", "smoke:application-foundation-lifecycle", "smoke:application-foundation-rewind"],
    scriptFiles: [
      "examples/scripts/runtime_application_sqlite_smoke.ts",
      "examples/scripts/runtime_application_foundation_smoke.ts",
      "examples/scripts/runtime_application_foundation_lifecycle_smoke.ts",
      "examples/scripts/runtime_application_foundation_rewind_smoke.ts",
    ],
    coverage: coverage({ policyGate: "partial", inspectionPath: "partial" }),
    notes: [
      "Application-declared SQLite persistence writes runtime state/event records and can be reopened through the runtime store API.",
      "Application submitTurn can be the first application command: it lazily creates the foundation session fact, then writes turn checkpoints and semantic conversation messages through runtime.conversationPlane when a foundation project is mounted.",
      "Application start, createSession, renameSession, close, explicit resume, and no-sessionId resume route through runtime.sessionPlane when a foundation project is mounted, so session title/status, selected resume candidate, and project lease state stay aligned with the application lifecycle.",
      "Application foundation lifecycle dispatches application.inspectSessionReport and reads praxis.application.sessionReport over praxis.runtime.createRuntimeSessionReport, proving ordinary session status/title, project session counts, released lease facts, and binding consistency are readable without a product-local session store.",
      "Application foundation rewind now also dispatches application.inspectSessionReport for the forked session and reads praxis.application.sessionReport over praxis.runtime.createRuntimeSessionReport, proving session, checkpoint, copied conversation, and fork relation facts are readable without adding a product-local session store.",
    ],
  },
  {
    id: "application.timeline",
    title: "Application Timeline",
    state: "partial",
    publicEntry: "@praxis-ai/praxis/application:application.inspectTimeline -> praxis.application.timelineReport + application transports + @praxis-ai/praxis:praxis.runtime.createRuntimeTimelineReport",
    owner: "applicationLayer",
    dependsOnSurfaceIds: ["application.layer", "runtime.promptPackCache"],
    npmScripts: [
      "smoke:application-timeline",
      "smoke:runtime-timeline",
      "smoke:application-execution-monitor",
      "smoke:application-rewind",
      "smoke:application-rollback-plan",
      "smoke:application-foundation-rewind",
    ],
    scriptFiles: [
      "examples/scripts/runtime_application_timeline_smoke.ts",
      "examples/scripts/runtime_timeline_smoke.ts",
      "examples/scripts/runtime_application_execution_monitor_smoke.ts",
      "examples/scripts/runtime_application_rewind_smoke.ts",
      "examples/scripts/runtime_application_rollback_plan_smoke.ts",
      "examples/scripts/runtime_application_foundation_rewind_smoke.ts",
    ],
    coverage: coverage({ checkpointPath: "partial", ownershipBoundary: "partial" }),
    notes: [
      "View, REST, SSE, and WebSocket retain/query/stream runtime events; application timeline smoke now verifies modelFleet endpoint, retry/fallback, failure-code, retryability, and fallbackFrom metadata is preserved across all four application event surfaces.",
      "The same application timeline smoke dispatches application.inspectTimeline and reads praxis.application.timelineReport over praxis.runtime.createRuntimeTimelineReport, createRuntimeTimelineIndex, queryRuntimeTimeline, and createRuntimeTimelineReplayPlan, proving upper applications can inspect runtime event, invocation, mainLoop, and read-only replay facts without importing runtime internals.",
      "Runtime timeline smoke proves a reopened SQLite RuntimeSessionStateEventStore snapshot can be normalized into a public-safe praxis.runtime.timeline.report with session, event, invocation, mainLoop step, and error coverage counts.",
      "The same runtime timeline smoke also feeds a foundation rewind snapshot into praxis.runtime.createRuntimeTimelineReport, then uses praxis.runtime.createRuntimeTimelineIndex, queryRuntimeTimeline, and createRuntimeTimelineReplayPlan to prove checkpoint turn ids, session fork facts, and read-only replay planning can be inspected without duplicating conversation/session semantics.",
      "Application execution monitor smoke proves retained application model events, cacheDebug, and modelFleet retry/fallback/failure metadata can be consumed by runtime.executionMonitor without a separate product-local diagnostics path.",
      "When a foundation project is mounted, application.rewind forks runtime.sessionPlane facts and copies runtime.conversationPlane messages through the selected checkpoint before later turns continue in the forked session.",
      "The durable runtime timeline read view and lightweight query/index/read-only replay plan are now smoke-proven; executable replay policy, richer log retention, and durable query storage remain future work.",
    ],
  },
  {
    id: "application.context",
    title: "Application Context Adapter",
    state: "partial",
    publicEntry: "@praxis-ai/praxis/application:BaseToolExecutorPort.context.load + application.inspectOfficialAdapterMountMatrix -> praxis.application.officialAdapterMountMatrix",
    owner: "applicationLayer",
    dependsOnSurfaceIds: ["application.layer"],
    npmScripts: ["smoke:application-context"],
    scriptFiles: ["examples/scripts/runtime_application_context_smoke.ts"],
    coverage: coverage({ checkpointPath: "partial" }),
    notes: [
      "Context material can enter via an application-owned adapter; full memory/RAG retrieval remains separate.",
      "application.inspectOfficialAdapterMountMatrix exposes context.load runtime readiness over runtime.officialAdapterPlane.mountMatrix without calling the context adapter or owning retrieval strategy.",
    ],
  },
  {
    id: "application.mcp",
    title: "Application MCP Adapter",
    state: "partial",
    publicEntry: "@praxis-ai/praxis/application:BaseToolExecutorPort.mcp.listResources + application.inspectMcpMountMatrix -> praxis.application.mcpMountMatrix",
    owner: "officialModule",
    dependsOnSurfaceIds: ["application.layer"],
    npmScripts: ["smoke:application-mcp"],
    scriptFiles: ["examples/scripts/runtime_application_mcp_smoke.ts"],
    coverage: coverage({ checkpointPath: "partial" }),
    notes: [
      "MCP resources can enter the model/tool round trip through application-owned ports; MCP+ overlay pressure remains a later live gate.",
      "application.inspectMcpMountMatrix returns a public-safe praxis.application.mcpMountMatrix wrapper over inspectMcpRuntimeMountMatrix and runtime.mcpPlane.mountMatrix, using the runtime BaseTool executor port plus application-mounted MCP/MCP+ server profiles.",
      "The MCP mount matrix now exposes resourceOperations for resources/list, resources/templates/list, and resources/read, promptOperations for prompts/list and prompts/get, and completionOperations for completion/complete, so upper applications can distinguish executor-backed operation groups from the broader MCP plane status.",
      "The mount matrix facade is read-only: native MCP tool inventories are caller-supplied evidence, and the command does not call MCP tools, refresh MCP+ profiles, or create a second MCP execution path.",
    ],
  },
  {
    id: "application.skill",
    title: "Application Skill Adapter",
    state: "partial",
    publicEntry: "@praxis-ai/praxis/application:BaseToolExecutorPort.skill.load + application.inspectOfficialAdapterMountMatrix -> praxis.application.officialAdapterMountMatrix",
    owner: "officialModule",
    dependsOnSurfaceIds: ["application.layer"],
    npmScripts: ["smoke:application-skill"],
    scriptFiles: ["examples/scripts/runtime_application_skill_smoke.ts"],
    coverage: coverage({ checkpointPath: "partial" }),
    notes: [
      "Skill material is application-live proven through skill.load; skill registry/package governance remains broader framework work.",
      "application.inspectOfficialAdapterMountMatrix exposes skill.load runtime readiness over runtime.officialAdapterPlane.mountMatrix without loading skills or owning skill registry governance.",
    ],
  },
  {
    id: "application.officialAdapters",
    title: "Application Official Adapter Composition",
    state: "usable",
    publicEntry: "@praxis-ai/praxis/application:BaseToolExecutorPort context+mcp+skill + application.inspectOfficialAdapterMountMatrix -> praxis.application.officialAdapterMountMatrix",
    owner: "applicationLayer",
    dependsOnSurfaceIds: ["application.context", "application.mcp", "application.skill"],
    npmScripts: ["smoke:application-official-adapters"],
    scriptFiles: ["examples/scripts/runtime_application_official_adapters_smoke.ts"],
    coverage: coverage({ checkpointPath: "partial" }),
    notes: [
      "One application runtime can mount context.load, mcp.resources, and skill.load adapters together, expose all three provider tools, execute them through one submitTurn, and feed each tool result back into the model loop.",
      "smoke:application-official-adapters now calls application.inspectOfficialAdapterMountMatrix before submitTurn and returns officialAdapterMountMatrix alongside officialAdapterReport, proving pre-execution context/MCP/skill mount readiness and execution-after-the-fact evidence in one upper application smoke.",
      "application.inspectOfficialAdapterMountMatrix returns a public-safe praxis.application.officialAdapterMountMatrix wrapper over runtime.officialAdapterPlane.mountMatrix, proving context/MCP/skill mount readiness from the runtime BaseTool executor port before adapter execution.",
      "The official adapter mount matrix is separate from application.inspectOfficialAdapters: matrix checks missing/declared-only/executor-backed readiness, while the report reads execution-after-the-fact evidence.",
      "This proves the application-facing official adapter harness composes; each adapter's deeper registry/package governance remains tracked on its own surface.",
    ],
  },
  {
    id: "runtime.officialAdapter.report",
    title: "Runtime Official Adapter Report",
    state: "partial",
    publicEntry: "@praxis-ai/praxis/application:application.inspectOfficialAdapters -> praxis.application.officialAdapterReport + @praxis-ai/praxis:praxis.runtime.createRuntimeOfficialAdapterReport/createRuntimeOfficialAdapterIndex/queryRuntimeOfficialAdapters",
    owner: "runtimePlane",
    dependsOnSurfaceIds: [
      "application.officialAdapters",
      "application.context",
      "application.mcp",
      "application.skill",
      "runtime.mcpPlus",
    ],
    npmScripts: [
      "smoke:application-context",
      "smoke:application-mcp",
      "smoke:application-skill",
      "smoke:application-official-adapters",
      "smoke:application-mcp-plus",
    ],
    scriptFiles: [
      "examples/scripts/runtime_application_context_smoke.ts",
      "examples/scripts/runtime_application_mcp_smoke.ts",
      "examples/scripts/runtime_application_skill_smoke.ts",
      "examples/scripts/runtime_application_official_adapters_smoke.ts",
      "examples/scripts/runtime_application_mcp_plus_smoke.ts",
    ],
    coverage: coverage({
      manifestDeclaration: "not-applicable",
      runtimeMount: "covered",
      policyGate: "not-applicable",
      eventPath: "partial",
      checkpointPath: "partial",
      inspectionPath: "covered",
      realSmoke: "covered",
      ownershipBoundary: "partial",
    }),
    notes: [
      "Application context, MCP, skill, official-adapter composition, and MCP+ smokes feed provider exposure, adapter calls, completed tool events, provider round-trip, composition order, and MCP+ profile/dynamic-tool facts into praxis.runtime.createRuntimeOfficialAdapterReport, createRuntimeOfficialAdapterIndex, and queryRuntimeOfficialAdapters.",
      "application.inspectOfficialAdapters returns a public-safe praxis.application.officialAdapterReport wrapper over the same runtime official-adapter report/index/query; it does not execute adapters or create a second adapter path.",
      "This is a public-safe read surface over existing adapter evidence; it does not execute adapters, own context retrieval strategy, own skill registry governance, or own MCP+ policy governance.",
    ],
  },
  {
    id: "runtime.modelAdapter",
    title: "Model Adapter",
    state: "partial",
    publicEntry: "@praxis-ai/praxis:model/provider carriers + application.submitTurn + application.inspectModelCalls -> praxis.application.modelCallReport + praxis.runtime.createRuntimeModelCallReport",
    owner: "runtimePlane",
    dependsOnSurfaceIds: ["runtime.kernel", "application.layer"],
    npmScripts: [
      "smoke:modelAdapter",
      "smoke:application-model-adapter",
      "smoke:application-auth-profile",
      "smoke:application-provider-capability",
      "smoke:application-provider-probe",
      "smoke:application-provider-fleet",
      "smoke:application-provider-health",
    ],
    scriptFiles: [
      "examples/scripts/modelAdapter_smoke.ts",
      "examples/scripts/runtime_application_model_adapter_smoke.ts",
      "examples/scripts/runtime_application_auth_profile_smoke.ts",
      "examples/scripts/runtime_application_provider_capability_smoke.ts",
      "examples/scripts/runtime_application_provider_probe_smoke.ts",
      "examples/scripts/runtime_application_provider_fleet_smoke.ts",
      "examples/scripts/runtime_application_provider_health_smoke.ts",
    ],
    coverage: coverage({
      policyGate: "partial",
      checkpointPath: "partial",
      inspectionPath: "partial",
      realSmoke: "partial",
      ownershipBoundary: "partial",
    }),
    notes: [
      "Prompt lowering and injected/dry-run provider paths exist.",
      "Application modelAdapter smoke proves application.submitTurn can route through native OpenAI Responses and OpenAI Chat Completions actualInvocationLayer callers, preserving provider envelopes while exposing public-safe model events and usage.",
      "Application auth profile smoke proves manifest-declared providerProfileRef/modelEntryRef can resolve through runtime.authPlane, deliver private material to the provider caller, and keep application view/events public-safe.",
      "Application provider capability smoke proves application.submitTurn can declare a primary modelFleet endpoint with toolCalling = false, expose provider tools, skip that endpoint before the first provider call, complete through a tool-capable endpoint, and expose modelFleetCapabilitySelection plus requiredCapabilities in application model event metadata.",
      "Application provider probe smoke proves application.submitTurn can read manifest-declared probe.status = unavailable, skip the primary before the first provider call, complete through the declared available fallback, and expose modelFleetAdaptiveSelection plus requiredCapabilities in application model event metadata.",
      "Application provider fleet smoke proves manifest-declared failurePolicy fallback can record primary failure, expose endpoint/ref/failure/retryability metadata in application model events, resolve the fallback endpoint auth profile, and complete the same application turn through runtime.modelAdapter with fallbackFrom evidence.",
      "Application provider health smoke proves retryable provider failures such as rate limits consume modelFleet maxRetries before fallback, while non-retryable provider failures stay visible and do not fallback; application model events expose retry attempt, max retry, failure code, retryability, and fallback metadata.",
      "application.inspectModelCalls returns a public-safe praxis.application.modelCallReport wrapper over the same runtime model-call report/index/query, so upper applications can read provider, usage, cacheDebug, modelFleet endpoint, fallback, retry, and failure facts without creating a second provider adapter.",
      "Kernel modelFleet tests prove the initial provider candidate follows manifest-declared primaryRef even when another endpoint matches manifest.model.",
      "Kernel modelFleet tests prove provider-tool exposure can consume manifest-declared capabilityMatrix.toolCalling, skip an endpoint that explicitly declares toolCalling = false, choose an endpoint that declares toolCalling = true, and emit runtime.modelFleet.capabilitySelection.planned evidence.",
      "Kernel modelFleet tests prove required toolCalling capability is derived from the actual provider tool bundle, including runtime decision tools, not only from declared business tools.",
      "Kernel modelFleet tests prove manifest-declared probe.status = unavailable can preselect the declared fallback before the first provider call and emit runtime.modelFleet.adaptiveSelection.planned evidence.",
      "Live provider health probing and broader adaptive fleet scoring still need broader acceptance; current preselection consumes declared capability/probe facts only.",
    ],
  },
  {
    id: "runtime.mcpPlus",
    title: "MCP Plus Overlay",
    state: "usable",
    publicEntry: "@praxis-ai/praxis/application:mcpPlusServers + mcpPlus",
    owner: "officialModule",
    dependsOnSurfaceIds: ["application.mcp"],
    npmScripts: ["smoke:mcp-plus-native", "smoke:application-mcp-plus"],
    scriptFiles: ["examples/scripts/mcp-plus-native-smoke.ts", "examples/scripts/runtime_application_mcp_plus_smoke.ts"],
    coverage: coverage({
      manifestDeclaration: "partial",
      checkpointPath: "partial",
      inspectionPath: "partial",
      ownershipBoundary: "partial",
    }),
    notes: [
      "MCP+ native comparison is available, and application.submitTurn can drive mcp_plus.init through profileStore refresh into a pinned dynamic MCP+ tool call.",
      "Deeper MCP+ package governance and inspection polish remain separate partial work; this surface is usable for application-facing overlay refresh.",
    ],
  },
  {
    id: "runtime.promptPackCache",
    title: "PromptPack And Cache",
    state: "partial",
    publicEntry: "@praxis-ai/praxis:promptPack/mainLoop + application.submitTurn + application.inspectModelCalls -> praxis.application.modelCallReport + praxis.runtime.createRuntimeModelCallReport",
    owner: "runtimePlane",
    dependsOnSurfaceIds: ["runtime.kernel", "runtime.modelAdapter", "application.layer"],
    npmScripts: ["smoke:promptpack-cache", "smoke:application-promptpack-cache"],
    scriptFiles: [
      "examples/scripts/runtime_promptpack_cache_smoke.ts",
      "examples/scripts/runtime_application_promptpack_cache_smoke.ts",
    ],
    coverage: coverage({
      policyGate: "partial",
      checkpointPath: "partial",
      inspectionPath: "covered",
      ownershipBoundary: "partial",
    }),
    notes: [
      "PromptPack cache smoke proves stable prefix and dynamic turn separation through existing prompt assembly and model lowering.",
      "Application promptPack/cache smoke proves application.submitTurn exposes cacheDebug from model events across two turns: stable prefix hashes stay fixed, dynamic payload hashes change, prompt_cache_key is stable, and application consumers do not import runtime internals.",
      "The same smoke reads application.inspectModelCalls as praxis.application.modelCallReport, proving weighted cache hit rate, prompt cache key stability, stable-prefix comparison, and dynamic-payload comparison are available to upper applications through the runtime inspection surface.",
      "Application submitTurn currently keeps previous_response_id disabled while still passing prior response facts into runtime; provider economics and live reuse policy remain later gates.",
    ],
  },
  {
    id: "runtime.multiagent",
    title: "Multiagent Official Surface",
    state: "partial",
    publicEntry: "@praxis-ai/praxis:runtime.officialModuleSurface.multiagent",
    owner: "officialModule",
    dependsOnSurfaceIds: ["runtime.kernel", "application.layer"],
    npmScripts: ["smoke:multiagent", "smoke:application-multiagent"],
    scriptFiles: [
      "examples/scripts/runtime_multiagent_smoke.ts",
      "examples/scripts/runtime_application_multiagent_smoke.ts",
    ],
    coverage: coverage({
      manifestDeclaration: "partial",
      runtimeMount: "partial",
      policyGate: "partial",
      eventPath: "partial",
      checkpointPath: "partial",
      inspectionPath: "partial",
      realSmoke: "partial",
      ownershipBoundary: "partial",
    }),
    notes: [
      "Multiagent smokes prove a runtime-mediated official bridge, project-local agent.* baseTools over the multiagent runtime port, and application.submitTurn -> agent.spawn -> child background runtime reply; durable event/checkpoint retention and full orchestration strategy remain broader framework work.",
    ],
  },
  {
    id: "runtime.multiagent.report",
    title: "Runtime Multiagent Report",
    state: "partial",
    publicEntry: "@praxis-ai/praxis/application:application.inspectMultiagent -> praxis.application.multiagentReport + @praxis-ai/praxis:praxis.runtime.createRuntimeMultiagentReport",
    owner: "runtimePlane",
    dependsOnSurfaceIds: ["runtime.multiagent", "application.layer"],
    npmScripts: ["smoke:multiagent", "smoke:application-multiagent"],
    scriptFiles: [
      "examples/scripts/runtime_multiagent_smoke.ts",
      "examples/scripts/runtime_application_multiagent_smoke.ts",
    ],
    coverage: coverage({
      manifestDeclaration: "not-applicable",
      runtimeMount: "partial",
      policyGate: "not-applicable",
      eventPath: "partial",
      checkpointPath: "partial",
      inspectionPath: "covered",
      realSmoke: "covered",
      ownershipBoundary: "partial",
    }),
    notes: [
      "Runtime and application multiagent smokes feed bridge, agent.* BaseTool, mesh, application event, provider round-trip, and child background runtime facts into praxis.runtime.createRuntimeMultiagentReport, createRuntimeMultiagentIndex, and queryRuntimeMultiagent.",
      "Application multiagent smoke dispatches application.inspectMultiagent and reads praxis.application.multiagentReport, proving upper applications can inspect report/index/query evidence through the application facade instead of importing runtime internals.",
      "This is a public-safe read surface over existing multiagent evidence; it does not spawn agents, schedule child runtimes, or replace the official multiagent orchestration strategy.",
    ],
  },
];

type PackageJson = {
  scripts?: Record<string, string>;
};

async function readPackageScripts(rootDir: string): Promise<Record<string, string>> {
  const raw = await readFile(path.join(rootDir, "package.json"), "utf8");
  const parsed = JSON.parse(raw) as PackageJson;
  return parsed.scripts ?? {};
}

export async function runRuntimeSurfaceAcceptanceMatrix(
  input: RuntimeSurfaceAcceptanceMatrixInput = {},
): Promise<RuntimeSurfaceAcceptanceMatrixResult> {
  const rootDir = path.resolve(input.rootDir ?? process.cwd());
  const now = input.now ?? (() => new Date().toISOString());
  const startedAt = now();
  const packageScripts = await readPackageScripts(rootDir);
  const missingPackageScripts = surfaces.flatMap((surface) =>
    surface.npmScripts
      .filter((script) => packageScripts[script] === undefined)
      .map((script) => ({ surfaceId: surface.id, script }))
  );
  const missingScriptFiles = surfaces.flatMap((surface) =>
    surface.scriptFiles
      .filter((file) => !existsSync(path.join(rootDir, file)))
      .map((file) => ({ surfaceId: surface.id, file }))
  );
  const usableSurfaces = surfaces.filter((surface) => surface.state === "usable").length;
  const partialSurfaces = surfaces.filter((surface) => surface.state === "partial").length;
  const futureSurfaces = surfaces.filter((surface) => surface.state === "future").length;
  const missingPackageScriptCount = missingPackageScripts.length;
  const missingScriptFileCount = missingScriptFiles.length;
  return {
    status: missingPackageScriptCount === 0 && missingScriptFileCount === 0 ? "ok" : "failed",
    startedAt,
    finishedAt: now(),
    rootDir,
    summary: {
      surfaceCount: surfaces.length,
      usableSurfaces,
      partialSurfaces,
      futureSurfaces,
      packageScriptsChecked: surfaces.reduce((count, surface) => count + surface.npmScripts.length, 0),
      missingPackageScripts: missingPackageScriptCount,
      scriptFilesChecked: surfaces.reduce((count, surface) => count + surface.scriptFiles.length, 0),
      missingScriptFiles: missingScriptFileCount,
    },
    surfaces,
    missingPackageScripts,
    missingScriptFiles,
  };
}

async function main(): Promise<void> {
  const result = await runRuntimeSurfaceAcceptanceMatrix();
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== "ok") process.exitCode = 1;
}

const invokedPath = process.argv[1] === undefined ? undefined : path.resolve(process.argv[1]);
if (invokedPath !== undefined && fileURLToPath(import.meta.url) === invokedPath) {
  await main();
}
