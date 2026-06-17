/*
 * 文件定位：agentCore framework 公共入口。
 * 核心目的：为普通开发者暴露稳定的 Agent authoring、manifest compile 和 runtime kernel API。
 * 边界：不把 runtime.* 深层实现文件作为普通 public API。
 */

import {
  PromptPack,
  PraxisAgent,
  PraxisAgentArchetype,
  STATE_PLANE_STANDARD_CONTROLS,
  append,
  compileAgent,
  endpoint,
  harness,
  inspectAgentManifest,
  loop,
  mainLoop,
  markdown,
  markdownFile,
  model,
  modelFleet,
  overwrite,
  policy,
  prepend,
  replaceLastLines,
  sandbox,
  session,
  statePlane,
  storage,
  tool,
  toolPolicies,
  tools,
  validateAgentManifest,
} from "../runtimeImplementation/runtimeAgentManifest.js";
import {
  createSandboxRuntimeProvider,
  prepareSandboxRuntime,
  resolveRaxcellBinaryPath,
  sandboxRuntimeProviderDescriptor,
} from "../runtimeImplementation/runtime.sandboxPlane/sandboxRuntimeProvider.js";
import {
  createSandboxCommandPlan,
  createLocalSandboxRemoteWorkerAdapter,
  runSandboxCommand,
  sandboxCommandRunnerDescriptor,
} from "../runtimeImplementation/runtime.sandboxPlane/sandboxCommandRunner.js";
import {
  createRaxcellSandboxProvider,
  mapSandboxProviderRequestToRaxcell,
  raxcellSandboxProviderDescriptor,
} from "../runtimeImplementation/runtime.sandboxPlane/raxcellSandboxProvider.js";
import {
  runSandboxPolicyMiddleware,
  sandboxPolicyMiddlewareDescriptor,
} from "../runtimeImplementation/runtime.sandboxPlane/sandboxPolicyMiddleware.js";
import {
  inspectSandboxRuntimeMountMatrix,
} from "../runtimeImplementation/runtime.sandboxPlane/sandboxMountMatrix.js";
import {
  approvalInterfaceEnvelope,
  createInterfaceEnvelope,
  eventInterfaceEnvelope,
  managementInterfaceEnvelope,
  repairInterfaceEnvelope,
  stateInterfaceEnvelope,
} from "../interfaceAdapter/interfaceEnvelope.js";
import {
  createInterfaceAdapterRuntime,
} from "../runtimeImplementation/runtime.interfaceAdapter/interfaceAdapterRuntime.js";
import {
  bindBasicInterfaceLayer,
} from "../runtimeImplementation/runtime.interfaceAdapter/bindBasicInterfaceLayer.js";
import {
  applyRaxStorageInitPlan,
  createAndApplyStoragePlaneRuntime,
  createRaxStorageLayout,
  createStoragePlaneRuntime,
  planRaxStorageInit,
  resolveRaxHome,
  resolveRaxWorkspace,
} from "../runtimeImplementation/runtime.storagePlane/storagePlaneRuntime.js";
import {
  openPraxisProject,
  project as defineProject,
  projectDescriptor,
} from "../runtimeImplementation/runtime.projectPlane/index.js";
import {
  createPraxisSessionManager,
  createRuntimeSessionReport,
} from "../runtimeImplementation/runtime.sessionPlane/index.js";
import {
  createPraxisConversationManager,
} from "../runtimeImplementation/runtime.conversationPlane/index.js";
import {
  capabilities,
  capability,
  createProvisionPlan,
  dependencies,
  dependencyAuthoring,
  provisionRuntimeDescriptor,
} from "../runtimeImplementation/runtime.provisionPlane/index.js";
import {
  component,
  createRuntimeComponentRegistry,
  lookupRuntimeComponent,
  officialRuntimeComponents,
} from "../runtimeImplementation/runtime.componentPlane/index.js";
import {
  canonicalDependencyId,
  createDependencySourceRegistry,
  defaultManagedRoot,
  ensureDependencyAvailable,
  lookupDependencySource,
  officialDependencySources,
  planDependencyInstallation,
  probeDependency,
} from "../runtimeImplementation/runtime.dependencyPlane/index.js";
import {
  PraxisRuntimeKernel,
  createPraxisRuntimeKernel,
} from "../runtimeImplementation/praxisRuntimeKernel.js";
import {
  createInMemorySessionStateEventStore,
  createSqliteSessionStateEventStore,
} from "../runtimeImplementation/runtimeSessionStateEventStore.js";
import {
  createFrameworkInspectionReport,
} from "../runtimeImplementation/runtime.inspection/frameworkInspectionReport.js";
import {
  inspectRuntimeSurfaces,
  runtimeSurfaceInspectorDescriptor,
} from "../runtimeImplementation/runtime.inspection/runtimeSurfaceInspector.js";
import {
  createRuntimeCompositionRoot,
  runtimeCompositionRootSurface,
} from "../runtimeImplementation/runtimeCompositionRoot.js";
import {
  createRuntimeSurfaceRegistry,
  runtimeSurfaceRegistryCapability,
} from "../runtimeImplementation/runtimeSurfaceRegistry.js";
import {
  baseToolDeveloperCatalogDescriptor,
  baseToolCodingCoreDescriptor,
  basetool,
  baseToolProfile,
  createBaseToolRegistry,
  createBaseToolSupportCatalog,
  evaluateBaseToolRuntimeReadiness,
  listBaseToolDeveloperCatalog,
  listBaseToolProfiles,
  toolSets,
  tryBaseToolById,
} from "../runtimeImplementation/runtime.execEngine/baseToolDeveloperCatalog.js";
import {
  baseToolRealityLedgerDescriptor,
  createBaseToolRealityLedger,
  inspectBaseToolReality,
  snapshotBaseToolRealityLedger,
} from "../runtimeImplementation/runtime.execEngine/baseToolRealityLedger.js";
import {
  baseToolExecutorPortFactoryDescriptor,
  createRuntimeBaseToolExecutorPort,
  listRuntimeBaseToolImplementedPortPaths,
} from "../runtimeImplementation/runtime.execEngine/baseToolExecutorPortFactory.js";
import {
  adjudicateRuntimeDecision,
  analyzeMainLoopCacheHealth,
  createMainLoopApprovalEnvelope,
  createMainLoopAgentInterfacePrimitive,
  createMainLoopBehaviorRegistry,
  createMainLoopCancelToken,
  createLoopTick,
  createMainLoopCheckpoint,
  createMainLoopControlAction,
  createMainLoopInputMaterial,
  createMainLoopOutputEnvelope,
  createMainLoopRun,
  createMainLoopRollbackPoint,
  createMainLoopSessionTimeline,
  createMainLoopStepRecord,
  createMainLoopStateProgressionRecord,
  createMainLoopTimelineRef,
  createUserTurn,
  decideMainLoopFinalAcceptance,
  decideMainLoopPromptPackRebuild,
  exposeMainLoopState,
  planFrameworkMainLoopHandoff,
  prepareMainLoopTurn,
  resolveMainLoopFailureRecovery,
  resolveMainLoopApproval,
  resolveMainLoopBudget,
  replayMainLoopStep,
  replayMainLoopTick,
  replayUserTurn,
  resolveMainLoopBehaviorRef,
  resolveMainLoopBudgetExhaustion,
  runMainLoop,
  selectMainLoopModel,
} from "../executionEngine/coreLogic/mainLoop.js";
import {
  interpretModelDecision,
} from "../executionEngine/coreLogic/modelDecision.js";
import {
  createContextCompactionPipelineExecutor,
  createLocalSummaryCompactExecutor,
  createRuntimeFallbackCompactExecutor,
  decideTurnBoundaryCompact,
} from "../executionEngine/coreLogic/contextCompact.js";
import {
  assemblePromptPack,
} from "../executionEngine/promptPack/promptAssembler.js";
import {
  assemblePromptContextMaterials,
  promptPackMaterialsForManifest,
} from "../runtimeImplementation/runtime.execEngine/promptContextAssembly.js";
import {
  createObservationMaterial,
} from "../executionEngine/coreLogic/observationIntegrator.js";
import {
  runtimeAuth,
} from "../runtimeImplementation/runtime.authPlane/index.js";
import {
  createApiKeyAuthEnvelope,
  createBearerAuthEnvelope,
  createMissingAuthEnvelope,
  mergeAuthMaterialHeaders,
  toPublicAuthEnvelope,
} from "../modelAdapter/authProfileLayer/authEnvelope.js";
import {
  createChatGPTCodexAuthEnvelope,
  createChatGPTCodexAuthMaterial,
  createChatGPTCodexRedactedIdentity,
  parseChatGPTCodexAuthJson,
  parseChatGPTCodexJwtClaims,
  toPublicChatGPTCodexAuthSnapshot,
} from "../modelAdapter/authProfileLayer/codexAuth.js";
import {
  createCredentialRef,
  credentialRefKey,
} from "../modelAdapter/authProfileLayer/credentialRef.js";
import {
  createMemoryPlane,
  memoryPlane,
} from "../memory_managementPool/index.js";
import {
  ExecutionMonitor,
  analyzeExecutionMonitor,
} from "../runtimeImplementation/runtime.executionMonitor/index.js";
import {
  createRuntimeGovernanceIndex,
  createRuntimeGovernanceReport,
  queryRuntimeGovernance,
} from "../runtimeImplementation/runtime.governancePlane/index.js";
import {
  createRuntimeTimelineIndex,
  createRuntimeTimelineReport,
  createRuntimeTimelineReplayPlan,
  queryRuntimeTimeline,
} from "../runtimeImplementation/runtime.timelinePlane/index.js";
import {
  createRuntimeManagementPlane,
} from "../runtimeImplementation/runtime.managementPlane/runtimeManagementPlane.js";
import {
  createRuntimeAccessSession,
} from "../runtimeImplementation/runtime.managementPlane/runtimeAccessSession.js";
import {
  evaluateManagementPolicyGate,
} from "../runtimeImplementation/runtime.managementPlane/managementPolicyGate.js";
import {
  routeManagementCommand,
} from "../runtimeImplementation/runtime.managementPlane/managementCommandRouter.js";
import {
  openRuntimeOperatorConsole,
} from "../runtimeImplementation/runtime.managementPlane/runtimeOperatorConsole.js";
import {
  governRuntimeResources,
} from "../runtimeImplementation/runtime.managementPlane/runtimeResourceGovernor.js";
import {
  planRuntimeMutation,
} from "../runtimeImplementation/runtime.managementPlane/runtimeMutationPlanner.js";
import {
  createRuntimeGovernanceBridgeEnvelope,
} from "../runtimeImplementation/runtime.managementPlane/runtimeGovernanceBridge.js";
import {
  planRuntimeRollback,
} from "../runtimeImplementation/runtime.managementPlane/runtimeRollbackController.js";
import {
  createRuntimeModelCallIndex,
  createRuntimeModelCallReport,
  queryRuntimeModelCalls,
} from "../runtimeImplementation/runtime.modelCallPlane/index.js";
import {
  createRuntimeToolCallIndex,
  createRuntimeToolCallReport,
  queryRuntimeToolCalls,
} from "../runtimeImplementation/runtime.toolCallPlane/index.js";
import {
  createRuntimeMultiagentIndex,
  createRuntimeMultiagentReport,
  queryRuntimeMultiagent,
} from "../runtimeImplementation/runtime.multiagentPlane/index.js";
import {
  createRuntimeOfficialAdapterIndex,
  createRuntimeOfficialAdapterReport,
  queryRuntimeOfficialAdapters,
} from "../runtimeImplementation/runtime.officialAdapterPlane/index.js";
import {
  buildMcpServerProfilesFromManifest,
  createMcpApplicationStateView,
  createFileMcpPlusProfileStore,
  createFileMcpPlusSkillStore,
  createInMemoryMcpPlusOverlayStore,
  createInMemoryMcpPlusProfileStore,
  createInMemoryMcpPlusSkillStore,
  inspectMcpRuntimeMountMatrix,
  mcp,
  planMcpHarnessExposure,
} from "../runtimeImplementation/runtime.mcpPlane/index.js";

