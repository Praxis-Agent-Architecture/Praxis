/*
 * 文件定位：Agent 运行态实现层 / OAO AgentManifest 编译面。
 * 核心目的：把 PraxisAgent class 或 instance 编译为 runtime 只读执行合同。
 * 能力要求1：支持 class 与 instance 两种 OAO authoring 输入，并生成稳定 manifestHash。
 * 能力要求2：Harness 保持声明式，runtime 后续只执行 AgentManifest，不直接执行 Agent class 内部逻辑。
 * 边界：只定义 agent 编译合同，不启动进程、不读取文件、不调用模型、不执行工具。
 * 对接：需要服务 PraxisRuntimeKernel、runtime.invocationMethod、runtime.modelAdapter 和 runtime.execEngine。
 * 实现提示：Agent Archetype 只编译声明式 spec 和 stable refs，不能把函数体或 provider 字段形状塞进 runtime 执行真相。
 */

import { createHash } from "node:crypto";

import type { CredentialRef } from "../agent_modelAdapter/authProfileLayer/credentialRef.js";
import type { ProviderReasoningConfig } from "../agent_modelAdapter/providerAccessLayer/providerCarrier.js";
import { createBaseToolSupportCatalog } from "./runtime.execEngine/baseToolSupportCatalog.js";

export type AgentIdentity = string | {
  id: string;
  name?: string;
  version?: string;
  description?: string;
};

