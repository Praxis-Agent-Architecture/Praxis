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
} from "./agent_interfaceAdapter/interfaceEnvelope.js";
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
  createSandboxRuntimeProvider,
  prepareSandboxRuntime,
  sandboxRuntimeProviderDescriptor,
  type SandboxRuntimePrepareResult,
  type SandboxRuntimeProvider,
  type SandboxRuntimeProviderAction,
  type SandboxRuntimeProviderProbe,
  type SandboxRuntimeProviderStatus,
  type SandboxRuntimeSmokeResult,
} from "./agent_runtimeImplementation/runtime.sandboxPlane/sandboxRuntimeProvider.js";

export {
  approvalInterfaceEnvelope,
  createInterfaceEnvelope,
  type InterfaceEnvelope,
  type InterfaceEnvelopeKind,
  type InterfaceEnvelopeSurface,
  type InterfaceEnvelopeValidationErrorCode,
  type InterfaceEnvelopeValidationResult,
} from "./agent_interfaceAdapter/interfaceEnvelope.js";

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
  PraxisRuntimeKernel,
  createPraxisRuntimeKernel,
  type AgentModelCallRecord,
  type AgentRunResult,
  type AgentToolCallRecord,
  type PraxisRuntimeKernelError,
  type PraxisRuntimeKernelErrorCode,
  type PraxisRuntimeKernelOptions,
  type RuntimeApprovalEnvelope,
  type RuntimeApprovalResolution,
  type RuntimeApprovalResolver,
} from "./agent_runtimeImplementation/praxisRuntimeKernel.js";

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
  createInterfaceEnvelope,
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
  inspection,
  storagePlane,
  sandboxPlane,
  interfaceAdapter,
});

export default praxis;