export {
  PromptPack,
  PraxisAgent,
  PraxisAgentArchetype,
  STATE_PLANE_STANDARD_CONTROLS,
  append,
  compileAgent,
  endpoint,
  harness,
  inspectAgentManifest,
  loop,
  mainLoop,
  markdown,
  markdownFile,
  model,
  modelFleet,
  overwrite,
  policy,
  prepend,
  replaceLastLines,
  sandbox,
  session,
  statePlane,
  storage,
  tool,
  toolPolicies,
  tools,
  validateAgentManifest,
  type AgentCompileErrorCode,
  type AgentCompileResult,
  type AgentIdentity,
  type AgentManifest,
  type AgentManifestInspection,
  type AgentManifestValidationResult,
  type BaseToolPolicyDecision,
  type BaseToolPolicyMatrixSpec,
  type BaseToolPolicyProfile,
  type BaseToolPolicyRisk,
  type BaseToolPolicyRule,
  type HarnessSpec,
  type FrameworkCoreContractSpec,
  type LoopSpec,
  type MainLoopSpec,
  type ModelEndpointSpec,
  type ModelFleetSpec,
  type ModelSpec,
  type PolicySpec,
  type PraxisAgentClass,
  type PraxisAgentInput,
  type PromptMaterialSource,
  type PromptPackSpec,
  type PromptPatchSpec,
  type SandboxSpec,
  type SandboxIsolationLevel,
  type SandboxMountPolicy,
  type SandboxNetworkRuntimePolicy,
  type SandboxPlatformSupport,
  type SandboxPlatformSupportStatus,
  type SandboxProcessPolicy,
  type SandboxProviderFamily,
  type SessionSpec,
  type StatePlaneSpec,
  type StorageSpec,
  type ToolSpec,
  type ToolPolicyCustomInput,
} from "../runtimeImplementation/runtimeAgentManifest.js";

export {
  buildMcpServerProfilesFromManifest,
  createMcpApplicationStateView,
  createFileMcpPlusProfileStore,
  createFileMcpPlusSkillStore,
  createInMemoryMcpPlusOverlayStore,
  createInMemoryMcpPlusProfileStore,
  createInMemoryMcpPlusSkillStore,
  inspectMcpRuntimeMountMatrix,
  mcp,
  planMcpHarnessExposure,
};

export type {
  McpApplicationServerView,
  McpApplicationServerInput,
  McpApplicationStateView,
  McpHarnessExposurePlan,
  McpHarnessModuleSpec,
  McpHarnessServerMode,
  McpHarnessServerSpec,
  McpRuntimeMountMatrix,
  McpRuntimeMountMatrixBaseTool,
  McpRuntimeMountMatrixCompletionOperation,
  McpRuntimeMountMatrixPromptOperation,
  McpRuntimeMountMatrixResourceOperation,
  McpRuntimeMountMatrixServer,
  McpPlusLearnedProfile,
  McpPlusApplicationServerInput,
  McpPlusOverlayStore,
  McpPlusOverlayStoreKey,
  McpPlusProfileProposal,
  McpPlusProfileStore,
  McpPlusProfileStoreKey,
  McpPlusRuntimeOverlay,
  McpPlusSkillNote,
  McpPlusSkillStore,
  McpTransportSpec,
  InspectMcpRuntimeMountMatrixInput,
} from "../runtimeImplementation/runtime.mcpPlane/index.js";

export {
  createMemoryPlane,
  memoryPlane,
};
export type {
  MemoryArtifactRef,
  MemoryIndexStatus,
  MemoryLayout,
  MemoryPlane,
  MemoryPlaneOptions,
  MemoryPolicyRisk,
  MemoryProfile,
  MemoryPromptGuide,
  MemoryReindexResult,
  MemoryRiskMetadata,
  MemoryScope,
  MemorySearchGuide,
  MemorySearchRequest,
  MemorySourceType,
} from "../memory_managementPool/index.js";

export {
  capabilities,
  capability,
  createProvisionPlan,
  dependencies,
  dependencyAuthoring,
  provisionRuntimeDescriptor,
  type CapabilityFallbackSpec,
  type CapabilityInput,
  type CapabilityKind,
  type CapabilityPolicySpec,
  type CapabilityReadiness,
  type CapabilitySpec,
  type CodeIntelligenceCapabilityInput,
  type ProvisionPlan,
  type SandboxCapabilityInput,
} from "../runtimeImplementation/runtime.provisionPlane/index.js";

export {
  component,
  createRuntimeComponentRegistry,
  lookupRuntimeComponent,
  officialRuntimeComponents,
  type RuntimeComponentKind,
  type RuntimeComponentRegistry,
  type RuntimeComponentSpec,
} from "../runtimeImplementation/runtime.componentPlane/index.js";

