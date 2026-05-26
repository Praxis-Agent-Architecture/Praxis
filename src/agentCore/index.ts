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
  sandboxRuntimeProviderDescriptor,
} from "../runtimeImplementation/runtime.sandboxPlane/sandboxRuntimeProvider.js";
import {
  createSandboxCommandPlan,
  createLocalSandboxRemoteWorkerAdapter,
  runSandboxCommand,
  sandboxCommandRunnerDescriptor,
} from "../runtimeImplementation/runtime.sandboxPlane/sandboxCommandRunner.js";
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
} from "../runtimeImplementation/runtimeSessionStateEventStore.js";
import {
  createFrameworkInspectionReport,
} from "../runtimeImplementation/runtime.inspection/frameworkInspectionReport.js";
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
  assemblePromptPack,
} from "../executionEngine/promptPack/promptAssembler.js";
import {
  createFallbackMemoryRef,
  createObservationMaterial,
} from "../executionEngine/coreLogic/observationIntegrator.js";
import {
  runtimeAuth,
} from "../runtimeImplementation/runtime.authPlane/index.js";
import {
  createMemoryPlane,
  memoryPlane,
} from "../memory_managementPool/index.js";
import {
  ExecutionMonitor,
  analyzeExecutionMonitor,
} from "../runtimeImplementation/runtime.executionMonitor/index.js";

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
  createFallbackMemoryRef,
  createObservationMaterial,
  type FallbackMemoryRef,
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
  markdown,
  markdownFile,
  overwrite,
  prepend,
  replaceLastLines,
});

export const modelAuthoring = Object.freeze({
  endpoint,
  model,
  modelFleet,
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
  createInMemorySessionStateEventStore,
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
  exposeMainLoopState,
  interpretModelDecision,
  planFrameworkMainLoopHandoff,
  prepareMainLoopTurn,
  resolveMainLoopFailureRecovery,
  resolveMainLoopBudget,
  runMainLoop,
  selectMainLoopModel,
  createFallbackMemoryRef,
  createObservationMaterial,
});

export const inspection = Object.freeze({
  createFrameworkInspectionReport,
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
  createSandboxCommandPlan,
  createLocalSandboxRemoteWorkerAdapter,
  createSandboxRuntimeProvider,
  prepareSandboxRuntime,
  runSandboxCommand,
  sandboxCommandRunnerDescriptor,
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
