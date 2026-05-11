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
} from "./agent_runtimeImplementation/runtimeAgentManifest.js";
import {
  createSandboxRuntimeProvider,
  prepareSandboxRuntime,
  sandboxRuntimeProviderDescriptor,
} from "./agent_runtimeImplementation/runtime.sandboxPlane/sandboxRuntimeProvider.js";
import {
  approvalInterfaceEnvelope,
  createInterfaceEnvelope,
  eventInterfaceEnvelope,
  managementInterfaceEnvelope,
  repairInterfaceEnvelope,
  stateInterfaceEnvelope,
} from "./agent_interfaceAdapter/interfaceEnvelope.js";
import {
  createInterfaceAdapterRuntime,
} from "./agent_runtimeImplementation/runtime.interfaceAdapter/interfaceAdapterRuntime.js";
import {
  bindBasicInterfaceLayer,
} from "./agent_runtimeImplementation/runtime.interfaceAdapter/bindBasicInterfaceLayer.js";
import {
  applyRaxStorageInitPlan,
  createAndApplyStoragePlaneRuntime,
  createRaxStorageLayout,
  createStoragePlaneRuntime,
  planRaxStorageInit,
  resolveRaxHome,
  resolveRaxWorkspace,
} from "./agent_runtimeImplementation/runtime.storagePlane/storagePlaneRuntime.js";
import {
  PraxisRuntimeKernel,
  createPraxisRuntimeKernel,
} from "./agent_runtimeImplementation/praxisRuntimeKernel.js";
import {
  createInMemorySessionStateEventStore,
} from "./agent_runtimeImplementation/runtimeSessionStateEventStore.js";
import {
  createFrameworkInspectionReport,
} from "./agent_runtimeImplementation/runtime.inspection/frameworkInspectionReport.js";
import {
  baseToolDeveloperCatalogDescriptor,
  baseTools,
  listBaseToolDeveloperCatalog,
  toolSets,
  tryBaseToolById,
} from "./agent_runtimeImplementation/runtime.execEngine/baseToolDeveloperCatalog.js";
import {
  baseToolRealityLedgerDescriptor,
  createBaseToolRealityLedger,
  inspectBaseToolReality,
  snapshotBaseToolRealityLedger,
} from "./agent_runtimeImplementation/runtime.execEngine/baseToolRealityLedger.js";
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
} from "./agent_executionEngine/coreLogic/mainLoop.js";
import {
  interpretModelDecision,
} from "./agent_executionEngine/coreLogic/modelDecision.js";
import {
  assemblePromptPack,
} from "./agent_executionEngine/promptPack/promptAssembler.js";
import {
  createFallbackMemoryRef,
  createObservationMaterial,
} from "./agent_executionEngine/coreLogic/observationIntegrator.js";

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
} from "./agent_runtimeImplementation/runtimeAgentManifest.js";

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
} from "./agent_executionEngine/coreLogic/mainLoop.js";

export {
  interpretModelDecision,
  type ModelDecision,
  type ModelDecisionFailure,
  type ModelDecisionKind,
  type ModelDecisionToolCall,
} from "./agent_executionEngine/coreLogic/modelDecision.js";

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
} from "./agent_executionEngine/coreLogic/observationIntegrator.js";

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
} from "./agent_executionEngine/coreLogic/ephemeralProcedure.js";

export {
  assemblePromptPack,
  type PromptPackCachePlan,
  type PromptPackCacheTelemetry,
  type PromptPackSegment,
  type PromptPackSegmentCachePolicy,
  type PromptPackSegmentStability,
  type StandardPromptPack,
} from "./agent_executionEngine/promptPack/promptAssembler.js";

export {
  PROMPT_PACK_PROVIDER_VISIBLE_SEGMENT_KINDS,
  PROMPT_PACK_SEGMENT_KINDS,
  inferPromptPackSegmentKind,
  type PromptPackSegmentKind,
} from "./agent_executionEngine/promptPack/promptDefiner.js";

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
} from "./agent_runtimeImplementation/runtime.sandboxPlane/sandboxRuntimeProvider.js";

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
} from "./agent_interfaceAdapter/interfaceEnvelope.js";