export {
  canonicalDependencyId,
  createDependencySourceRegistry,
  defaultManagedRoot,
  ensureDependencyAvailable,
  lookupDependencySource,
  officialDependencySources,
  planDependencyInstallation,
  probeDependency,
  type DependencyAvailability,
  type DependencyDeclaration,
  type DependencyInstallPlan,
  type DependencyKind,
  type DependencyPlaneContext,
  type DependencySource,
} from "../runtimeImplementation/runtime.dependencyPlane/index.js";

export {
  adjudicateRuntimeDecision,
  analyzeMainLoopCacheHealth,
  createLoopTick,
  createMainLoopApprovalEnvelope,
  createMainLoopBehaviorRegistry,
  createMainLoopCancelToken,
  createMainLoopCheckpoint,
  createMainLoopControlAction,
  createMainLoopRun,
  createMainLoopRollbackPoint,
  createMainLoopSessionTimeline,
  createMainLoopStepRecord,
  createMainLoopTimelineRef,
  createUserTurn,
  decideMainLoopFinalAcceptance,
  exposeMainLoopState,
  planFrameworkMainLoopHandoff,
  prepareMainLoopTurn,
  replayMainLoopStep,
  replayMainLoopTick,
  replayUserTurn,
  resolveMainLoopApproval,
  resolveMainLoopBehaviorRef,
  resolveMainLoopFailureRecovery,
  resolveMainLoopBudget,
  resolveMainLoopBudgetExhaustion,
  resolveMainLoopContinuation,
  resolveMainLoopToolChoice,
  runMainLoop,
  selectMainLoopModel,
  DEFAULT_MAIN_LOOP_BUDGET,
  DEFAULT_MAIN_LOOP_FAILURE_RECOVERY_POLICY,
  MAIN_LOOP_CONTROL_PRIMITIVES,
  type LoopTick,
  type LoopTickStatus,
  type MainLoopBudgetExhaustionAction,
  type MainLoopBudgetExhaustionDecision,
  type MainLoopBudgetSpec,
  type MainLoopCacheHealth,
  type MainLoopBehaviorRefDecision,
  type MainLoopBehaviorRef,
  type MainLoopBehaviorRefSource,
  type MainLoopBehaviorRegistry,
  type MainLoopBehaviorResolution,
  type MainLoopBreakDecision,
  type MainLoopBreakDecisionKind,
  type MainLoopApprovalEnvelope,
  type MainLoopApprovalResolution,
  type MainLoopApprovalStatus,
  type MainLoopCheckpoint,
  type MainLoopCheckpointKind,
  type MainLoopContinuationDecision,
  type MainLoopContinuationDecisionKind,
  type MainLoopControlPrimitive,
  type MainLoopControlActionRecord,
  type MainLoopFinalAcceptanceRequest,
  type MainLoopAgentInterfacePrimitive,
  type MainLoopInputMaterial,
  type MainLoopInputMaterialKind,
  type MainLoopModelCandidate,
  type MainLoopModelCapabilityRole,
  type MainLoopModelSelectionDecision,
  type MainLoopModelSelectionRequest,
  type MainLoopFailureRecoveryDecision,
  type MainLoopFailureRecoveryPolicy,
  type MainLoopFallbackPolicy,
  type MainLoopRun,
  type MainLoopRunStatus,
  type MainLoopRuntimeContext,
  type MainLoopRuntimeSurfaceRef,
  type MainLoopRetryPolicy,
  type MainLoopReplayPlan,
  type MainLoopReplayPlanKind,
  type MainLoopRollbackPoint,
  type MainLoopSessionTimeline,
  type MainLoopStateExposure,
  type MainLoopStateProgressionAction,
  type MainLoopStateProgressionRecord,
  type MainLoopStep,
  type MainLoopStepRecord,
  type MainLoopOutputEnvelope,
  type MainLoopOutputEnvelopeKind,
  type MainLoopPromptPackRebuildDecision,
  type MainLoopPromptPackRebuildTrigger,
  type MainLoopTimelineRef,
  type MainLoopTimelineRefKind,
  type MainLoopToolChoiceMode,
  type MainLoopToolChoicePolicy,
  type MainLoopTurnRecord,
  type MainLoopTurnPreparationRequest,
  type MainLoopTurnPreparationResult,
  type RunMainLoopRequest,
  type RunMainLoopResult,
  type RuntimeBudgetSpec,
  type RuntimeAdjudication,
  type RuntimeAdjudicationKind,
  type RuntimeAdjudicationRequest,
  type UserTurn,
  type UserTurnStatus,
} from "../executionEngine/coreLogic/mainLoop.js";

export {
  interpretModelDecision,
  type ModelDecision,
  type ModelDecisionFailure,
  type ModelDecisionKind,
  type ModelDecisionToolCall,
} from "../executionEngine/coreLogic/modelDecision.js";

export {
  DEFAULT_OBSERVATION_COMPRESSION_POLICY,
  DEFAULT_OBSERVATION_SUMMARY_DELEGATION_POLICY,
  DEFAULT_SUMMARY_AGENT_REF,
  DEFAULT_TOOL_RESULT_SIZE_POLICY,
  createObservationMaterial,
  type LargeObservationSelectionFlow,
  type ObservationArtifactRef,
  type ObservationCompressionPolicy,
  type ObservationMaterial,
  type ObservationSummaryDelegationPolicy,
  type ObservationTrustLevel,
  type RuntimeObservationInput,
  type RuntimeObservationMaterial,
  type SummaryAgentRef,
  type ToolResultSizePolicy,
} from "../executionEngine/coreLogic/observationIntegrator.js";

export {
  createEphemeralProcedureExecutionState,
  normalizeEphemeralProcedurePlan,
  type EphemeralProcedureAuthor,
  type EphemeralProcedureExecutionMode,
  type EphemeralProcedureExecutionState,
  type EphemeralProcedureExpectedOutput,
  type EphemeralProcedurePartialStatus,
  type EphemeralProcedurePlan,
  type EphemeralProcedureResourceHints,
  type EphemeralProcedureRiskLevel,
  type EphemeralProcedureStep,
  type EphemeralProcedureStepExecutionState,
  type EphemeralProcedureStepExecutionStatus,
  type EphemeralProcedureValidationError,
  type EphemeralProcedureValidationResult,
} from "../executionEngine/coreLogic/ephemeralProcedure.js";

export {
  runMainLoopEngine,
  type MainLoopEngineRequest,
  type MainLoopEngineResult,
} from "../executionEngine/coreLogic/mainLoopEngine.js";

export {
  createMainLoopCoreEvent,
  createMainLoopRecorder,
  type MainLoopRecorderSink,
  type MainLoopRecorderSnapshot,
} from "../executionEngine/coreLogic/mainLoopRecorder.js";

export {
  noopMainLoopSummarizer,
  createMainLoopStreamAccumulator,
  reduceMainLoopStreamAccumulator,
  type MainLoopCoreEvent,
  type MainLoopCoreEventName,
  type MainLoopEnginePorts,
  type MainLoopModelStreamEvent,
  type MainLoopStreamAccumulatorState,
  type MainLoopRecorderPort,
  type MainLoopSummarizerPort,
  type MainLoopSummarizerRequest,
  type MainLoopSummarizerResult,
  type MainLoopUsagePricing,
  type MainLoopUsageReport,
} from "../executionEngine/coreLogic/mainLoopPorts.js";

export {
  addMainLoopBudgetUsage,
  addMainLoopObservationRefs,
  clearMainLoopOneShotToolContextSelection,
  consumeMainLoopPendingInputs,
  createMainLoopBudgetUsage,
  createMainLoopTurnState,
  enqueueMainLoopPendingInput,
  interruptMainLoopTurnState,
  registerMainLoopApprovalWait,
  resumeMainLoopTurnState,
  setMainLoopToolContextSelection,
  transitionMainLoopTurnState,
  type MainLoopBudgetUsage,
  type MainLoopInterruptCheckpoint,
  type MainLoopPendingInput,
  type MainLoopResumeToken,
  type MainLoopToolContextSelection,
  type MainLoopTurnPhase,
  type MainLoopTurnState,
  type MainLoopTurnStateTransition,
  type PendingInputDisposition,
} from "../executionEngine/coreLogic/turnState.js";

export {
  runToolExecutionUnits,
  toolExecutionUnitFromProcedureStep,
  toolExecutionUnitFromToolCall,
  toolExecutionUnitsFromEphemeralProcedure,
  type ToolExecutionStatus,
  type ToolExecutionUnit,
  type ToolExecutionUnitKind,
  type ToolExecutionUnitRecord,
  type ToolSchedulerExecuteInput,
  type ToolSchedulerExecuteResult,
  type ToolSchedulerPolicy,
  type ToolSchedulerResult,
} from "../executionEngine/coreLogic/toolScheduler.js";