export type ModelSpec = {
  provider: "openai" | "anthropic" | "deepmind" | "customFormat" | (string & {});
  model: string;
  endpointShape?: "responses" | "messages" | "custom" | (string & {});
  carrierId?: string;
  credentialRef?: CredentialRef;
  reasoning?: ProviderReasoningConfig;
  baseURL?: string;
  clientName?: string;
  clientVersion?: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type ModelEndpointPath =
  | "/v1/messages"
  | "/v1/responses"
  | "/v1/images"
  | "/v1/batches"
  | "/v1/realtime";

export type ModelEndpointFamily =
  | "messages"
  | "responses"
  | "images"
  | "batches"
  | "realtime";

export type ModelProtocolFamily =
  | "anthropic-messages"
  | "openai-responses"
  | "openai-images"
  | "openai-batches"
  | "openai-realtime"
  | "openai-compatible"
  | "custom";

export type ModelCapabilityRole =
  | "reasoning"
  | "background"
  | "image-generation"
  | "batch"
  | "realtime"
  | "embedding"
  | "rerank"
  | (string & {});

export type ModelEndpointProbeResult = {
  status: "unknown" | "available" | "unavailable" | "degraded";
  checkedAt?: string;
  latencyMs?: number;
  errorCode?: string;
  publicSafeMessage?: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type ModelCapabilityMatrix = {
  text?: boolean;
  reasoning?: boolean;
  toolCalling?: boolean;
  visionInput?: boolean;
  imageGeneration?: boolean;
  batch?: boolean;
  realtime?: boolean;
  streaming?: boolean;
  metadata?: Readonly<Record<string, unknown>>;
};

export type ModelFailurePolicy = {
  onUnavailable?: "fallback" | "skip" | "fail" | "degrade";
  fallbackEndpointRef?: string;
  maxRetries?: number;
  timeoutMs?: number;
  metadata?: Readonly<Record<string, unknown>>;
};

export type ModelEndpointSpec = {
  endpointId: string;
  endpoint: ModelEndpointPath;
  endpointFamily: ModelEndpointFamily;
  protocolFamily: ModelProtocolFamily;
  role: ModelCapabilityRole;
  provider?: ModelSpec["provider"];
  model?: string;
  carrierId?: string;
  baseURL?: string;
  credentialRef?: CredentialRef;
  probe?: ModelEndpointProbeResult;
  capabilityMatrix?: ModelCapabilityMatrix;
  failurePolicy?: ModelFailurePolicy;
  metadata?: Readonly<Record<string, unknown>>;
};

export type ModelFleetSpec = {
  mode: "auto" | "manual";
  endpoints: Readonly<Record<string, ModelEndpointSpec>>;
  primaryRef?: string;
  probeStrategy?: "lazy" | "startup" | "manual";
  capabilityMatrix?: Readonly<Record<string, ModelCapabilityMatrix>>;
  failurePolicy?: ModelFailurePolicy;
  metadata?: Readonly<Record<string, unknown>>;
};

export type ToolSpec = {
  toolId: string;
  family?: string;
  group?: string;
  description?: string;
  inputSchema?: Readonly<Record<string, unknown>>;
  scopes?: readonly string[];
  metadata?: Readonly<Record<string, unknown>>;
};

export type PolicySpec = {
  scopes?: readonly string[];
  allowedTools?: readonly string[];
  requireApproval?: readonly string[];
  allowProviderCall?: boolean;
  allowToolExecution?: boolean;
  workspaceRoot?: string;
  allowedRoots?: readonly string[];
  metadata?: Readonly<Record<string, unknown>>;
};

export type LoopSpec = {
  strategy: "single" | "tool-calling-v1" | "custom" | (string & {});
  maxModelTurns?: number;
  maxToolCalls?: number;
  metadata?: Readonly<Record<string, unknown>>;
};

export type MainLoopHookName =
  | "onStart"
  | "buildPrompt"
  | "chooseModel"
  | "beforeTool"
  | "afterTool"
  | "shouldContinue"
  | "shouldBreak"
  | "onError"
  | "onResume";

export type MainLoopHookRef = {
  hook: MainLoopHookName;
  strategyRef?: string;
  handlerRef?: string;
  policyRef?: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type MainLoopSpec = {
  kind: "praxis.mainLoopSpec";
  strategy: "standard" | "custom" | (string & {});
  hooks: readonly MainLoopHookRef[];
  stepRecordCompatible: true;
  modelDecisionCompatible: true;
  ephemeralProcedureCompatible: true;
  promptPackCompatible: true;
  metadata?: Readonly<Record<string, unknown>>;
};

export type ContextSpec = {
  refs?: readonly string[];
  metadata?: Readonly<Record<string, unknown>>;
};

export type MemorySpec = {
  mode?: "none" | "session" | "longTerm" | (string & {});
  pool?: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type StorageSpec = {
  kind?: "memory" | "sqlite" | (string & {});
  path?: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type PromptMaterialSource =
  | { kind: "markdown"; text: string; ref?: string }
  | { kind: "markdownFile"; path: string; ref?: string }
  | { kind: "materialRef"; ref: string };

export type PromptPatchOperation =
  | "append"
  | "prepend"
  | "overwrite"
  | "replace"
  | "range"
  | "replaceLastLines";

export type PromptPatchSpec = {
  patchId: string;
  operation: PromptPatchOperation;
  targetRef: string;
  material: PromptMaterialSource;
  range?: { startLine: number; endLine: number };
  lastLines?: number;
  sceneTrigger?: string;
  stateTrigger?: string;
  auditRefs?: readonly string[];
  metadata?: Readonly<Record<string, unknown>>;
};

export type PromptPackSpec = {
  promptPackId?: string;
  base?: PromptMaterialSource;
  inherits?: readonly string[];
  patches?: readonly PromptPatchSpec[];
  sceneTriggers?: readonly string[];
  stateMachineMutations?: readonly PromptPatchSpec[];
  auditRefs?: readonly string[];
  materials?: readonly string[];
  designOwner?: "user" | "runtime-shim" | "archetype";
  metadata?: Readonly<Record<string, unknown>>;
};

type PromptPatchHelperInput = Partial<Pick<PromptPatchSpec, "patchId">> &
  Omit<PromptPatchSpec, "patchId" | "operation" | "targetRef" | "material">;

export abstract class PromptPack {
  promptPackId?: string;
  base?: PromptMaterialSource;
  patches?: readonly PromptPatchSpec[];
  inherits?: readonly string[];
  sceneTriggers?: readonly string[];
  stateMachineMutations?: readonly PromptPatchSpec[];
  auditRefs?: readonly string[];
  materials?: readonly string[];
  designOwner?: "user" | "runtime-shim" | "archetype";
  metadata?: Readonly<Record<string, unknown>>;
}

export type SandboxFilesystemPolicy = "workspace-only" | "read-only" | "temp-only" | "deny" | (string & {});
export type SandboxNetworkPolicy = "allow" | "deny-by-default" | "deny" | "approval" | (string & {});
export type SandboxShellPolicy = "deny" | "read-only" | "guarded" | "approval-for-write" | (string & {});

export type SandboxResourceLimits = {
  timeoutMs?: number;
  maxProcesses?: number;
  maxMemoryMb?: number;
  maxOutputBytes?: number;
  metadata?: Readonly<Record<string, unknown>>;
};

export type SandboxProfile = "host-observed" | "temp" | "workspace" | "strict" | "custom" | (string & {});

export type SandboxSpec = {
  sandboxId: string;
  profile: SandboxProfile;
  filesystem: SandboxFilesystemPolicy;
  network: SandboxNetworkPolicy;
  shell: SandboxShellPolicy;
  resourceLimits: SandboxResourceLimits;
  reusableProfileRef?: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type BaseToolPolicyDecision =
  | "allow"
  | "deny"
  | "approval"
  | "guarded"
  | "approval-on-destructive"
  | (string & {});

export type BaseToolPolicyProfile =
  | "bapr"
  | "yolo"
  | "permissive"
  | "standard"
  | "restricted"
  | "codingAgentFull"
  | "custom";

export type BaseToolPolicyRisk =
  | "safe"
  | "risky"
  | "dangerous"
  | "low"
  | "medium"
  | "high"
  | "destructive"
  | (string & {});

export type BaseToolPolicyRule = {
  scope: "family" | "group" | "toolId" | "action";
  family?: string;
  group?: string;
  toolId?: string;
  action?: string;
  decision: BaseToolPolicyDecision;
  risk?: BaseToolPolicyRisk;
  log?: "none" | "summary" | "full";
  approval?: "none" | "required" | "on-risk" | "on-destructive";
  sandboxRef?: string;
  resourceLimits?: SandboxResourceLimits;
  metadata?: Readonly<Record<string, unknown>>;
};

export type BaseToolPolicyMatrixSpec = {
  matrixId: string;
  profile: BaseToolPolicyProfile;
  defaultDecision: BaseToolPolicyDecision;
  familyRules: readonly BaseToolPolicyRule[];
  groupRules: readonly BaseToolPolicyRule[];
  toolRules: readonly BaseToolPolicyRule[];
  actionRules: readonly BaseToolPolicyRule[];
  readinessPolicy?: "observe" | "strict" | "disabled";
  eventLogLevel?: "summary" | "full";
  metadata?: Readonly<Record<string, unknown>>;
};

export type SessionSpec = {
  persistence: "memory" | "sqlite" | (string & {});
  resume: "manual" | "auto" | "disabled" | (string & {});
  thread: "ephemeral" | "durable" | (string & {});
  logs: "none" | "summary" | "full" | (string & {});
  storeRef?: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type StatePlaneSpec = {
  expose: readonly string[];
  control: readonly string[];
  audit: "none" | "summary" | "full";
  metadata?: Readonly<Record<string, unknown>>;
};

export type FrameworkCoreContractSpec = {
  kind: "praxis.frameworkCoreContract";
  contractVersion: "praxis.frameworkCore.v1";
  phase: "framework-core";
  runtimeTruth: "agentManifest";
  promptPack: {
    layer: "formal";
    providerPayloadBuilder: false;
    sourceCategories: readonly ["declared-built-in", "process-product", "user-request"];
    bindRef: "runtime.execEngine.bindPromptPack";
    loweringRef: "runtime.modelAdapter.promptLoweringRuntime";
    promptPackId: string;
  };
  mainLoop: {
    layer: "formal";
    arbitraryUserJs: false;
    stepRecordCompatible: true;
    modelDecisionCompatible: true;
    ephemeralProcedureCompatible: true;
    bindRef: "runtime.execEngine.bindCoreLogic";
    strategy: MainLoopSpec["strategy"];
  };
  modelDecision: {
    providerNeutral: true;
    variants: readonly ["finalOutput", "toolCall", "ephemeralProcedurePlan", "requestApproval", "continue", "fail"];
  };
  baseToolGovernance: {
    identityAxis: "family/group/toolId";
    canonicalMountChain: readonly [
      "adaptRuntimeToolInvocation",
      "bridgeExecEngineInvocation",
      "createBaseToolRegistry.lookupHandler",
      "BaseToolHandler.invoke",
      "BaseToolExecutorPort",
    ];
    policyMatrixId: string;
    sandboxId: string;
  };
  sessionStateEvent: {
    session: SessionSpec;
    statePlane: StatePlaneSpec;
    records: readonly ["session", "state", "event", "modelInvocation", "toolInvocation", "mainLoopStep"];
  };
  approval: {
    interfaceSurface: true;
    defaultBehavior: "public-safe-pending";
  };
  inspectionDebug: {
    manifestInspectable: true;
    debugSnapshotReady: boolean;
    selfRepairContractReady: boolean;
  };
  officialModuleBridge: {
    tap: "contract-only";
    cmp: "contract-only";
    mp: "contract-only";
    multiagent: "contract-only";
  };
  verificationGates: readonly string[];
};

export type HarnessSpec = {
  context?: ContextSpec;
  memory?: MemorySpec;
  storage?: StorageSpec;
  promptPack?: PromptPackSpec;
  tools?: readonly ToolSpec[];
  policy?: PolicySpec;
  loop?: LoopSpec;
  modelFleet?: ModelFleetSpec;
  mainLoop?: MainLoopSpec;
  sandbox?: SandboxSpec;
  toolPolicy?: BaseToolPolicyMatrixSpec;
  session?: SessionSpec;
  statePlane?: StatePlaneSpec;
  modules?: Readonly<Record<string, unknown>>;
  runtimeRequirements?: readonly string[];
  metadata?: Readonly<Record<string, unknown>>;
};

export type BehaviorSpec = Readonly<Record<string, unknown>>;
export type AgentHooks = Readonly<Record<string, unknown>>;

export abstract class PraxisAgent {
  abstract identity: AgentIdentity;
  abstract model: ModelSpec;
  abstract harness: HarnessSpec;
  modelFleet?: ModelFleetSpec;
  promptPack?: PromptPackSpec | PromptPack;
  mainLoop?: MainLoopSpec;
  sandbox?: SandboxSpec;
  toolPolicy?: BaseToolPolicyMatrixSpec;
  session?: SessionSpec;
  statePlane?: StatePlaneSpec;
  behaviors?: BehaviorSpec;
  hooks?: AgentHooks;
}

export abstract class PraxisAgentArchetype extends PraxisAgent {
  declare modelFleet?: ModelFleetSpec;
  declare promptPack?: PromptPackSpec | PromptPack;
  declare mainLoop?: MainLoopSpec;
  declare sandbox?: SandboxSpec;
  declare toolPolicy?: BaseToolPolicyMatrixSpec;
  declare session?: SessionSpec;
  declare statePlane?: StatePlaneSpec;
}

export type AgentSourceKind = "class" | "instance";

export type AgentManifest = {
  kind: "praxis.agentManifest";
  schemaVersion: "praxis.agentManifest.v1";
  manifestId: string;
  manifestHash: string;
  compiledAt: string;
  source: {
    kind: AgentSourceKind;
    className?: string;
    constructorSideEffectsAllowed: false;
  };
  identity: {
    id: string;
    name?: string;
    version?: string;
    description?: string;
  };
  model: ModelSpec & {
    carrierId: string;
    endpointShape: string;
  };
  modelFleet: ModelFleetSpec;
  promptPack: Required<Pick<PromptPackSpec, "materials" | "inherits" | "patches" | "sceneTriggers" | "stateMachineMutations" | "auditRefs">> & {
    promptPackId: string;
    base?: PromptMaterialSource;
    designOwner: "user" | "runtime-shim" | "archetype";
    metadata: Readonly<Record<string, unknown>>;
  };
  mainLoop: MainLoopSpec;
  sandbox: SandboxSpec;
  toolPolicy: BaseToolPolicyMatrixSpec;
  session: SessionSpec;
  statePlane: StatePlaneSpec;
  frameworkCore: FrameworkCoreContractSpec;
  harness: Required<Pick<HarnessSpec, "context" | "memory" | "storage" | "promptPack" | "tools" | "policy" | "loop">> & {
    modelFleet: ModelFleetSpec;
    mainLoop: MainLoopSpec;
    sandbox: SandboxSpec;
    toolPolicy: BaseToolPolicyMatrixSpec;
    session: SessionSpec;
    statePlane: StatePlaneSpec;
    frameworkCore: FrameworkCoreContractSpec;
    modules: Readonly<Record<string, unknown>>;
    runtimeRequirements: readonly string[];
    metadata: Readonly<Record<string, unknown>>;
  };
  behaviors?: BehaviorSpec;
  hooks?: AgentHooks;
  verification: {
    compiled: true;
    harnessDeclarative: true;
    runtimeExecutesManifestOnly: true;
  };
};

export type AgentCompileErrorCode =
  | "MISSING_AGENT"
  | "INVALID_AGENT_CLASS"
  | "MISSING_IDENTITY"
  | "MISSING_MODEL"
  | "MISSING_MODEL_NAME"
  | "MISSING_HARNESS"
  | "INVALID_MODEL_FLEET"
  | "INVALID_PROMPT_PACK"
  | "INVALID_MAIN_LOOP"
  | "INVALID_SANDBOX"
  | "INVALID_TOOL_POLICY"
  | "INVALID_TOOL_SPEC"
  | "INVALID_SESSION"
  | "INVALID_STATE_PLANE"
  | "INVALID_MANIFEST";

export type AgentManifestValidationErrorCode =
  | "MISSING_MANIFEST"
  | "INVALID_KIND"
  | "INVALID_SCHEMA_VERSION"
  | "MISSING_MANIFEST_ID"
  | "MISSING_HASH"
  | "HASH_MISMATCH"
  | "MISSING_FRAMEWORK_CORE"
  | "HARNESS_VIEW_MISMATCH"
  | "RAW_SECRET_REJECTED";

export type AgentManifestValidationResult =
  | { ok: true; manifest: AgentManifest; events: readonly string[] }
  | {
      ok: false;
      error: {
        code: AgentManifestValidationErrorCode;
        message: string;
        boundary: "input" | "manifest" | "security" | "consistency";
        publicSafe: true;
      };
      events: readonly string[];
    };

export type AgentManifestInspection = {
  manifestId: string;
  manifestHash: string;
  identityId: string;
  model: {
    provider: string;
    model: string;
    carrierId: string;
    endpointShape: string;
    fleetMode: ModelFleetSpec["mode"];
    endpoints: readonly string[];
  };
  promptPack: {
    promptPackId: string;
    designOwner: AgentManifest["promptPack"]["designOwner"];
    patchCount: number;
    materialCount: number;
  };
  mainLoop: {
    strategy: MainLoopSpec["strategy"];
    hookCount: number;
    formalLayer: boolean;
  };
  governance: {
    sandboxProfile: SandboxProfile;
    sandboxId: string;
    toolPolicyProfile: BaseToolPolicyProfile;
    policyMatrixId: string;
  };
  sessionState: {
    persistence: SessionSpec["persistence"];
    resume: SessionSpec["resume"];
    thread: SessionSpec["thread"];
    exposedState: readonly string[];
    controls: readonly string[];
  };
  frameworkCore: {
    contractVersion: FrameworkCoreContractSpec["contractVersion"];
    promptPackBindRef: FrameworkCoreContractSpec["promptPack"]["bindRef"];
    mainLoopBindRef: FrameworkCoreContractSpec["mainLoop"]["bindRef"];
    officialModules: FrameworkCoreContractSpec["officialModuleBridge"];
  };
  runtimeRequirements: readonly string[];
  verificationGates: readonly string[];
};

export type AgentCompileResult =
  | {
      ok: true;
      manifest: AgentManifest;
      events: readonly string[];
    }
  | {
      ok: false;
      error: {
        code: AgentCompileErrorCode;
        message: string;
        boundary: "input" | "agent-object" | "manifest";
        publicSafe: true;
      };
      events: readonly string[];
    };

export type PraxisAgentClass<TAgent extends PraxisAgent = PraxisAgent> = new () => TAgent;
export type PraxisAgentInput<TAgent extends PraxisAgent = PraxisAgent> = TAgent | PraxisAgentClass<TAgent>;

export function model(modelName: string, input: Omit<ModelSpec, "provider" | "model"> & { provider?: ModelSpec["provider"] } = {}): ModelSpec {
  return {
    provider: input.provider ?? "openai",
    model: modelName,
    endpointShape: input.endpointShape ?? "responses",
    carrierId: input.carrierId,
    credentialRef: input.credentialRef,
    reasoning: input.reasoning,
    baseURL: input.baseURL,
    clientName: input.clientName,
    clientVersion: input.clientVersion,
    metadata: input.metadata,
  };
}

function endpointFamilyFor(endpointPath: ModelEndpointPath): ModelEndpointFamily {
  return endpointPath.slice("/v1/".length) as ModelEndpointFamily;
}

function protocolFamilyFor(endpointPath: ModelEndpointPath): ModelProtocolFamily {
  if (endpointPath === "/v1/messages") return "anthropic-messages";
  if (endpointPath === "/v1/responses") return "openai-responses";
  if (endpointPath === "/v1/images") return "openai-images";
  if (endpointPath === "/v1/batches") return "openai-batches";
  if (endpointPath === "/v1/realtime") return "openai-realtime";
  return "custom";
}

export function endpoint(
  endpointPath: ModelEndpointPath,
  input: Omit<ModelEndpointSpec, "endpoint" | "endpointFamily" | "protocolFamily" | "endpointId"> & {
    endpointId?: string;
    protocolFamily?: ModelProtocolFamily;
  },
): ModelEndpointSpec {
  const endpointFamily = endpointFamilyFor(endpointPath);
  return {
    endpointId: input.endpointId ?? `${input.role}:${endpointFamily}`,
    endpoint: endpointPath,
    endpointFamily,
    protocolFamily: input.protocolFamily ?? protocolFamilyFor(endpointPath),
    role: input.role,
    provider: input.provider,
    model: input.model,
    carrierId: input.carrierId,
    baseURL: input.baseURL,
    credentialRef: input.credentialRef,
    probe: input.probe,
    capabilityMatrix: input.capabilityMatrix,
    failurePolicy: input.failurePolicy,
    metadata: input.metadata,
  };
}

export const modelFleet = {
  auto(
    endpoints: Readonly<Record<string, ModelEndpointSpec>>,
    input: Omit<ModelFleetSpec, "mode" | "endpoints"> = {},
  ): ModelFleetSpec {
    const normalizedEndpoints = Object.fromEntries(
      Object.entries(endpoints).map(([ref, spec]) => [ref, { ...spec, endpointId: spec.endpointId || ref }]),
    );
    return {
      mode: "auto",
      endpoints: normalizedEndpoints,
      primaryRef: input.primaryRef ?? (normalizedEndpoints.primary === undefined ? Object.keys(normalizedEndpoints)[0] : "primary"),
      probeStrategy: input.probeStrategy ?? "lazy",
      capabilityMatrix: input.capabilityMatrix,
      failurePolicy: input.failurePolicy,
      metadata: input.metadata,
    };
  },
};

export function tool(toolId: string, input: Omit<ToolSpec, "toolId"> = {}): ToolSpec {
  return { toolId, ...input };
}

export function tools(items: readonly ToolSpec[]): readonly ToolSpec[] {
  return items;
}

export function policy(input: PolicySpec = {}): PolicySpec {
  return input;
}

export const loop = Object.assign(
  (input: LoopSpec = { strategy: "tool-calling-v1" }): LoopSpec => input,
  {
    standard(input: Omit<LoopSpec, "strategy"> = {}): LoopSpec {
      return { strategy: "tool-calling-v1", ...input };
    },
    single(input: Omit<LoopSpec, "strategy"> = {}): LoopSpec {
      return { strategy: "single", ...input };
    },
    custom(strategy: string, input: Omit<LoopSpec, "strategy"> = {}): LoopSpec {
      return { strategy, ...input };
    },
  },
);

export const mainLoop = {
  standard(input: {
    hooks?: Partial<Record<MainLoopHookName, string | Omit<MainLoopHookRef, "hook">>>;
    metadata?: Readonly<Record<string, unknown>>;
  } = {}): MainLoopSpec {
    const hooks = Object.entries(input.hooks ?? {}).map(([name, ref]) => {
      const hook = name as MainLoopHookName;
      return typeof ref === "string"
        ? { hook, handlerRef: ref }
        : { hook, ...ref };
    });
    return {
      kind: "praxis.mainLoopSpec",
      strategy: "standard",
      hooks,
      stepRecordCompatible: true,
      modelDecisionCompatible: true,
      ephemeralProcedureCompatible: true,
      promptPackCompatible: true,
      metadata: input.metadata,
    };
  },
};

export function markdown(text: string, ref?: string): PromptMaterialSource {
  return ref === undefined ? { kind: "markdown", text } : { kind: "markdown", text, ref };
}

export function markdownFile(path: string, ref?: string): PromptMaterialSource {
  return ref === undefined ? { kind: "markdownFile", path } : { kind: "markdownFile", path, ref };
}

function defaultPromptPatchId(targetRef: string, operation: PromptPatchOperation, input: Pick<PromptPatchSpec, "sceneTrigger" | "stateTrigger"> = {}): string {
  const qualifiers = [
    input.sceneTrigger?.trim() ? `scene:${input.sceneTrigger.trim()}` : undefined,
    input.stateTrigger?.trim() ? `state:${input.stateTrigger.trim()}` : undefined,
  ].filter((value): value is string => value !== undefined);
  return [targetRef, operation, ...qualifiers].join(":");
}

export function append(targetRef: string, material: PromptMaterialSource, input: PromptPatchHelperInput = {}): PromptPatchSpec {
  return { ...input, patchId: input.patchId?.trim() || defaultPromptPatchId(targetRef, "append", input), operation: "append", targetRef, material };
}

export function prepend(targetRef: string, material: PromptMaterialSource, input: PromptPatchHelperInput = {}): PromptPatchSpec {
  return { ...input, patchId: input.patchId?.trim() || defaultPromptPatchId(targetRef, "prepend", input), operation: "prepend", targetRef, material };
}

export function overwrite(targetRef: string, material: PromptMaterialSource, input: PromptPatchHelperInput = {}): PromptPatchSpec {
  return { ...input, patchId: input.patchId?.trim() || defaultPromptPatchId(targetRef, "overwrite", input), operation: "overwrite", targetRef, material };
}

export function replaceLastLines(targetRef: string, lastLines: number, material: PromptMaterialSource, input: Omit<PromptPatchHelperInput, "lastLines"> = {}): PromptPatchSpec {
  return {
    ...input,
    patchId: input.patchId?.trim() || `${defaultPromptPatchId(targetRef, "replaceLastLines", input)}:${lastLines}`,
    operation: "replaceLastLines",
    targetRef,
    lastLines,
    material,
  };
}

export const sandbox = {
  hostObserved(input: Partial<Omit<SandboxSpec, "sandboxId" | "profile" | "resourceLimits">> & {
    sandboxId?: string;
    resourceLimits?: SandboxResourceLimits;
  } = {}): SandboxSpec {
    return {
      sandboxId: input.sandboxId ?? "sandbox.hostObserved",
      profile: "host-observed",
      filesystem: input.filesystem ?? "workspace-only",
      network: input.network ?? "deny-by-default",
      shell: input.shell ?? "approval-for-write",
      resourceLimits: input.resourceLimits ?? {},
      reusableProfileRef: input.reusableProfileRef,
      metadata: {
        isolation: "none",
        observation: "runtime records, gates, budgets, and approvals still apply",
        ...(input.metadata ?? {}),
      },
    };
  },
  temp(input: Partial<Omit<SandboxSpec, "sandboxId" | "profile" | "resourceLimits">> & {
    sandboxId?: string;
    resourceLimits?: SandboxResourceLimits;
  } = {}): SandboxSpec {
    return {
      sandboxId: input.sandboxId ?? "sandbox.temp",
      profile: "temp",
      filesystem: input.filesystem ?? "workspace-only",
      network: input.network ?? "deny-by-default",
      shell: input.shell ?? "approval-for-write",
      resourceLimits: input.resourceLimits ?? {},
      reusableProfileRef: input.reusableProfileRef,
      metadata: input.metadata,
    };
  },
};

type ToolPolicyProfileInput = {
  matrixId?: string;
  metadata?: Readonly<Record<string, unknown>>;
};

function rule(
  action: "safe" | "risky" | "dangerous",
  decision: BaseToolPolicyDecision,
  approval: BaseToolPolicyRule["approval"],
  metadata: Readonly<Record<string, unknown>> = {},
): BaseToolPolicyRule {
  return {
    scope: "action",
    action,
    decision,
    risk: action,
    log: "full",
    approval,
    metadata,
  };
}

function buildToolPolicyProfile(
  profile: BaseToolPolicyProfile,
  input: ToolPolicyProfileInput,
  decisions: {
    defaultDecision: BaseToolPolicyDecision;
    safe: BaseToolPolicyDecision;
    risky: BaseToolPolicyDecision;
    dangerous: BaseToolPolicyDecision;
    safeApproval: BaseToolPolicyRule["approval"];
    riskyApproval: BaseToolPolicyRule["approval"];
    dangerousApproval: BaseToolPolicyRule["approval"];
  },
): BaseToolPolicyMatrixSpec {
  return {
    matrixId: input.matrixId ?? `toolPolicy.${profile}`,
    profile,
    defaultDecision: decisions.defaultDecision,
    familyRules: [],
    groupRules: [],
    toolRules: [],
    actionRules: [
      rule("safe", decisions.safe, decisions.safeApproval, { boundaryChecks: true }),
      rule("risky", decisions.risky, decisions.riskyApproval, { resourceControls: true }),
      rule("dangerous", decisions.dangerous, decisions.dangerousApproval, { destructiveOrExternalEffect: true }),
    ],
    readinessPolicy: "observe",
    eventLogLevel: "full",
    metadata: {
      riskScale: "safe/risky/dangerous",
      ...(input.metadata ?? {}),
    },
  };
}

export const toolPolicies = {
  bapr(input: ToolPolicyProfileInput = {}): BaseToolPolicyMatrixSpec {
    return buildToolPolicyProfile("bapr", input, {
      defaultDecision: "allow",
      safe: "allow",
      risky: "allow",
      dangerous: "allow",
      safeApproval: "none",
      riskyApproval: "none",
      dangerousApproval: "none",
    });
  },
  yolo(input: ToolPolicyProfileInput = {}): BaseToolPolicyMatrixSpec {
    return buildToolPolicyProfile("yolo", input, {
      defaultDecision: "guarded",
      safe: "allow",
      risky: "allow",
      dangerous: "approval",
      safeApproval: "none",
      riskyApproval: "none",
      dangerousApproval: "required",
    });
  },
  permissive(input: ToolPolicyProfileInput = {}): BaseToolPolicyMatrixSpec {
    return buildToolPolicyProfile("permissive", input, {
      defaultDecision: "guarded",
      safe: "allow",
      risky: "guarded",
      dangerous: "approval",
      safeApproval: "none",
      riskyApproval: "on-risk",
      dangerousApproval: "required",
    });
  },
  standard(input: ToolPolicyProfileInput = {}): BaseToolPolicyMatrixSpec {
    return buildToolPolicyProfile("standard", input, {
      defaultDecision: "guarded",
      safe: "guarded",
      risky: "approval",
      dangerous: "approval",
      safeApproval: "none",
      riskyApproval: "on-risk",
      dangerousApproval: "required",
    });
  },
  restricted(input: ToolPolicyProfileInput = {}): BaseToolPolicyMatrixSpec {
    return buildToolPolicyProfile("restricted", input, {
      defaultDecision: "approval",
      safe: "approval",
      risky: "approval",
      dangerous: "approval",
      safeApproval: "required",
      riskyApproval: "required",
      dangerousApproval: "required",
    });
  },
  codingAgentFull(input: {
    read?: BaseToolPolicyDecision;
    write?: BaseToolPolicyDecision;
    shell?: BaseToolPolicyDecision;
    git?: BaseToolPolicyDecision;
    matrixId?: string;
    metadata?: Readonly<Record<string, unknown>>;
  } = {}): BaseToolPolicyMatrixSpec {
    return {
      matrixId: input.matrixId ?? "toolPolicy.codingAgentFull",
      profile: "codingAgentFull",
      defaultDecision: "deny",
      familyRules: [
        { scope: "family", family: "codeBase", action: "read", decision: input.read ?? "allow", risk: "low", log: "full", approval: "none" },
        { scope: "family", family: "codeBase", action: "write", decision: input.write ?? "approval", risk: "medium", log: "full", approval: "required" },
        { scope: "family", family: "shellBase", decision: input.shell ?? "guarded", risk: "high", log: "full", approval: "on-risk" },
        { scope: "family", family: "gitBase", decision: input.git ?? "approval-on-destructive", risk: "destructive", log: "full", approval: "on-destructive" },
      ],
      groupRules: [],
      toolRules: [],
      actionRules: [],
      readinessPolicy: "observe",
      eventLogLevel: "full",
      metadata: input.metadata,
    };
  },
};

export function session(input: Partial<SessionSpec> = {}): SessionSpec {
  return {
    persistence: input.persistence ?? "memory",
    resume: input.resume ?? "manual",
    thread: input.thread ?? "ephemeral",
    logs: input.logs ?? "summary",
    storeRef: input.storeRef,
    metadata: input.metadata,
  };
}

export function statePlane(input: Partial<StatePlaneSpec> = {}): StatePlaneSpec {
  return {
    expose: input.expose ?? ["phase", "lastAction", "toolCalls", "errors"],
    control: input.control ?? [],
    audit: input.audit ?? "summary",
    metadata: input.metadata,
  };
}

export function harness(input: HarnessSpec): HarnessSpec {
  return input;
}

function isAgentClass(value: unknown): value is PraxisAgentClass {
  return typeof value === "function";
}

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`;
}

function manifestHash(manifest: Omit<AgentManifest, "manifestHash">): string {
  return createHash("sha256").update(stableJson(manifest)).digest("hex");
}

function createFrameworkCoreContract(input: {
  promptPack: AgentManifest["promptPack"];
  mainLoop: MainLoopSpec;
  toolPolicy: BaseToolPolicyMatrixSpec;
  sandbox: SandboxSpec;
  session: SessionSpec;
  statePlane: StatePlaneSpec;
}): FrameworkCoreContractSpec {
  return {
    kind: "praxis.frameworkCoreContract",
    contractVersion: "praxis.frameworkCore.v1",
    phase: "framework-core",
    runtimeTruth: "agentManifest",
    promptPack: {
      layer: "formal",
      providerPayloadBuilder: false,
      sourceCategories: ["declared-built-in", "process-product", "user-request"],
      bindRef: "runtime.execEngine.bindPromptPack",
      loweringRef: "runtime.modelAdapter.promptLoweringRuntime",
      promptPackId: input.promptPack.promptPackId,
    },
    mainLoop: {
      layer: "formal",
      arbitraryUserJs: false,
      stepRecordCompatible: true,
      modelDecisionCompatible: true,
      ephemeralProcedureCompatible: true,
      bindRef: "runtime.execEngine.bindCoreLogic",
      strategy: input.mainLoop.strategy,
    },
    modelDecision: {
      providerNeutral: true,
      variants: ["finalOutput", "toolCall", "ephemeralProcedurePlan", "requestApproval", "continue", "fail"],
    },
    baseToolGovernance: {
      identityAxis: "family/group/toolId",
      canonicalMountChain: [
        "adaptRuntimeToolInvocation",
        "bridgeExecEngineInvocation",
        "createBaseToolRegistry.lookupHandler",
        "BaseToolHandler.invoke",
        "BaseToolExecutorPort",
      ],
      policyMatrixId: input.toolPolicy.matrixId,
      sandboxId: input.sandbox.sandboxId,
    },
    sessionStateEvent: {
      session: input.session,
      statePlane: input.statePlane,
      records: ["session", "state", "event", "modelInvocation", "toolInvocation", "mainLoopStep"],
    },
    approval: {
      interfaceSurface: true,
      defaultBehavior: "public-safe-pending",
    },
    inspectionDebug: {
      manifestInspectable: true,
      debugSnapshotReady: false,
      selfRepairContractReady: false,
    },
    officialModuleBridge: {
      tap: "contract-only",
      cmp: "contract-only",
      mp: "contract-only",
      multiagent: "contract-only",
    },
    verificationGates: [
      "manifest-hash-stable",
      "top-level-harness-consistent",
      "no-raw-secrets",
      "provider-neutral-prompt-pack",
      "baseTool-registry-chain-required",
    ],
  };
}

type NormalizeResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: AgentCompileErrorCode; message: string };

function normalizedFailure<T>(code: AgentCompileErrorCode, message: string): NormalizeResult<T> {
  return { ok: false, code, message };
}

function normalizeIdentity(identity: AgentIdentity | undefined): AgentManifest["identity"] | undefined {
  if (typeof identity === "string") {
    const id = identity.trim();
    return id.length > 0 ? { id } : undefined;
  }

  if (identity === undefined || !hasText(identity.id)) {
    return undefined;
  }

  return {
    id: identity.id.trim(),
    name: identity.name?.trim() || undefined,
    version: identity.version?.trim() || undefined,
    description: identity.description?.trim() || undefined,
  };
}

function defaultEndpointForModel(modelSpec: ModelSpec, identityId: string): ModelEndpointSpec {
  const endpointPath: ModelEndpointPath = modelSpec.endpointShape === "messages"
    ? "/v1/messages"
    : modelSpec.endpointShape === "custom"
      ? "/v1/responses"
      : "/v1/responses";
  return endpoint(endpointPath, {
    endpointId: "primary",
    role: modelSpec.endpointShape === "messages" ? "reasoning" : "background",
    provider: modelSpec.provider,
    model: modelSpec.model,
    carrierId: modelSpec.carrierId ?? `${identityId}:carrier:${modelSpec.provider}:${modelSpec.model}`,
    baseURL: modelSpec.baseURL,
    credentialRef: modelSpec.credentialRef,
  });
}

function normalizeModelFleet(input: ModelFleetSpec | undefined, modelSpec: ModelSpec, identityId: string): NormalizeResult<ModelFleetSpec> {
  const fleet = input ?? modelFleet.auto({ primary: defaultEndpointForModel(modelSpec, identityId) });
  const endpointEntries = Object.entries(fleet.endpoints ?? {});
  if (endpointEntries.length === 0) {
    return normalizedFailure("INVALID_MODEL_FLEET", "modelFleet requires at least one endpoint");
  }

  const endpointPaths: readonly ModelEndpointPath[] = ["/v1/messages", "/v1/responses", "/v1/images", "/v1/batches", "/v1/realtime"];
  const endpoints = Object.fromEntries(endpointEntries.map(([ref, spec]) => {
    if (!hasText(ref) || !hasText(spec.endpointId)) {
      return [ref, undefined];
    }
    if (!endpointPaths.includes(spec.endpoint)) {
      return [ref, undefined];
    }
    return [ref.trim(), {
      ...spec,
      endpointId: spec.endpointId.trim(),
      endpointFamily: endpointFamilyFor(spec.endpoint),
      protocolFamily: spec.protocolFamily ?? protocolFamilyFor(spec.endpoint),
      role: spec.role,
    }];
  }));

  if (Object.values(endpoints).some((spec) => spec === undefined)) {
    return normalizedFailure("INVALID_MODEL_FLEET", "modelFleet endpoints must use supported /v1 endpoint families and stable ids");
  }

  const primaryRef = fleet.primaryRef?.trim() || endpointEntries[0]?.[0];
  if (primaryRef === undefined || endpoints[primaryRef] === undefined) {
    return normalizedFailure("INVALID_MODEL_FLEET", "modelFleet primaryRef must point to a declared endpoint");
  }

  return {
    ok: true,
    value: {
      mode: fleet.mode,
      endpoints: endpoints as Readonly<Record<string, ModelEndpointSpec>>,
      primaryRef,
      probeStrategy: fleet.probeStrategy ?? "lazy",
      capabilityMatrix: fleet.capabilityMatrix,
      failurePolicy: fleet.failurePolicy,
      metadata: fleet.metadata ?? {},
    },
  };
}

function materialHasContent(material: PromptMaterialSource | undefined): boolean {
  if (material === undefined) return true;
  if (material.kind === "markdown") return hasText(material.text);
  if (material.kind === "markdownFile") return hasText(material.path);
  return hasText(material.ref);
}

function normalizePromptPatch(patch: PromptPatchSpec): PromptPatchSpec {
  return {
    ...patch,
    patchId: patch.patchId.trim(),
    targetRef: patch.targetRef.trim(),
    sceneTrigger: patch.sceneTrigger?.trim() || undefined,
    stateTrigger: patch.stateTrigger?.trim() || undefined,
    auditRefs: cleanList(patch.auditRefs),
  };
}

function normalizePromptPack(input: PromptPackSpec | PromptPack | undefined, identityId: string): NormalizeResult<AgentManifest["promptPack"]> {
  const source = input ?? {};
  const base = source.base;
  if (!materialHasContent(base)) {
    return normalizedFailure("INVALID_PROMPT_PACK", "promptPack base material must reference markdown, markdownFile, or materialRef content");
  }

  const patchIds = new Set<string>();
  const normalizedPatches: PromptPatchSpec[] = [];
  const normalizedStateMutations: PromptPatchSpec[] = [];
  for (const [collectionName, target] of [
    ["patches", normalizedPatches],
    ["stateMachineMutations", normalizedStateMutations],
  ] as const) {
    for (const patch of source[collectionName] ?? []) {
      if (!hasText(patch.patchId) || !hasText(patch.targetRef) || !materialHasContent(patch.material)) {
        return normalizedFailure("INVALID_PROMPT_PACK", "promptPack patches require patchId, targetRef, and material");
      }
      if (patch.operation === "replaceLastLines" && (patch.lastLines === undefined || patch.lastLines < 1)) {
        return normalizedFailure("INVALID_PROMPT_PACK", "replaceLastLines patch requires a positive lastLines value");
      }
      if (patch.operation === "range" && (patch.range === undefined || patch.range.startLine < 1 || patch.range.endLine < patch.range.startLine)) {
        return normalizedFailure("INVALID_PROMPT_PACK", "range prompt patch requires a valid line range");
      }
      const normalized = normalizePromptPatch(patch);
      if (patchIds.has(normalized.patchId)) {
        return normalizedFailure("INVALID_PROMPT_PACK", `promptPack patchId must be unique: ${normalized.patchId}`);
      }
      patchIds.add(normalized.patchId);
      target.push(normalized);
    }
  }

  return {
    ok: true,
    value: {
      promptPackId: source.promptPackId?.trim() || `${identityId}:promptPack`,
      base,
      inherits: cleanList(source.inherits),
      patches: normalizedPatches,
      sceneTriggers: cleanList(source.sceneTriggers),
      stateMachineMutations: normalizedStateMutations,
      auditRefs: cleanList(source.auditRefs),
      materials: source.materials ?? [],
      designOwner: source.designOwner ?? (input === undefined ? "runtime-shim" : "archetype"),
      metadata: source.metadata ?? {},
    },
  };
}

function normalizeMainLoop(input: MainLoopSpec | undefined): NormalizeResult<MainLoopSpec> {
  const spec = input ?? mainLoop.standard();
  for (const hook of spec.hooks) {
    if (!hasText(hook.hook)) {
      return normalizedFailure("INVALID_MAIN_LOOP", "mainLoop hook requires a stable hook name");
    }
    if (Object.values(hook).some((value) => typeof value === "function")) {
      return normalizedFailure("INVALID_MAIN_LOOP", "mainLoop hooks must compile to stable refs, not function bodies");
    }
    if (!hasText(hook.strategyRef) && !hasText(hook.handlerRef) && !hasText(hook.policyRef)) {
      return normalizedFailure("INVALID_MAIN_LOOP", "mainLoop hook requires strategyRef, handlerRef, or policyRef");
    }
  }
  return {
    ok: true,
    value: {
      ...spec,
      hooks: spec.hooks.map((hook) => ({
        hook: hook.hook,
        strategyRef: hook.strategyRef?.trim() || undefined,
        handlerRef: hook.handlerRef?.trim() || undefined,
        policyRef: hook.policyRef?.trim() || undefined,
        metadata: hook.metadata,
      })),
      metadata: spec.metadata ?? {},
    },
  };
}

function normalizeSandbox(input: SandboxSpec | undefined): NormalizeResult<SandboxSpec> {
  const spec = input ?? sandbox.hostObserved();
  if (!hasText(spec.sandboxId) || !hasText(spec.profile) || !hasText(spec.filesystem) || !hasText(spec.network) || !hasText(spec.shell)) {
    return normalizedFailure("INVALID_SANDBOX", "sandbox requires stable sandboxId, profile, filesystem, network, and shell fields");
  }
  const resourceLimits = spec.resourceLimits ?? {};
  for (const [key, value] of Object.entries(resourceLimits)) {
    if (key === "metadata" || value === undefined) continue;
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      return normalizedFailure("INVALID_SANDBOX", "sandbox resource limits must be positive finite numbers");
    }
  }
  return {
    ok: true,
    value: {
      ...spec,
      sandboxId: spec.sandboxId.trim(),
      profile: spec.profile.trim() as SandboxProfile,
      filesystem: spec.filesystem.trim() as SandboxFilesystemPolicy,
      network: spec.network.trim() as SandboxNetworkPolicy,
      shell: spec.shell.trim() as SandboxShellPolicy,
      resourceLimits,
      metadata: spec.metadata ?? {},
    },
  };
}

function normalizeToolPolicy(input: BaseToolPolicyMatrixSpec | undefined): NormalizeResult<BaseToolPolicyMatrixSpec> {
  const spec = input ?? toolPolicies.standard({ matrixId: "toolPolicy.standard.default" });
  if (!hasText(spec.matrixId) || !hasText(spec.profile)) {
    return normalizedFailure("INVALID_TOOL_POLICY", "tool policy matrix requires stable matrixId and profile");
  }
  const familyRules = spec.familyRules ?? [];
  const groupRules = spec.groupRules ?? [];
  const toolRules = spec.toolRules ?? [];
  const actionRules = spec.actionRules ?? [];
  for (const rule of [...familyRules, ...groupRules, ...toolRules, ...actionRules]) {
    if (!hasText(rule.decision)) {
      return normalizedFailure("INVALID_TOOL_POLICY", "BaseTool policy rules require a decision");
    }
    if (rule.scope === "family" && !hasText(rule.family)) {
      return normalizedFailure("INVALID_TOOL_POLICY", "family-level BaseTool policy requires family");
    }
    if (rule.scope === "group" && (!hasText(rule.family) || !hasText(rule.group))) {
      return normalizedFailure("INVALID_TOOL_POLICY", "group-level BaseTool policy requires family and group");
    }
    if (rule.scope === "toolId" && !hasText(rule.toolId)) {
      return normalizedFailure("INVALID_TOOL_POLICY", "toolId-level BaseTool policy requires toolId");
    }
    if (rule.scope === "action" && !hasText(rule.action)) {
      return normalizedFailure("INVALID_TOOL_POLICY", "action-level BaseTool policy requires action");
    }
  }
  return {
    ok: true,
    value: {
      ...spec,
      matrixId: spec.matrixId.trim(),
      profile: spec.profile.trim() as BaseToolPolicyProfile,
      familyRules,
      groupRules,
      toolRules,
      actionRules,
      metadata: spec.metadata ?? {},
    },
  };
}

function normalizeHarnessTools(input: readonly ToolSpec[] | undefined): NormalizeResult<readonly ToolSpec[]> {
  const selectedTools = input ?? [];
  const catalogByToolId = new Map(createBaseToolSupportCatalog().map((entry) => [entry.toolId, entry]));
  const normalized: ToolSpec[] = [];
  const seenToolIds = new Set<string>();

  for (const selectedTool of selectedTools) {
    if (!hasText(selectedTool.toolId)) {
      return normalizedFailure("INVALID_TOOL_SPEC", "harness tools require stable toolId");
    }

    const toolId = selectedTool.toolId.trim();
    const entry = catalogByToolId.get(toolId);
    if (entry === undefined) {
      return normalizedFailure("INVALID_TOOL_SPEC", `harness references unknown BaseTool: ${toolId}`);
    }

    const family = selectedTool.family?.trim();
    if (family !== undefined && family.length > 0 && family !== entry.family && family !== entry.storageFamily) {
      return normalizedFailure(
        "INVALID_TOOL_SPEC",
        `harness tool ${toolId} family must match ${entry.storageFamily} or ${entry.family}`,
      );
    }

    const group = selectedTool.group?.trim();
    if (group !== undefined && group.length > 0 && group !== entry.group) {
      return normalizedFailure("INVALID_TOOL_SPEC", `harness tool ${toolId} group must match ${entry.group}`);
    }

    if (seenToolIds.has(toolId)) {
      continue;
    }
    seenToolIds.add(toolId);
    normalized.push({
      ...selectedTool,
      toolId,
      family: entry.storageFamily,
      group: entry.group,
      description: selectedTool.description ?? entry.title,
      metadata: {
        baseToolFamily: entry.family,
        riskLevel: entry.riskLevel,
        ...(selectedTool.metadata ?? {}),
      },
    });
  }

  return { ok: true, value: normalized };
}

function normalizeSession(input: SessionSpec | undefined): NormalizeResult<SessionSpec> {
  const spec = input ?? session();
  if (!hasText(spec.persistence) || !hasText(spec.resume) || !hasText(spec.thread) || !hasText(spec.logs)) {
    return normalizedFailure("INVALID_SESSION", "session spec requires persistence, resume, thread, and logs");
  }
  return { ok: true, value: { ...spec, metadata: spec.metadata ?? {} } };
}

function normalizeStatePlane(input: StatePlaneSpec | undefined): NormalizeResult<StatePlaneSpec> {
  const spec = input ?? { expose: ["phase", "lastAction", "toolCalls", "errors"], control: [], audit: "summary" };
  const expose = cleanList(spec.expose);
  const control = cleanList(spec.control);
  if (expose.length === 0) {
    return normalizedFailure("INVALID_STATE_PLANE", "statePlane expose list must contain at least one stable field");
  }
  return { ok: true, value: { expose, control, audit: spec.audit, metadata: spec.metadata ?? {} } };
}

function normalizeHarness(
  input: HarnessSpec,
  authoring: {
    modelFleet: ModelFleetSpec;
    promptPack: AgentManifest["promptPack"];
    mainLoop: MainLoopSpec;
    sandbox: SandboxSpec;
    toolPolicy: BaseToolPolicyMatrixSpec;
    session: SessionSpec;
    statePlane: StatePlaneSpec;
    frameworkCore: FrameworkCoreContractSpec;
  },
  normalizedTools: readonly ToolSpec[],
): AgentManifest["harness"] {
  const loopSpec = input.loop ?? { strategy: "tool-calling-v1", maxModelTurns: 2, maxToolCalls: 4 };
  return {
    context: input.context ?? {},
    memory: input.memory ?? { mode: "session" },
    storage: input.storage ?? { kind: "memory" },
    promptPack: {
      promptPackId: authoring.promptPack.promptPackId,
      base: authoring.promptPack.base,
      inherits: authoring.promptPack.inherits,
      patches: authoring.promptPack.patches,
      sceneTriggers: authoring.promptPack.sceneTriggers,
      stateMachineMutations: authoring.promptPack.stateMachineMutations,
      auditRefs: authoring.promptPack.auditRefs,
      materials: authoring.promptPack.materials,
      designOwner: authoring.promptPack.designOwner,
      metadata: authoring.promptPack.metadata,
    },
    tools: normalizedTools,
    policy: input.policy ?? {},
    loop: {
      strategy: loopSpec.strategy,
      maxModelTurns: loopSpec.maxModelTurns ?? 2,
      maxToolCalls: loopSpec.maxToolCalls ?? 4,
      metadata: loopSpec.metadata,
    },
    modelFleet: authoring.modelFleet,
    mainLoop: authoring.mainLoop,
    sandbox: authoring.sandbox,
    toolPolicy: authoring.toolPolicy,
    session: authoring.session,
    statePlane: authoring.statePlane,
    frameworkCore: authoring.frameworkCore,
    modules: input.modules ?? {},
    runtimeRequirements: cleanList(input.runtimeRequirements),
    metadata: input.metadata ?? {},
  };
}

function failure(
  code: AgentCompileErrorCode,
  message: string,
  boundary: "input" | "agent-object" | "manifest",
): AgentCompileResult {
  return {
    ok: false,
    error: { code, message, boundary, publicSafe: true },
    events: ["runtime.agentManifest.compile.rejected"],
  };
}

export function compileAgent<TAgent extends PraxisAgent>(
  input?: PraxisAgentInput<TAgent>,
  options: { compiledAt?: string; manifestId?: string } = {},
): AgentCompileResult {
  if (input === undefined) {
    return failure("MISSING_AGENT", "compileAgent requires a PraxisAgent class or instance", "input");
  }

  let agent: PraxisAgent;
  let source: AgentManifest["source"];
  try {
    if (isAgentClass(input)) {
      agent = new input();
      source = {
        kind: "class",
        className: input.name || undefined,
        constructorSideEffectsAllowed: false,
      };
    } else {
      agent = input;
      source = {
        kind: "instance",
        className: input.constructor.name || undefined,
        constructorSideEffectsAllowed: false,
      };
    }
  } catch {
    return failure("INVALID_AGENT_CLASS", "compileAgent could not instantiate the provided Agent class", "agent-object");
  }

  const identity = normalizeIdentity(agent.identity);
  if (identity === undefined) {
    return failure("MISSING_IDENTITY", "PraxisAgent requires a stable identity", "agent-object");
  }

  if (agent.model === undefined) {
    return failure("MISSING_MODEL", "PraxisAgent requires a model spec", "agent-object");
  }

  if (!hasText(agent.model.model)) {
    return failure("MISSING_MODEL_NAME", "PraxisAgent model spec requires a model name", "agent-object");
  }

  if (agent.harness === undefined) {
    return failure("MISSING_HARNESS", "PraxisAgent requires a declarative harness", "agent-object");
  }

  const compiledAt = options.compiledAt ?? new Date().toISOString();
  const modelSpec = {
    ...agent.model,
    provider: agent.model.provider,
    model: agent.model.model.trim(),
    endpointShape: agent.model.endpointShape ?? "responses",
    carrierId: agent.model.carrierId ?? `${identity.id}:carrier:${agent.model.provider}:${agent.model.model.trim()}`,
  };
  const modelFleetSpec = normalizeModelFleet(agent.modelFleet ?? agent.harness.modelFleet, modelSpec, identity.id);
  if (!modelFleetSpec.ok) {
    return failure(modelFleetSpec.code, modelFleetSpec.message, "agent-object");
  }

  const promptPackSpec = normalizePromptPack(agent.promptPack ?? agent.harness.promptPack, identity.id);
  if (!promptPackSpec.ok) {
    return failure(promptPackSpec.code, promptPackSpec.message, "agent-object");
  }

  const mainLoopSpec = normalizeMainLoop(agent.mainLoop ?? agent.harness.mainLoop);
  if (!mainLoopSpec.ok) {
    return failure(mainLoopSpec.code, mainLoopSpec.message, "agent-object");
  }

  const sandboxSpec = normalizeSandbox(agent.sandbox ?? agent.harness.sandbox);
  if (!sandboxSpec.ok) {
    return failure(sandboxSpec.code, sandboxSpec.message, "agent-object");
  }

  const toolPolicySpec = normalizeToolPolicy(agent.toolPolicy ?? agent.harness.toolPolicy);
  if (!toolPolicySpec.ok) {
    return failure(toolPolicySpec.code, toolPolicySpec.message, "agent-object");
  }

  const harnessTools = normalizeHarnessTools(agent.harness.tools);
  if (!harnessTools.ok) {
    return failure(harnessTools.code, harnessTools.message, "agent-object");
  }

  const sessionSpec = normalizeSession(agent.session ?? agent.harness.session);
  if (!sessionSpec.ok) {
    return failure(sessionSpec.code, sessionSpec.message, "agent-object");
  }

  const statePlaneSpec = normalizeStatePlane(agent.statePlane ?? agent.harness.statePlane);
  if (!statePlaneSpec.ok) {
    return failure(statePlaneSpec.code, statePlaneSpec.message, "agent-object");
  }

  const authoring = {
    modelFleet: modelFleetSpec.value,
    promptPack: promptPackSpec.value,
    mainLoop: mainLoopSpec.value,
    sandbox: sandboxSpec.value,
    toolPolicy: toolPolicySpec.value,
    session: sessionSpec.value,
    statePlane: statePlaneSpec.value,
    frameworkCore: createFrameworkCoreContract({
      promptPack: promptPackSpec.value,
      mainLoop: mainLoopSpec.value,
      sandbox: sandboxSpec.value,
      toolPolicy: toolPolicySpec.value,
      session: sessionSpec.value,
      statePlane: statePlaneSpec.value,
    }),
  };
  const manifestWithoutHash: Omit<AgentManifest, "manifestHash"> = {
    kind: "praxis.agentManifest",
    schemaVersion: "praxis.agentManifest.v1",
    manifestId: options.manifestId ?? `${identity.id}:manifest`,
    compiledAt,
    source,
    identity,
    model: modelSpec,
    modelFleet: authoring.modelFleet,
    promptPack: authoring.promptPack,
    mainLoop: authoring.mainLoop,
    sandbox: authoring.sandbox,
    toolPolicy: authoring.toolPolicy,
    session: authoring.session,
    statePlane: authoring.statePlane,
    frameworkCore: authoring.frameworkCore,
    harness: normalizeHarness(agent.harness, authoring, harnessTools.value),
    behaviors: agent.behaviors,
    hooks: agent.hooks,
    verification: {
      compiled: true,
      harnessDeclarative: true,
      runtimeExecutesManifestOnly: true,
    },
  };

  return {
    ok: true,
    manifest: {
      ...manifestWithoutHash,
      manifestHash: manifestHash(manifestWithoutHash),
    },
    events: ["runtime.agentManifest.compiled"],
  };
}

function manifestValidationFailure(
  code: AgentManifestValidationErrorCode,
  message: string,
  boundary: "input" | "manifest" | "security" | "consistency",
): AgentManifestValidationResult {
  return {
    ok: false,
    error: { code, message, boundary, publicSafe: true },
    events: ["runtime.agentManifest.validation.rejected"],
  };
}

function manifestWithoutHash(manifest: AgentManifest): Omit<AgentManifest, "manifestHash"> {
  const { manifestHash: _manifestHash, ...withoutHash } = manifest;
  return withoutHash;
}

function looksLikeRawSecretKey(key: string): boolean {
  return /(^|_)(api[-_]?key|secret|access[-_]?token|refresh[-_]?token|password|bearer)(_|$)/i.test(key);
}

function containsRawSecretShape(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false;
  }
  if (Array.isArray(value)) {
    return value.some(containsRawSecretShape);
  }
  if (!isRecord(value)) {
    return false;
  }
  return Object.entries(value).some(([key, nested]) => looksLikeRawSecretKey(key) || containsRawSecretShape(nested));
}

export function validateAgentManifest(input: unknown): AgentManifestValidationResult {
  if (!isRecord(input)) {
    return manifestValidationFailure("MISSING_MANIFEST", "AgentManifest validation requires a manifest object", "input");
  }

  if (input.kind !== "praxis.agentManifest") {
    return manifestValidationFailure("INVALID_KIND", "AgentManifest kind must be praxis.agentManifest", "manifest");
  }

  if (input.schemaVersion !== "praxis.agentManifest.v1") {
    return manifestValidationFailure("INVALID_SCHEMA_VERSION", "AgentManifest schemaVersion must be praxis.agentManifest.v1", "manifest");
  }

  const manifest = input as AgentManifest;
  if (!hasText(manifest.manifestId)) {
    return manifestValidationFailure("MISSING_MANIFEST_ID", "AgentManifest requires a stable manifestId", "manifest");
  }

  if (!hasText(manifest.manifestHash)) {
    return manifestValidationFailure("MISSING_HASH", "AgentManifest requires a manifestHash", "manifest");
  }

  if (manifest.frameworkCore?.kind !== "praxis.frameworkCoreContract") {
    return manifestValidationFailure("MISSING_FRAMEWORK_CORE", "AgentManifest requires a frameworkCore contract", "manifest");
  }

  if (containsRawSecretShape(manifest.model) || containsRawSecretShape(manifest.modelFleet)) {
    return manifestValidationFailure("RAW_SECRET_REJECTED", "AgentManifest must contain credential refs, not raw provider secrets", "security");
  }

  const expectedHash = manifestHash(manifestWithoutHash(manifest));
  if (manifest.manifestHash !== expectedHash) {
    return manifestValidationFailure("HASH_MISMATCH", "AgentManifest hash does not match its stable contents", "manifest");
  }

  if (
    manifest.harness?.promptPack?.promptPackId !== manifest.promptPack?.promptPackId ||
    manifest.harness?.mainLoop?.strategy !== manifest.mainLoop?.strategy ||
    manifest.harness?.sandbox?.sandboxId !== manifest.sandbox?.sandboxId ||
    manifest.harness?.toolPolicy?.matrixId !== manifest.toolPolicy?.matrixId ||
    manifest.harness?.frameworkCore?.promptPack?.promptPackId !== manifest.frameworkCore.promptPack.promptPackId
  ) {
    return manifestValidationFailure("HARNESS_VIEW_MISMATCH", "AgentManifest top-level authoring fields must mirror harness view", "consistency");
  }

  return {
    ok: true,
    manifest,
    events: ["runtime.agentManifest.validation.accepted"],
  };
}

export function inspectAgentManifest(manifest: AgentManifest): AgentManifestInspection {
  return {
    manifestId: manifest.manifestId,
    manifestHash: manifest.manifestHash,
    identityId: manifest.identity.id,
    model: {
      provider: manifest.model.provider,
      model: manifest.model.model,
      carrierId: manifest.model.carrierId,
      endpointShape: manifest.model.endpointShape,
      fleetMode: manifest.modelFleet.mode,
      endpoints: Object.keys(manifest.modelFleet.endpoints),
    },
    promptPack: {
      promptPackId: manifest.promptPack.promptPackId,
      designOwner: manifest.promptPack.designOwner,
      patchCount: manifest.promptPack.patches.length + manifest.promptPack.stateMachineMutations.length,
      materialCount: manifest.promptPack.materials.length,
    },
    mainLoop: {
      strategy: manifest.mainLoop.strategy,
      hookCount: manifest.mainLoop.hooks.length,
      formalLayer: manifest.frameworkCore.mainLoop.layer === "formal",
    },
    governance: {
      sandboxProfile: manifest.sandbox.profile,
      sandboxId: manifest.sandbox.sandboxId,
      toolPolicyProfile: manifest.toolPolicy.profile,
      policyMatrixId: manifest.toolPolicy.matrixId,
    },
    sessionState: {
      persistence: manifest.session.persistence,
      resume: manifest.session.resume,
      thread: manifest.session.thread,
      exposedState: manifest.statePlane.expose,
      controls: manifest.statePlane.control,
    },
    frameworkCore: {
      contractVersion: manifest.frameworkCore.contractVersion,
      promptPackBindRef: manifest.frameworkCore.promptPack.bindRef,
      mainLoopBindRef: manifest.frameworkCore.mainLoop.bindRef,
      officialModules: manifest.frameworkCore.officialModuleBridge,
    },
    runtimeRequirements: manifest.harness.runtimeRequirements,
    verificationGates: manifest.frameworkCore.verificationGates,
  };
}