export {
  bindBasicInterfaceLayer,
  type BasicInterfaceKind,
  type BasicInterfaceLayerBinding,
  type BasicInterfaceLayerBindingRequest,
  type BasicInterfaceLayerBindingResult,
  type BasicInterfaceRef,
} from "./agent_runtimeImplementation/runtime.interfaceAdapter/bindBasicInterfaceLayer.js";

export {
  createInterfaceAdapterRuntime,
  type InterfaceAdapterRuntimeBinding,
  type InterfaceAdapterRuntimeBindingInput,
  type InterfaceAdapterRuntimeCaller,
  type InterfaceAdapterRuntimeHandle,
  type InterfaceAdapterRuntimeRequest,
  type InterfaceAdapterRuntimeResult,
  type InterfaceAdapterRuntimeSurface,
} from "./agent_runtimeImplementation/runtime.interfaceAdapter/interfaceAdapterRuntime.js";

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
} from "./agent_runtimeImplementation/runtime.storagePlane/storagePlaneRuntime.js";

export {
  type BaseToolExecutorPort,
  type BaseToolExecutorResult,
} from "./agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";

export {
  PraxisRuntimeKernel,
  createPraxisRuntimeKernel,
  type AgentModelCallProgressEvent,
  type AgentModelCallRecord,
  type AgentRunResult,
  type AgentToolCallProgressEvent,
  type AgentToolCallRecord,
  type PraxisRuntimeKernelError,
  type PraxisRuntimeKernelErrorCode,
  type PraxisRuntimeKernelOptions,
  type RuntimeApprovalEnvelope,
  type RuntimeApprovalResolution,
  type RuntimeApprovalResolver,
} from "./agent_runtimeImplementation/praxisRuntimeKernel.js";

export {
  createInMemorySessionStateEventStore,
  type RuntimeSessionSnapshot,
  type RuntimeSessionStateEventStore,
} from "./agent_runtimeImplementation/runtimeSessionStateEventStore.js";

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
} from "./agent_runtimeImplementation/runtime.inspection/frameworkInspectionReport.js";

export {
  baseToolDeveloperCatalogDescriptor,
  baseTools,
  listBaseToolDeveloperCatalog,
  toolSets,
  tryBaseToolById,
  type BaseToolDeveloperCatalogEntry,
  type BaseToolDeveloperLookupResult,
  type BaseToolSpecInput,
  type CodingToolSetOptions,
} from "./agent_runtimeImplementation/runtime.execEngine/baseToolDeveloperCatalog.js";

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
} from "./agent_runtimeImplementation/runtime.execEngine/baseToolRealityLedger.js";

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
} from "./agent_modelAdapter/bridgingLayer/toolSchemaCompatibilityLayer.js";

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
  baseTools,
  tool,
  tools,
  toolPolicies,
  toolSets,
  tryBaseToolById,
  listBaseToolDeveloperCatalog,
  baseToolDeveloperCatalogDescriptor,
});

export const runtimeKernel = Object.freeze({
  PraxisRuntimeKernel,
  createPraxisRuntimeKernel,
  createInMemorySessionStateEventStore,
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

export const sandboxPlane = Object.freeze({
  createSandboxRuntimeProvider,
  prepareSandboxRuntime,
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
 * import { praxis } from "@praxis-ai/framework";
 * ```
 *
 * 然后用 `praxis.AgentArchetype`、`praxis.prompt.append`、
 * `praxis.model(...)`、`praxis.baseTools.code.read()` 来定义 Agent。
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

  harness,
  loop,
  mainLoop,
  policy,
  sandbox,
  session,
  statePlane,
  storage,

  baseTools,
  tool,
  tools,
  toolPolicies,
  toolSets,
  tryBaseToolById,
  listBaseToolDeveloperCatalog,

  runtime: runtimeKernel,
  execution: executionCore,
  inspection,
  storagePlane,
  sandboxPlane,
  interfaceAdapter,
});

export default praxis;