export {
  assemblePromptPack,
  type PromptPackCachePlan,
  type PromptPackCacheTelemetry,
  type PromptPackSegment,
  type PromptPackSegmentCachePolicy,
  type PromptPackSegmentStability,
  type StandardPromptPack,
} from "../executionEngine/promptPack/promptAssembler.js";

export {
  createContextCompactionPipelineExecutor,
  createLocalSummaryCompactExecutor,
  createRuntimeFallbackCompactExecutor,
  decideTurnBoundaryCompact,
  CONTEXT_COMPACTOR_RESPONSE_SCHEMA,
  CONTEXT_ORGANIZER_RESPONSE_SCHEMA,
  LOCAL_SUMMARY_COMPACT_RESPONSE_SCHEMA,
  type ContextCompactionPipelineOptions,
  type ContextOrganizerPacket,
  type CompactModelCaller,
  type CompactModelCallerRequest,
  type CompactModelCallerResponse,
  type CompactModelMessage,
  type CompactExecutor,
  type CompactExecutorRequest,
  type CompactExecutorResult,
  type CompactRecord,
  type CompactThresholdDecision,
  type CompactTriggerKind,
  type LocalSummaryCompactExecutorOptions,
} from "../executionEngine/coreLogic/contextCompact.js";

export {
  PRE_COMPACT_GOVERNANCE_SCHEMA,
  createModelPreCompactGovernanceExecutor,
  createNoopPreCompactGovernanceExecutor,
  createSkippedPreCompactGovernanceRecord,
  packetMaterialRefs,
  parsePreCompactGovernanceResult,
  preCompactGovernanceInstruction,
  type PreCompactGovernanceExecutor,
  type PreCompactGovernanceExecutorRequest,
  type PreCompactGovernanceExecutorResult,
  type PreCompactGovernanceFact,
  type PreCompactGovernanceIndexedMaterial,
  type PreCompactGovernanceModelCaller,
  type PreCompactGovernanceModelResponse,
  type PreCompactGovernancePacket,
  type PreCompactGovernancePacketMaterial,
  type PreCompactGovernanceProjectContextUpdate,
  type PreCompactGovernanceRecord,
  type PreCompactGovernanceRemovedNoise,
  type PreCompactGovernanceResult,
} from "../executionEngine/coreLogic/preCompactGovernance.js";

export {
  PRAXIS_BASE_TOOL_CALLING_PROTOCOL,
  assemblePromptContextMaterials,
  promptPackMaterialsForManifest,
  type PromptContextAssemblyBudget,
  type PromptContextAssemblyRequest,
  type PromptContextAssemblyResult,
  type PromptContextConversationMessage,
  type PromptContextSessionSummary,
} from "../runtimeImplementation/runtime.execEngine/promptContextAssembly.js";

export {
  PROMPT_PACK_PROVIDER_VISIBLE_SEGMENT_KINDS,
  PROMPT_PACK_SEGMENT_KINDS,
  inferPromptPackSegmentKind,
  type PromptPackSegmentKind,
} from "../executionEngine/promptPack/promptDefiner.js";

export {
  createSandboxCommandPlan,
  createLocalSandboxRemoteWorkerAdapter,
  runSandboxCommand,
  sandboxCommandRunnerDescriptor,
  type SandboxCommandDenial,
  type SandboxCommandFilesystemPolicy,
  type SandboxCommandNetworkPolicy,
  type SandboxCommandPlan,
  type SandboxCommandProviderFamily,
  type SandboxCommandRequest,
  type SandboxCommandRunResult,
  type SandboxRemoteWorkerAdapter,
} from "../runtimeImplementation/runtime.sandboxPlane/sandboxCommandRunner.js";

export {
  createSandboxRuntimeProvider,
  prepareSandboxRuntime,
  resolveRaxcellBinaryPath,
  sandboxRuntimeProviderDescriptor,
  type SandboxRuntimePrepareResult,
  type SandboxRuntimeDependencyCheck,
  type SandboxRuntimeSelfRepairHint,
  type SandboxRuntimeProvider,
  type SandboxRuntimeProviderAction,
  type SandboxRuntimeProviderProbe,
  type SandboxRuntimeProviderStatus,
  type SandboxRuntimeSmokeResult,
} from "../runtimeImplementation/runtime.sandboxPlane/sandboxRuntimeProvider.js";

export {
  createRaxcellSandboxProvider,
  mapSandboxProviderRequestToRaxcell,
  raxcellSandboxProviderDescriptor,
  type RaxcellClientLike,
  type RaxcellSandboxProviderOptions,
} from "../runtimeImplementation/runtime.sandboxPlane/raxcellSandboxProvider.js";

export {
  runSandboxPolicyMiddleware,
  sandboxPolicyMiddlewareDescriptor,
  type SandboxExecutionProviderPort,
  type SandboxPolicyMiddlewareAuditEvent,
  type SandboxPolicyMiddlewareEnvironmentGapDecision,
  type SandboxPolicyMiddlewareResult,
  type SandboxProviderRunRequest,
} from "../runtimeImplementation/runtime.sandboxPlane/sandboxPolicyMiddleware.js";

export {
  inspectSandboxRuntimeMountMatrix,
  type InspectSandboxRuntimeMountMatrixInput,
  type SandboxMountMatrixCommandPreview,
  type SandboxMountMatrixIsolationEvidence,
  type SandboxMountMatrixProviderEvidence,
  type SandboxMountMatrixStatus,
  type SandboxRuntimeMountMatrix,
} from "../runtimeImplementation/runtime.sandboxPlane/sandboxMountMatrix.js";

export {
  approvalInterfaceEnvelope,
  createInterfaceEnvelope,
  eventInterfaceEnvelope,
  managementInterfaceEnvelope,
  repairInterfaceEnvelope,
  stateInterfaceEnvelope,
  type InterfaceEnvelope,
  type InterfaceEnvelopeKind,
  type InterfaceEnvelopeSurface,
  type InterfaceEnvelopeValidationErrorCode,
  type InterfaceEnvelopeValidationResult,
} from "../interfaceAdapter/interfaceEnvelope.js";

export {
  bindBasicInterfaceLayer,
  type BasicInterfaceKind,
  type BasicInterfaceLayerBinding,
  type BasicInterfaceLayerBindingRequest,
  type BasicInterfaceLayerBindingResult,
  type BasicInterfaceRef,
} from "../runtimeImplementation/runtime.interfaceAdapter/bindBasicInterfaceLayer.js";

export {
  createInterfaceAdapterRuntime,
  type InterfaceAdapterRuntimeBinding,
  type InterfaceAdapterRuntimeBindingInput,
  type InterfaceAdapterRuntimeCaller,
  type InterfaceAdapterRuntimeHandle,
  type InterfaceAdapterRuntimeRequest,
  type InterfaceAdapterRuntimeResult,
  type InterfaceAdapterRuntimeSurface,
} from "../runtimeImplementation/runtime.interfaceAdapter/interfaceAdapterRuntime.js";

export {
  applyRaxStorageInitPlan,
  createAndApplyStoragePlaneRuntime,
  createRaxStorageLayout,
  createStoragePlaneRuntime,
  planRaxStorageInit,
  resolveRaxHome,
  resolveRaxWorkspace,
  type RaxHomeResolution,
  type RaxPathResolutionError,
  type RaxPathResolutionErrorCode,
  type RaxPathResolutionResult,
  type RaxStorageHomeLayout,
  type RaxStorageInitDirectory,
  type RaxStorageInitPlan,
  type RaxStorageInitResult,
  type RaxStorageLayout,
  type RaxStorageLayoutRefs,
  type RaxStorageWorkspaceLayout,
  type RaxWorkspaceResolution,
  type StoragePlaneRuntime,
  type StoragePlaneRuntimeInput,
  type StoragePlaneRuntimeResult,
} from "../runtimeImplementation/runtime.storagePlane/storagePlaneRuntime.js";

export {
  openPraxisProject,
  projectDescriptor,
  project,
  type PraxisArtifactRecord,
  type PraxisConversationMessageRecord,
  type PraxisConversationRole,
  type PraxisConversationSummaryRecord,
  type PraxisFoundationProjectSnapshot,
  type PraxisFoundationSessionSnapshot,
  type PraxisFoundationStatus,
  type PraxisFoundationStore,
  type PraxisProjectAgentEntrySpec,
  type PraxisProjectArtifactsSpec,
  type PraxisProjectKind,
  type PraxisProjectLeaseRecord,
  type PraxisProjectOpenMode,
  type PraxisProjectOpenOptions,
  type PraxisProjectOpenResult,
  type PraxisProjectRecord,
  type PraxisProjectRuntime,
  type PraxisProjectSessionsSpec,
  type PraxisProjectSpec,
  type PraxisProjectSpecInput,
  type PraxisProjectStub,
  type PraxisProjectWorkspaceRecord,
  type PraxisProjectWorkspaceSpec,
  type PraxisSessionAgentBindingRecord,
  type PraxisSessionRecord,
  type PraxisTurnRecord,
  createInMemoryProjectStore,
  createSqliteProjectStore,
} from "../runtimeImplementation/runtime.projectPlane/index.js";

export {
  createPraxisSessionManager,
  type CreatePraxisSessionInput,
  type ForkPraxisSessionInput,
  type PraxisSessionManager,
  type SwitchSessionAgentInput,
} from "../runtimeImplementation/runtime.sessionPlane/index.js";

export {
  createPraxisConversationManager,
  type AppendAssistantTurnInput,
  type AppendConversationMessageInput,
  type AppendUserTurnInput,
  type CreateConversationTurnInput,
  type ForkConversationMessagesInput,
  type PraxisConversationManager,
  type ReadConversationWindowInput,
  type WriteConversationSummaryInput,
} from "../runtimeImplementation/runtime.conversationPlane/index.js";

export {
  type BaseToolExecutorPort,
  type BaseToolExecutorResult,
} from "../basetool/types.js";

export {
  baseToolExecutorPortFactoryDescriptor,
  createRuntimeBaseToolExecutorPort,
  listRuntimeBaseToolImplementedPortPaths,
  type RuntimeBaseToolExecutorContext,
  type RuntimeBaseToolExecutorEvent,
  type RuntimeBaseToolExecutorPolicy,
  type RuntimeBaseToolExecutorResourceLimits,
  type RuntimeBaseToolExecutorSandbox,
} from "../runtimeImplementation/runtime.execEngine/baseToolExecutorPortFactory.js";

export {
  createRuntimeSurfaceRegistry,
  runtimeSurfaceRegistryCapability,
  type RegisteredRuntimeSurface,
  type RuntimeSurfaceDescriptor,
  type RuntimeSurfaceKind,
  type RuntimeSurfaceRegistry,
  type RuntimeSurfaceRegistryBoundary,
  type RuntimeSurfaceRegistryCaller,
  type RuntimeSurfaceRegistryError,
  type RuntimeSurfaceRegistryErrorCode,
  type RuntimeSurfaceRegistryGate,
  type RuntimeSurfaceRegistryRequest,
  type RuntimeSurfaceRegistryResult,
  type RuntimeSurfaceResolveRequest,
  type RuntimeSurfaceResolveResult,
} from "../runtimeImplementation/runtimeSurfaceRegistry.js";

export {
  createRuntimeCompositionRoot,
  runtimeCompositionRootSurface,
  type RuntimeCompositionRootBoundary,
  type RuntimeCompositionRootCaller,
  type RuntimeCompositionRootCallerKind,
  type RuntimeCompositionRootError,
  type RuntimeCompositionRootErrorCode,
  type RuntimeCompositionRootGate,
  type RuntimeCompositionRootRequest,
  type RuntimeCompositionRootResult,
  type RuntimeCompositionRootSnapshot,
  type RuntimeCompositionSurfaceBinding,
  type RuntimeCompositionSurfaceInput,
  type RuntimeCompositionSurfaceName,
} from "../runtimeImplementation/runtimeCompositionRoot.js";

export {
  inspectRuntimeSurfaces,
  runtimeSurfaceInspectorDescriptor,
  type RuntimeSurfaceAttachment,
  type RuntimeSurfaceInspectionEntry,
  type RuntimeSurfaceInspectionSnapshot,
  type RuntimeSurfaceInspectorBoundary,
  type RuntimeSurfaceInspectorError,
  type RuntimeSurfaceInspectorErrorCode,
  type RuntimeSurfaceInspectorGate,
  type RuntimeSurfaceInspectorRequest,
  type RuntimeSurfaceInspectorResult,
  type RuntimeSurfaceStatus,
} from "../runtimeImplementation/runtime.inspection/runtimeSurfaceInspector.js";

export {
  PraxisRuntimeKernel,
  createPraxisRuntimeKernel,
  type AgentModelCallProgressEvent,
  type AgentModelCallRecord,
  type AgentModelUsageRecord,
  type AgentRunResult,
  type AgentToolCallProgressEvent,
  type AgentToolCallRecord,
  type PraxisRuntimeKernelError,
  type PraxisRuntimeKernelErrorCode,
  type PraxisRuntimeKernelOptions,
  type RuntimeApprovalEnvelope,
  type RuntimeApprovalResolution,
  type RuntimeApprovalResolver,
  type RuntimeAgentReviewEnvelope,
  type RuntimeAgentReviewResolution,
  type RuntimeAgentReviewResolver,
} from "../runtimeImplementation/praxisRuntimeKernel.js";

export {
  createInMemorySessionStateEventStore,
  createSqliteSessionStateEventStore,
  type RuntimeSessionSnapshot,
  type RuntimeSessionStateEventStore,
} from "../runtimeImplementation/runtimeSessionStateEventStore.js";

export {
  bindProviderRoleModel,
  bindRaxodeRoleModel,
  createProviderModelEntry,
  createProviderProfileConfiguration,
  createProviderSecret,
  createRaxodeModelEntry,
  createRaxodeProviderProfile,
  createRaxodeSecret,
  maskProviderSecret,
  maskRaxodeSecret,
  resolveProviderRequestUrl,
  resolveRaxodeProviderRequestUrl,
  type ProviderConfigurationError,
  type ProviderEndpointShape,
  type ProviderModelEntry,
  type ProviderModelEntryResult,
  type ProviderProfileConfiguration,
  type ProviderProfileConfigurationResult,
  type ProviderRequestUrlPlan,
  type ProviderRequestUrlResult,
  type ProviderRoleBinding,
  type ProviderRoleBindingResult,
  type ProviderSecret,
  type ProviderSecretResult,
  type ProviderUrlMode,
  type RaxodeEndpointShape,
  type RaxodeModelEntry,
  type RaxodeModelEntryResult,
  type RaxodeProviderConfigurationError,
  type RaxodeProviderProfile,
  type RaxodeProviderProfileResult,
  type RaxodeProviderRequestUrlPlan,
  type RaxodeProviderRequestUrlResult,
  type RaxodeRoleBinding,
  type RaxodeRoleBindingResult,
  type RaxodeSecret,
  type RaxodeSecretResult,
  type RaxodeUrlMode,
} from "../modelAdapter/authProfileLayer/providerConfiguration.js";

export {
  createFrameworkInspectionReport,
  type FrameworkDependencyInput,
  type FrameworkInspectionFinding,
  type FrameworkInspectionReport,
  type FrameworkInspectionReportRequest,
  type FrameworkInspectionReportResult,
  type FrameworkProviderReadinessInput,
  type FrameworkPromptPackPreviewInput,
  type FrameworkToolReadinessInput,
} from "../runtimeImplementation/runtime.inspection/frameworkInspectionReport.js";

export {
  baseToolDeveloperCatalogDescriptor,
  baseToolCodingCoreDescriptor,
  basetool,
  baseToolProfile,
  createBaseToolRegistry,
  createBaseToolSupportCatalog,
  evaluateBaseToolRuntimeReadiness,
  listBaseToolDeveloperCatalog,
  listBaseToolProfiles,
  toolSets,
  tryBaseToolById,
  type BaseToolDefinition,
  type BaseToolDeveloperCatalogEntry,
  type BaseToolDeveloperLookupResult,
  type BaseToolProfile,
  type BaseToolProfileName,
  type BaseToolSpecInput,
  type CodingToolSetOptions,
} from "../basetool/index.js";

export {
  baseToolRealityLedgerDescriptor,
  createBaseToolRealityLedger,
  inspectBaseToolReality,
  snapshotBaseToolRealityLedger,
  type BaseToolDependencyRealityStatus,
  type BaseToolDeveloperReadiness,
  type BaseToolExecutorSupportRealityStatus,
  type BaseToolLiveRealityStatus,
  type BaseToolRealityCapabilityClass,
  type BaseToolRealityLedgerEntry,
  type BaseToolRealityLedgerOptions,
  type BaseToolRealityLiveGate,
  type BaseToolRealityProjection,
  type BaseToolRealityStages,
  type BaseToolRealityStageStatus,
  type BaseToolRealityLedgerSnapshot,
  type BaseToolRegistryMountStatus,
  type BaseToolStorageRealityStatus,
} from "../runtimeImplementation/runtime.execEngine/baseToolRealityLedger.js";

export {
  createApiKeyAuthEnvelope,
  createBearerAuthEnvelope,
  createMissingAuthEnvelope,
  mergeAuthMaterialHeaders,
  toPublicAuthEnvelope,
  type AuthEnvelope,
  type AuthEnvelopeKind,
  type AuthHeaderPlan,
  type AuthQueryPlan,
  type ProviderAuthMaterial,
  type ResolvedAuthEnvelope,
} from "../modelAdapter/authProfileLayer/authEnvelope.js";

export {
  createChatGPTCodexAuthEnvelope,
  createChatGPTCodexAuthMaterial,
  createChatGPTCodexRedactedIdentity,
  parseChatGPTCodexAuthJson,
  parseChatGPTCodexJwtClaims,
  toPublicChatGPTCodexAuthSnapshot,
  type ChatGPTCodexAuthSnapshot,
  type ChatGPTCodexJwtClaims,
  type ChatGPTCodexPlanType,
  type ChatGPTCodexPublicSnapshot,
  type ParseChatGPTCodexAuthResult,
} from "../modelAdapter/authProfileLayer/codexAuth.js";

export {
  createCredentialRef,
  credentialRefKey,
  type CredentialRef,
  type CredentialRefErrorCode,
  type CredentialRefInput,
  type CredentialRefResult,
  type CredentialSource,
  type CredentialSourceKind,
  type CredentialType,
  type ProviderCredentialKind,
} from "../modelAdapter/authProfileLayer/credentialRef.js";

export {
  runtimeAuth,
  runtimeAuth as auth,
  authAuditEvent,
  bindRuntimeAuthRole,
  createInMemoryRuntimeAuthSecretVault,
  createRuntimeAuthModelEntry,
  createRuntimeAuthProviderProfile,
  createRuntimeAuthRegistry,
  createRuntimeAuthResolver,
  createRuntimeAuthSecretRecord,
  decryptRuntimeAuthSecretRecord,
  runtimeAuthCredentialRef,
  toRuntimeAuthSecretPublicView,
  type RuntimeAuthAuditEvent,
  type RuntimeAuthAuditEventKind,
  type RuntimeAuthCredentialRef,
  type RuntimeAuthEndpointShape,
  type RuntimeAuthEncryptedPayload,
  type RuntimeAuthModelEntry,
  type RuntimeAuthProviderKind,
  type RuntimeAuthProviderProfile,
  type RuntimeAuthRegistry,
  type RuntimeAuthRegistrySnapshot,
  type RuntimeAuthResolver,
  type RuntimeAuthResolverRequest,
  type RuntimeAuthResolverResult,
  type RuntimeAuthRole,
  type RuntimeAuthRoleBinding,
  type RuntimeAuthSecretKind,
  type RuntimeAuthSecretPlaintext,
  type RuntimeAuthSecretPublicView,
  type RuntimeAuthSecretRecord,
  type RuntimeAuthSecretVault,
  type RuntimeAuthVaultKeyProvider,
} from "../runtimeImplementation/runtime.authPlane/index.js";

export {
  ExecutionMonitor,
  analyzeExecutionMonitor,
  type AnalyzeExecutionMonitorInput,
  type ExecutionMonitorArtifactPointer,
  type ExecutionMonitorCacheShapeSummary,
  type ExecutionMonitorFinding,
  type ExecutionMonitorHealthGrade,
  type ExecutionMonitorModelCallReport,
  type ExecutionMonitorObserveInput,
  type ExecutionMonitorOptions,
  type ExecutionMonitorProjectReport,
  type ExecutionMonitorPromptPackSummary,
  type ExecutionMonitorProviderReuseSummary,
  type ExecutionMonitorReport,
  type ExecutionMonitorSessionReport,
  type ExecutionMonitorSeverity,
  type ExecutionMonitorTargetPlane,
  type ExecutionMonitorThresholds,
  type ExecutionMonitorTurnReport,
  type ExecutionMonitorUsageTotals,
} from "../runtimeImplementation/runtime.executionMonitor/index.js";

export {
  createRuntimeGovernanceIndex,
  createRuntimeGovernanceReport,
  queryRuntimeGovernance,
  type CreateRuntimeGovernanceReportInput,
  type QueryRuntimeGovernanceInput,
  type RuntimeGovernanceDecision,
  type RuntimeGovernanceDecisionKind,
  type RuntimeGovernanceIndex,
  type RuntimeGovernanceQuery,
  type RuntimeGovernanceQueryResult,
  type RuntimeGovernanceReport,
} from "../runtimeImplementation/runtime.governancePlane/index.js";

export {
  createRuntimeSessionReport,
  type CreateRuntimeSessionReportInput,
  type RuntimeSessionMessageDigest,
  type RuntimeSessionReport,
  type RuntimeSessionReportSourceKind,
  type RuntimeSessionTurnReport,
} from "../runtimeImplementation/runtime.sessionPlane/index.js";

export {
  createRuntimeTimelineIndex,
  createRuntimeTimelineReport,
  createRuntimeTimelineReplayPlan,
  queryRuntimeTimeline,
  type CreateRuntimeTimelineReportInput,
  type CreateRuntimeTimelineReplayPlanInput,
  type QueryRuntimeTimelineInput,
  type RuntimeTimelineCheckpoint,
  type RuntimeTimelineIndex,
  type RuntimeTimelineItem,
  type RuntimeTimelineItemKind,
  type RuntimeTimelineQuery,
  type RuntimeTimelineQueryResult,
  type RuntimeTimelineReport,
  type RuntimeTimelineReplayPlan,
  type RuntimeTimelineSessionFork,
  type RuntimeTimelineSourceKind,
} from "../runtimeImplementation/runtime.timelinePlane/index.js";

export {
  createRuntimeManagementPlane,
  type RuntimeManagementBoundary,
  type RuntimeManagementCaller,
  type RuntimeManagementCallerKind,
  type RuntimeManagementComponent,
  type RuntimeManagementComponentInput,
  type RuntimeManagementError,
  type RuntimeManagementErrorCode,
  type RuntimeManagementGate,
  type RuntimeManagementHandle,
  type RuntimeManagementPlaneRequest,
  type RuntimeManagementPlaneResult,
  type RuntimeManagementSurface,
} from "../runtimeImplementation/runtime.managementPlane/runtimeManagementPlane.js";

export {
  createRuntimeAccessSession,
  isRuntimeAccessSessionActive,
  runtimeAccessSessionDescriptor,
  type RuntimeAccessSession,
  type RuntimeAccessSessionActor,
  type RuntimeAccessSessionActorKind,
  type RuntimeAccessSessionBoundary,
  type RuntimeAccessSessionError,
  type RuntimeAccessSessionErrorCode,
  type RuntimeAccessSessionGate,
  type RuntimeAccessSessionRequest,
  type RuntimeAccessSessionResult,
} from "../runtimeImplementation/runtime.managementPlane/runtimeAccessSession.js";

export {
  evaluateManagementPolicyGate,
  managementPermissionByEffect,
  managementPolicyGateDescriptor,
  type ManagementCommandEffect,
  type ManagementCommandEnvelope,
  type ManagementPolicyBoundary,
  type ManagementPolicyDecision,
  type ManagementPolicyDecisionStatus,
  type ManagementPolicyGateError,
  type ManagementPolicyGateErrorCode,
  type ManagementPolicyGateRequest,
  type ManagementPolicyGateResult,
  type ManagementPolicyRule,
  type ManagementPolicyRuleMatch,
} from "../runtimeImplementation/runtime.managementPlane/managementPolicyGate.js";

export {
  managementCommandRouterDescriptor,
  routeManagementCommand,
  type ManagementCommandRoute,
  type ManagementCommandRouteBoundary,
  type ManagementCommandRoutePlan,
  type ManagementCommandRouterError,
  type ManagementCommandRouterErrorCode,
  type ManagementCommandRouterRequest,
  type ManagementCommandRouterResult,
} from "../runtimeImplementation/runtime.managementPlane/managementCommandRouter.js";

export {
  openRuntimeOperatorConsole,
  type RuntimeOperatorCommandEnvelope,
  type RuntimeOperatorCommandInput,
  type RuntimeOperatorConsoleError,
  type RuntimeOperatorConsoleErrorCode,
  type RuntimeOperatorConsoleRequest,
  type RuntimeOperatorConsoleResult,
  type RuntimeOperatorConsoleSession,
  type RuntimeOperatorConsoleVerb,
  type RuntimeOperatorIdentity,
  type RuntimeOperatorRole,
} from "../runtimeImplementation/runtime.managementPlane/runtimeOperatorConsole.js";

export {
  governRuntimeResources,
  type RuntimeResourceBudget,
  type RuntimeResourceDecision,
  type RuntimeResourceDemand,
  type RuntimeResourceGovernorError,
  type RuntimeResourceGovernorErrorCode,
  type RuntimeResourceGovernorRequest,
  type RuntimeResourceGovernorResult,
  type RuntimeResourceGovernorSnapshot,
  type RuntimeResourceKind,
} from "../runtimeImplementation/runtime.managementPlane/runtimeResourceGovernor.js";

export {
  planRuntimeMutation,
  type RuntimeMutationOperation,
  type RuntimeMutationPlan,
  type RuntimeMutationPlannerError,
  type RuntimeMutationPlannerErrorCode,
  type RuntimeMutationPlannerRequest,
  type RuntimeMutationPlannerResult,
  type RuntimeMutationPlanStep,
  type RuntimeMutationProposal,
  type RuntimeMutationRisk,
} from "../runtimeImplementation/runtime.managementPlane/runtimeMutationPlanner.js";

export {
  createRuntimeGovernanceBridgeEnvelope,
  runtimeGovernanceBridgeDescriptor,
  type RuntimeGovernanceBridgeBoundary,
  type RuntimeGovernanceBridgeEnvelope,
  type RuntimeGovernanceBridgeError,
  type RuntimeGovernanceBridgeErrorCode,
  type RuntimeGovernanceBridgeRequest,
  type RuntimeGovernanceBridgeResult,
  type RuntimeGovernanceBridgeStatus,
} from "../runtimeImplementation/runtime.managementPlane/runtimeGovernanceBridge.js";

export {
  planRuntimeRollback,
  type RuntimeRollbackBoundary,
  type RuntimeRollbackCheckpoint,
  type RuntimeRollbackError,
  type RuntimeRollbackErrorCode,
  type RuntimeRollbackGate,
  type RuntimeRollbackPlan,
  type RuntimeRollbackRequest,
  type RuntimeRollbackResult,
  type RuntimeRollbackTrace,
} from "../runtimeImplementation/runtime.managementPlane/runtimeRollbackController.js";

export {
  createRuntimeModelCallIndex,
  createRuntimeModelCallReport,
  queryRuntimeModelCalls,
  type CreateRuntimeModelCallReportInput,
  type QueryRuntimeModelCallsInput,
  type RuntimeModelCallApplicationEvent,
  type RuntimeModelCallCache,
  type RuntimeModelCallFleet,
  type RuntimeModelCallIndex,
  type RuntimeModelCallProvider,
  type RuntimeModelCallQuery,
  type RuntimeModelCallQueryResult,
  type RuntimeModelCallRecord,
  type RuntimeModelCallReport,
  type RuntimeModelCallSourceKind,
  type RuntimeModelCallStatus,
  type RuntimeModelCallUsage,
} from "../runtimeImplementation/runtime.modelCallPlane/index.js";

export {
  createRuntimeToolCallIndex,
  createRuntimeToolCallReport,
  queryRuntimeToolCalls,
  type CreateRuntimeToolCallReportInput,
  type QueryRuntimeToolCallsInput,
  type RuntimeToolCallIndex,
  type RuntimeToolCallQuery,
  type RuntimeToolCallQueryResult,
  type RuntimeToolCallRecord,
  type RuntimeToolCallReport,
  type RuntimeToolCallSourceKind,
} from "../runtimeImplementation/runtime.toolCallPlane/index.js";

export {
  createRuntimeMultiagentIndex,
  createRuntimeMultiagentReport,
  queryRuntimeMultiagent,
  type CreateRuntimeMultiagentReportInput,
  type QueryRuntimeMultiagentInput,
  type RuntimeMultiagentApplicationEvent,
  type RuntimeMultiagentApplicationReport,
  type RuntimeMultiagentBridgeReport,
  type RuntimeMultiagentCoverage,
  type RuntimeMultiagentIndex,
  type RuntimeMultiagentMessageReport,
  type RuntimeMultiagentQuery,
  type RuntimeMultiagentQueryResult,
  type RuntimeMultiagentReport,
  type RuntimeMultiagentSessionReport,
  type RuntimeMultiagentSmokeFacts,
  type RuntimeMultiagentSourceKind,
  type RuntimeMultiagentToolReport,
} from "../runtimeImplementation/runtime.multiagentPlane/index.js";

export {
  createRuntimeOfficialAdapterIndex,
  createRuntimeOfficialAdapterReport,
  queryRuntimeOfficialAdapters,
  type CreateRuntimeOfficialAdapterReportInput,
  type QueryRuntimeOfficialAdaptersInput,
  type RuntimeOfficialAdapterApplicationEvent,
  type RuntimeOfficialAdapterCompositionInput,
  type RuntimeOfficialAdapterCoverage,
  type RuntimeOfficialAdapterEvidenceInput,
  type RuntimeOfficialAdapterFamilyKey,
  type RuntimeOfficialAdapterIndex,
  type RuntimeOfficialAdapterMcpPlusEvidenceInput,
  type RuntimeOfficialAdapterMcpPlusReport,
  type RuntimeOfficialAdapterQuery,
  type RuntimeOfficialAdapterQueryResult,
  type RuntimeOfficialAdapterRecord,
  type RuntimeOfficialAdapterReport,
  type RuntimeOfficialAdapterSourceKind,
  type RuntimeOfficialAdapterStatus,
} from "../runtimeImplementation/runtime.officialAdapterPlane/index.js";

export {
  type BaseToolContextSelection,
  type BaseToolContextUsageRecord,
} from "../runtimeImplementation/runtime.execEngine/baseToolContextFolding.js";

export {
  createProviderToolMappings,
  createPraxisToolDeclarations,
  lowerPraxisToolsForProvider,
  lowerProviderToolResult,
  normalizeProviderInputSchema,
  providerToolName,
  raiseProviderToolCalls,
  type LowerProviderToolResultRequest,
  type LowerPraxisToolsForProviderRequest,
  type ProviderCacheHintPlan,
  type ProviderToolCallEnvelope,
  type ProviderToolDeclarationBundle,
  type ProviderToolNameMapping,
  type ProviderToolResultContentBlock,
  type ProviderToolResultEnvelope,
  type ProviderToolSchemaFamily,
  type PraxisToolDeclaration,
  type PraxisToolProviderKind,
  type RaiseProviderToolCallsRequest,
} from "../modelAdapter/bridgingLayer/toolSchemaCompatibilityLayer.js";

/**
 * Recommended developer authoring boxes.
 *
 * 白话：细粒度导出还保留；这些对象只是给普通开发者一个更像 framework 的入口，
 * 不用在一个 Agent 文件顶部 import 三十多个零件。
 */
export const authoringPrimitives = Object.freeze({
  PromptPack,
  PraxisAgent,
  PraxisAgentArchetype,
  compileAgent,
  inspectAgentManifest,
  validateAgentManifest,
});

export const promptPack = Object.freeze({
  PromptPack,
  append,
  assemblePromptContextMaterials,
  markdown,
  markdownFile,
  overwrite,
  promptPackMaterialsForManifest,
  prepend,
  replaceLastLines,
});

export const modelAuthoring = Object.freeze({
  endpoint,
  model,
  modelFleet,
});

export const modelAuth = Object.freeze({
  apiKeyEnvelope: createApiKeyAuthEnvelope,
  bearerEnvelope: createBearerAuthEnvelope,
  chatgptCodexAuthEnvelope: createChatGPTCodexAuthEnvelope,
  chatgptCodexAuthMaterial: createChatGPTCodexAuthMaterial,
  chatgptCodexRedactedIdentity: createChatGPTCodexRedactedIdentity,
  credentialRef: createCredentialRef,
  credentialRefKey,
  missingEnvelope: createMissingAuthEnvelope,
  mergeMaterialHeaders: mergeAuthMaterialHeaders,
  parseChatGPTCodexAuthJson,
  parseChatGPTCodexJwtClaims,
  toPublicAuthEnvelope,
  toPublicChatGPTCodexAuthSnapshot,
});

export const harnessRuntimePolicy = Object.freeze({
  harness,
  loop,
  mainLoop,
  policy,
  sandbox,
  session,
  statePlane,
  storage,
});

export const baseTool = Object.freeze({
  basetool,
  profile: baseToolProfile,
  profiles: listBaseToolProfiles,
  createBaseToolRegistry,
  createBaseToolSupportCatalog,
  evaluateBaseToolRuntimeReadiness,
  tool,
  tools,
  toolPolicies,
  toolSets,
  tryBaseToolById,
  listBaseToolDeveloperCatalog,
  baseToolDeveloperCatalogDescriptor,
  baseToolCodingCoreDescriptor,
});

export const runtimeKernel = Object.freeze({
  PraxisRuntimeKernel,
  createPraxisRuntimeKernel,
  createBaseToolExecutorPort: createRuntimeBaseToolExecutorPort,
  listBaseToolImplementedPortPaths: listRuntimeBaseToolImplementedPortPaths,
  baseToolExecutorPortFactoryDescriptor,
  inspectMcpMountMatrix: inspectMcpRuntimeMountMatrix,
  inspectSandboxMountMatrix: inspectSandboxRuntimeMountMatrix,
  createSurfaceRegistry: createRuntimeSurfaceRegistry,
  runtimeSurfaceRegistryCapability,
  createCompositionRoot: createRuntimeCompositionRoot,
  runtimeCompositionRootSurface,
  createInMemorySessionStateEventStore,
  createSqliteSessionStateEventStore,
  createRuntimeGovernanceReport,
  createRuntimeGovernanceIndex,
  queryRuntimeGovernance,
  createRuntimeSessionReport,
  createRuntimeTimelineReport,
  createRuntimeTimelineIndex,
  queryRuntimeTimeline,
  createRuntimeTimelineReplayPlan,
  createRuntimeManagementPlane,
  createRuntimeAccessSession,
  evaluateManagementPolicyGate,
  routeManagementCommand,
  openRuntimeOperatorConsole,
  governRuntimeResources,
  planRuntimeMutation,
  createRuntimeGovernanceBridgeEnvelope,
  planRuntimeRollback,
  createRuntimeModelCallReport,
  createRuntimeModelCallIndex,
  queryRuntimeModelCalls,
  createRuntimeToolCallReport,
  createRuntimeToolCallIndex,
  queryRuntimeToolCalls,
  createRuntimeMultiagentReport,
  createRuntimeMultiagentIndex,
  queryRuntimeMultiagent,
  createRuntimeOfficialAdapterReport,
  createRuntimeOfficialAdapterIndex,
  queryRuntimeOfficialAdapters,
  project: Object.freeze({
    open: openPraxisProject,
  }),
  session: Object.freeze({
    createPraxisSessionManager,
  }),
  conversation: Object.freeze({
    createPraxisConversationManager,
  }),
});

export const mcpPlane = Object.freeze({
  mcp,
  buildMcpServerProfilesFromManifest,
  createMcpApplicationStateView,
  createFileMcpPlusProfileStore,
  createFileMcpPlusSkillStore,
  createInMemoryMcpPlusOverlayStore,
  createInMemoryMcpPlusProfileStore,
  createInMemoryMcpPlusSkillStore,
  inspectMcpRuntimeMountMatrix,
  planMcpHarnessExposure,
});

export const executionCore = Object.freeze({
  adjudicateRuntimeDecision,
  assemblePromptPack,
  createLoopTick,
  createMainLoopCheckpoint,
  createMainLoopRun,
  createMainLoopSessionTimeline,
  createMainLoopStepRecord,
  createMainLoopTimelineRef,
  createUserTurn,
  decideMainLoopFinalAcceptance,
  decideTurnBoundaryCompact,
  exposeMainLoopState,
  interpretModelDecision,
  planFrameworkMainLoopHandoff,
  prepareMainLoopTurn,
  resolveMainLoopFailureRecovery,
  resolveMainLoopBudget,
  runMainLoop,
  selectMainLoopModel,
  createContextCompactionPipelineExecutor,
  createLocalSummaryCompactExecutor,
  createRuntimeFallbackCompactExecutor,
  createObservationMaterial,
});

export const inspection = Object.freeze({
  createFrameworkInspectionReport,
  inspectRuntimeSurfaces,
  runtimeSurfaceInspectorDescriptor,
  createBaseToolRealityLedger,
  inspectBaseToolReality,
  snapshotBaseToolRealityLedger,
  baseToolRealityLedgerDescriptor,
});

export const storagePlane = Object.freeze({
  applyRaxStorageInitPlan,
  createAndApplyStoragePlaneRuntime,
  createRaxStorageLayout,
  createStoragePlaneRuntime,
  planRaxStorageInit,
  resolveRaxHome,
  resolveRaxWorkspace,
});

export const memory = Object.freeze({
  ...memoryPlane,
});

export const projectPlane = Object.freeze({
  project: defineProject,
  descriptor: projectDescriptor,
  open: openPraxisProject,
  createSessionManager: createPraxisSessionManager,
  createConversationManager: createPraxisConversationManager,
});

export const provisionPlane = Object.freeze({
  capabilities,
  capability,
  dependencies,
  dependency: dependencyAuthoring,
  createProvisionPlan,
  provisionRuntimeDescriptor,
});

export const componentPlane = Object.freeze({
  component,
  createRuntimeComponentRegistry,
  lookupRuntimeComponent,
  officialRuntimeComponents,
});

export const dependencyPlane = Object.freeze({
  canonicalDependencyId,
  createDependencySourceRegistry,
  defaultManagedRoot,
  ensureDependencyAvailable,
  lookupDependencySource,
  officialDependencySources,
  planDependencyInstallation,
  probeDependency,
});

export const sandboxPlane = Object.freeze({
  createRaxcellSandboxProvider,
  createSandboxCommandPlan,
  createLocalSandboxRemoteWorkerAdapter,
  createSandboxRuntimeProvider,
  inspectSandboxRuntimeMountMatrix,
  mapSandboxProviderRequestToRaxcell,
  prepareSandboxRuntime,
  resolveRaxcellBinaryPath,
  runSandboxPolicyMiddleware,
  runSandboxCommand,
  raxcellSandboxProviderDescriptor,
  sandboxCommandRunnerDescriptor,
  sandboxPolicyMiddlewareDescriptor,
  sandboxRuntimeProviderDescriptor,
});

export const interfaceAdapter = Object.freeze({
  approvalInterfaceEnvelope,
  bindBasicInterfaceLayer,
  createInterfaceEnvelope,
  createInterfaceAdapterRuntime,
  eventInterfaceEnvelope,
  managementInterfaceEnvelope,
  repairInterfaceEnvelope,
  stateInterfaceEnvelope,
});

/**
 * One-object authoring facade.
 *
 * 白话：这是最省心的开发者入口。用户可以只写：
 *
 * ```ts
 * import { praxis } from "@praxis-ai/praxis";
 * ```
 *
 * 然后用 `praxis.AgentArchetype`、`praxis.prompt.append`、
 * `praxis.model(...)`、`praxis.basetool.core.fileRead()` 来定义 Agent。
 */
export const praxis = Object.freeze({
  Agent: PraxisAgent,
  AgentArchetype: PraxisAgentArchetype,
  PraxisAgent,
  PraxisAgentArchetype,
  PromptPack,
  compileAgent,
  inspectAgentManifest,
  validateAgentManifest,

  prompt: promptPack,
  append,
  markdown,
  markdownFile,
  overwrite,
  prepend,
  replaceLastLines,

  endpoint,
  model,
  modelFleet,
  auth: runtimeAuth,
  modelAuth,

  harness,
  loop,
  mainLoop,
  policy,
  sandbox,
  capabilities,
  capability,
  dependencies,
  dependency: dependencyAuthoring,
  component,
  session,
  project: defineProject,
  statePlane,
  storage,
  memory,
  mcp,
  mcpPlane,
  buildMcpServerProfilesFromManifest,
  createInMemoryMcpPlusSkillStore,

  basetool,
  basetools: basetool,
  baseTool,
  baseToolProfile,
  listBaseToolProfiles,
  createBaseToolRegistry,
  createBaseToolSupportCatalog,
  evaluateBaseToolRuntimeReadiness,
  tool,
  tools,
  toolPolicies,
  toolSets,
  tryBaseToolById,
  listBaseToolDeveloperCatalog,
  baseToolCodingCoreDescriptor,

  runtime: runtimeKernel,
  projectPlane,
  provision: provisionPlane,
  dependencyPlane,
  componentPlane,
  execution: executionCore,
  inspection,
  storagePlane,
  sandboxPlane,
  interfaceAdapter,
});

export default praxis;
