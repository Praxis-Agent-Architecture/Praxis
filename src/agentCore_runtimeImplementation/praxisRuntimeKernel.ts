/*
 * 文件定位：Agent 运行态实现层 / PraxisRuntimeKernel。
 * 核心目的：执行已编译 AgentManifest，把 text IO、codex responses、BaseTool mount 和 session/event 记录串成第一条可用 agent 链。
 * 能力要求1：runtime 执行 manifest，不直接执行 Agent class 内部逻辑，run(agent) 只作为 compile 后的语法糖。
 * 能力要求2：支持 codex_responses 模型调用、一次工具调用回填、BaseToolExecutorPort 注入和最小 session/state/event 记录。
 * 边界：不设计 promptPack 终局语义，不加厚 mainLoop/coreLogic 动作原语，不吞并 baseTool storage 语义。
 * 对接：需要服务 OAO compile、runtime.modelAdapter、runtime.execEngine、IOTransceiver 和后续 inspection/debug。
 * 实现提示：先提供可测试纵向闭环，再由用户监督 promptPack 与 mainLoop/coreLogic 的正式设计。
 */

import type { AuthEnvelope } from "../agentCore_modelAdapter/authProfileLayer/authEnvelope.js";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { OpenAIV1ResponsesProviderCaller } from "../agentCore_modelAdapter/actualInvocationLayer/openai/v1_responses.js";
import type { OpenAiV1ChatCompletionsProviderCaller } from "../agentCore_modelAdapter/actualInvocationLayer/openai/v1_chat_completions.js";
import type { AnthropicV1MessagesProviderCaller } from "../agentCore_modelAdapter/actualInvocationLayer/anthropic/v1_messages.js";
import {
  isDeepSeekV4Model,
  mapDeepSeekV4ReasoningEffort,
} from "../agentCore_modelAdapter/providerAccessLayer/modelMetadataRegistry.js";
import {
  createProviderToolMappings,
  lowerProviderToolResult,
  lowerPraxisToolsForProvider,
  providerToolName,
  type ProviderToolDeclarationBundle,
  type ProviderToolResultEnvelope,
  type ProviderToolNameMapping,
  type ProviderToolSchemaFamily,
} from "../agentCore_modelAdapter/bridgingLayer/toolSchemaCompatibilityLayer.js";
import type { BaseToolExecutorPort } from "../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { receiveTextInput } from "../agentCore_executionEngine/IOTransceiver/inputReceiver/textReceiver.js";
import { exposeTextOutput } from "../agentCore_executionEngine/IOTransceiver/outputExposer/textExposer.js";
import {
  createMainLoopStepRecord,
  decideMainLoopFinalAcceptance,
  planFrameworkMainLoopHandoff,
  runMainLoop,
  runMainLoopRunner,
  type MainLoopRunnerError,
  type MainLoopTurnRecord,
  type MainLoopStepRecord,
} from "../agentCore_executionEngine/coreLogic/mainLoop.js";
import {
  interpretModelDecision,
} from "../agentCore_executionEngine/coreLogic/modelDecision.js";
import {
  type EphemeralProcedurePlan,
  type EphemeralProcedureStep,
} from "../agentCore_executionEngine/coreLogic/ephemeralProcedure.js";
import {
  createObservationMaterial,
  DEFAULT_OBSERVATION_TURN_INLINE_BUDGET_BYTES,
  type RuntimeObservationMaterial,
} from "../agentCore_executionEngine/coreLogic/observationIntegrator.js";
import type { StandardPromptPack } from "../agentCore_executionEngine/promptPack/promptAssembler.js";
import {
  type PromptPackMaterialDraft,
  type PromptPackSegmentKind,
} from "../agentCore_executionEngine/promptPack/promptDefiner.js";
import {
  createRuntimeBaseToolExecutorPort,
  listRuntimeBaseToolImplementedPortPaths,
  type RuntimeBaseToolExecutorPolicy,
  type RuntimeBaseToolExecutorResourceLimits,
} from "./runtime.execEngine/baseToolExecutorPortFactory.js";
import { evaluateBaseToolRuntimeGovernance, type BaseToolRuntimeGovernanceDecision } from "./runtime.execEngine/baseToolRuntimeGovernance.js";
import {
  preflightBaseToolDependencies,
  type BaseToolDependencyRuntimeMode,
} from "./runtime.execEngine/baseToolDependencyRuntime.js";
import {
  applyBaseToolContextUsage,
  createBaseToolContextHeatState,
  createBaseToolContextTree,
  type BaseToolContextHeatState,
  type BaseToolContextSelection,
  type BaseToolContextUsageRecord,
} from "./runtime.execEngine/baseToolContextFolding.js";
import { invokeMountedBaseTool } from "./runtime.execEngine/baseToolRuntimeMount.js";
import { evaluateBaseToolRuntimeReadiness } from "./runtime.execEngine/baseToolSupportCatalog.js";
import { invokeModelThroughRuntime } from "./runtime.modelAdapter/modelInvocationRuntime.js";
import {
  normalizeAllowedRoots,
  normalizeToolCwd,
  normalizeWorkspacePath,
  workspacePathMetadata,
  workspaceRelativePath,
  type WorkspacePathFailure,
} from "./runtime.execEngine/workspacePathPolicy.js";
import {
  lowerPromptForModelAdapter,
  type LoweredPromptEnvelope,
} from "./runtime.modelAdapter/promptLoweringRuntime.js";
import {
  compileAgent,
  type AgentManifest,
  type BaseToolPolicyProfile,
  type PraxisAgent,
  type PraxisAgentInput,
  type PromptMaterialSource,
} from "./runtimeAgentManifest.js";
import {
  approvalInterfaceEnvelope,
  type InterfaceEnvelope,
} from "../agentCore_interfaceAdapter/interfaceEnvelope.js";
import type { ToolDependencyProbe } from "../agentCore_executionEngine/basic_toolLayer/toolDependency/dependencyManager.js";
import {
  createInMemorySessionStateEventStore,
  createSqliteSessionStateEventStore,
  type RuntimeEventRecord,
  type RuntimeInvocationRecord,
  type RuntimeApprovalRecord,
  type RuntimePublicSafeErrorRecord,
  type RuntimeProcedureRecord,
  type RuntimeSessionSnapshot,
  type RuntimeSessionStateEventStore,
  type RuntimeStateRecord,
} from "./runtimeSessionStateEventStore.js";
import {
  applyRaxStorageInitPlan,
  createStoragePlaneRuntime,
  type RaxStorageInitMode,
  type StoragePlaneRuntime,
} from "./runtime.storagePlane/storagePlaneRuntime.js";
import {
  prepareSandboxRuntime,
  type SandboxRuntimePrepareResult,
} from "./runtime.sandboxPlane/sandboxRuntimeProvider.js";
import {
  describeShellWorkspaceWrite,
  shellWorkspaceWriteGuardMessage,
} from "../storagePool/baseToolStorage/shellBase/_shared/workspaceWriteGuard.js";

export type PraxisRuntimeKernelErrorCode =
  | "MANIFEST_COMPILE_FAILED"
  | "TEXT_INPUT_REJECTED"
  | "PROMPT_PACK_FAILED"
  | "MODEL_INVOCATION_FAILED"
  | "MODEL_DECISION_FAILED"
  | "TOOL_INVOCATION_FAILED"
  | "PROCEDURE_INVOCATION_FAILED"
  | "APPROVAL_REQUIRED"
  | "SANDBOX_UNAVAILABLE"
  | "STORAGE_RESOLUTION_FAILED"
  | "TEXT_OUTPUT_REJECTED";

export type PraxisRuntimeKernelError = {
  code: PraxisRuntimeKernelErrorCode;
  message: string;
  boundary: "compile" | "io" | "model" | "tool" | "runtime-state";
  publicSafe: true;
};

export type PraxisRuntimeKernelOptions = {
  runtimeId?: string;
  sessionId?: string;
  auth?: AuthEnvelope;
  providerCaller?: OpenAIV1ResponsesProviderCaller;
  openaiResponsesCaller?: OpenAIV1ResponsesProviderCaller;
  openaiChatCompletionsCaller?: OpenAiV1ChatCompletionsProviderCaller;
  anthropicMessagesCaller?: AnthropicV1MessagesProviderCaller;
  allowPreviousResponseId?: boolean;
  previousProviderResponse?: {
    responseId: string;
    stablePrefixHash: string;
  };
  executor?: BaseToolExecutorPort;
  baseToolAdapters?: Partial<BaseToolExecutorPort>;
  baseToolPolicy?: RuntimeBaseToolExecutorPolicy;
  baseToolResourceLimits?: RuntimeBaseToolExecutorResourceLimits;
  store?: RuntimeSessionStateEventStore;
  allowProviderCall?: boolean;
  allowToolExecution?: boolean;
  exposeProviderTools?: boolean;
  toolContextSelection?: BaseToolContextSelection;
  toolContextUsage?: readonly BaseToolContextUsageRecord[];
  dryRun?: boolean;
  approvalResolver?: RuntimeApprovalResolver;
  baseToolDependencyRuntime?: {
    mode?: BaseToolDependencyRuntimeMode;
    probes?: readonly ToolDependencyProbe[];
    managedRoot?: string;
    env?: Readonly<Record<string, string | undefined>>;
    homeDir?: string;
    timeoutMs?: number;
  };
  storage?: {
    cwd?: string;
    raxHome?: string;
    workspaceRoot?: string;
    homeDir?: string;
    env?: Readonly<Record<string, string | undefined>>;
    initMode?: RaxStorageInitMode;
  };
  sandbox?: {
    cwd?: string;
    runSmoke?: boolean;
    failOnUnavailable?: boolean;
  };
  onTextDelta?: (delta: string, metadata?: Readonly<Record<string, unknown>>) => void | Promise<void>;
  onModelCallProgress?: (event: AgentModelCallProgressEvent) => void | Promise<void>;
  onToolCallProgress?: (event: AgentToolCallProgressEvent) => void | Promise<void>;
  now?: () => string;
};

export type RuntimeApprovalEnvelope = {
  approvalId: string;
  runtimeId: string;
  sessionId: string;
  source: RuntimeApprovalRecord["source"];
  reason: string;
  requestedScopes: readonly string[];
  riskLevel?: string;
  interfaceSurface: RuntimeApprovalRecord["interfaceSurface"];
  metadata: Readonly<Record<string, unknown>>;
  publicSafe: true;
};

export type RuntimeApprovalResolution = {
  status: "approved" | "denied" | "pending";
  resolvedBy?: string;
  reason?: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type RuntimeApprovalResolver = (
  envelope: RuntimeApprovalEnvelope,
) => RuntimeApprovalResolution | Promise<RuntimeApprovalResolution>;

async function inferFilesystemActionForTool(input: {
  toolId: string;
  args: Readonly<Record<string, unknown>>;
  workspaceRoot?: string;
}): Promise<string | undefined> {
  if (input.toolId === "code.delete") return "delete";
  if (!["code.overwrite", "code.replaceFile", "code.modify", "code.format"].includes(input.toolId)) return undefined;

  const rawPath = input.args.targetPath ?? input.args.path;
  if (typeof rawPath !== "string" || rawPath.trim() === "" || input.workspaceRoot === undefined) {
    return ["code.overwrite", "code.replaceFile"].includes(input.toolId) ? "overwrite" : "modify";
  }

  const normalized = rawPath.trim();
  const absoluteTarget = path.isAbsolute(normalized) ? normalized : path.resolve(input.workspaceRoot, normalized);
  const relative = path.relative(input.workspaceRoot, absoluteTarget);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return "out-of-scope";

  try {
    await stat(absoluteTarget);
    return ["code.overwrite", "code.replaceFile"].includes(input.toolId) ? "overwrite" : "modify";
  } catch (error) {
    if (typeof error === "object" && error !== null && (error as { code?: unknown }).code === "ENOENT") return "create";
    return undefined;
  }
}

export type AgentToolCallRecord = {
  callId: string;
  toolId: string;
  arguments: Readonly<Record<string, unknown>>;
  ok: boolean;
  output?: unknown;
  error?: unknown;
};

export type AgentToolCallProgressEvent =
  | {
      phase: "started";
      callId: string;
      toolId: string;
      providerToolName?: string;
      arguments: Readonly<Record<string, unknown>>;
    }
  | {
      phase: "completed" | "failed";
      providerToolName?: string;
      record: AgentToolCallRecord;
    };

export type AgentModelCallRecord = {
  invocationId: string;
  raw: unknown;
  ok: boolean;
  usage?: AgentModelUsageRecord;
  providerRouting?: AgentModelProviderRoutingDebug;
  providerResponseId?: string;
  previousProviderResponseId?: string;
};

export type AgentModelUsageRecord = {
  inputTokens?: number;
  outputTokens?: number;
  thinkingTokens?: number;
  totalTokens?: number;
  cachedInputTokens?: number;
  source?: string;
  estimated: boolean;
};

export type AgentModelProviderRoutingDebug = {
  publicSafe: true;
  responseHeaderNames: readonly string[];
  responseCodexTurnState: "present" | "absent";
  responseRequestId?: string;
  responseOpenAIModel?: string;
};

export type AgentModelCallProgressEvent =
  | {
      phase: "started";
      invocationId: string;
      turnIndex: number;
      provider: string;
      carrierId: string;
      model?: string;
    }
  | {
      phase: "completed" | "failed";
      invocationId: string;
      turnIndex: number;
      provider: string;
      carrierId: string;
      model?: string;
      ok: boolean;
      usage?: AgentModelUsageRecord;
      providerRouting?: AgentModelProviderRoutingDebug;
      cacheDebug?: AgentModelCacheDebugRecord;
      providerResponseId?: string;
      previousProviderResponseId?: string;
      error?: PraxisRuntimeKernelError;
    };

export type AgentModelCacheDebugRecord = {
  kind: "praxis.modelCall.cacheDebug";
  strategy: "prompt-pack-cache-xray";
  promptCacheKey?: string;
  promptPack: {
    totalEstimatedTokens: number;
    renderedTextEstimatedTokens: number;
    cacheablePrefixEstimatedTokens: number;
    dynamicEstimatedTokens: number;
    segmentCount: number;
    segments: readonly {
      segmentKind: PromptPackSegmentKind;
      cachePolicy: string;
      stability: string;
      estimatedTokens: number;
      segmentHash: string;
      materialCount: number;
      materialRefs: readonly string[];
      providerHints: Readonly<Record<string, unknown>>;
    }[];
    cacheRiskWarnings: readonly string[];
    providerLowering?: {
      instructionSegmentKinds: readonly PromptPackSegmentKind[];
      dynamicInputSegmentKinds: readonly PromptPackSegmentKind[];
      instructionEstimatedTokens: number;
      dynamicInputEstimatedTokens: number;
      instructionsHash: string;
      dynamicInputHash: string;
    };
  };
  providerBody: {
    estimatedTokens: number;
    inputEstimatedTokens: number;
    toolsEstimatedTokens: number;
    toolCount: number;
    fingerprints: Readonly<Record<string, string>>;
    previousProviderOutputItems: number;
    toolResultInputs: number;
    toolResultBudget: {
      budgetBytes: number;
      originalToolResultBytes: number;
      replayedToolResultBytes: number;
      fullToolResults: number;
      compactedToolResults: number;
    };
    cacheShape: {
      providerStablePrefixEstimatedTokens: number;
      providerDynamicInputEstimatedTokens: number;
      stablePrefixShare: number;
      dynamicInputShare: number;
      stablePrefixHash: string;
      dynamicPayloadHash: string;
    };
  };
  observedUsage?: {
    inputTokens?: number;
    cachedInputTokens?: number;
    nonCachedInputTokens?: number;
    cacheHitRate?: number;
    stablePrefixWarmthEstimate?: number;
    diagnosis:
      | "no-cache-telemetry"
      | "warm-stable-prefix"
      | "dynamic-payload-dominates"
      | "stable-prefix-cache-break"
      | "provider-cache-miss-with-stable-prefix"
      | "partial-cache-hit";
    reasons: readonly string[];
  };
  comparisonToPrevious?: {
    previousStablePrefixHash: string;
    previousDynamicPayloadHash: string;
    stablePrefixChanged: boolean;
    dynamicPayloadChanged: boolean;
    instructionsChanged: boolean;
    toolsChanged: boolean;
    changedFingerprintKeys: readonly string[];
  };
};

export type AgentRunResult =
  | {
      ok: true;
      runtimeId: string;
      sessionId: string;
      manifest: AgentManifest;
      finalOutput: string;
      modelCalls: readonly AgentModelCallRecord[];
      toolCalls: readonly AgentToolCallRecord[];
      mainLoopSteps: readonly MainLoopStepRecord[];
      events: readonly string[];
      state: RuntimeSessionSnapshot;
    }
  | {
      ok: false;
      runtimeId?: string;
      sessionId?: string;
      manifest?: AgentManifest;
      error: PraxisRuntimeKernelError;
      mainLoopSteps?: readonly MainLoopStepRecord[];
      events: readonly string[];
      state?: RuntimeSessionSnapshot;
    };

type ProviderToolMapping = ProviderToolNameMapping;

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function defaultNow(): string {
  return new Date().toISOString();
}

function runtimeIdFor(manifest: AgentManifest): string {
  return `runtime:${manifest.identity.id}`;
}

function sessionIdFor(runtimeId: string, manifest: AgentManifest): string {
  return `${runtimeId}:session:${manifest.manifestHash.slice(0, 12)}`;
}

function event(
  sessionId: string,
  eventId: string,
  type: string,
  createdAt: string,
  payload: Readonly<Record<string, unknown>> = {},
): RuntimeEventRecord {
  return { sessionId, eventId, type, createdAt, payload };
}

function state(
  sessionId: string,
  stateId: string,
  phase: string,
  createdAt: string,
  metadata: Readonly<Record<string, unknown>> = {},
): RuntimeStateRecord {
  return { sessionId, stateId, phase, createdAt, metadata };
}

function storageSessionMetadata(storageRuntime: StoragePlaneRuntime, sessionSqlitePath: string): Readonly<Record<string, unknown>> {
  return {
    kind: storageRuntime.kind,
    protocolVersion: storageRuntime.layout.protocolVersion,
    initMode: storageRuntime.initMode,
    homeRef: storageRuntime.layout.refs.homeRef,
    workspaceRef: storageRuntime.layout.refs.workspaceRef,
    sessionStoreRef: storageRuntime.layout.refs.sessionStoreRef,
    artifactRootRef: storageRuntime.layout.refs.artifactRootRef,
    cacheRootRef: storageRuntime.layout.refs.cacheRootRef,
    sandboxRootRef: storageRuntime.layout.refs.sandboxRootRef,
    homeRoot: storageRuntime.layout.home.root,
    workspaceRoot: storageRuntime.layout.workspace.root,
    sessionSqlitePath,
    writesSecrets: storageRuntime.initPlan.writesSecrets,
  };
}

function invocation(
  sessionId: string,
  invocationId: string,
  kind: RuntimeInvocationRecord["kind"],
  target: string,
  ok: boolean,
  createdAt: string,
  summary: Readonly<Record<string, unknown>> = {},
): RuntimeInvocationRecord {
  return { sessionId, invocationId, kind, target, ok, createdAt, summary };
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readPositiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

function readStringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  const values: string[] = [];
  for (const item of value) {
    const text = readString(item);
    if (text !== undefined && !values.includes(text)) values.push(text);
  }
  return values;
}

function procedureShellStepCommandSource(step: EphemeralProcedureStep): string | undefined {
  if (!step.baseToolId.startsWith("shell.")) return undefined;
  const target = isRecord(step.input.target) ? step.input.target : {};
  const command = readString(step.input.command)
    ?? readString(target.command)
    ?? readString(step.input.script)
    ?? readString(target.script);
  const args = [
    ...readStringArray(step.input.args),
    ...readStringArray(target.args),
  ];
  if (command !== undefined) {
    return [command, ...args].join(" ");
  }
  try {
    return JSON.stringify(step.input);
  } catch {
    return undefined;
  }
}

function procedureShellWorkspaceWriteViolation(plan: EphemeralProcedurePlan): {
  step: EphemeralProcedureStep;
  reason: string;
  message: string;
} | undefined {
  for (const step of plan.steps) {
    const source = procedureShellStepCommandSource(step);
    if (source === undefined) continue;
    const reason = describeShellWorkspaceWrite(source);
    if (reason === undefined) continue;
    return {
      step,
      reason,
      message: `EphemeralProcedure step ${step.stepId} uses ${step.baseToolId} to write workspace files. ${shellWorkspaceWriteGuardMessage(reason)}`,
    };
  }
  return undefined;
}

function mergeStringLists(...lists: readonly (readonly string[] | undefined)[]): readonly string[] {
  const merged: string[] = [];
  for (const list of lists) {
    if (list === undefined) continue;
    for (const item of list) {
      const text = readString(item);
      if (text !== undefined && !merged.includes(text)) merged.push(text);
    }
  }
  return merged;
}

function omniProviderPermissionsCanDefault(profile: BaseToolPolicyProfile): boolean {
  return profile === "bapr" || profile === "yolo" || profile === "permissive";
}

function runtimeTapApprovalCanDefault(profile: BaseToolPolicyProfile): boolean {
  return profile === "bapr" || profile === "yolo" || profile === "permissive";
}

const shellRuntimeBasePermissions = ["shell:execute", "shell:observe", "shell:validate"] as const;

const shellRuntimePermissionHintsByToolId: Record<string, readonly string[]> = {
  "shell.argumentAssembly": ["shell:generate"],
  "shell.backgroundExecution": ["shell:process:background"],
  "shell.capabilityDetection": ["shell:detect"],
  "shell.commandGeneration": ["shell:generate"],
  "shell.detachedExecution": ["shell:process:detached"],
  "shell.environmentInspection": ["shell:environment:inspect"],
  "shell.executionGuard": ["shell:generate"],
  "shell.executionMonitoring": ["shell:execution:monitor"],
  "shell.interactiveControl": ["shell:interactive:control"],
  "shell.invocationConstruction": ["shell:generate"],
  "shell.outputCapture": ["shell:output:capture"],
  "shell.processTermination": ["shell:process:terminate"],
  "shell.promptHandling": ["shell:prompt:handle"],
  "shell.sandboxEnforcement": ["shell:sandbox"],
  "shell.scriptGeneration": ["shell:script:generate"],
  "shell.serviceStartAndVerify": ["shell:service:verify", "shell:process:service", "shell:process:background"],
  "shell.sessionDetection": ["shell:session:detect", "shell:process:read"],
  "shell.shellLifecycleManagement": ["shell:lifecycle:manage"],
  "shell.shellProcessManagement": ["shell:process:manage"],
  "shell.shellResourceManagement": [
    "shell:resource:inspect",
    "shell:resource:reserve",
    "shell:resource:release",
    "shell:resource:limit",
  ],
  "shell.shellSessionManagement": [
    "shell:session:inspect",
    "shell:session:create",
    "shell:session:attach",
    "shell:session:close",
  ],
  "shell.stdinFeeding": ["shell:stdin:feed"],
  "shell.typeDetection": ["shell:detect"],
};

function approvedRuntimeTapApproval(input: {
  rawApproval: unknown;
  profile: BaseToolPolicyProfile;
  reason: string;
  force?: boolean;
}): Readonly<Record<string, unknown>> | undefined {
  if (input.force !== true && !runtimeTapApprovalCanDefault(input.profile)) return undefined;
  const rawApproval = isRecord(input.rawApproval) ? input.rawApproval : {};
  return {
    ...rawApproval,
    accepted: true,
    approvalId: readString(rawApproval.approvalId) ?? `runtime-profile-${input.profile}`,
    reason: readString(rawApproval.reason) ?? input.reason,
  };
}

function runtimeGrantedPermissionsForTool(toolId: string, profile: BaseToolPolicyProfile): readonly string[] {
  if (toolId.startsWith("git.")) return ["git:read", "filesystem:read"];
  if (toolId.startsWith("code.")) return ["filesystem:read", "filesystem:write"];
  if (toolId.startsWith("skill.")) return ["skill:read", "skill:write", "filesystem:read", "filesystem:write"];
  if (toolId.startsWith("search.")) return ["network:read", "search:fetch", "network:egress", "network:search", "search:native"];
  if (toolId.startsWith("shell.")) return mergeStringLists(shellRuntimeBasePermissions, shellRuntimePermissionHintsByToolId[toolId]);
  if (toolId.startsWith("mcp.")) {
    return [
      "mcp:connect",
      "mcp:auth",
      "mcp:read",
      "mcp:write",
      "mcp:cache:invalidate",
      "mcp:disconnect",
      "mcp:subscription:write",
      "mcp:call",
      "mcp:service",
      "mcp:stream",
      "mcp:cancel",
      "mcp:control",
      "mcp:native-execute",
      "mcp:raw",
      "mcp:tool:read",
      "mcp:tool:write",
      "mcp:connection:read",
      "mcp:resource:list",
      "mcp:resource:read",
      "mcp:resource:create",
      "mcp:resource:write",
      "mcp:resource:delete",
      "mcp:ping",
      "mcp:monitor:read",
    ];
  }
  if (toolId === "omni.viewImage") return ["filesystem:read", "omni:image:view"];
  if (toolId.startsWith("omni.")) {
    const basePermissions = ["filesystem:read", "filesystem:write", "omni:media:transform"];
    if (!omniProviderPermissionsCanDefault(profile)) return basePermissions;
    return [
      ...basePermissions,
      "provider:invoke",
      "omni:image:read",
      "omni:image:write",
      "omni:image:generate",
      "omni:audio:read",
      "omni:audio:write",
      "omni:audio:generate",
      "omni:video:read",
      "omni:video:write",
      "omni:video:generate",
    ];
  }
  if (toolId.startsWith("computeruse.")) return ["computeruse:read", "computeruse:device:read", "computeruse:screenshot"];
  return ["tool.execute"];
}

function safeRuntimePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]/gu, "_").slice(0, 96) || "runtime";
}

function imageExtensionFromTarget(target: Readonly<Record<string, unknown>>): string {
  const declared = readString(target.outputFormat)
    ?? readString(target.targetFormat)
    ?? readString(target.format)
    ?? readString(target.mimeType);
  if (declared === "image/jpeg" || declared === "jpeg" || declared === "jpg") return "jpg";
  if (declared === "image/webp" || declared === "webp") return "webp";
  return "png";
}

function autoOutputTargetForTool(input: {
  toolId: string;
  target: Readonly<Record<string, unknown>>;
  workspaceRoot?: string;
  sessionId: string;
  invocationId: string;
}): Readonly<Record<string, unknown>> {
  if (input.toolId !== "omni.generateImage") return input.target;
  if (readString(input.target.outputPath) !== undefined || readString(input.target.outputRef) !== undefined) {
    return input.target;
  }
  if (input.workspaceRoot === undefined) return input.target;
  const extension = imageExtensionFromTarget(input.target);
  return {
    ...input.target,
    outputPath: path.join(
      input.workspaceRoot,
      ".rax_workspace",
      "artifacts",
      safeRuntimePathSegment(input.sessionId),
      `generated-image-${safeRuntimePathSegment(input.invocationId)}.${extension}`,
    ),
  };
}

function grantedPermissionsForTool(toolId: string, rawPermissions: unknown, profile: BaseToolPolicyProfile): readonly string[] {
  const merged = mergeStringLists(readStringArray(rawPermissions), runtimeGrantedPermissionsForTool(toolId, profile));
  if (toolId === "omni.viewImage") {
    return merged.filter((permission) => permission === "filesystem:read" || permission === "omni:image:view");
  }
  return merged;
}

function withApprovedRuntimePermissions(
  toolId: string,
  args: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const rawContext = isRecord(args.context) ? args.context : {};
  const approvedPermissions = runtimeGrantedPermissionsForTool(toolId, "bapr");
  const approval = approvedRuntimeTapApproval({
    rawApproval: rawContext.approval,
    profile: "bapr",
    force: true,
    reason: "runtime approval was granted by the application approval surface",
  });
  return {
    ...args,
    context: {
      ...rawContext,
      grantedPermissions: mergeStringLists(readStringArray(rawContext.grantedPermissions), approvedPermissions),
      guard: isRecord(rawContext.guard)
        ? { accepted: true, allowed: true, ...rawContext.guard }
        : { accepted: true, allowed: true },
      governance: isRecord(rawContext.governance)
        ? { accepted: true, allowed: true, ...rawContext.governance }
        : { accepted: true, allowed: true },
      contract: isRecord(rawContext.contract)
        ? { accepted: true, allowed: true, ...rawContext.contract }
        : { accepted: true, allowed: true },
      ...(approval === undefined ? {} : { approval }),
    },
  };
}

function defaultMcpServerId(toolId: string, args: Readonly<Record<string, unknown>>): string | undefined {
  if (!toolId.startsWith("mcp.")) return undefined;
  return readString(args.serverId) ?? "local-mcp";
}

function providerToolMappings(manifest: AgentManifest): readonly ProviderToolMapping[] {
  return createProviderToolMappings(manifest.harness.tools);
}

function providerToolSchemaFamilyForModel(model: AgentManifest["model"]): ProviderToolSchemaFamily {
  if (model.provider === "anthropic" || model.endpointShape === "messages") return "anthropicMessages";
  if (model.endpointShape === "chat_completions") return "openaiChatCompletions";
  return "openaiResponses";
}

function providerRouteForModel(model: AgentManifest["model"]): string | undefined {
  const route = model.metadata?.providerRoute;
  return typeof route === "string" && route.trim().length > 0 ? route.trim() : undefined;
}

function modelInvocationCapabilityForModel(model: AgentManifest["model"]): { capabilityId: string; kind: string } {
  if (model.provider === "anthropic" || model.endpointShape === "messages") {
    return { capabilityId: "anthropic-messages", kind: "messages" };
  }
  if (model.endpointShape === "chat_completions") {
    return { capabilityId: "openai-chat-completions", kind: "chat_completions" };
  }
  if (providerRouteForModel(model) === "openai_responses" || model.credentialRef?.credentialType === "openai_api_key") {
    return { capabilityId: "openai-responses", kind: "responses" };
  }
  return { capabilityId: "codex-responses", kind: "responses" };
}

function enrichToolArguments(
  manifest: AgentManifest,
  toolId: string,
  args: Readonly<Record<string, unknown>>,
  runtimeContext: {
    runtimeId: string;
    sessionId: string;
    invocationId: string;
    workspaceRoot?: string;
    allowedRoots?: readonly string[];
  },
): Readonly<Record<string, unknown>> {
  const rawContext = isRecord(args.context) ? args.context : {};
  const workspaceRoot = manifest.harness.policy.workspaceRoot ?? runtimeContext.workspaceRoot;
  const allowedRoots = manifest.harness.policy.allowedRoots ?? runtimeContext.allowedRoots;
  const grantedPermissions = grantedPermissionsForTool(toolId, rawContext.grantedPermissions, manifest.toolPolicy.profile);
  const requestedScopes = mergeStringLists(readStringArray(rawContext.requestedScopes), ["tool.execute", `tool.${toolId}`]);
  const allowedScopes = mergeStringLists(readStringArray(rawContext.allowedScopes), manifest.harness.policy.scopes, ["tool.execute", `tool.${toolId}`, toolId]);
  const allowedRepositoryRoots = Array.isArray(rawContext.allowedRepositoryRoots)
    ? rawContext.allowedRepositoryRoots
    : [workspaceRoot, ...(allowedRoots ?? [])].filter((root): root is string => typeof root === "string" && root.trim().length > 0);
  const defaultServerId = defaultMcpServerId(toolId, args);
  const allowedServerIds = mergeStringLists(readStringArray(rawContext.allowedServerIds), defaultServerId === undefined ? undefined : [defaultServerId]);
  const approval = approvedRuntimeTapApproval({
    rawApproval: rawContext.approval,
    profile: manifest.toolPolicy.profile,
    reason: `${manifest.toolPolicy.profile} profile auto-approves runtime TAP approval fields`,
  });
  const rawTarget = isRecord(args.target) ? args.target : {};
  let target = rawTarget;
  if (toolId.startsWith("git.") && workspaceRoot !== undefined) {
    const rawRepositoryPath = readString(rawTarget.repositoryPath);
    const repositoryPath = rawRepositoryPath === undefined
      ? workspaceRoot
      : path.isAbsolute(rawRepositoryPath)
        ? rawRepositoryPath
        : path.resolve(workspaceRoot, rawRepositoryPath);
    target = { ...rawTarget, repositoryPath };
  }
  target = autoOutputTargetForTool({
    toolId,
    target,
    workspaceRoot,
    sessionId: runtimeContext.sessionId,
    invocationId: runtimeContext.invocationId,
  });
  if (defaultServerId !== undefined) {
    target = { serverId: defaultServerId, ...target };
  }

  return {
    ...args,
    ...(Object.keys(target).length === 0 ? {} : { target }),
    ...(args.dryRun === undefined ? { dryRun: false } : {}),
    ...(workspaceRoot === undefined ? {} : { workspaceRoot }),
    context: {
      ...rawContext,
      runtimeId: readString(rawContext.runtimeId) ?? runtimeContext.runtimeId,
      sessionId: readString(rawContext.sessionId) ?? runtimeContext.sessionId,
      invocationId: readString(rawContext.invocationId) ?? runtimeContext.invocationId,
      dryRun: rawContext.dryRun ?? args.dryRun ?? false,
      guard: isRecord(rawContext.guard)
        ? { accepted: true, allowed: true, ...rawContext.guard }
        : { accepted: true, allowed: true },
      governance: isRecord(rawContext.governance)
        ? { accepted: true, allowed: true, ...rawContext.governance }
        : { accepted: true, allowed: true },
      contract: isRecord(rawContext.contract)
        ? { accepted: true, allowed: true, ...rawContext.contract }
        : { accepted: true, allowed: true },
      ...(approval === undefined ? {} : { approval }),
      ...(workspaceRoot === undefined ? {} : { workspaceRoot }),
      ...(allowedRoots === undefined ? {} : { allowedRoots }),
      ...(allowedRepositoryRoots.length === 0 ? {} : { allowedRepositoryRoots }),
      ...(allowedServerIds.length === 0 ? {} : { allowedServerIds }),
      requestedScopes,
      allowedScopes,
      grantedPermissions,
    },
  };
}

type ToolWorkspacePathContractResult =
  | {
      ok: true;
      args: Readonly<Record<string, unknown>>;
      metadata?: Readonly<Record<string, unknown>>;
    }
  | {
      ok: false;
      error: Readonly<Record<string, unknown>>;
    };

function pathContractError(
  failure: WorkspacePathFailure,
  field: "path" | "cwd",
): Readonly<Record<string, unknown>> {
  const metadata = workspacePathMetadata(failure, field);
  return {
    code: failure.reason,
    reason: failure.reason,
    message: failure.message,
    publicSafe: true,
    ...metadata,
  };
}

function withWorkspaceNormalizationMetadata(
  args: Readonly<Record<string, unknown>>,
  normalizations: readonly Readonly<Record<string, unknown>>[],
): Readonly<Record<string, unknown>> {
  if (normalizations.length === 0) return args;
  const rawContext = isRecord(args.context) ? args.context : {};
  const rawAudit = isRecord(rawContext.auditMetadata) ? rawContext.auditMetadata : {};
  return {
    ...args,
    context: {
      ...rawContext,
      auditMetadata: {
        ...rawAudit,
        workspacePathNormalization: normalizations[0],
        workspacePathNormalizations: normalizations,
      },
    },
  };
}

function normalizeCodePathValue(input: {
  value: string;
  workspaceRoot: string;
  allowedRoots: readonly string[];
}): { ok: true; value: string; metadata: Readonly<Record<string, unknown>> } | { ok: false; error: Readonly<Record<string, unknown>> } {
  const normalized = normalizeWorkspacePath(input.value, {
    workspaceRoot: input.workspaceRoot,
    allowedRoots: input.allowedRoots,
    kind: "path",
  });
  if (!normalized.ok) {
    return { ok: false, error: pathContractError(normalized, "path") };
  }
  const relative = workspaceRelativePath(normalized.normalizedPath, input.workspaceRoot);
  if (relative === undefined) {
    return {
      ok: false,
      error: pathContractError({
        ok: false,
        reason: "OUTSIDE_ALLOWED_ROOTS",
        message: "code tool targetPath must stay inside the current workspaceRoot",
        requestedPath: normalized.requestedPath,
        normalizedPath: normalized.normalizedPath,
        workspaceRoot: normalized.workspaceRoot,
        allowedRoots: normalized.allowedRoots,
        pathWasMapped: normalized.pathWasMapped,
        mappingSource: normalized.mappingSource,
        suggestedCwd: normalized.suggestedCwd,
      }, "path"),
    };
  }
  return {
    ok: true,
    value: relative,
    metadata: workspacePathMetadata(normalized, "path"),
  };
}

function normalizeShellCwdValue(input: {
  value: string;
  workspaceRoot: string;
  allowedRoots: readonly string[];
  allowOsTmpdir?: boolean;
}): { ok: true; value: string; metadata: Readonly<Record<string, unknown>> } | { ok: false; error: Readonly<Record<string, unknown>> } {
  const normalized = normalizeToolCwd(input.value, {
    workspaceRoot: input.workspaceRoot,
    allowedRoots: input.allowedRoots,
    kind: "cwd",
  });
  if (!normalized.ok) {
    const requestedCwd = path.resolve(input.value);
    const tmpRoot = path.resolve(tmpdir());
    if (input.allowOsTmpdir === true && (requestedCwd === tmpRoot || requestedCwd.startsWith(`${tmpRoot}${path.sep}`))) {
      return {
        ok: true,
        value: requestedCwd,
        metadata: {
          requestedCwd: input.value,
          normalizedCwd: requestedCwd,
          workspaceRoot: input.workspaceRoot,
          allowedRoots: input.allowedRoots,
          cwdWasMapped: false,
          mappingSource: "os-tmpdir",
        },
      };
    }
    return { ok: false, error: pathContractError(normalized, "cwd") };
  }
  return {
    ok: true,
    value: normalized.normalizedPath,
    metadata: workspacePathMetadata(normalized, "cwd"),
  };
}

function normalizeStringPathField(input: {
  target: Record<string, unknown>;
  field: string;
  workspaceRoot: string;
  allowedRoots: readonly string[];
  mode: "code-path" | "shell-cwd";
  allowOsTmpdir?: boolean;
  normalizations: Readonly<Record<string, unknown>>[];
}): Readonly<Record<string, unknown>> | undefined {
  const raw = input.target[input.field];
  if (typeof raw !== "string" || raw.trim().length === 0) return undefined;
  const normalized = input.mode === "code-path"
    ? normalizeCodePathValue({ value: raw, workspaceRoot: input.workspaceRoot, allowedRoots: input.allowedRoots })
    : normalizeShellCwdValue({
      value: raw,
      workspaceRoot: input.workspaceRoot,
      allowedRoots: input.allowedRoots,
      allowOsTmpdir: input.allowOsTmpdir,
    });
  if (!normalized.ok) return normalized.error;
  input.target[input.field] = normalized.value;
  input.normalizations.push(normalized.metadata);
  return undefined;
}

function normalizeStringArrayPathField(input: {
  target: Record<string, unknown>;
  field: string;
  workspaceRoot: string;
  allowedRoots: readonly string[];
  normalizations: Readonly<Record<string, unknown>>[];
}): Readonly<Record<string, unknown>> | undefined {
  const raw = input.target[input.field];
  if (!Array.isArray(raw)) return undefined;
  const values: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") {
      values.push(String(item));
      continue;
    }
    const normalized = normalizeCodePathValue({
      value: item,
      workspaceRoot: input.workspaceRoot,
      allowedRoots: input.allowedRoots,
    });
    if (!normalized.ok) return normalized.error;
    values.push(normalized.value);
    input.normalizations.push(normalized.metadata);
  }
  input.target[input.field] = values;
  return undefined;
}

function normalizeWorkspacePathContract(input: {
  toolId: string;
  args: Readonly<Record<string, unknown>>;
  workspaceRoot?: string;
  allowedRoots?: readonly string[];
}): ToolWorkspacePathContractResult {
  const workspaceRoot = readString(input.workspaceRoot);
  if (workspaceRoot === undefined) return { ok: true, args: input.args };
  const allowedRoots = normalizeAllowedRoots({ workspaceRoot, allowedRoots: input.allowedRoots });
  const nextArgs: Record<string, unknown> = { ...input.args };
  const normalizations: Readonly<Record<string, unknown>>[] = [];
  const allowProcessControlTmpCwd = input.toolId === "shell.backgroundExecution"
    || input.toolId === "shell.detachedExecution"
    || input.toolId === "shell.processSpawning"
    || input.toolId === "shell.serviceStartAndVerify";

  if (input.toolId.startsWith("code.")) {
    for (const field of ["targetPath", "path", "filePath", "directoryPath"]) {
      const error = normalizeStringPathField({
        target: nextArgs,
        field,
        workspaceRoot,
        allowedRoots,
        mode: "code-path",
        normalizations,
      });
      if (error !== undefined) return { ok: false, error };
    }
    for (const field of ["targetPaths", "paths", "files"]) {
      const error = normalizeStringArrayPathField({
        target: nextArgs,
        field,
        workspaceRoot,
        allowedRoots,
        normalizations,
      });
      if (error !== undefined) return { ok: false, error };
    }
    if (isRecord(nextArgs.target)) {
      const target = { ...nextArgs.target };
      for (const field of ["targetPath", "path", "filePath", "directoryPath"]) {
        const error = normalizeStringPathField({
          target,
          field,
          workspaceRoot,
          allowedRoots,
          mode: "code-path",
          normalizations,
        });
        if (error !== undefined) return { ok: false, error };
      }
      nextArgs.target = target;
    }
    if (Array.isArray(nextArgs.targets)) {
      const targets: unknown[] = [];
      for (const rawTarget of nextArgs.targets) {
        if (!isRecord(rawTarget)) {
          targets.push(rawTarget);
          continue;
        }
        const target = { ...rawTarget };
        for (const field of ["targetPath", "path", "filePath"]) {
          const error = normalizeStringPathField({
            target,
            field,
            workspaceRoot,
            allowedRoots,
            mode: "code-path",
            normalizations,
          });
          if (error !== undefined) return { ok: false, error };
        }
        targets.push(target);
      }
      nextArgs.targets = targets;
    }
  }

  if (input.toolId.startsWith("shell.")) {
    if (input.toolId === "shell.commandExecution" && isRecord(nextArgs.target)) {
      const target = nextArgs.target;
      if (typeof nextArgs.command !== "string" && typeof target.command === "string") {
        nextArgs.command = target.command;
      }
      if (!Array.isArray(nextArgs.args) && Array.isArray(target.args)) {
        nextArgs.args = target.args;
      }
      if (typeof nextArgs.cwd !== "string" && typeof target.workingDirectory === "string") {
        nextArgs.cwd = target.workingDirectory;
      }
      if (typeof nextArgs.cwd !== "string" && typeof target.cwd === "string") {
        nextArgs.cwd = target.cwd;
      }
      if (typeof nextArgs.shellType !== "string" && typeof target.shell === "string") {
        nextArgs.shellType = target.shell;
      }
    }
    for (const field of ["cwd", "workingDirectory"]) {
      const error = normalizeStringPathField({
        target: nextArgs,
        field,
        workspaceRoot,
        allowedRoots,
        mode: "shell-cwd",
        allowOsTmpdir: allowProcessControlTmpCwd,
        normalizations,
      });
      if (error !== undefined) return { ok: false, error };
    }
    for (const nestedKey of ["target", "start", "probe", "verification"]) {
      if (!isRecord(nextArgs[nestedKey])) continue;
      const nested = { ...(nextArgs[nestedKey] as Record<string, unknown>) };
      for (const field of ["cwd", "workingDirectory"]) {
        const error = normalizeStringPathField({
          target: nested,
          field,
          workspaceRoot,
          allowedRoots,
          mode: "shell-cwd",
          allowOsTmpdir: allowProcessControlTmpCwd,
          normalizations,
        });
        if (error !== undefined) return { ok: false, error };
      }
      nextArgs[nestedKey] = nested;
    }
  }

  return {
    ok: true,
    args: withWorkspaceNormalizationMetadata(nextArgs, normalizations),
    metadata: normalizations[0] === undefined
      ? { workspaceRoot, allowedRoots, suggestedCwd: workspaceRoot }
      : {
        ...normalizations[0],
        workspacePathNormalizations: normalizations,
      },
  };
}

function outputWithWorkspacePathMetadata(
  output: unknown,
  metadata: Readonly<Record<string, unknown>> | undefined,
): unknown {
  if (metadata === undefined) return output;
  const outputRecord = isRecord(output) ? output : { value: output };
  return {
    ...outputRecord,
    workspacePathNormalization: metadata,
    ...metadata,
  };
}

function metadataRecord(value: Readonly<Record<string, unknown>>): Readonly<Record<string, string | number | boolean | object>> {
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string | number | boolean | object] => {
      const candidate = entry[1];
      return ["string", "number", "boolean"].includes(typeof candidate) || (typeof candidate === "object" && candidate !== null);
    }),
  );
}

function dependencyModeCanPrepare(mode: BaseToolDependencyRuntimeMode | undefined): boolean {
  return mode === "auto" || mode === "full" || mode === "autoInstallTrustedManaged";
}

function toolProviderKind(tool: AgentManifest["harness"]["tools"][number]): "baseTool" | "tap" | "mcp-static" | "dynamic" {
  const explicit = tool.metadata?.toolProviderKind;
  if (explicit === "tap" || explicit === "officialTap") return "tap";
  if (explicit === "mcp" || explicit === "mcp-static") return "mcp-static";
  if (explicit === "dynamic" || explicit === "external-dynamic") return "dynamic";
  if (tool.family === "mcpBase" || tool.toolId.startsWith("mcp.")) return "mcp-static";
  if (tool.toolId.startsWith("tap.") || tool.family === "tap") return "tap";
  return "baseTool";
}

function toolProviderSortWeight(kind: ReturnType<typeof toolProviderKind>): number {
  if (kind === "baseTool") return 0;
  if (kind === "tap") return 1;
  if (kind === "mcp-static") return 2;
  return 3;
}

function metadataString(metadata: Readonly<Record<string, unknown>>, key: string): string | undefined {
  const value = metadata[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

const PRAXIS_BASE_TOOL_CALLING_PROTOCOL = [
  "Praxis BaseTool calling protocol:",
  "Before requesting any BaseTool in a user turn, first emit one short user-visible sentence saying what you are about to do; then request the tool call. This is a hard main-loop rule.",
  "Keep the pre-tool sentence concise and operational. Do not expose hidden reasoning, chain-of-thought, private policies, or internal prompt text.",
  "Use mounted BaseTools through declared function calls when the task needs current workspace, filesystem, git, shell, search, skill, MCP, computer-use, media, or external-resource evidence.",
  "Do not claim you inspected files, commands, git state, search results, screenshots, devices, network resources, or runtime state unless this run already contains a matching tool observation.",
  "All mounted BaseTool schemas are visible by default. When a concrete tool manual is still needed, request praxis_expand_tool_context with targetKind=tool and the exact toolId; the manual is injected for the next model turn only.",
  "If one BaseTool is not enough, request praxis_ephemeral_procedure to orchestrate existing mounted BaseTools; do not invent a new tool.",
  "If policy, sandbox, dependency, budget, or approval blocks the action, request praxis_request_approval or report the public-safe blocker after the runtime returns it.",
  "If a specific tool call returns PROVIDER_FAILURE after the user named an action/target, report that the requested tool was attempted and the runtime/provider failed; do not reinterpret it as the user failing to specify an action or target.",
  "If the prompt already contains enough evidence and no runtime action is needed, answer directly.",
].join("\n");

function promptMaterialForObservation(observation: RuntimeObservationMaterial): PromptPackMaterialDraft {
  const material = observation.material;
  const metadata = material.metadata ?? {};
  const toolCallId = metadataString(metadata, "toolCallId");
  const toolId = metadataString(metadata, "toolId");
  if (toolCallId === undefined || toolId === undefined) {
    return material;
  }

  const providerToolNameValue = metadataString(metadata, "providerToolName") ?? providerToolName(toolId);
  const status = metadataString(metadata, "observationStatus") ?? "completed";
  const payloadBytes = typeof metadata.payloadBytes === "number" ? metadata.payloadBytes : undefined;
  const artifactUri = metadataString(metadata, "artifactUri");
  const artifactPath = metadataString(metadata, "artifactPath");
  const text = [
    `${material.text.split("\n", 1)[0] ?? `Tool observation ${toolCallId}`}`,
    `nativeToolResult: call_id=${toolCallId} toolId=${toolId} providerToolName=${providerToolNameValue} status=${status}`,
    payloadBytes === undefined ? "" : `payloadBytes: ${payloadBytes}`,
    artifactUri === undefined ? "" : `payloadArtifact: ${artifactUri}`,
    artifactPath === undefined ? "" : `payloadArtifactPath: ${artifactPath}`,
    "payloadDelivery: full tool result is supplied separately as provider-native function_call_output; this PromptPack item is only an index.",
    "reuseRule: use the native tool result already in this model input; do not call the same tool again unless a new missing fact is explicitly required.",
  ].filter(Boolean).join("\n");

  return {
    ...material,
    id: `${material.id ?? observation.observationId}:prompt-index`,
    text,
    metadata: {
      ...metadata,
      providerNativeToolResult: true,
      originalObservationId: observation.observationId,
      promptPayloadMode: "native-tool-result-index",
    },
  };
}

function promptMaterialsForTurn(input: {
  manifest: AgentManifest;
  task: string;
  turnIndex: number;
  toolMappings: readonly ProviderToolMapping[];
  observations: readonly RuntimeObservationMaterial[];
  events: readonly string[];
  toolContextSelection?: BaseToolContextSelection;
  toolContextUsage?: readonly BaseToolContextUsageRecord[];
}): readonly PromptPackMaterialDraft[] {
  const manifestPromptMaterials = promptPackMaterialsForManifest(input.manifest);
  const observationUsage = input.observations
    .map((observation) => {
      const toolId = typeof observation.material.metadata?.toolId === "string"
        ? observation.material.metadata.toolId
        : undefined;
      return toolId === undefined ? undefined : { toolId };
    })
    .filter((usage): usage is { toolId: string } => usage !== undefined);
  const toolContext = createBaseToolContextTree(input.manifest.harness.tools, {
    mode: "intelligent",
    manual: input.toolContextSelection,
    usage: input.toolContextUsage ?? observationUsage,
    keepExpandedScore: 15,
  });
  const toolMaterials = toolContext.materials.map((materialDraft, index): PromptPackMaterialDraft => {
    const toolId = typeof materialDraft.metadata?.toolId === "string" ? materialDraft.metadata.toolId : undefined;
    const providerName = toolId === undefined
      ? undefined
      : input.toolMappings.find((mapping) => mapping.toolId === toolId)?.providerName ?? providerToolName(toolId);
    const providerKind = toolId === undefined
      ? undefined
      : toolProviderKind(input.manifest.harness.tools.find((tool) => tool.toolId === toolId) ?? { toolId });
    return {
      ...materialDraft,
      priority: materialDraft.priority ?? 80 - index,
      metadata: {
        ...(materialDraft.metadata ?? {}),
        ...(providerKind === undefined ? {} : { toolProviderKind: providerKind }),
        ...(providerName === undefined ? {} : { toolName: providerName }),
      },
    };
  });

  const observationMaterials = input.observations.map((observation) => promptMaterialForObservation(observation));
  const observationAnswerGuard: PromptPackMaterialDraft[] = input.observations.length === 0
    ? []
    : [{
        id: `runtime:observation-answer-guard:${input.turnIndex}`,
        kind: "command-injection",
        text: [
          "Runtime already contains tool observations from earlier turns in this same agent run.",
          "Use those observations to answer the user now.",
          "Do not repeat a tool call that already produced the requested evidence unless a new missing fact is explicitly required.",
          "If the available observation is enough, return final text instead of another tool call.",
        ].join("\n"),
        source: "runtime.observationAnswerGuard",
        priority: 101,
        trusted: true,
        scope: "runtime.mainLoop",
        promptSegmentKind: "userTurn",
        metadata: {
          promptSegmentKind: "userTurn",
          turnIndex: input.turnIndex,
          observationCount: input.observations.length,
        },
      }];
  return [
    ...manifestPromptMaterials,
    {
      id: `task:${input.turnIndex}`,
      kind: "user",
      text: input.task,
      source: "runtime.input.text",
      priority: 100,
      trusted: false,
      scope: "user.task",
      promptSegmentKind: "userTurn",
      metadata: { turnIndex: input.turnIndex },
    },
    {
      id: "runtime:base-tool-protocol",
      kind: "runtime",
      text: PRAXIS_BASE_TOOL_CALLING_PROTOCOL,
      source: "runtime.baseToolCallingProtocol",
      priority: 95,
      trusted: true,
      scope: "runtime.toolCalling",
      promptSegmentKind: "stableSystemCore",
      metadata: {
        promptSegmentKind: "stableSystemCore",
        mountedToolCount: input.manifest.harness.tools.length,
      },
    },
    {
      id: `runtime:${input.turnIndex}`,
      kind: "runtime",
      text: [
        `turnIndex=${input.turnIndex}`,
        `runtime mounted BaseTools=${input.manifest.harness.tools.map((tool) => tool.toolId).join(", ") || "none"}`,
        `baseTool context mode=${toolContext.mode}`,
        `baseTool context expanded=${toolContext.expandedNodeIds.join(", ") || "none"}`,
        `recent events=${input.events.slice(-8).join(", ") || "none"}`,
      ].join("\n"),
      source: "runtime.stateProjection",
      priority: 60,
      trusted: true,
      scope: "runtime.state",
      metadata: {
        promptSegmentKind: "observations",
        turnIndex: input.turnIndex,
        maxModelTurns: input.manifest.harness.loop.maxModelTurns ?? 2,
        maxToolCalls: input.manifest.harness.loop.maxToolCalls ?? 4,
      },
    },
    ...toolMaterials,
    ...observationMaterials,
    ...observationAnswerGuard,
  ];
}

function promptMaterialSourceText(material: PromptMaterialSource, fallbackRef: string): string {
  if (material.kind === "markdown") return material.text;
  if (material.kind === "materialRef") return `Prompt material reference declared as ${material.ref || fallbackRef}.`;
  try {
    return readFileSync(path.resolve(material.path), "utf8");
  } catch {
    return `Prompt markdown file declared at ${material.path}.`;
  }
}

function promptMaterialSourceRef(material: PromptMaterialSource, fallbackRef: string): string {
  if (material.kind === "markdown") return material.ref || fallbackRef;
  if (material.kind === "markdownFile") return material.ref || material.path;
  return material.ref || fallbackRef;
}

function promptPackMaterialsForManifest(manifest: AgentManifest): readonly PromptPackMaterialDraft[] {
  const materials: PromptPackMaterialDraft[] = [];
  const promptPack = manifest.promptPack;

  if (promptPack.base !== undefined) {
    materials.push({
      id: promptMaterialSourceRef(promptPack.base, `${promptPack.promptPackId}:base`),
      kind: "system",
      text: promptMaterialSourceText(promptPack.base, `${promptPack.promptPackId}:base`),
      source: "manifest.promptPack.base",
      priority: 900,
      trusted: true,
      scope: "manifest.promptPack",
      promptSegmentKind: "stableSystemCore",
      metadata: {
        promptPackId: promptPack.promptPackId,
        promptRole: "base",
      },
    });
  }

  for (const [index, inherited] of promptPack.inherits.entries()) {
    materials.push({
      id: `promptPack.inherits:${inherited}`,
      kind: "runtime",
      text: `PromptPack inherits ${inherited}.`,
      source: "manifest.promptPack.inherits",
      priority: 880 - index,
      trusted: true,
      scope: "manifest.promptPack",
      promptSegmentKind: "projectContext",
      metadata: {
        promptPackId: promptPack.promptPackId,
        promptRole: "inherit",
      },
    });
  }

  for (const [index, patch] of [...promptPack.patches, ...promptPack.stateMachineMutations].entries()) {
    materials.push({
      id: patch.patchId,
      kind: "system",
      text: promptMaterialSourceText(patch.material, patch.patchId),
      source: `manifest.promptPack.${patch.operation}`,
      priority: 870 - index,
      trusted: true,
      scope: "manifest.promptPack.patch",
      promptSegmentKind: "declaredRuntimeContext",
      metadata: {
        promptPackId: promptPack.promptPackId,
        promptRole: "patch",
        patchId: patch.patchId,
        operation: patch.operation,
        targetRef: patch.targetRef,
        sceneTrigger: patch.sceneTrigger ?? "",
      },
    });
  }

  for (const [index, materialRef] of promptPack.materials.entries()) {
    materials.push({
      id: `promptPack.material:${materialRef}`,
      kind: "runtime",
      text: `PromptPack material reference ${materialRef}.`,
      source: "manifest.promptPack.materials",
      priority: 830 - index,
      trusted: true,
      scope: "manifest.promptPack.materials",
      promptSegmentKind: "projectContext",
      metadata: {
        promptPackId: promptPack.promptPackId,
        promptRole: "materialRef",
      },
    });
  }

  return materials;
}

function observationPayloadText(observation: RuntimeObservationMaterial): string {
  if (observation.artifactRef !== undefined) {
    return observation.material.text;
  }
  if (typeof observation.payload === "string") return observation.payload;
  try {
    return JSON.stringify(observation.payload);
  } catch {
    return observation.material.text;
  }
}

type ProviderToolResultHistoryBudget = {
  budgetBytes: number;
  originalToolResultBytes: number;
  replayedToolResultBytes: number;
  fullToolResults: number;
  compactedToolResults: number;
};

type ProviderToolResultEnvelopeWithBudget = ProviderToolResultEnvelope & {
  originalContentBytes: number;
  replayedContentBytes: number;
  compactedForHistory: boolean;
};

function compactToolResultHistoryPayload(input: {
  observation: RuntimeObservationMaterial;
  payloadText: string;
  payloadBytes: number;
  budgetBytes: number;
}): string {
  const summary = input.observation.material.text
    .split(/\r?\n/u)
    .filter((line) => !/^\s*payload\s*:/iu.test(line))
    .slice(0, 3)
    .join("\n");
  return JSON.stringify({
    kind: "praxis.compactedToolResultHistoryPayload",
    observationId: input.observation.observationId,
    originalPayloadBytes: input.payloadBytes,
    originalPayloadSha256: sha256Hex(input.payloadText),
    budgetBytes: input.budgetBytes,
    summary,
    note: "Older tool result payload was compacted before provider history replay to keep dynamic context within the aggregate observation budget. Re-run the tool or inspect an artifact ref if exact content is needed.",
  });
}

function providerToolResultHistoryFromObservations(
  observations: readonly RuntimeObservationMaterial[],
  budgetBytes = DEFAULT_OBSERVATION_TURN_INLINE_BUDGET_BYTES,
): {
  results: readonly ProviderToolResultEnvelopeWithBudget[];
  budget: ProviderToolResultHistoryBudget;
} {
  const candidates = observations
    .map((observation, index): (ProviderToolResultEnvelopeWithBudget & { observationIndex: number }) | undefined => {
      const metadata = observation.material.metadata ?? {};
      const toolCallId = typeof metadata.toolCallId === "string" && metadata.toolCallId.trim().length > 0
        ? metadata.toolCallId.trim()
        : undefined;
      const toolId = typeof metadata.toolId === "string" && metadata.toolId.trim().length > 0
        ? metadata.toolId.trim()
        : undefined;
      if (toolCallId === undefined || toolId === undefined) return undefined;
      const providerName = typeof metadata.providerToolName === "string" && metadata.providerToolName.trim().length > 0
        ? metadata.providerToolName.trim()
        : providerToolName(toolId);
      const status = typeof metadata.observationStatus === "string" ? metadata.observationStatus : "completed";
      const payloadText = observationPayloadText(observation);
      const payloadBytes = Buffer.byteLength(payloadText, "utf8");
      return {
        observationIndex: index,
        callId: toolCallId,
        toolId,
        providerName,
        isError: status !== "completed",
        content: [{
          type: "text",
          text: payloadText.length === 0 ? observation.material.text : payloadText,
        }],
        metadata: {
          observationId: observation.observationId,
          observationStatus: status,
        },
        originalContentBytes: payloadBytes,
        replayedContentBytes: payloadBytes,
        compactedForHistory: false,
      };
    })
    .filter((result): result is ProviderToolResultEnvelopeWithBudget & { observationIndex: number } => result !== undefined);

  let remainingBytes = budgetBytes;
  let fullToolResults = 0;
  let compactedToolResults = 0;
  const replayedByIndex = new Map<number, ProviderToolResultEnvelopeWithBudget>();
  for (const candidate of [...candidates].reverse()) {
    const canInlineFull = candidate.originalContentBytes <= remainingBytes;
    if (canInlineFull) {
      remainingBytes -= candidate.originalContentBytes;
      fullToolResults += 1;
      replayedByIndex.set(candidate.observationIndex, candidate);
      continue;
    }

    compactedToolResults += 1;
    const observation = observations[candidate.observationIndex];
    const fullText = candidate.content.map((part) => part.type === "text" ? part.text : "").join("\n");
    const compactedText = observation === undefined
      ? JSON.stringify({
        kind: "praxis.compactedToolResultHistoryPayload",
        originalPayloadBytes: candidate.originalContentBytes,
        budgetBytes,
      })
      : compactToolResultHistoryPayload({
        observation,
        payloadText: fullText,
        payloadBytes: candidate.originalContentBytes,
        budgetBytes,
      });
    replayedByIndex.set(candidate.observationIndex, {
      ...candidate,
      content: [{ type: "text", text: compactedText }],
      replayedContentBytes: Buffer.byteLength(compactedText, "utf8"),
      compactedForHistory: true,
    });
  }

  const results = candidates
    .map((candidate) => replayedByIndex.get(candidate.observationIndex))
    .filter((result): result is ProviderToolResultEnvelopeWithBudget => result !== undefined);
  return {
    results,
    budget: {
      budgetBytes,
      originalToolResultBytes: candidates.reduce((sum, result) => sum + result.originalContentBytes, 0),
      replayedToolResultBytes: results.reduce((sum, result) => sum + result.replayedContentBytes, 0),
      fullToolResults,
      compactedToolResults,
    },
  };
}

function providerToolResultsFromObservations(
  observations: readonly RuntimeObservationMaterial[],
): readonly ProviderToolResultEnvelope[] {
  return providerToolResultHistoryFromObservations(observations).results;
}

function stablePromptCacheKey(manifest: AgentManifest, sessionId: string): string {
  const hash = createHash("sha256")
    .update([
      "praxis.promptCache.v1",
      manifest.identity.id,
      manifest.harness.promptPack.promptPackId ?? "",
      sessionId,
    ].join("\n"))
    .digest("hex")
    .slice(0, 32);
  return `praxis-${hash}`;
}

function kernelSseDataObjects(text: string): readonly unknown[] {
  const objects: unknown[] = [];
  for (const line of text.split(/\r?\n/u)) {
    if (!line.startsWith("data:")) continue;
    const payload = line.slice("data:".length).trim();
    if (payload.length === 0 || payload === "[DONE]") continue;
    try {
      objects.push(JSON.parse(payload) as unknown);
    } catch {
      // Ignore non-JSON stream payloads.
    }
  }
  return objects;
}

function outputItemKey(item: Readonly<Record<string, unknown>>, index: number): string {
  const callId = typeof item.call_id === "string" && item.call_id.trim().length > 0 ? item.call_id.trim() : undefined;
  const id = typeof item.id === "string" && item.id.trim().length > 0 ? item.id.trim() : undefined;
  const type = typeof item.type === "string" && item.type.trim().length > 0 ? item.type.trim() : "item";
  return callId ?? id ?? `${type}:${index}`;
}

const MAX_PROVIDER_FUNCTION_CALL_ARGUMENT_HISTORY_BYTES = 4 * 1024;
const MAX_COMPACT_ARGUMENT_STRING_CHARS = 240;
const MAX_COMPACT_ARGUMENT_ARRAY_ITEMS = 16;
const MAX_COMPACT_ARGUMENT_OBJECT_KEYS = 48;

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function compactLargeStringForFunctionCallHistory(value: string): Readonly<Record<string, unknown>> {
  return {
    kind: "praxis.compactedLargeString",
    bytes: Buffer.byteLength(value, "utf8"),
    chars: value.length,
    lines: value.split(/\r?\n/u).length,
    sha256: sha256Hex(value),
  };
}

function shouldCompactFunctionCallString(key: string | undefined, value: string): boolean {
  if (Buffer.byteLength(value, "utf8") > MAX_PROVIDER_FUNCTION_CALL_ARGUMENT_HISTORY_BYTES) return true;
  if (!/content|source|code|html|css|script|body|stdout|stderr|output/iu.test(key ?? "")) return false;
  return value.length > MAX_COMPACT_ARGUMENT_STRING_CHARS;
}

function compactFunctionCallArgumentValue(value: unknown, key?: string, depth = 0): unknown {
  if (typeof value === "string") {
    return shouldCompactFunctionCallString(key, value) ? compactLargeStringForFunctionCallHistory(value) : value;
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (depth >= 8) {
    return {
      kind: "praxis.compactedDeepValue",
      valueType: Array.isArray(value) ? "array" : "object",
    };
  }
  if (Array.isArray(value)) {
    const visible = value.slice(0, MAX_COMPACT_ARGUMENT_ARRAY_ITEMS).map((item) =>
      compactFunctionCallArgumentValue(item, key, depth + 1)
    );
    return value.length <= MAX_COMPACT_ARGUMENT_ARRAY_ITEMS
      ? visible
      : {
        kind: "praxis.compactedArray",
        itemCount: value.length,
        visibleItems: visible,
        omittedItems: value.length - MAX_COMPACT_ARGUMENT_ARRAY_ITEMS,
      };
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const visibleKeys = keys.slice(0, MAX_COMPACT_ARGUMENT_OBJECT_KEYS);
  const compacted: Record<string, unknown> = {};
  for (const childKey of visibleKeys) {
    compacted[childKey] = compactFunctionCallArgumentValue(record[childKey], childKey, depth + 1);
  }
  if (keys.length > MAX_COMPACT_ARGUMENT_OBJECT_KEYS) {
    compacted.__praxisOmittedKeys = keys.length - MAX_COMPACT_ARGUMENT_OBJECT_KEYS;
  }
  return compacted;
}

function compactProviderFunctionCallArgumentsForHistory(input: {
  toolName: string;
  callId: string;
  argumentsText: string;
}): string {
  const argumentBytes = Buffer.byteLength(input.argumentsText, "utf8");
  if (argumentBytes <= MAX_PROVIDER_FUNCTION_CALL_ARGUMENT_HISTORY_BYTES) {
    return input.argumentsText;
  }

  let parsedArguments: unknown;
  try {
    parsedArguments = JSON.parse(input.argumentsText);
  } catch {
    parsedArguments = input.argumentsText;
  }
  return JSON.stringify({
    kind: "praxis.compactedFunctionCallArguments",
    toolName: input.toolName,
    callId: input.callId,
    originalArgumentsBytes: argumentBytes,
    originalArgumentsSha256: sha256Hex(input.argumentsText),
    note: "The runtime executed the original full arguments. This compact form is only replayed to the provider as call history.",
    arguments: compactFunctionCallArgumentValue(parsedArguments),
  });
}

function normalizeOpenAIResponseOutputItemForInput(
  item: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> | undefined {
  const type = typeof item.type === "string" ? item.type : undefined;
  if (type !== "function_call") {
    return undefined;
  }

  const name = typeof item.name === "string" && item.name.trim().length > 0 ? item.name.trim() : undefined;
  const callId = typeof item.call_id === "string" && item.call_id.trim().length > 0 ? item.call_id.trim() : undefined;
  if (name === undefined || callId === undefined) {
    return undefined;
  }

  const args = typeof item.arguments === "string" ? item.arguments : "{}";
  const status = typeof item.status === "string" && item.status.trim().length > 0 ? item.status.trim() : "completed";
  const historyArgs = compactProviderFunctionCallArgumentsForHistory({
    toolName: name,
    callId,
    argumentsText: args,
  });
  return {
    type: "function_call",
    name,
    call_id: callId,
    arguments: historyArgs,
    status,
  };
}

function stringifyProviderArguments(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined) return "{}";
  try {
    return JSON.stringify(value);
  } catch {
    return "{}";
  }
}

function normalizeOpenAIChatCompletionToolCallForInput(
  item: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> | undefined {
  const functionRecord = isRecord(item.function) ? item.function : undefined;
  const name = readString(functionRecord?.name) ?? readString(item.name);
  const callId = readString(item.id) ?? readString(item.call_id);
  if (name === undefined || callId === undefined) return undefined;
  const argumentsText = stringifyProviderArguments(functionRecord?.arguments ?? item.arguments ?? item.input);
  return {
    id: callId,
    type: "function",
    function: {
      name,
      arguments: compactProviderFunctionCallArgumentsForHistory({
        toolName: name,
        callId,
        argumentsText,
      }),
    },
  };
}

function normalizeOpenAIChatCompletionMessageForInput(
  message: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> | undefined {
  if (message.role !== "assistant") return undefined;
  const rawToolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
  const toolCalls = rawToolCalls
    .filter((toolCall): toolCall is Readonly<Record<string, unknown>> => isRecord(toolCall))
    .map(normalizeOpenAIChatCompletionToolCallForInput)
    .filter((toolCall): toolCall is Readonly<Record<string, unknown>> => toolCall !== undefined);
  if (toolCalls.length === 0) return undefined;
  return {
    role: "assistant",
    content: typeof message.content === "string" ? message.content : null,
    tool_calls: toolCalls,
  };
}

function assembleOpenAIChatCompletionMessageFromSse(raw: string): Readonly<Record<string, unknown>> | undefined {
  const contentChunks: string[] = [];
  const fragments = new Map<string, {
    id?: string;
    type?: string;
    name?: string;
    argumentsText: string;
    index: number;
  }>();
  let nextIndex = 0;
  for (const object of kernelSseDataObjects(raw)) {
    if (!isRecord(object)) continue;
    const choices = Array.isArray(object.choices) ? object.choices : [];
    for (const choice of choices) {
      if (!isRecord(choice)) continue;
      const delta = isRecord(choice.delta) ? choice.delta : undefined;
      const content = delta?.content;
      if (typeof content === "string") {
        contentChunks.push(content);
      }
      const toolCalls = Array.isArray(delta?.tool_calls) ? delta.tool_calls : [];
      for (const toolCall of toolCalls) {
        if (!isRecord(toolCall)) continue;
        const functionRecord = isRecord(toolCall.function) ? toolCall.function : undefined;
        const index = typeof toolCall.index === "number" ? toolCall.index : nextIndex;
        const key = `index:${index}`;
        const previous = fragments.get(key) ?? { argumentsText: "", index };
        const argumentsDelta = typeof functionRecord?.arguments === "string"
          ? functionRecord.arguments
          : typeof toolCall.arguments === "string"
            ? toolCall.arguments
            : "";
        fragments.set(key, {
          id: readString(toolCall.id) ?? readString(toolCall.call_id) ?? previous.id,
          type: readString(toolCall.type) ?? previous.type,
          name: readString(functionRecord?.name) ?? readString(toolCall.name) ?? previous.name,
          argumentsText: `${previous.argumentsText}${argumentsDelta}`,
          index,
        });
        nextIndex += 1;
      }
    }
  }

  const toolCalls = [...fragments.values()]
    .sort((left, right) => left.index - right.index)
    .filter((fragment) => fragment.name !== undefined)
    .map((fragment) => ({
      id: fragment.id ?? `chat-tool-call-${fragment.index}`,
      type: fragment.type ?? "function",
      function: {
        name: fragment.name ?? "",
        arguments: fragment.argumentsText,
      },
    }));
  const content = contentChunks.join("");
  if (toolCalls.length === 0 && content.length === 0) {
    return undefined;
  }
  return {
    role: "assistant",
    content: content.length > 0 ? content : null,
    ...(toolCalls.length === 0 ? {} : { tool_calls: toolCalls }),
  };
}

function extractOpenAIResponseId(raw: unknown): string | undefined {
  if (typeof raw === "string") {
    let responseId: string | undefined;
    for (const object of kernelSseDataObjects(raw)) {
      const candidate = extractOpenAIResponseId(object);
      if (candidate !== undefined) responseId = candidate;
    }
    return responseId;
  }

  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return undefined;
  }

  const record = raw as Readonly<Record<string, unknown>>;
  const directId = typeof record.id === "string" && record.id.trim().length > 0 ? record.id.trim() : undefined;
  if (directId !== undefined && (directId.startsWith("resp_") || directId.startsWith("resp-"))) {
    return directId;
  }
  const response = record.response;
  if (response !== null && typeof response === "object" && !Array.isArray(response)) {
    return extractOpenAIResponseId(response);
  }
  return directId;
}

function extractOpenAIChatCompletionOutputItems(raw: unknown): readonly Readonly<Record<string, unknown>>[] {
  if (typeof raw === "string") {
    const assembled = assembleOpenAIChatCompletionMessageFromSse(raw);
    const items = [
      assembled === undefined ? undefined : normalizeOpenAIChatCompletionMessageForInput(assembled),
      ...kernelSseDataObjects(raw).flatMap(extractOpenAIChatCompletionOutputItems),
    ].filter((item): item is Readonly<Record<string, unknown>> => item !== undefined);
    const seen = new Set<string>();
    return items.filter((item, index) => {
      const key = outputItemKey(item, index);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  if (!isRecord(raw)) return [];
  const choices = Array.isArray(raw.choices) ? raw.choices : [];
  return choices
    .map((choice) => isRecord(choice) && isRecord(choice.message)
      ? normalizeOpenAIChatCompletionMessageForInput(choice.message)
      : undefined)
    .filter((item): item is Readonly<Record<string, unknown>> => item !== undefined);
}

function extractOpenAIResponseOutputItems(raw: unknown): readonly Readonly<Record<string, unknown>>[] {
  if (typeof raw === "string") {
    const responseItems = kernelSseDataObjects(raw).flatMap((object) => {
      if (object === null || typeof object !== "object" || Array.isArray(object)) return [];
      const record = object as Record<string, unknown>;
      const eventType = typeof record.type === "string" ? record.type : undefined;
      const fromResponse = record.response === undefined ? [] : extractOpenAIResponseOutputItems(record.response);
      const fromItem = eventType === "response.output_item.done" &&
        record.item !== null &&
        typeof record.item === "object" &&
        !Array.isArray(record.item)
        ? [record.item as Readonly<Record<string, unknown>>]
        : [];
      return [...fromResponse, ...fromItem];
    }).map(normalizeOpenAIResponseOutputItemForInput)
      .filter((item): item is Readonly<Record<string, unknown>> => item !== undefined);
    const items = [
      ...extractOpenAIChatCompletionOutputItems(raw),
      ...responseItems,
    ];
    const seen = new Set<string>();
    return items.filter((item, index) => {
      const key = outputItemKey(item, index);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return [];
  }

  const output = (raw as { output?: unknown }).output;
  if (!Array.isArray(output)) {
    return extractOpenAIChatCompletionOutputItems(raw);
  }

  return output
    .filter((item): item is Readonly<Record<string, unknown>> => {
      return item !== null && typeof item === "object" && !Array.isArray(item);
    })
    .map(normalizeOpenAIResponseOutputItemForInput)
    .filter((item): item is Readonly<Record<string, unknown>> => item !== undefined);
}

function parseJsonRecordForKernel(text: string): Readonly<Record<string, unknown>> | undefined {
  try {
    const parsed: unknown = JSON.parse(text);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

type AnthropicContentBlockDraft = {
  index: number;
  type?: string;
  id?: string;
  name?: string;
  input?: Readonly<Record<string, unknown>>;
  inputJsonText: string;
  text: string;
  thinking: string;
  signature: string;
  redactedData?: string;
};

function assembleAnthropicContentBlocksFromSse(raw: string): readonly Readonly<Record<string, unknown>>[] {
  const blocks = new Map<number, AnthropicContentBlockDraft>();
  const blockForIndex = (index: number): AnthropicContentBlockDraft => {
    const existing = blocks.get(index);
    if (existing !== undefined) return existing;
    const draft: AnthropicContentBlockDraft = { index, inputJsonText: "", text: "", thinking: "", signature: "" };
    blocks.set(index, draft);
    return draft;
  };

  for (const object of kernelSseDataObjects(raw)) {
    if (!isRecord(object)) continue;
    const eventType = readString(object.type);
    const index = typeof object.index === "number" && Number.isInteger(object.index) ? object.index : blocks.size;
    if (eventType === "content_block_start" && isRecord(object.content_block)) {
      const sourceBlock = object.content_block;
      const draft = blockForIndex(index);
      draft.type = readString(sourceBlock.type) ?? draft.type;
      if (draft.type === "tool_use") {
        draft.id = readString(sourceBlock.id) ?? draft.id;
        draft.name = readString(sourceBlock.name) ?? draft.name;
        if (isRecord(sourceBlock.input) && Object.keys(sourceBlock.input).length > 0) {
          draft.input = sourceBlock.input;
        }
      }
      if (draft.type === "text" && typeof sourceBlock.text === "string") {
        draft.text += sourceBlock.text;
      }
      if (draft.type === "thinking") {
        if (typeof sourceBlock.thinking === "string") draft.thinking += sourceBlock.thinking;
        if (typeof sourceBlock.signature === "string") draft.signature += sourceBlock.signature;
      }
      if (draft.type === "redacted_thinking" && typeof sourceBlock.data === "string") {
        draft.redactedData = sourceBlock.data;
      }
      continue;
    }
    if (eventType === "content_block_delta" && isRecord(object.delta)) {
      const delta = object.delta;
      const draft = blockForIndex(index);
      if (delta.type === "input_json_delta" && typeof delta.partial_json === "string") {
        draft.type = draft.type ?? "tool_use";
        draft.inputJsonText += delta.partial_json;
      }
      if (delta.type === "text_delta" && typeof delta.text === "string") {
        draft.type = draft.type ?? "text";
        draft.text += delta.text;
      }
      if (delta.type === "thinking_delta" && typeof delta.thinking === "string") {
        draft.type = draft.type ?? "thinking";
        draft.thinking += delta.thinking;
      }
      if (delta.type === "signature_delta" && typeof delta.signature === "string") {
        draft.type = draft.type ?? "thinking";
        draft.signature += delta.signature;
      }
    }
  }

  return [...blocks.values()]
    .sort((left, right) => left.index - right.index)
    .flatMap((draft): readonly Readonly<Record<string, unknown>>[] => {
      if (draft.type === "tool_use" && draft.id !== undefined && draft.name !== undefined) {
        return [{
          type: "tool_use",
          id: draft.id,
          name: draft.name,
          input: draft.inputJsonText.trim().length > 0
            ? parseJsonRecordForKernel(draft.inputJsonText) ?? draft.input ?? {}
            : draft.input ?? {},
        }];
      }
      if (draft.type === "text" && draft.text.length > 0) {
        return [{ type: "text", text: draft.text }];
      }
      if (draft.type === "thinking" && (draft.thinking.length > 0 || draft.signature.length > 0)) {
        return [{
          type: "thinking",
          thinking: draft.thinking,
          ...(draft.signature.length === 0 ? {} : { signature: draft.signature }),
        }];
      }
      if (draft.type === "redacted_thinking" && draft.redactedData !== undefined) {
        return [{ type: "redacted_thinking", data: draft.redactedData }];
      }
      return [];
    });
}

function extractAnthropicMessagesOutputItems(raw: unknown): readonly Readonly<Record<string, unknown>>[] {
  if (typeof raw === "string") {
    const streamContent = assembleAnthropicContentBlocksFromSse(raw);
    const nestedMessages = kernelSseDataObjects(raw).flatMap((object) =>
      isRecord(object) && object.message !== undefined
        ? extractAnthropicMessagesOutputItems(object.message)
        : []
    );
    const messages = [
      ...(streamContent.length === 0 ? [] : [{ role: "assistant", content: streamContent }]),
      ...nestedMessages,
    ];
    const seen = new Set<string>();
    return messages.filter((item, index) => {
      const key = outputItemKey(item, index);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  if (!isRecord(raw) || !Array.isArray(raw.content) || raw.content.length === 0) return [];
  return [{ role: "assistant", content: raw.content }];
}

function extractProviderOutputItems(
  raw: unknown,
  providerFamily: ProviderToolSchemaFamily,
): readonly Readonly<Record<string, unknown>>[] {
  if (providerFamily === "anthropicMessages") {
    return extractAnthropicMessagesOutputItems(raw);
  }
  return extractOpenAIResponseOutputItems(raw);
}

function renderPromptPackProviderMaterials(materials: readonly StandardPromptPack["materials"][number][]): string {
  return materials
    .map((material) => [`<${material.kind} id="${material.id}">`, material.text, `</${material.kind}>`].join("\n"))
    .join("\n\n");
}

function splitPromptPackForProvider(promptPack: StandardPromptPack): {
  instructionText: string;
  dynamicInputText: string;
  instructionSegmentKinds: readonly PromptPackSegmentKind[];
  dynamicSegmentKinds: readonly PromptPackSegmentKind[];
  instructionEstimatedTokens: number;
  dynamicEstimatedTokens: number;
} {
  const segmentPolicies = new Map(promptPack.cachePlan.segments.map((segment) => [segment.segmentKind, segment.cachePolicy]));
  const instructionMaterials = promptPack.materials.filter((material) =>
    segmentPolicies.get(material.promptSegmentKind) !== "dynamic-no-cache"
  );
  const dynamicMaterials = promptPack.materials.filter((material) =>
    segmentPolicies.get(material.promptSegmentKind) === "dynamic-no-cache"
  );
  const instructionSegmentKinds = [...new Set(instructionMaterials.map((material) => material.promptSegmentKind))];
  const dynamicSegmentKinds = [...new Set(dynamicMaterials.map((material) => material.promptSegmentKind))];
  return {
    instructionText: renderPromptPackProviderMaterials(instructionMaterials),
    dynamicInputText: renderPromptPackProviderMaterials(dynamicMaterials),
    instructionSegmentKinds,
    dynamicSegmentKinds,
    instructionEstimatedTokens: instructionMaterials.reduce((sum, material) => sum + material.estimatedTokens, 0),
    dynamicEstimatedTokens: dynamicMaterials.reduce((sum, material) => sum + material.estimatedTokens, 0),
  };
}

function estimateSerializedTokens(value: unknown): number {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  return Math.max(0, Math.ceil((serialized?.length ?? 0) / 4));
}

function recordArrayLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function stableJsonForHash(value: unknown): string {
  if (value === undefined) {
    return "undefined";
  }
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJsonForHash(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJsonForHash(record[key])}`)
    .join(",")}}`;
}

function hashDebugValue(value: unknown): string {
  return createHash("sha256").update(stableJsonForHash(value)).digest("hex");
}

function ratioOrZero(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 10_000) / 10_000;
}

function headerValueForKernel(headers: Readonly<Record<string, string>> | undefined, name: string): string | undefined {
  const lowerName = name.toLowerCase();
  for (const [key, value] of Object.entries(headers ?? {})) {
    if (key.toLowerCase() === lowerName && value.trim().length > 0) {
      return value;
    }
  }
  return undefined;
}

function providerRoutingDebug(headers: Readonly<Record<string, string>> | undefined): AgentModelProviderRoutingDebug | undefined {
  if (headers === undefined) return undefined;
  return {
    publicSafe: true,
    responseHeaderNames: Object.keys(headers).map((key) => key.toLowerCase()).sort(),
    responseCodexTurnState: headerValueForKernel(headers, "x-codex-turn-state") === undefined ? "absent" : "present",
    responseRequestId: headerValueForKernel(headers, "x-request-id") ?? headerValueForKernel(headers, "x-oai-request-id"),
    responseOpenAIModel: headerValueForKernel(headers, "openai-model"),
  };
}

function providerResponseHeadersForKernel(providerResult: unknown): Readonly<Record<string, string>> | undefined {
  if (!isRecord(providerResult) || providerResult.ok !== true || !isRecord(providerResult.response)) return undefined;
  const headers = providerResult.response.headers;
  if (!isRecord(headers)) return undefined;
  return Object.fromEntries(
    Object.entries(headers).filter((entry): entry is [string, string] =>
      typeof entry[0] === "string" && typeof entry[1] === "string"),
  );
}

function normalizeToolContext(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const normalized: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (["invocationId", "toolCallId", "callId"].includes(key)) continue;
    normalized[key] = normalizeToolContext(child);
  }
  return normalized;
}

function stringValueForKernel(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function firstStringValueForKernel(...values: readonly unknown[]): string | undefined {
  for (const value of values) {
    const candidate = stringValueForKernel(value);
    if (candidate !== undefined) return candidate;
  }
  return undefined;
}

function stringArrayValueForKernel(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.map((item) => stringValueForKernel(item)).filter((item): item is string => item !== undefined)
    : [];
}

function codeReadTargetPaths(args: Readonly<Record<string, unknown>>): readonly string[] {
  const target = isRecord(args.target) ? args.target : undefined;
  const values = [
    ...stringArrayValueForKernel(args.targetPaths),
    ...stringArrayValueForKernel(args.paths),
    ...stringArrayValueForKernel(args.files),
    ...stringArrayValueForKernel(target?.targetPaths),
    ...stringArrayValueForKernel(target?.paths),
    ...[
      firstStringValueForKernel(args.targetPath, args.path, args.filePath, target?.targetPath, target?.path, target?.filePath),
    ].filter((item): item is string => item !== undefined),
  ];
  return values.map((item) => item.trim()).filter((item, index, array) => item.length > 0 && array.indexOf(item) === index).sort();
}

function codeReadHasRange(args: Readonly<Record<string, unknown>>): boolean {
  return isRecord(args.range) || isRecord(isRecord(args.target) ? args.target.range : undefined);
}

function codeReadCacheKey(toolId: string, args: Readonly<Record<string, unknown>>): string | undefined {
  if (toolId !== "code.read") return undefined;
  const paths = codeReadTargetPaths(args);
  if (paths.length === 0) return undefined;
  return `${toolId}:${stableJsonForHash({
    paths,
    includeLineNumbers: args.includeLineNumbers,
    encoding: args.encoding,
    context: normalizeToolContext(args.context),
  })}`;
}

function isCodeMutationTool(toolId: string): boolean {
  return ["code.overwrite", "code.modify", "code.replaceFile", "code.delete", "code.format"].includes(toolId);
}

function duplicateCodeReadRecord(input: {
  sessionId: string;
  toolCallId: string;
  toolId: string;
  providerToolName?: string;
  args: Readonly<Record<string, unknown>>;
  previousCallId: string;
  now: string;
}): { record: AgentToolCallRecord; observation: RuntimeObservationMaterial } {
  const paths = codeReadTargetPaths(input.args);
  const payload = {
    kind: "agentCore.basicTool.code.read.cachedObservation",
    duplicateOfToolCallId: input.previousCallId,
    targetPaths: paths,
    content: "",
    files: [],
    bytes: 0,
    truncated: false,
    unsafeSideEffects: false,
    note: "This code.read request repeats content already returned earlier in the same model turn. Use the previous observation instead of rereading the file.",
  };
  const record: AgentToolCallRecord = {
    callId: input.toolCallId,
    toolId: input.toolId,
    arguments: input.args,
    ok: true,
    output: payload,
  };
  const observation = createObservationMaterial({
    observationId: `${input.sessionId}:observation:${input.toolCallId}:cached-read`,
    source: "runtime",
    status: "completed",
    title: `BaseTool ${input.toolId} cached`,
    summary: `duplicate code.read skipped; previous observation ${input.previousCallId} already contains ${paths.join(", ") || "the requested file"}`,
    refs: [input.toolCallId, input.toolId, input.previousCallId],
    payload,
    metadata: metadataRecord({
      toolCallId: input.toolCallId,
      toolId: input.toolId,
      providerToolName: input.providerToolName ?? "",
      duplicateOfToolCallId: input.previousCallId,
      duplicateObservationReuse: true,
      createdAt: input.now,
    }),
  });
  return { record, observation };
}

function providerBodyFingerprints(input: {
  providerBody: Readonly<Record<string, unknown>>;
  previousProviderOutputItems: readonly Readonly<Record<string, unknown>>[];
  toolResultInputs: readonly unknown[];
}): Readonly<Record<string, string>> {
  const providerInput = Array.isArray(input.providerBody.input) ? input.providerBody.input : [];
  const dynamicInputItem = providerInput.find((item) =>
    item !== null &&
    typeof item === "object" &&
    !Array.isArray(item) &&
    (item as { role?: unknown }).role === "user"
  );
  return {
    bodyHash: hashDebugValue(input.providerBody),
    toolsHash: hashDebugValue(input.providerBody.tools),
    inputHash: hashDebugValue(input.providerBody.input),
    instructionsHash: hashDebugValue(input.providerBody.instructions),
    developerHash: hashDebugValue(input.providerBody.instructions ?? providerInput[0]),
    promptPackUserHash: hashDebugValue(dynamicInputItem ?? providerInput[1]),
    previousItemsHash: hashDebugValue(input.previousProviderOutputItems),
    toolResultsHash: hashDebugValue(input.toolResultInputs),
  };
}

function providerItemCallId(item: unknown): string | undefined {
  if (!isRecord(item)) return undefined;
  const callId = item.call_id;
  return typeof callId === "string" && callId.trim().length > 0 ? callId.trim() : undefined;
}

function composeOpenAIResponsesInput(input: {
  dynamicInputText: string;
  previousProviderOutputItems: readonly Readonly<Record<string, unknown>>[];
  toolResultInputs: readonly Readonly<Record<string, unknown>>[];
}): readonly Readonly<Record<string, unknown>>[] {
  const toolResultsByCallId = new Map<string, Readonly<Record<string, unknown>>[]>();
  for (const toolResult of input.toolResultInputs) {
    const callId = providerItemCallId(toolResult);
    if (callId === undefined) continue;
    toolResultsByCallId.set(callId, [...(toolResultsByCallId.get(callId) ?? []), toolResult]);
  }

  const providerInput: Readonly<Record<string, unknown>>[] = [];
  const consumedToolResults = new Set<Readonly<Record<string, unknown>>>();
  for (const previousItem of input.previousProviderOutputItems) {
    providerInput.push(previousItem);
    const callId = providerItemCallId(previousItem);
    if (callId === undefined) continue;
    for (const toolResult of toolResultsByCallId.get(callId) ?? []) {
      providerInput.push(toolResult);
      consumedToolResults.add(toolResult);
    }
  }
  providerInput.push(
    ...input.toolResultInputs.filter((toolResult) => !consumedToolResults.has(toolResult)),
    {
      role: "user",
      content: [{
        type: "input_text",
        text: input.dynamicInputText,
      }],
    },
  );
  return providerInput;
}

function chatToolCallIds(message: Readonly<Record<string, unknown>>): readonly string[] {
  const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
  return toolCalls
    .map((toolCall) => isRecord(toolCall) ? readString(toolCall.id) : undefined)
    .filter((toolCallId): toolCallId is string => toolCallId !== undefined);
}

function composeOpenAIChatCompletionsMessages(input: {
  dynamicInputText: string;
  previousProviderOutputItems: readonly Readonly<Record<string, unknown>>[];
  toolResultMessages: readonly Readonly<Record<string, unknown>>[];
}): readonly Readonly<Record<string, unknown>>[] {
  const toolMessagesByCallId = new Map<string, Readonly<Record<string, unknown>>[]>();
  for (const toolMessage of input.toolResultMessages) {
    const callId = readString(toolMessage.tool_call_id);
    if (callId === undefined) continue;
    toolMessagesByCallId.set(callId, [...(toolMessagesByCallId.get(callId) ?? []), toolMessage]);
  }

  const messages: Readonly<Record<string, unknown>>[] = [];
  const consumedToolMessages = new Set<Readonly<Record<string, unknown>>>();
  for (const previousItem of input.previousProviderOutputItems) {
    messages.push(previousItem);
    for (const callId of chatToolCallIds(previousItem)) {
      for (const toolMessage of toolMessagesByCallId.get(callId) ?? []) {
        messages.push(toolMessage);
        consumedToolMessages.add(toolMessage);
      }
    }
  }
  messages.push(
    ...input.toolResultMessages.filter((toolMessage) => !consumedToolMessages.has(toolMessage)),
    { role: "user", content: input.dynamicInputText },
  );
  return messages;
}

function anthropicToolUseIds(message: Readonly<Record<string, unknown>>): readonly string[] {
  const content = Array.isArray(message.content) ? message.content : [];
  return content
    .map((block) => isRecord(block) && block.type === "tool_use" ? readString(block.id) : undefined)
    .filter((toolUseId): toolUseId is string => toolUseId !== undefined);
}

function anthropicToolResultIds(message: Readonly<Record<string, unknown>>): readonly string[] {
  const content = Array.isArray(message.content) ? message.content : [];
  return content
    .map((block) => isRecord(block) && block.type === "tool_result" ? readString(block.tool_use_id) : undefined)
    .filter((toolUseId): toolUseId is string => toolUseId !== undefined);
}

function anthropicToolResultBlocksForId(
  message: Readonly<Record<string, unknown>>,
  toolUseId: string,
): readonly Readonly<Record<string, unknown>>[] {
  const content = Array.isArray(message.content) ? message.content : [];
  return content.filter((block): block is Readonly<Record<string, unknown>> =>
    isRecord(block) &&
    block.type === "tool_result" &&
    block.tool_use_id === toolUseId
  );
}

function appendAnthropicUserText(
  messages: Readonly<Record<string, unknown>>[],
  dynamicInputText: string,
): readonly Readonly<Record<string, unknown>>[] {
  const textBlock = { type: "text", text: dynamicInputText };
  const last = messages[messages.length - 1];
  if (last !== undefined && last.role === "user" && Array.isArray(last.content)) {
    messages[messages.length - 1] = {
      ...last,
      content: [...last.content, textBlock],
    };
    return messages;
  }
  messages.push({ role: "user", content: dynamicInputText });
  return messages;
}

function composeAnthropicMessages(input: {
  dynamicInputText: string;
  previousProviderOutputItems: readonly Readonly<Record<string, unknown>>[];
  toolResultMessages: readonly Readonly<Record<string, unknown>>[];
}): readonly Readonly<Record<string, unknown>>[] {
  const toolMessagesByToolUseId = new Map<string, Readonly<Record<string, unknown>>[]>();
  for (const toolMessage of input.toolResultMessages) {
    for (const toolUseId of anthropicToolResultIds(toolMessage)) {
      toolMessagesByToolUseId.set(toolUseId, [...(toolMessagesByToolUseId.get(toolUseId) ?? []), toolMessage]);
    }
  }

  const messages: Readonly<Record<string, unknown>>[] = [];
  const consumedToolMessages = new Set<Readonly<Record<string, unknown>>>();
  for (const previousItem of input.previousProviderOutputItems) {
    messages.push(previousItem);
    const toolUseIds = anthropicToolUseIds(previousItem);
    if (toolUseIds.length === 0) continue;
    const toolResultBlocks: Readonly<Record<string, unknown>>[] = [];
    for (const toolUseId of toolUseIds) {
      for (const toolMessage of toolMessagesByToolUseId.get(toolUseId) ?? []) {
        const blocks = anthropicToolResultBlocksForId(toolMessage, toolUseId);
        if (blocks.length === 0) continue;
        toolResultBlocks.push(...blocks);
        consumedToolMessages.add(toolMessage);
      }
    }
    if (toolResultBlocks.length > 0) {
      messages.push({ role: "user", content: toolResultBlocks });
    }
  }

  messages.push(...input.toolResultMessages.filter((toolMessage) => !consumedToolMessages.has(toolMessage)));
  return appendAnthropicUserText(messages, input.dynamicInputText);
}

function normalizedSelection(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))].sort();
}

function buildPromptPackCacheDebug(input: {
  promptPack: StandardPromptPack;
  providerBody: Readonly<Record<string, unknown>>;
  promptCacheKey?: string;
  previousProviderOutputItems: readonly Readonly<Record<string, unknown>>[];
  toolResultInputs: readonly unknown[];
  toolResultBudget: ProviderToolResultHistoryBudget;
  promptSplit: ReturnType<typeof splitPromptPackForProvider>;
}): AgentModelCacheDebugRecord {
  const segments = input.promptPack.cachePlan.segments.map((segment) => ({
    segmentKind: segment.segmentKind,
    cachePolicy: segment.cachePolicy,
    stability: segment.stability,
    estimatedTokens: segment.estimatedTokens,
    segmentHash: segment.segmentHash,
    materialCount: segment.materialRefs.length,
    materialRefs: segment.materialRefs,
    providerHints: segment.providerHints,
  }));
  const cacheablePrefixEstimatedTokens = input.promptPack.cachePlan.cacheablePrefixSegmentKinds
    .reduce((sum, segmentKind) => sum + (input.promptPack.cachePlan.segments.find((segment) => segment.segmentKind === segmentKind)?.estimatedTokens ?? 0), 0);
  const dynamicEstimatedTokens = input.promptPack.cachePlan.dynamicSegmentKinds
    .reduce((sum, segmentKind) => sum + (input.promptPack.cachePlan.segments.find((segment) => segment.segmentKind === segmentKind)?.estimatedTokens ?? 0), 0);
  const inputEstimatedTokens = estimateSerializedTokens(input.providerBody.input);
  const toolsEstimatedTokens = estimateSerializedTokens(input.providerBody.tools);
  const providerBodyEstimatedTokens = estimateSerializedTokens(input.providerBody);
  const providerStablePrefixEstimatedTokens = input.promptSplit.instructionEstimatedTokens + toolsEstimatedTokens;
  const providerDynamicInputEstimatedTokens = inputEstimatedTokens;
  return {
    kind: "praxis.modelCall.cacheDebug",
    strategy: "prompt-pack-cache-xray",
    promptCacheKey: input.promptCacheKey,
    promptPack: {
      totalEstimatedTokens: input.promptPack.totalEstimatedTokens,
      renderedTextEstimatedTokens: estimateSerializedTokens(input.promptPack.renderedText),
      cacheablePrefixEstimatedTokens,
      dynamicEstimatedTokens,
      segmentCount: segments.length,
      segments,
      cacheRiskWarnings: input.promptPack.cachePlan.cacheRiskWarnings,
      providerLowering: {
        instructionSegmentKinds: input.promptSplit.instructionSegmentKinds,
        dynamicInputSegmentKinds: input.promptSplit.dynamicSegmentKinds,
        instructionEstimatedTokens: input.promptSplit.instructionEstimatedTokens,
        dynamicInputEstimatedTokens: input.promptSplit.dynamicEstimatedTokens,
        instructionsHash: hashDebugValue(input.promptSplit.instructionText),
        dynamicInputHash: hashDebugValue(input.promptSplit.dynamicInputText),
      },
    },
    providerBody: {
      estimatedTokens: providerBodyEstimatedTokens,
      inputEstimatedTokens,
      toolsEstimatedTokens,
      toolCount: recordArrayLength(input.providerBody.tools),
      fingerprints: providerBodyFingerprints(input),
      previousProviderOutputItems: input.previousProviderOutputItems.length,
      toolResultInputs: input.toolResultInputs.length,
      toolResultBudget: input.toolResultBudget,
      cacheShape: {
        providerStablePrefixEstimatedTokens,
        providerDynamicInputEstimatedTokens,
        stablePrefixShare: ratioOrZero(providerStablePrefixEstimatedTokens, providerBodyEstimatedTokens),
        dynamicInputShare: ratioOrZero(providerDynamicInputEstimatedTokens, providerBodyEstimatedTokens),
        stablePrefixHash: hashDebugValue({
          instructions: input.providerBody.instructions,
          tools: input.providerBody.tools,
        }),
        dynamicPayloadHash: hashDebugValue({
          input: input.providerBody.input,
          previousProviderOutputItems: input.previousProviderOutputItems,
          toolResultInputs: input.toolResultInputs,
        }),
      },
    },
  };
}

function cacheDebugWithObservedUsage(
  cacheDebug: AgentModelCacheDebugRecord,
  usage: AgentModelUsageRecord | undefined,
): AgentModelCacheDebugRecord {
  if (usage === undefined) return cacheDebug;
  const inputTokens = usage.inputTokens;
  const cachedInputTokens = usage.cachedInputTokens;
  if (inputTokens === undefined || cachedInputTokens === undefined || inputTokens <= 0) {
    return {
      ...cacheDebug,
      observedUsage: {
        inputTokens,
        cachedInputTokens,
        diagnosis: "no-cache-telemetry",
        reasons: ["provider usage did not include both inputTokens and cachedInputTokens"],
      },
    };
  }

  const nonCachedInputTokens = Math.max(0, inputTokens - cachedInputTokens);
  const cacheHitRate = ratioOrZero(cachedInputTokens, inputTokens);
  const stablePrefixEstimate = cacheDebug.providerBody.cacheShape.providerStablePrefixEstimatedTokens;
  const stablePrefixWarmthEstimate = ratioOrZero(cachedInputTokens, stablePrefixEstimate);
  const dynamicInputShare = cacheDebug.providerBody.cacheShape.dynamicInputShare;
  const reasons: string[] = [
    `observed cachedInputTokens=${cachedInputTokens} inputTokens=${inputTokens}`,
    `provider stable prefix estimate=${stablePrefixEstimate} dynamic input estimate=${cacheDebug.providerBody.cacheShape.providerDynamicInputEstimatedTokens}`,
  ];

  let diagnosis: NonNullable<AgentModelCacheDebugRecord["observedUsage"]>["diagnosis"] = "partial-cache-hit";
  if (cacheHitRate >= 0.9) {
    diagnosis = "warm-stable-prefix";
    reasons.push("overall cache hit rate is already warm");
  } else if (stablePrefixEstimate > 0 && stablePrefixWarmthEstimate < 0.6) {
    diagnosis = "stable-prefix-cache-break";
    reasons.push("cached tokens cover less than 60% of the estimated stable prefix");
  } else if (dynamicInputShare >= 0.35 || nonCachedInputTokens > cachedInputTokens * 0.5) {
    diagnosis = "dynamic-payload-dominates";
    reasons.push("non-cached dynamic payload is large enough to dilute the overall hit rate");
  } else {
    reasons.push("cache hit is partial; compare fingerprints across adjacent turns for the changing field");
  }

  return {
    ...cacheDebug,
    observedUsage: {
      inputTokens,
      cachedInputTokens,
      nonCachedInputTokens,
      cacheHitRate,
      stablePrefixWarmthEstimate,
      diagnosis,
      reasons,
    },
  };
}

function cacheDebugWithPreviousComparison(
  cacheDebug: AgentModelCacheDebugRecord,
  previous: AgentModelCacheDebugRecord | undefined,
): AgentModelCacheDebugRecord {
  if (previous === undefined) return cacheDebug;
  const currentFingerprints = cacheDebug.providerBody.fingerprints;
  const previousFingerprints = previous.providerBody.fingerprints;
  const fingerprintKeys = [...new Set([
    ...Object.keys(previousFingerprints),
    ...Object.keys(currentFingerprints),
  ])].sort();
  const changedFingerprintKeys = fingerprintKeys.filter((key) => previousFingerprints[key] !== currentFingerprints[key]);
  const stablePrefixChanged = previous.providerBody.cacheShape.stablePrefixHash !== cacheDebug.providerBody.cacheShape.stablePrefixHash;
  const dynamicPayloadChanged = previous.providerBody.cacheShape.dynamicPayloadHash !== cacheDebug.providerBody.cacheShape.dynamicPayloadHash;
  const observedUsage = cacheDebug.observedUsage;
  const stablePrefixMissWithStableBody =
    observedUsage?.diagnosis === "stable-prefix-cache-break"
    && observedUsage.cachedInputTokens === 0
    && !stablePrefixChanged
    && previousFingerprints.instructionsHash === currentFingerprints.instructionsHash
    && previousFingerprints.toolsHash === currentFingerprints.toolsHash;
  return {
    ...cacheDebug,
    observedUsage: stablePrefixMissWithStableBody
      ? {
        ...observedUsage,
        diagnosis: "provider-cache-miss-with-stable-prefix",
        reasons: [
          ...observedUsage.reasons,
          "stable prefix and provider tool fingerprints match the previous model call; this looks like provider cache routing/reuse miss, not PromptPack prefix drift",
        ],
      }
      : observedUsage,
    comparisonToPrevious: {
      previousStablePrefixHash: previous.providerBody.cacheShape.stablePrefixHash,
      previousDynamicPayloadHash: previous.providerBody.cacheShape.dynamicPayloadHash,
      stablePrefixChanged,
      dynamicPayloadChanged,
      instructionsChanged: previousFingerprints.instructionsHash !== currentFingerprints.instructionsHash,
      toolsChanged: previousFingerprints.toolsHash !== currentFingerprints.toolsHash,
      changedFingerprintKeys,
    },
  };
}

function buildCodexResponsesBodyFromPromptPack(
  manifest: AgentManifest,
  promptPack: StandardPromptPack,
  mappings: readonly ProviderToolMapping[],
  options: {
    exposeProviderTools?: boolean;
    observations?: readonly RuntimeObservationMaterial[];
    previousProviderOutputItems?: readonly Readonly<Record<string, unknown>>[];
    previousProviderResponseId?: string;
    promptCacheKey?: string;
  } = {},
): Readonly<Record<string, unknown>> {
  const promptSplit = splitPromptPackForProvider(promptPack);
  const stableInstructionText = [
    "You are running inside PraxisRuntimeKernel. Use the Praxis PromptPack as current situation context.",
    PRAXIS_BASE_TOOL_CALLING_PROTOCOL,
    promptSplit.instructionText.length > 0
      ? [
        "Praxis PromptPack stable context follows. Treat it as governing instructions and stable tool/context guidance.",
        promptSplit.instructionText,
      ].join("\n\n")
      : undefined,
  ].filter((part): part is string => typeof part === "string" && part.length > 0).join("\n\n");
  const dynamicInputText = promptSplit.dynamicInputText.length > 0
    ? promptSplit.dynamicInputText
    : "Current Praxis turn has no dynamic prompt material.";
  const toolResultInputs = providerToolResultsFromObservations(options.observations ?? [])
    .map((result) => lowerProviderToolResult({ providerFamily: "openaiResponses", result }));
  const body: Record<string, unknown> = {
    model: manifest.model.model,
    ...(options.promptCacheKey === undefined ? {} : { prompt_cache_key: options.promptCacheKey }),
    ...(options.previousProviderResponseId === undefined ? {} : { previous_response_id: options.previousProviderResponseId }),
    instructions: stableInstructionText,
    input: composeOpenAIResponsesInput({
      dynamicInputText,
      previousProviderOutputItems: options.previousProviderOutputItems ?? [],
      toolResultInputs,
    }),
  };

  if (options.exposeProviderTools !== false) {
    const bundle = lowerPraxisToolsForProvider({
      providerFamily: "openaiResponses",
      manifest,
      mappings,
      includeRuntimeDecisionTools: true,
    });
    body.tools = bundle.tools;
  }

  return body;
}

function buildOpenAIChatCompletionsBodyFromPromptPack(
  manifest: AgentManifest,
  promptPack: StandardPromptPack,
  providerToolBundle: ProviderToolDeclarationBundle,
  options: {
    exposeProviderTools?: boolean;
    observations?: readonly RuntimeObservationMaterial[];
    previousProviderOutputItems?: readonly Readonly<Record<string, unknown>>[];
  } = {},
): Readonly<Record<string, unknown>> {
  const promptSplit = splitPromptPackForProvider(promptPack);
  const systemText = [
    "You are running inside PraxisRuntimeKernel. Use the Praxis PromptPack as current situation context.",
    PRAXIS_BASE_TOOL_CALLING_PROTOCOL,
    promptSplit.instructionText,
  ].filter((part) => part.trim().length > 0).join("\n\n");
  const dynamicInputText = promptSplit.dynamicInputText.length > 0
    ? promptSplit.dynamicInputText
    : "Current Praxis turn has no dynamic prompt material.";
  const toolResultMessages = providerToolResultsFromObservations(options.observations ?? [])
    .map((result) => lowerProviderToolResult({ providerFamily: "openaiChatCompletions", result }));
  const reasoningEffort = isDeepSeekV4Model(manifest.model.model)
    ? manifest.model.reasoning?.effort
    : undefined;
  return {
    model: manifest.model.model,
    stream: true,
    stream_options: { include_usage: true },
    ...(reasoningEffort === undefined ? {} : { reasoning_effort: reasoningEffort }),
    messages: [
      ...(systemText.length > 0 ? [{ role: "system", content: systemText }] : []),
      ...composeOpenAIChatCompletionsMessages({
        dynamicInputText,
        previousProviderOutputItems: options.previousProviderOutputItems ?? [],
        toolResultMessages,
      }),
    ],
    ...(options.exposeProviderTools === false || providerToolBundle.tools.length === 0 ? {} : { tools: providerToolBundle.tools }),
  };
}

function buildAnthropicMessagesBodyFromPromptPack(
  manifest: AgentManifest,
  promptPack: StandardPromptPack,
  providerToolBundle: ProviderToolDeclarationBundle,
  options: {
    exposeProviderTools?: boolean;
    observations?: readonly RuntimeObservationMaterial[];
    previousProviderOutputItems?: readonly Readonly<Record<string, unknown>>[];
  } = {},
): Readonly<Record<string, unknown>> {
  const promptSplit = splitPromptPackForProvider(promptPack);
  const systemText = [
    "You are running inside PraxisRuntimeKernel. Use the Praxis PromptPack as current situation context.",
    PRAXIS_BASE_TOOL_CALLING_PROTOCOL,
    promptSplit.instructionText,
  ].filter((part) => part.trim().length > 0).join("\n\n");
  const dynamicInputText = promptSplit.dynamicInputText.length > 0
    ? promptSplit.dynamicInputText
    : "Current Praxis turn has no dynamic prompt material.";
  const toolResultInputs = providerToolResultsFromObservations(options.observations ?? [])
    .map((result) => lowerProviderToolResult({ providerFamily: "anthropicMessages", result }));
  const messages = composeAnthropicMessages({
    dynamicInputText,
    previousProviderOutputItems: options.previousProviderOutputItems ?? [],
    toolResultMessages: toolResultInputs,
  });
  const deepSeekReasoning = isDeepSeekV4Model(manifest.model.model)
    ? mapDeepSeekV4ReasoningEffort(manifest.model.reasoning?.effort)
    : undefined;
  const maxTokens = readPositiveInteger(manifest.model.metadata?.maxOutputTokens) ?? 8_192;
  return {
    model: manifest.model.model,
    max_tokens: maxTokens,
    stream: true,
    ...(systemText.length === 0 ? {} : { system: systemText }),
    ...(deepSeekReasoning === undefined ? {} : { thinking: deepSeekReasoning.thinking }),
    ...(deepSeekReasoning?.outputConfig === undefined ? {} : { output_config: deepSeekReasoning.outputConfig }),
    messages,
    ...(options.exposeProviderTools === false || providerToolBundle.tools.length === 0 ? {} : { tools: providerToolBundle.tools }),
  };
}

function buildProviderBodyFromPromptPack(
  manifest: AgentManifest,
  promptPack: StandardPromptPack,
  providerToolBundle: ProviderToolDeclarationBundle,
  mappings: readonly ProviderToolMapping[],
  options: {
    exposeProviderTools?: boolean;
    observations?: readonly RuntimeObservationMaterial[];
    previousProviderOutputItems?: readonly Readonly<Record<string, unknown>>[];
    previousProviderResponseId?: string;
    promptCacheKey?: string;
  } = {},
): Readonly<Record<string, unknown>> {
  if (manifest.model.provider === "anthropic" || manifest.model.endpointShape === "messages") {
    return buildAnthropicMessagesBodyFromPromptPack(manifest, promptPack, providerToolBundle, options);
  }
  if (manifest.model.endpointShape === "chat_completions") {
    return buildOpenAIChatCompletionsBodyFromPromptPack(manifest, promptPack, providerToolBundle, options);
  }
  return buildCodexResponsesBodyFromPromptPack(manifest, promptPack, mappings, options);
}

function kernelError(
  code: PraxisRuntimeKernelErrorCode,
  message: string,
  boundary: PraxisRuntimeKernelError["boundary"],
): PraxisRuntimeKernelError {
  return { code, message, boundary, publicSafe: true };
}

async function recordMainLoopStep(input: {
  store: RuntimeSessionStateEventStore;
  sessionId: string;
  step: MainLoopStepRecord;
  createdAt: string;
  events: string[];
  mainLoopSteps: MainLoopStepRecord[];
}): Promise<void> {
  input.mainLoopSteps.push(input.step);
  input.events.push(`mainLoop.${input.step.actionPrimitive}.${input.step.status}`);
  await input.store.appendMainLoopStep(input.step);
  await input.store.appendEvent(event(
    input.sessionId,
    `event:${input.step.stepId}`,
    "runtime.mainLoop.step",
    input.createdAt,
    { step: input.step },
  ));
}

async function recordKernelError(input: {
  store: RuntimeSessionStateEventStore;
  sessionId: string;
  errorId: string;
  error: PraxisRuntimeKernelError | RuntimePublicSafeErrorRecord;
  createdAt: string;
  metadata?: Readonly<Record<string, unknown>>;
}): Promise<void> {
  const boundary =
    input.error.boundary === "compile"
      ? "runtime-state"
      : input.error.boundary === "io"
        ? "io"
        : input.error.boundary === "runtime-state"
          ? "runtime-state"
          : input.error.boundary;
  await input.store.appendPublicSafeError({
    sessionId: input.sessionId,
    errorId: input.errorId,
    code: input.error.code,
    message: input.error.message,
    boundary,
    createdAt: input.createdAt,
    metadata: input.metadata ?? {},
    publicSafe: true,
  });
}

async function recordHandoffPlan(input: {
  store: RuntimeSessionStateEventStore;
  sessionId: string;
  createdAt: string;
  events: string[];
  mainLoopSteps: MainLoopStepRecord[];
  turnIndex: number;
  startStepIndex: number;
  tickKind: "model-only" | "tool-call" | "ephemeral-procedure" | "approval-wait" | "resume" | "interrupt" | "failure";
  promptPackRef?: string;
  loweredPromptRef?: string;
  modelCallId?: string;
  toolCallId?: string;
  procedureId?: string;
  observationRefs?: readonly string[];
  inputRefs?: readonly string[];
  outputRefs?: readonly string[];
  error?: MainLoopStepRecord["error"];
}): Promise<void> {
  const plan = planFrameworkMainLoopHandoff({
    sessionId: input.sessionId,
    turnIndex: input.turnIndex,
    startStepIndex: input.startStepIndex,
    now: input.createdAt,
    tickKind: input.tickKind,
    promptPackRef: input.promptPackRef,
    loweredPromptRef: input.loweredPromptRef,
    modelCallId: input.modelCallId,
    toolCallId: input.toolCallId,
    procedureId: input.procedureId,
    observationRefs: input.observationRefs,
    inputRefs: input.inputRefs,
    outputRefs: input.outputRefs,
    error: input.error,
  });
  input.events.push(...plan.events);
  if (!plan.ok) {
    return;
  }
  for (const step of plan.plan.stepRecords) {
    await recordMainLoopStep({
      store: input.store,
      sessionId: input.sessionId,
      createdAt: input.createdAt,
      events: input.events,
      mainLoopSteps: input.mainLoopSteps,
      step,
    });
  }
}

function promptLoweringMaterials(promptPack: StandardPromptPack): readonly {
  kind: string;
  ref: string;
  text: string;
  sourceCategory?: "declared-built-in" | "process-product" | "user-request";
  priority: number;
  metadata: Readonly<Record<string, unknown>>;
}[] {
  return promptPack.materials.map((material) => ({
    kind: material.kind,
    ref: material.id,
    text: material.text,
    sourceCategory: material.sourceCategory,
    priority: material.priority,
    metadata: material.metadata,
  }));
}

async function requestRuntimeApproval(input: {
  runtimeId: string;
  sessionId: string;
  approvalId: string;
  source: RuntimeApprovalRecord["source"];
  reason: string;
  requestedScopes: readonly string[];
  riskLevel?: string;
  interfaceSurface?: RuntimeApprovalRecord["interfaceSurface"];
  resolver?: RuntimeApprovalResolver;
  store: RuntimeSessionStateEventStore;
  now: () => string;
  metadata?: Readonly<Record<string, unknown>>;
}): Promise<{
  status: "approved" | "denied" | "pending";
  envelope: RuntimeApprovalEnvelope;
  interfaceEnvelope?: InterfaceEnvelope;
  events: readonly string[];
  reason?: string;
}> {
  const createdAt = input.now();
  const interfaceSurface = input.interfaceSurface ?? (input.resolver === undefined ? "application" : "test-harness");
  const envelope: RuntimeApprovalEnvelope = {
    approvalId: input.approvalId,
    runtimeId: input.runtimeId,
    sessionId: input.sessionId,
    source: input.source,
    reason: input.reason,
    requestedScopes: input.requestedScopes,
    riskLevel: input.riskLevel,
    interfaceSurface,
    metadata: input.metadata ?? {},
    publicSafe: true,
  };
  await input.store.appendApproval({
    sessionId: input.sessionId,
    approvalId: input.approvalId,
    status: "pending",
    reason: input.reason,
    requestedScopes: input.requestedScopes,
    riskLevel: input.riskLevel,
    source: input.source,
    interfaceSurface,
    createdAt,
    metadata: input.metadata ?? {},
  });
  await input.store.appendEvent(event(input.sessionId, `event:approval:${input.approvalId}:pending`, "runtime.approval.pending", createdAt, {
    approval: envelope,
  }));
  const interfaceEnvelope = approvalInterfaceEnvelope({
    approvalId: input.approvalId,
    runtimeId: input.runtimeId,
    sessionId: input.sessionId,
    surface: interfaceSurface === "cli" || interfaceSurface === "tui" || interfaceSurface === "raxos"
      ? interfaceSurface
      : "application",
    payload: envelope,
    createdAt,
  });
  if (interfaceEnvelope.ok) {
    await input.store.appendEvent(event(
      input.sessionId,
      `event:interface:approval:${input.approvalId}`,
      "runtime.interfaceAdapter.approval.envelope",
      createdAt,
      {
        envelope: interfaceEnvelope.envelope,
      },
    ));
  }

  if (input.resolver === undefined) {
    return {
      status: "pending",
      envelope,
      interfaceEnvelope: interfaceEnvelope.ok ? interfaceEnvelope.envelope : undefined,
      events: ["runtime.approval.pending", ...(interfaceEnvelope.ok ? interfaceEnvelope.events : [])],
      reason: input.reason,
    };
  }

  let resolution: RuntimeApprovalResolution;
  try {
    resolution = await input.resolver(envelope);
  } catch {
    const resolvedAt = input.now();
    await input.store.resolveApproval(input.sessionId, input.approvalId, {
      status: "denied",
      resolvedAt,
      resolution: {
        resolvedBy: "approvalResolver",
        reason: "approval resolver failed",
      },
    });
    await input.store.appendEvent(event(input.sessionId, `event:approval:${input.approvalId}:resolverFailed`, "runtime.approval.denied", resolvedAt, {
      approvalId: input.approvalId,
      status: "denied",
      publicSafeFailure: "approval resolver failed",
    }));
    return {
      status: "denied",
      envelope,
      interfaceEnvelope: interfaceEnvelope.ok ? interfaceEnvelope.envelope : undefined,
      events: ["runtime.approval.denied", ...(interfaceEnvelope.ok ? interfaceEnvelope.events : [])],
      reason: "approval resolver failed",
    };
  }
  const status = resolution.status;
  if (status === "pending") {
    return {
      status,
      envelope,
      interfaceEnvelope: interfaceEnvelope.ok ? interfaceEnvelope.envelope : undefined,
      events: ["runtime.approval.pending", ...(interfaceEnvelope.ok ? interfaceEnvelope.events : [])],
      reason: resolution.reason ?? input.reason,
    };
  }

  const resolvedAt = input.now();
  await input.store.resolveApproval(input.sessionId, input.approvalId, {
    status: status === "approved" ? "approved" : "denied",
    resolvedAt,
    resolution: {
      resolvedBy: resolution.resolvedBy ?? "approvalResolver",
      reason: resolution.reason,
      ...(resolution.metadata ?? {}),
    },
  });
  await input.store.appendEvent(event(input.sessionId, `event:approval:${input.approvalId}:resolved`, `runtime.approval.${status}`, resolvedAt, {
    approvalId: input.approvalId,
    status,
    resolvedBy: resolution.resolvedBy ?? "approvalResolver",
  }));
  return {
    status,
    envelope,
    interfaceEnvelope: interfaceEnvelope.ok ? interfaceEnvelope.envelope : undefined,
    events: [`runtime.approval.${status}`, ...(interfaceEnvelope.ok ? interfaceEnvelope.events : [])],
    reason: resolution.reason,
  };
}

async function prepareKernelSandbox(input: {
  manifest: AgentManifest;
  runtimeId: string;
  sessionId: string;
  storageRuntime: StoragePlaneRuntime;
  options: PraxisRuntimeKernelOptions;
  store: RuntimeSessionStateEventStore;
  now: () => string;
  events: string[];
}): Promise<
  | { ok: true; sandbox: SandboxRuntimePrepareResult }
  | { ok: false; sandbox: SandboxRuntimePrepareResult; error: PraxisRuntimeKernelError }
> {
  const sandbox = await prepareSandboxRuntime(input.manifest.sandbox, {
    cwd: input.options.sandbox?.cwd ?? input.storageRuntime.layout.workspace.root,
    runSmoke: input.options.sandbox?.runSmoke ?? false,
  });
  input.events.push(...sandbox.events);
  await input.store.appendEvent(event(
    input.sessionId,
    "event:sandbox.prepared",
    "runtime.sandboxPlane.prepared",
    input.now(),
    { sandbox },
  ));

  const failOnUnavailable = input.options.sandbox?.failOnUnavailable ?? true;
  if (!sandbox.ready && failOnUnavailable) {
    return {
      ok: false,
      sandbox,
      error: kernelError(
        "SANDBOX_UNAVAILABLE",
        sandbox.probe.publicSafeMessage,
        "runtime-state",
      ),
    };
  }

  return { ok: true, sandbox };
}

async function buildPromptPackAndLower(input: {
  runtimeId: string;
  sessionId: string;
  manifest: AgentManifest;
  task: string;
  turnIndex: number;
  startStepIndex?: number;
  now?: string;
  modelCaller: { kind: "application"; id: string; sessionId: string };
  toolMappings: readonly ProviderToolMapping[];
  observations: readonly RuntimeObservationMaterial[];
  events: readonly string[];
  toolContextSelection?: BaseToolContextSelection;
  toolContextUsage?: readonly BaseToolContextUsageRecord[];
}): Promise<
  | {
      ok: true;
      promptPackId: string;
      promptPack: StandardPromptPack;
      loweredPrompt: LoweredPromptEnvelope;
      providerToolBundle: ProviderToolDeclarationBundle;
      turnRecord: MainLoopTurnRecord;
      events: readonly string[];
    }
  | {
      ok: false;
      error: PraxisRuntimeKernelError;
      events: readonly string[];
    }
> {
  const promptPackId = input.manifest.harness.promptPack.promptPackId ?? `${input.sessionId}:promptPack:${input.turnIndex + 1}`;
  const mainLoopRun = runMainLoop({
    runtime: {
      runtimeId: input.runtimeId,
      sessionId: input.sessionId,
      manifestRef: input.manifest.manifestId,
      callerRef: input.modelCaller.id,
      surfaces: [
        { surfaceId: "promptPack", kind: "promptPack", ready: true },
        { surfaceId: "modelAdapter", kind: "modelAdapter", ready: true },
        { surfaceId: "baseToolExecutor", kind: "baseToolExecutor", ready: true },
        { surfaceId: "stateEventStore", kind: "stateEventStore", ready: true },
      ],
      now: input.now === undefined ? undefined : () => input.now ?? defaultNow(),
      metadata: { source: "PraxisRuntimeKernel.buildPromptPackAndLower" },
    },
    input: input.task,
    userTurnIndex: input.turnIndex,
    loopTickIndex: input.turnIndex,
    startStepIndex: input.startStepIndex,
    inputRefs: ["runtime.input.normalized", ...input.observations.map((observation) => observation.observationId)],
    targetModel: input.manifest.model.model,
    loweringHint: input.manifest.model.endpointShape,
    promptPackId,
    materials: promptMaterialsForTurn({
      manifest: input.manifest,
      task: input.task,
      turnIndex: input.turnIndex,
      toolMappings: input.toolMappings,
      observations: input.observations,
      events: input.events,
      toolContextSelection: input.toolContextSelection,
      toolContextUsage: input.toolContextUsage,
    }),
  });
  if (!mainLoopRun.ok) {
    return {
      ok: false,
      error: kernelError("PROMPT_PACK_FAILED", mainLoopRun.error.message, "runtime-state"),
      events: mainLoopRun.events,
    };
  }
  const preparedTurn = mainLoopRun.turnPreparation;
  if (preparedTurn === undefined) {
    return {
      ok: false,
      error: kernelError("PROMPT_PACK_FAILED", "mainLoop run did not return turn preparation", "runtime-state"),
      events: mainLoopRun.events,
    };
  }

  const providerFamily = providerToolSchemaFamilyForModel(input.manifest.model);
  const providerToolBundle = lowerPraxisToolsForProvider({
    providerFamily,
    manifest: input.manifest,
    mappings: input.toolMappings,
    includeRuntimeDecisionTools: true,
  });

  const lowered = lowerPromptForModelAdapter({
    runtimeId: input.runtimeId,
    caller: input.modelCaller,
    promptPack: {
      id: promptPackId,
      materials: promptLoweringMaterials(preparedTurn.promptPack),
      metadata: {
        source: "PraxisRuntimeKernel",
        format: preparedTurn.promptPack.format,
        cachePlan: preparedTurn.cachePlan,
        turnRecord: preparedTurn.turnRecord,
      },
    },
    target: {
      capabilityId: modelInvocationCapabilityForModel(input.manifest.model).capabilityId,
      carrierId: input.manifest.model.carrierId,
      outputMode: "single",
    },
    providerToolBundle,
    providerCacheHintPlan: providerToolBundle.cacheHintPlan,
    runtimeReady: true,
    contract: { accepted: true },
    governance: { accepted: true },
  });
  if (!lowered.ok) {
    return {
      ok: false,
      error: kernelError("PROMPT_PACK_FAILED", lowered.error.message, "runtime-state"),
      events: [...mainLoopRun.events, ...lowered.events],
    };
  }

  return {
    ok: true,
    promptPackId,
    promptPack: preparedTurn.promptPack,
    loweredPrompt: lowered.loweredPrompt,
    providerToolBundle,
    turnRecord: preparedTurn.turnRecord,
    events: [...mainLoopRun.events, ...lowered.events],
  };
}

async function executeBaseToolDecision(input: {
  runtimeId: string;
  sessionId: string;
  manifest: AgentManifest;
  executor: BaseToolExecutorPort;
  toolCallId: string;
  toolId: string;
  providerToolName?: string;
  args: Readonly<Record<string, unknown>>;
  workspaceRoot?: string;
  allowedRoots?: readonly string[];
  allowToolExecution?: boolean;
  dependencyRuntime?: NonNullable<PraxisRuntimeKernelOptions["baseToolDependencyRuntime"]>;
  store: RuntimeSessionStateEventStore;
  approvalResolver?: RuntimeApprovalResolver;
  now: () => string;
  events: string[];
}): Promise<{
  record: AgentToolCallRecord;
  observation: RuntimeObservationMaterial;
  events: readonly string[];
  governance: BaseToolRuntimeGovernanceDecision;
}> {
  let toolArguments = enrichToolArguments(input.manifest, input.toolId, input.args, {
    runtimeId: input.runtimeId,
    sessionId: input.sessionId,
    invocationId: input.toolCallId,
    workspaceRoot: input.workspaceRoot,
    allowedRoots: input.allowedRoots,
  });
  const pathContract = normalizeWorkspacePathContract({
    toolId: input.toolId,
    args: toolArguments,
    workspaceRoot: input.workspaceRoot,
    allowedRoots: input.allowedRoots,
  });
  if (!pathContract.ok) {
    const record: AgentToolCallRecord = {
      callId: input.toolCallId,
      toolId: input.toolId,
      arguments: toolArguments,
      ok: false,
      error: pathContract.error,
    };
    const observation = createObservationMaterial({
      observationId: `${input.sessionId}:observation:${input.toolCallId}:workspace-path`,
      source: "baseTool",
      status: "failed",
      title: `BaseTool ${input.toolId}`,
      summary: String(pathContract.error.message ?? "workspace path contract rejected the tool call"),
      refs: [input.toolCallId, input.toolId],
      payload: pathContract.error,
      metadata: metadataRecord({
        toolCallId: input.toolCallId,
        toolId: input.toolId,
        pathContractStatus: "rejected",
        reason: String(pathContract.error.reason ?? pathContract.error.code ?? ""),
      }),
    });
    return {
      record,
      observation,
      events: ["runtime.execEngine.workspacePathContract.rejected"],
      governance: {
        kind: "runtime.execEngine.baseTool.governanceDecision",
        toolId: input.toolId,
        status: "deny",
        risk: "risky",
        policyProfile: input.manifest.toolPolicy.profile,
        policyMatrixId: input.manifest.toolPolicy.matrixId,
        approvalRequired: false,
        approvalReason: String(pathContract.error.message ?? "workspace path contract rejected the tool call"),
        sandbox: {
          sandboxId: input.manifest.sandbox.sandboxId,
          profile: input.manifest.sandbox.profile,
          providerFamily: input.manifest.sandbox.providerFamily,
          isolationLevel: input.manifest.sandbox.isolationLevel,
          filesystem: input.manifest.sandbox.filesystem,
          network: input.manifest.sandbox.network,
          shell: input.manifest.sandbox.shell,
          hostObserved: input.manifest.sandbox.profile === "host-observed",
          dependencyRefs: input.manifest.sandbox.dependencyRefs ?? [],
        },
        resourceLimits: input.manifest.sandbox.resourceLimits,
        publicSafe: true,
        events: ["runtime.execEngine.workspacePathContract.rejected"],
        metadata: {
          toolCallId: input.toolCallId,
          pathContractStatus: "rejected",
          reason: String(pathContract.error.reason ?? pathContract.error.code ?? ""),
        },
      },
    };
  }
  toolArguments = pathContract.args;
  const runtimeReadiness = evaluateBaseToolRuntimeReadiness({
    toolId: input.toolId,
    executor: input.executor,
    implementedPortPaths: listRuntimeBaseToolImplementedPortPaths(),
  });
  const filesystemAction = await inferFilesystemActionForTool({
    toolId: input.toolId,
    args: toolArguments,
    workspaceRoot: input.workspaceRoot,
  });
  const governance = evaluateBaseToolRuntimeGovernance({
    toolId: input.toolId,
    policyMatrix: input.manifest.toolPolicy,
    sandbox: input.manifest.sandbox,
    readiness: runtimeReadiness,
    catalogEntry: runtimeReadiness.entry,
    resourceLimits: input.manifest.sandbox.resourceLimits,
    metadata: {
      toolCallId: input.toolCallId,
      providerToolName: input.providerToolName ?? "",
      ...(filesystemAction === undefined ? {} : { filesystemAction }),
    },
  });
  input.events.push(...governance.events);

  if (governance.status === "deny") {
    const record: AgentToolCallRecord = {
      callId: input.toolCallId,
      toolId: input.toolId,
      arguments: toolArguments,
      ok: false,
      error: {
        code: "GOVERNANCE_REJECTED",
        message: runtimeReadiness.decision === "blocked" ? runtimeReadiness.reason : `BaseTool ${input.toolId} was denied by runtime governance`,
        publicSafe: true,
      },
    };
    const observation = createObservationMaterial({
      observationId: `${input.sessionId}:observation:${input.toolCallId}`,
      source: "baseTool",
      status: "failed",
      title: `BaseTool ${input.toolId}`,
      summary: "tool invocation denied by runtime governance",
      refs: [input.toolCallId, input.toolId],
      payload: record.error,
      metadata: metadataRecord({ toolCallId: input.toolCallId, toolId: input.toolId, governanceStatus: governance.status }),
    });
    return { record, observation, events: governance.events, governance };
  }

  if (governance.status === "requiresApproval") {
    const approval = await requestRuntimeApproval({
      runtimeId: input.runtimeId,
      sessionId: input.sessionId,
      approvalId: `${input.toolCallId}:approval`,
      source: "baseTool",
      reason: governance.approvalReason ?? `BaseTool ${input.toolId} requires approval`,
      requestedScopes: ["tool.execute", `tool.${input.toolId}`],
      riskLevel: governance.risk,
      resolver: input.approvalResolver,
      store: input.store,
      now: input.now,
      metadata: {
        toolCallId: input.toolCallId,
        toolId: input.toolId,
        policyMatrixId: governance.policyMatrixId,
      },
    });
    input.events.push(...approval.events);
    if (approval.status !== "approved") {
      const error = {
        code: "APPROVAL_REQUIRED",
        message: approval.reason ?? governance.approvalReason ?? `BaseTool ${input.toolId} requires approval`,
        publicSafe: true,
      };
      const record: AgentToolCallRecord = {
        callId: input.toolCallId,
        toolId: input.toolId,
        arguments: toolArguments,
        ok: false,
        error,
      };
      const observation = createObservationMaterial({
        observationId: `${input.sessionId}:observation:${input.toolCallId}:approval`,
        source: "baseTool",
        status: "waitingApproval",
        title: `BaseTool ${input.toolId}`,
        summary: error.message,
        refs: [input.toolCallId, input.toolId, approval.envelope.approvalId],
        payload: approval.envelope,
        metadata: metadataRecord({ toolCallId: input.toolCallId, toolId: input.toolId, governanceStatus: governance.status }),
      });
      return { record, observation, events: [...governance.events, ...approval.events], governance };
    }
    toolArguments = withApprovedRuntimePermissions(input.toolId, toolArguments);
  }

  let dependencyPreflight = await preflightBaseToolDependencies({
    executor: input.executor,
    implementedPortPaths: listRuntimeBaseToolImplementedPortPaths(),
    readiness: runtimeReadiness,
    catalogEntry: runtimeReadiness.entry,
    probes: input.dependencyRuntime?.probes,
    context: {
      runtimeId: input.runtimeId,
      sessionId: input.sessionId,
      invocationId: input.toolCallId,
      toolId: input.toolId,
      toolInput: toolArguments,
      governanceAccepted: true,
      allowedScopes: input.manifest.harness.policy.scopes,
      mode: input.dependencyRuntime?.mode ?? "observe",
      managedRoot: input.dependencyRuntime?.managedRoot,
      env: input.dependencyRuntime?.env,
      homeDir: input.dependencyRuntime?.homeDir,
      timeoutMs: input.dependencyRuntime?.timeoutMs,
    },
  });
  input.events.push(...dependencyPreflight.events);
  await input.store.appendEvent(event(input.sessionId, `event:tool:${input.toolCallId}:dependencies`, "runtime.baseTool.dependencies.preflight", input.now(), {
    toolId: input.toolId,
    dependencyPreflight,
  }));

  if (dependencyPreflight.decision === "requiresApproval") {
    const approval = await requestRuntimeApproval({
      runtimeId: input.runtimeId,
      sessionId: input.sessionId,
      approvalId: `${input.toolCallId}:dependency-approval`,
      source: "runtime",
      reason: dependencyPreflight.reason,
      requestedScopes: [
        "dependency.prepare",
        ...dependencyPreflight.approvalRequiredDependencies.map((dependencyId) => `dependency.${dependencyId}`),
      ],
      riskLevel: "risky",
      resolver: input.approvalResolver,
      store: input.store,
      now: input.now,
      metadata: {
        toolCallId: input.toolCallId,
        toolId: input.toolId,
        dependencyStatus: dependencyPreflight.status,
        installableDependencies: dependencyPreflight.installableDependencies,
      },
    });
    input.events.push(...approval.events);
    if (approval.status !== "approved") {
      const error = {
        code: "DEPENDENCY_APPROVAL_REQUIRED",
        message: approval.reason ?? dependencyPreflight.reason,
        publicSafe: true,
      };
      const record: AgentToolCallRecord = {
        callId: input.toolCallId,
        toolId: input.toolId,
        arguments: toolArguments,
        ok: false,
        error,
      };
      const observation = createObservationMaterial({
        observationId: `${input.sessionId}:observation:${input.toolCallId}:dependency-approval`,
        source: "baseTool",
        status: "waitingApproval",
        title: `BaseTool ${input.toolId}`,
        summary: error.message,
        refs: [input.toolCallId, input.toolId, approval.envelope.approvalId],
        payload: approval.envelope,
        metadata: metadataRecord({ toolCallId: input.toolCallId, toolId: input.toolId, dependencyStatus: dependencyPreflight.status }),
      });
      return { record, observation, events: [...governance.events, ...dependencyPreflight.events, ...approval.events], governance };
    }

    if (!dependencyModeCanPrepare(input.dependencyRuntime?.mode ?? "observe")) {
      const error = {
        code: "DEPENDENCY_PREPARE_PENDING",
        message: "dependency approval was granted, but automatic trusted managed installation is not enabled for this run",
        publicSafe: true,
      };
      const record: AgentToolCallRecord = {
        callId: input.toolCallId,
        toolId: input.toolId,
        arguments: toolArguments,
        ok: false,
        error,
      };
      const observation = createObservationMaterial({
        observationId: `${input.sessionId}:observation:${input.toolCallId}:dependency-prepare`,
        source: "baseTool",
        status: "waitingApproval",
        title: `BaseTool ${input.toolId}`,
        summary: error.message,
        refs: [input.toolCallId, input.toolId],
        payload: dependencyPreflight,
        metadata: metadataRecord({ toolCallId: input.toolCallId, toolId: input.toolId, dependencyStatus: dependencyPreflight.status }),
      });
      return { record, observation, events: [...governance.events, ...dependencyPreflight.events, ...approval.events], governance };
    }

    dependencyPreflight = await preflightBaseToolDependencies({
      executor: input.executor,
      implementedPortPaths: listRuntimeBaseToolImplementedPortPaths(),
      readiness: runtimeReadiness,
      catalogEntry: runtimeReadiness.entry,
      probes: input.dependencyRuntime?.probes,
      context: {
        runtimeId: input.runtimeId,
        sessionId: input.sessionId,
        invocationId: input.toolCallId,
        toolId: input.toolId,
        toolInput: toolArguments,
        governanceAccepted: true,
        allowedScopes: input.manifest.harness.policy.scopes,
        mode: "autoInstallTrustedManaged",
        managedRoot: input.dependencyRuntime?.managedRoot,
        env: input.dependencyRuntime?.env,
        homeDir: input.dependencyRuntime?.homeDir,
        timeoutMs: input.dependencyRuntime?.timeoutMs,
      },
    });
    input.events.push(...dependencyPreflight.events);
    await input.store.appendEvent(event(input.sessionId, `event:tool:${input.toolCallId}:dependencies:prepared`, "runtime.baseTool.dependencies.prepared", input.now(), {
      toolId: input.toolId,
      dependencyPreflight,
    }));
  }

  if (dependencyPreflight.decision === "blocked") {
    const record: AgentToolCallRecord = {
      callId: input.toolCallId,
      toolId: input.toolId,
      arguments: toolArguments,
      ok: false,
      error: {
        code: dependencyPreflight.status === "providerUnavailable" ? "PROVIDER_UNAVAILABLE" : "DEPENDENCY_UNAVAILABLE",
        message: dependencyPreflight.reason,
        publicSafe: true,
      },
    };
    const observation = createObservationMaterial({
      observationId: `${input.sessionId}:observation:${input.toolCallId}:dependency`,
      source: "baseTool",
      status: "failed",
      title: `BaseTool ${input.toolId}`,
      summary: dependencyPreflight.reason,
      refs: [input.toolCallId, input.toolId],
      payload: dependencyPreflight,
      metadata: metadataRecord({ toolCallId: input.toolCallId, toolId: input.toolId, dependencyStatus: dependencyPreflight.status }),
    });
    return { record, observation, events: [...governance.events, ...dependencyPreflight.events], governance };
  }

  const toolResult = await invokeMountedBaseTool({
    runtimeId: input.runtimeId,
    sessionId: input.sessionId,
    toolId: input.toolId,
    toolCallId: input.toolCallId,
    input: toolArguments,
    executor: input.executor,
    runtimeReady: true,
    readinessMode: "observe",
    implementedPortPaths: listRuntimeBaseToolImplementedPortPaths(),
    requestedScopes: ["tool.execute", `tool.${input.toolId}`],
    allowedScopes: [
      ...(input.manifest.harness.policy.scopes ?? []),
      "tool.execute",
      `tool.${input.toolId}`,
      input.toolId,
    ],
    governance: { accepted: input.allowToolExecution ?? input.manifest.harness.policy.allowToolExecution ?? true },
    contract: { accepted: true },
    metadata: {
      sandbox: governance.sandbox,
      governance: {
        status: governance.status,
        risk: governance.risk,
        policyProfile: governance.policyProfile,
        policyMatrixId: governance.policyMatrixId,
      },
      dependencyRuntime: {
        status: dependencyPreflight.status,
        decision: dependencyPreflight.decision,
        missingDependencies: dependencyPreflight.missingDependencies,
        installableDependencies: dependencyPreflight.installableDependencies,
      },
    },
  });
  input.events.push(...toolResult.events);
  const record: AgentToolCallRecord = {
    callId: input.toolCallId,
    toolId: input.toolId,
    arguments: toolArguments,
    ok: toolResult.ok && toolResult.toolResult.ok,
    output: toolResult.ok && toolResult.toolResult.ok
      ? outputWithWorkspacePathMetadata(toolResult.toolResult.output, pathContract.metadata)
      : undefined,
    error: toolResult.ok ? (toolResult.toolResult.ok ? undefined : toolResult.toolResult.error) : toolResult.error,
  };
  const observation = createObservationMaterial({
    observationId: `${input.sessionId}:observation:${input.toolCallId}`,
    source: "baseTool",
    status: record.ok ? "completed" : "failed",
    title: `BaseTool ${input.toolId}`,
    summary: record.ok ? "tool invocation completed" : "tool invocation failed",
    refs: [input.toolCallId, input.toolId],
    payload: record.ok ? record.output : record.error,
    ...(input.workspaceRoot === undefined ? {} : {
      artifactStore: {
        workspaceRoot: input.workspaceRoot,
        sessionId: input.sessionId,
      },
    }),
    metadata: metadataRecord({
      toolCallId: input.toolCallId,
      toolId: input.toolId,
      providerToolName: input.providerToolName ?? "",
      createdAt: input.now(),
    }),
  });
  return { record, observation, events: toolResult.events, governance };
}

async function executeEphemeralProcedure(input: {
  runtimeId: string;
  sessionId: string;
  manifest: AgentManifest;
  executor: BaseToolExecutorPort;
  plan: EphemeralProcedurePlan;
  workspaceRoot?: string;
  allowedRoots?: readonly string[];
  allowToolExecution?: boolean;
  store: RuntimeSessionStateEventStore;
  approvalResolver?: RuntimeApprovalResolver;
  dependencyRuntime?: NonNullable<PraxisRuntimeKernelOptions["baseToolDependencyRuntime"]>;
  onToolCallProgress?: (event: AgentToolCallProgressEvent) => void | Promise<void>;
  now: () => string;
  events: string[];
}): Promise<{
  ok: boolean;
  records: readonly AgentToolCallRecord[];
  observations: readonly RuntimeObservationMaterial[];
  error?: PraxisRuntimeKernelError;
}> {
  const shellWorkspaceWriteViolation = procedureShellWorkspaceWriteViolation(input.plan);
  if (shellWorkspaceWriteViolation !== undefined) {
    return {
      ok: false,
      records: [],
      observations: [createObservationMaterial({
        observationId: `${input.sessionId}:observation:${input.plan.procedureId}:${shellWorkspaceWriteViolation.step.stepId}:workspace-write-blocked`,
        source: "ephemeralProcedure",
        status: "failed",
        title: `EphemeralProcedure ${input.plan.procedureId} blocked`,
        summary: shellWorkspaceWriteViolation.message,
        refs: [input.plan.procedureId, shellWorkspaceWriteViolation.step.stepId, shellWorkspaceWriteViolation.step.baseToolId],
        payload: {
          procedureId: input.plan.procedureId,
          stepId: shellWorkspaceWriteViolation.step.stepId,
          baseToolId: shellWorkspaceWriteViolation.step.baseToolId,
          reason: shellWorkspaceWriteViolation.reason,
          recommendedTools: ["code.overwrite", "code.modify", "code.replaceFile"],
        },
        metadata: metadataRecord({
          procedureId: input.plan.procedureId,
          stepId: shellWorkspaceWriteViolation.step.stepId,
          baseToolId: shellWorkspaceWriteViolation.step.baseToolId,
          blockedBy: "shellWorkspaceWriteGuard",
        }),
      })],
      error: kernelError("PROCEDURE_INVOCATION_FAILED", shellWorkspaceWriteViolation.message, "tool"),
    };
  }

  if (input.plan.approval.required) {
    const approval = await requestRuntimeApproval({
      runtimeId: input.runtimeId,
      sessionId: input.sessionId,
      approvalId: `${input.plan.procedureId}:approval`,
      source: "ephemeralProcedure",
      reason: input.plan.approval.reason ?? `EphemeralProcedure ${input.plan.procedureId} requires approval`,
      requestedScopes: input.plan.requiredBaseTools.map((toolId) => `tool.${toolId}`),
      riskLevel: input.plan.riskLevel,
      resolver: input.approvalResolver,
      store: input.store,
      now: input.now,
      metadata: {
        procedureId: input.plan.procedureId,
        requiredBaseTools: input.plan.requiredBaseTools,
      },
    });
    input.events.push(...approval.events);
    if (approval.status === "approved") {
      // Approval was resolved by the application/test harness; execute the procedure below.
    } else {
    return {
      ok: false,
      records: [],
      observations: [createObservationMaterial({
        observationId: `${input.sessionId}:observation:${input.plan.procedureId}:approval`,
        source: "ephemeralProcedure",
        status: "waitingApproval",
        title: `EphemeralProcedure ${input.plan.procedureId}`,
        summary: approval.reason ?? input.plan.approval.reason ?? "procedure requires approval",
        refs: [input.plan.procedureId, approval.envelope.approvalId],
        payload: approval.envelope,
      })],
      error: kernelError("APPROVAL_REQUIRED", `procedure requires approval: ${input.plan.procedureId}`, "tool"),
    };
    }
  }

  const pending = new Map<string, EphemeralProcedureStep>(input.plan.steps.map((step) => [step.stepId, step]));
  const completed = new Set<string>();
  const records: AgentToolCallRecord[] = [];
  const observations: RuntimeObservationMaterial[] = [];

  while (pending.size > 0) {
    const ready = [...pending.values()].filter((step) => step.dependsOn.every((dependency) => completed.has(dependency)));
    if (ready.length === 0) {
      return {
        ok: false,
        records,
        observations,
        error: kernelError("PROCEDURE_INVOCATION_FAILED", `procedure has unresolved dependencies: ${input.plan.procedureId}`, "tool"),
      };
    }

    const wave = input.plan.executionMode === "serial" ? ready.slice(0, 1) : ready;
    const results = await Promise.all(wave.map(async (step) => {
      const toolCallId = `${input.plan.procedureId}:${step.stepId}`;
      await input.onToolCallProgress?.({
        phase: "started",
        callId: toolCallId,
        toolId: step.baseToolId,
        arguments: step.input,
      });
      const result = await executeBaseToolDecision({
        runtimeId: input.runtimeId,
        sessionId: input.sessionId,
        manifest: input.manifest,
        executor: input.executor,
        toolCallId,
        toolId: step.baseToolId,
        args: step.input,
        workspaceRoot: input.workspaceRoot,
        allowedRoots: input.allowedRoots,
        allowToolExecution: input.allowToolExecution,
        store: input.store,
        approvalResolver: input.approvalResolver,
        dependencyRuntime: input.dependencyRuntime,
        now: input.now,
        events: input.events,
      });
      await input.onToolCallProgress?.({
        phase: result.record.ok ? "completed" : "failed",
        record: result.record,
      });
      return { step, result };
    }));

    for (const { step, result } of results) {
      records.push(result.record);
      observations.push(createObservationMaterial({
        observationId: `${input.sessionId}:observation:${input.plan.procedureId}:${step.stepId}`,
        source: "ephemeralProcedure",
        status: result.record.ok ? "completed" : "failed",
        title: `EphemeralProcedure ${input.plan.procedureId} step ${step.stepId}`,
        summary: result.record.ok ? "procedure step completed" : "procedure step failed",
        refs: [input.plan.procedureId, step.stepId, result.record.callId],
        payload: result.record.ok ? result.record.output : result.record.error,
        metadata: metadataRecord({
          procedureId: input.plan.procedureId,
          stepId: step.stepId,
          baseToolId: step.baseToolId,
          outputRef: step.outputRef,
        }),
      }));
      pending.delete(step.stepId);
      if (!result.record.ok) {
        return {
          ok: false,
          records,
          observations,
          error: kernelError("PROCEDURE_INVOCATION_FAILED", `procedure step failed: ${step.stepId}`, "tool"),
        };
      }
      completed.add(step.stepId);
    }
  }

  return { ok: true, records, observations };
}

export class PraxisRuntimeKernel {
  readonly runtimeId?: string;
  readonly store: RuntimeSessionStateEventStore;
  private readonly storeProvided: boolean;

  constructor(options: { runtimeId?: string; store?: RuntimeSessionStateEventStore } = {}) {
    this.runtimeId = options.runtimeId;
    this.store = options.store ?? createInMemorySessionStateEventStore();
    this.storeProvided = options.store !== undefined;
  }

  async run(agent: PraxisAgentInput<PraxisAgent>, task: string, options: PraxisRuntimeKernelOptions = {}): Promise<AgentRunResult> {
    const compiled = compileAgent(agent);
    if (!compiled.ok) {
      return {
        ok: false,
        error: kernelError("MANIFEST_COMPILE_FAILED", compiled.error.message, "compile"),
        events: compiled.events,
      };
    }
    return await this.runManifest(compiled.manifest, task, options);
  }

  async runManifest(manifest: AgentManifest, task: string, options: PraxisRuntimeKernelOptions = {}): Promise<AgentRunResult> {
    const runtimeId = options.runtimeId ?? this.runtimeId ?? runtimeIdFor(manifest);
    const sessionId = options.sessionId ?? sessionIdFor(runtimeId, manifest);
    const now = options.now ?? defaultNow;
    const events: string[] = [];
    const storageRuntimeResult = createStoragePlaneRuntime({
      cwd: options.storage?.cwd,
      raxHome: options.storage?.raxHome,
      workspaceRoot: options.storage?.workspaceRoot ?? (manifest.storage.kind === "rax-workspace" ? manifest.storage.path : undefined),
      homeDir: options.storage?.homeDir,
      env: options.storage?.env,
      agentId: manifest.identity.id,
      initMode: options.storage?.initMode ?? manifest.storage.init,
    });
    if (!storageRuntimeResult.ok) {
      const error = kernelError("STORAGE_RESOLUTION_FAILED", storageRuntimeResult.error.message, "runtime-state");
      return {
        ok: false,
        runtimeId,
        sessionId,
        manifest,
        error,
        mainLoopSteps: [],
        events: storageRuntimeResult.events,
        state: { states: [], events: [], invocations: [], mainLoopSteps: [], procedures: [], approvals: [], errors: [] },
      };
    }
    const storageRuntime = storageRuntimeResult.runtime;
    events.push(...storageRuntimeResult.events);
    const toolWorkspaceRoot = path.resolve(manifest.harness.policy.workspaceRoot ?? options.sandbox?.cwd ?? options.storage?.cwd ?? process.cwd());
    const toolAllowedRoots = Array.from(new Set([
      toolWorkspaceRoot,
      storageRuntime.layout.workspace.root,
      ...(manifest.harness.policy.allowedRoots ?? []).map((root) => path.resolve(root)),
    ]));

    const shouldUseWorkspaceSqlite = options.store === undefined &&
      !this.storeProvided &&
      manifest.session.persistence === "sqlite" &&
      manifest.storage.kind !== "memory";
    if (shouldUseWorkspaceSqlite && storageRuntime.initMode === "on-run") {
      const init = await applyRaxStorageInitPlan(storageRuntime.initPlan);
      events.push(...init.events);
    }
    const sqliteStorePath = manifest.storage.kind === "sqlite" && manifest.storage.path !== undefined
      ? path.resolve(manifest.storage.path)
      : storageRuntime.layout.workspace.sessionSqlitePath;
    if (shouldUseWorkspaceSqlite && storageRuntime.initMode === "on-run" && manifest.storage.kind === "sqlite" && manifest.storage.path !== undefined) {
      await mkdir(path.dirname(sqliteStorePath), { recursive: true });
      events.push("runtime.storagePlane.sqlitePath.parentReady");
    }
    const store = shouldUseWorkspaceSqlite
      ? await createSqliteSessionStateEventStore(sqliteStorePath)
      : options.store ?? this.store;
    const modelCalls: AgentModelCallRecord[] = [];
    const toolCalls: AgentToolCallRecord[] = [];
    const mainLoopSteps: MainLoopStepRecord[] = [];
    const observations: RuntimeObservationMaterial[] = [];
    const sameTurnCodeReadCache = new Map<string, { callId: string; fullFileRead: boolean }>();
    const createdAt = now();

    await store.createSession({
      sessionId,
      runtimeId,
      agentId: manifest.identity.id,
      manifestHash: manifest.manifestHash,
      createdAt,
      status: "running",
      metadata: {
        manifestId: manifest.manifestId,
        storage: storageSessionMetadata(storageRuntime, sqliteStorePath),
      },
    });
    await store.appendState(state(sessionId, "state:received", "received", now()));
    await store.appendEvent(event(sessionId, "event:session.created", "runtime.session.created", now(), {
      agentId: manifest.identity.id,
      storageWorkspaceRef: storageRuntime.layout.refs.workspaceRef,
    }));

    const sandboxPrepared = await prepareKernelSandbox({
      manifest,
      runtimeId,
      sessionId,
      storageRuntime,
      options,
      store,
      now,
      events,
    });
    await recordMainLoopStep({
      store,
      sessionId,
      createdAt: now(),
      events,
      mainLoopSteps,
      step: createMainLoopStepRecord({
        sessionId,
        turnIndex: 0,
        stepIndex: 0,
        actionPrimitive: "sandboxPrepare",
        status: sandboxPrepared.ok ? "completed" : "failed",
        inputRefs: [manifest.sandbox.sandboxId],
        outputRefs: [sandboxPrepared.sandbox.providerFamily],
        error: sandboxPrepared.ok ? undefined : {
          code: sandboxPrepared.error.code,
          message: sandboxPrepared.error.message,
          boundary: "runtime-state",
          publicSafe: true,
        },
        now: now(),
        metadata: {
          providerFamily: sandboxPrepared.sandbox.providerFamily,
          profile: sandboxPrepared.sandbox.profile,
          probeStatus: sandboxPrepared.sandbox.probe.status,
          ready: sandboxPrepared.sandbox.ready,
        },
      }),
    });
    if (!sandboxPrepared.ok) {
      await recordKernelError({
        store,
        sessionId,
        errorId: "error:sandbox",
        error: sandboxPrepared.error,
        createdAt: now(),
        metadata: {
          sandbox: sandboxPrepared.sandbox,
        },
      });
      await store.updateSessionStatus(sessionId, "failed");
      const snapshot = await store.readSession(sessionId);
      return {
        ok: false,
        runtimeId,
        sessionId,
        manifest,
        error: sandboxPrepared.error,
        mainLoopSteps,
        events,
        state: snapshot,
      };
    }

    const input = receiveTextInput({
      runtimeId,
      sessionId,
      source: "user",
      text: task,
      runtimeReady: true,
      requestedScopes: ["agent.invoke"],
      allowedScopes: ["agent.invoke"],
      governance: { accepted: true },
    });
    events.push(...input.events);
    if (!input.ok) {
      const error = kernelError("TEXT_INPUT_REJECTED", input.error.message, "io");
      await recordKernelError({ store, sessionId, errorId: "error:input", error, createdAt: now() });
      await store.updateSessionStatus(sessionId, "failed");
      await recordMainLoopStep({
        store,
        sessionId,
        createdAt: now(),
        events,
        mainLoopSteps,
        step: createMainLoopStepRecord({
          sessionId,
          turnIndex: 0,
          stepIndex: 1,
          actionPrimitive: "receiveInput",
          status: "failed",
          inputRefs: ["runtime.input.text"],
          error: {
            code: input.error.code,
            message: input.error.message,
            boundary: "input",
            publicSafe: true,
          },
          now: now(),
        }),
      });
      const snapshot = await store.readSession(sessionId);
      return {
        ok: false,
        runtimeId,
        sessionId,
        manifest,
        error,
        mainLoopSteps,
        events,
        state: snapshot,
      };
    }
    await recordMainLoopStep({
      store,
      sessionId,
      createdAt: now(),
      events,
      mainLoopSteps,
      step: createMainLoopStepRecord({
        sessionId,
        turnIndex: 0,
        stepIndex: 1,
        actionPrimitive: "receiveInput",
        status: "completed",
        inputRefs: ["runtime.input.text"],
        outputRefs: ["runtime.input.normalized"],
        stateAfterRef: "state:received",
        now: now(),
      }),
    });

    const dryRun = options.dryRun !== false;
    const defaultBaseToolPolicy: RuntimeBaseToolExecutorPolicy = {
      workspaceRoot: toolWorkspaceRoot,
      allowedRoots: toolAllowedRoots,
      ...(manifest.harness.policy.workspaceRoot === undefined ? {} : { workspaceRoot: manifest.harness.policy.workspaceRoot }),
      ...(manifest.harness.policy.allowedRoots === undefined ? {} : { allowedRoots: manifest.harness.policy.allowedRoots }),
      allowShellExecution: manifest.harness.policy.allowToolExecution ?? options.allowToolExecution,
      allowGitExecution: manifest.harness.policy.allowToolExecution ?? options.allowToolExecution,
      allowProcessExecution: manifest.harness.policy.allowToolExecution ?? options.allowToolExecution,
      allowFilesystemWrite: manifest.harness.policy.allowToolExecution ?? options.allowToolExecution,
      allowFilesystemDelete: manifest.harness.policy.allowToolExecution ?? options.allowToolExecution,
      allowRipgrep: true,
      allowNetworkFetch: true,
      allowNetworkSearch: true,
      ...(options.baseToolPolicy ?? {}),
    };
    const executor = options.executor ?? createRuntimeBaseToolExecutorPort({
      runtimeId,
      sessionId,
      policy: defaultBaseToolPolicy,
      resourceLimits: options.baseToolResourceLimits,
      adapters: options.baseToolAdapters,
      sandbox: {
        ...sandboxPrepared.sandbox,
        policyProfile: manifest.toolPolicy.profile,
        mountPolicy: manifest.sandbox.mountPolicy,
        networkPolicy: manifest.sandbox.networkPolicy,
      },
      emitEvent: (runtimeEvent) => {
        events.push(runtimeEvent.type);
      },
    });

    const modelCaller = {
      kind: "application" as const,
      id: "praxis-runtime-kernel",
      sessionId,
    };

    const maxModelTurns = manifest.harness.loop.maxModelTurns ?? 2;
    const maxToolCalls = manifest.harness.loop.maxToolCalls ?? 4;
    const toolMappings = providerToolMappings(manifest);
    const providerFamily = providerToolSchemaFamilyForModel(manifest.model);
    let toolContextSelection: {
      families: string[];
      groups: string[];
      toolIds: string[];
    } = {
      families: normalizedSelection(options.toolContextSelection?.families),
      groups: normalizedSelection(options.toolContextSelection?.groups),
      toolIds: normalizedSelection(options.toolContextSelection?.toolIds),
    };
    const providerResponseOutputItems: Readonly<Record<string, unknown>>[] = [];
    let previousProviderResponse = options.previousProviderResponse;
    let toolContextHeatState: BaseToolContextHeatState = createBaseToolContextHeatState({
      agentId: manifest.identity.id,
      sessionId,
      usage: options.toolContextUsage,
      updatedAt: createdAt,
    });
    let previousModelCacheDebug: AgentModelCacheDebugRecord | undefined;

    type KernelPromptPackage = Extract<Awaited<ReturnType<typeof buildPromptPackAndLower>>, { ok: true }>;
    let runnerError: PraxisRuntimeKernelError | undefined;
    const runnerResult = await runMainLoopRunner<KernelPromptPackage, unknown>({
      maxModelTurns,
      maxToolCalls,
      prepareTurn: async (turn) => {
      await store.appendState(state(sessionId, `state:model:${turn + 1}`, "model", now(), { turn }));
      const stepBase = turn * 20 + 2;
      const prompt = await buildPromptPackAndLower({
        runtimeId,
        sessionId,
        manifest,
        task: input.input.normalizedText,
        turnIndex: turn,
        startStepIndex: stepBase,
        now: now(),
        modelCaller,
        toolMappings,
        observations,
        events,
        toolContextSelection,
        toolContextUsage: toolContextHeatState.usage,
      });
      toolContextSelection = { families: [], groups: [], toolIds: [] };
      events.push(...prompt.events);
      if (!prompt.ok) {
        await recordKernelError({ store, sessionId, errorId: `error:prompt:${turn + 1}`, error: prompt.error, createdAt: now() });
        await recordMainLoopStep({
          store,
          sessionId,
          createdAt: now(),
          events,
          mainLoopSteps,
          step: createMainLoopStepRecord({
            sessionId,
            turnIndex: turn,
            stepIndex: stepBase,
            actionPrimitive: "assemblePromptPack",
            status: "failed",
            inputRefs: ["runtime.input.normalized", ...observations.map((observation) => observation.observationId)],
            error: {
              code: prompt.error.code,
              message: prompt.error.message,
              boundary: "prompt",
              publicSafe: true,
            },
            now: now(),
          }),
        });
        return {
          ok: false,
          error: {
            code: prompt.error.code,
            message: prompt.error.message,
            boundary: "prompt",
            publicSafe: true,
          } satisfies MainLoopRunnerError,
          events: prompt.events,
        };
      }

      for (const turnStep of prompt.turnRecord.stepRecords) {
        await recordMainLoopStep({
          store,
          sessionId,
          createdAt: now(),
          events,
          mainLoopSteps,
          step: turnStep,
        });
      }
      await recordMainLoopStep({
        store,
        sessionId,
        createdAt: now(),
        events,
        mainLoopSteps,
        step: createMainLoopStepRecord({
          sessionId,
          turnIndex: turn,
          stepIndex: stepBase + 3,
          actionPrimitive: "lowerPrompt",
          status: "completed",
          inputRefs: [prompt.promptPackId],
          outputRefs: [prompt.loweredPrompt.loweringId],
          promptPackRef: prompt.promptPackId,
          loweredPromptRef: prompt.loweredPrompt.loweringId,
          now: now(),
          metadata: {
            materialRefs: prompt.loweredPrompt.materialRefs,
            targetCapability: prompt.loweredPrompt.target.capabilityId,
          },
        }),
      });

      return { prompt, events: prompt.events };
      },
      invokeModel: async (turn, prompt) => {
      const stepBase = turn * 20 + 2;
      const modelInvocationId = `${sessionId}:model:${turn + 1}`;
      const promptCacheKey = stablePromptCacheKey(manifest, sessionId);
      const promptSplit = splitPromptPackForProvider(prompt.promptPack);
      const providerToolResultHistory = providerToolResultHistoryFromObservations(observations);
      const toolResultInputs = providerToolResultHistory.results
        .map((result) => lowerProviderToolResult({ providerFamily, result }));
      const providerBodyCandidate = buildProviderBodyFromPromptPack(manifest, prompt.promptPack, prompt.providerToolBundle, prompt.providerToolBundle.mappings, {
        exposeProviderTools: options.exposeProviderTools,
        observations,
        previousProviderOutputItems: providerResponseOutputItems,
        promptCacheKey,
      });
      const candidateCacheDebug = buildPromptPackCacheDebug({
        promptPack: prompt.promptPack,
        providerBody: providerBodyCandidate,
        promptCacheKey,
        previousProviderOutputItems: providerResponseOutputItems,
        toolResultInputs,
        toolResultBudget: providerToolResultHistory.budget,
        promptSplit,
      });
      const previousProviderResponseId = options.allowPreviousResponseId === true &&
        manifest.model.endpointShape !== "chat_completions" &&
        manifest.model.provider !== "anthropic" &&
        previousProviderResponse !== undefined &&
        previousProviderResponse.stablePrefixHash === candidateCacheDebug.providerBody.cacheShape.stablePrefixHash
        ? previousProviderResponse.responseId
        : undefined;
      const providerBody = previousProviderResponseId === undefined
        ? providerBodyCandidate
        : buildProviderBodyFromPromptPack(manifest, prompt.promptPack, prompt.providerToolBundle, prompt.providerToolBundle.mappings, {
          exposeProviderTools: options.exposeProviderTools,
          observations,
          previousProviderOutputItems: providerResponseOutputItems,
          previousProviderResponseId,
          promptCacheKey,
        });
      const cacheDebug = previousProviderResponseId === undefined
        ? candidateCacheDebug
        : buildPromptPackCacheDebug({
          promptPack: prompt.promptPack,
          providerBody,
          promptCacheKey,
          previousProviderOutputItems: providerResponseOutputItems,
          toolResultInputs,
          toolResultBudget: providerToolResultHistory.budget,
          promptSplit,
        });
      await options.onModelCallProgress?.({
        phase: "started",
        invocationId: modelInvocationId,
        turnIndex: turn,
        provider: manifest.model.provider,
        carrierId: manifest.model.carrierId,
        model: manifest.model.model,
      });
      const modelResult = await invokeModelThroughRuntime({
        runtimeId,
        invocationId: modelInvocationId,
        caller: modelCaller,
        loweredPrompt: prompt.loweredPrompt,
        capability: modelInvocationCapabilityForModel(manifest.model),
        carrier: {
          carrierId: manifest.model.carrierId,
          provider: manifest.model.provider,
          endpointShape: manifest.model.endpointShape,
          baseURL: manifest.model.baseURL,
          metadata: manifest.model.metadata,
        },
        mode: "single",
        dryRun,
        allowProviderCall: options.allowProviderCall ?? manifest.harness.policy.allowProviderCall ?? !dryRun,
        auth: options.auth,
        providerCaller: options.providerCaller,
        openaiResponsesCaller: options.openaiResponsesCaller,
        openaiChatCompletionsCaller: options.openaiChatCompletionsCaller,
        anthropicMessagesCaller: options.anthropicMessagesCaller,
        providerBody,
        governance: { accepted: true },
        contract: { accepted: true },
        clientName: manifest.model.clientName,
        clientVersion: manifest.model.clientVersion,
      });
      const modelUsage = modelResult.ok && modelResult.usage
        ? {
          inputTokens: modelResult.usage.inputTokens,
          outputTokens: modelResult.usage.outputTokens,
          thinkingTokens: "reasoningTokens" in modelResult.usage ? modelResult.usage.reasoningTokens : undefined,
          totalTokens: modelResult.usage.totalTokens,
          cachedInputTokens: "cachedInputTokens" in modelResult.usage ? modelResult.usage.cachedInputTokens : undefined,
          source: modelResult.usage.source,
          estimated: modelResult.usage.estimated,
        }
        : undefined;
      const providerRouting = modelResult.ok
        ? providerRoutingDebug(providerResponseHeadersForKernel(modelResult.providerResult))
        : undefined;
      const providerResponseId = modelResult.ok ? extractOpenAIResponseId(modelResult.raw) : undefined;
      const observedCacheDebug = cacheDebugWithPreviousComparison(
        cacheDebugWithObservedUsage(cacheDebug, modelUsage),
        previousModelCacheDebug,
      );
      previousModelCacheDebug = observedCacheDebug;
      await options.onModelCallProgress?.({
        phase: modelResult.ok ? "completed" : "failed",
        invocationId: modelInvocationId,
        turnIndex: turn,
        provider: manifest.model.provider,
        carrierId: manifest.model.carrierId,
        model: manifest.model.model,
        ok: modelResult.ok,
        usage: modelUsage,
        providerRouting,
        cacheDebug: observedCacheDebug,
        providerResponseId,
        previousProviderResponseId,
        error: modelResult.ok
          ? undefined
          : kernelError("MODEL_INVOCATION_FAILED", modelResult.error.message, "model"),
      });
      events.push(...modelResult.events);
      modelCalls.push({
        invocationId: modelInvocationId,
        raw: modelResult.ok ? modelResult.raw : null,
        ok: modelResult.ok,
        usage: modelUsage,
        providerRouting,
        providerResponseId,
        previousProviderResponseId,
      });
      await store.appendInvocation(invocation(sessionId, modelInvocationId, "model", manifest.model.carrierId, modelResult.ok, now(), {
        turn,
        promptPackId: prompt.promptPackId,
        loweringId: prompt.loweredPrompt.loweringId,
      }));
      await recordMainLoopStep({
        store,
        sessionId,
        createdAt: now(),
        events,
        mainLoopSteps,
        step: createMainLoopStepRecord({
          sessionId,
          turnIndex: turn,
          stepIndex: stepBase + 4,
          actionPrimitive: "invokeModel",
          status: modelResult.ok ? "completed" : "failed",
          inputRefs: [prompt.loweredPrompt.loweringId],
          outputRefs: [modelInvocationId],
          modelCallId: modelInvocationId,
          promptPackRef: prompt.promptPackId,
          loweredPromptRef: prompt.loweredPrompt.loweringId,
          error: modelResult.ok ? undefined : {
            code: modelResult.error.code,
            message: modelResult.error.message,
            boundary: "model",
            publicSafe: true,
          },
          now: now(),
          metadata: { turn },
        }),
      });
      await recordHandoffPlan({
        store,
        sessionId,
        createdAt: now(),
        events,
        mainLoopSteps,
        turnIndex: turn,
        startStepIndex: stepBase + 20,
        tickKind: "model-only",
        promptPackRef: prompt.promptPackId,
        loweredPromptRef: prompt.loweredPrompt.loweringId,
        modelCallId: modelInvocationId,
        inputRefs: [prompt.promptPackId, prompt.loweredPrompt.loweringId],
        outputRefs: [modelInvocationId],
      });

      if (!modelResult.ok) {
        const error = kernelError("MODEL_INVOCATION_FAILED", modelResult.error.message, "model");
        runnerError = error;
        await recordKernelError({ store, sessionId, errorId: `error:model:${turn + 1}`, error, createdAt: now(), metadata: { modelInvocationId } });
        return {
          ok: false,
          modelCallId: modelInvocationId,
          error: {
            code: error.code,
            message: error.message,
            boundary: "model",
            publicSafe: true,
          },
          events: modelResult.events,
        };
      }

      providerResponseOutputItems.push(...extractProviderOutputItems(modelResult.raw, providerFamily));
      if (providerResponseId !== undefined) {
        previousProviderResponse = {
          responseId: providerResponseId,
          stablePrefixHash: observedCacheDebug.providerBody.cacheShape.stablePrefixHash,
        };
      }

      return {
        ok: true,
        modelCallId: modelInvocationId,
        raw: modelResult.raw,
        events: modelResult.events,
      };
      },
      interpretDecision: async (turn, model, prompt) => {
      const stepBase = turn * 20 + 2;
      const decisionResult = interpretModelDecision({
        raw: model.raw,
        sessionId,
        turnIndex: turn,
        providerFamily,
        providerToolMappings: toolMappings,
        providerRawRef: model.modelCallId,
      });
      events.push(...decisionResult.events);
      await recordMainLoopStep({
        store,
        sessionId,
        createdAt: now(),
        events,
        mainLoopSteps,
        step: createMainLoopStepRecord({
          sessionId,
          turnIndex: turn,
          stepIndex: stepBase + 5,
          actionPrimitive: "interpretModelDecision",
          status: decisionResult.ok ? "completed" : "failed",
          inputRefs: [model.modelCallId],
          outputRefs: decisionResult.ok ? decisionResult.decisions.map((decision) => decision.decisionId) : [],
          modelCallId: model.modelCallId,
          promptPackRef: prompt.promptPackId,
          error: decisionResult.ok ? undefined : {
            code: decisionResult.error.code,
            message: decisionResult.error.message,
            boundary: "model",
            publicSafe: true,
          },
          now: now(),
          metadata: {
            decisionKinds: decisionResult.ok ? decisionResult.decisions.map((decision) => decision.kind) : [],
          },
        }),
      });
      if (!decisionResult.ok) {
        const error = kernelError("MODEL_DECISION_FAILED", decisionResult.error.message, "model");
        runnerError = error;
        await recordKernelError({ store, sessionId, errorId: `error:modelDecision:${turn + 1}`, error, createdAt: now(), metadata: { modelInvocationId: model.modelCallId } });
        return {
          ok: false,
          error: {
            code: error.code,
            message: error.message,
            boundary: "model-decision",
            publicSafe: true,
          },
          events: decisionResult.events,
        };
      }

      return { ok: true, decisions: decisionResult.decisions, events: decisionResult.events };
      },
      acceptFinalOutput: async ({ turnIndex: turn, decisionIndex, decision }) => {
        const finalAcceptance = decideMainLoopFinalAcceptance({
          finalOutput: decision.finalOutput ?? "",
          fatalFailureRefs: runnerError === undefined ? [] : [runnerError.code],
        });
        await recordMainLoopStep({
          store,
          sessionId,
          createdAt: now(),
          events,
          mainLoopSteps,
          step: createMainLoopStepRecord({
            sessionId,
            turnIndex: turn,
            stepIndex: turn * 20 + 60 + decisionIndex,
            actionPrimitive: "adjudicateDecision",
            status: finalAcceptance.canBreak ? "completed" : "failed",
            inputRefs: [decision.decisionId],
            outputRefs: finalAcceptance.canBreak ? ["runtime.final.accepted"] : finalAcceptance.blockingRefs,
            error: finalAcceptance.canBreak ? undefined : {
              code: "FINAL_OUTPUT_REJECTED",
              message: finalAcceptance.reason,
              boundary: "output",
              publicSafe: true,
            },
            now: now(),
            metadata: {
              decisionKind: decision.kind,
              finalAcceptanceKind: finalAcceptance.kind,
              canBreak: finalAcceptance.canBreak,
            },
          }),
        });
        if (!finalAcceptance.canBreak) {
          return {
            ok: false,
            error: {
              code: "FINAL_OUTPUT_REJECTED",
              message: finalAcceptance.reason,
              boundary: "output",
              publicSafe: true,
            },
            events: ["agentCore.execution.mainLoop.runner.finalOutputRejected"],
          };
        }
        return {
          ok: true,
          finalOutput: finalAcceptance.finalOutput ?? "",
          events: ["agentCore.execution.mainLoop.runner.finalOutputAccepted"],
        };
      },
      handleContinue: async ({ turnIndex: turn, decisionIndex, decision }) => {
        const expansion = decision.toolContextExpansion;
        if (expansion === undefined) {
          return {
            ok: true,
            continueLoop: true,
            events: ["agentCore.execution.mainLoop.runner.continue"],
          };
        }

        if (expansion.targetKind === "family" && expansion.family !== undefined && !toolContextSelection.families.includes(expansion.family)) {
          toolContextSelection.families.push(expansion.family);
        }
        if (expansion.targetKind === "group" && expansion.family !== undefined && expansion.group !== undefined) {
          const groupId = `${expansion.family}/${expansion.group}`;
          if (!toolContextSelection.groups.includes(groupId)) toolContextSelection.groups.push(groupId);
        }
        if (expansion.targetKind === "tool" && expansion.toolId !== undefined && !toolContextSelection.toolIds.includes(expansion.toolId)) {
          toolContextSelection.toolIds.push(expansion.toolId);
        }

        const providerCallId = typeof decision.metadata.callId === "string" && decision.metadata.callId.trim().length > 0
          ? decision.metadata.callId.trim()
          : undefined;
        if (providerCallId !== undefined) {
          observations.push(createObservationMaterial({
            observationId: `${sessionId}:observation:${providerCallId}:tool-context-expanded`,
            source: "runtime",
            status: "completed",
            title: "BaseTool context expanded",
            summary: `Expanded ${expansion.targetKind} BaseTool context for the next turn.`,
            refs: [providerCallId, decision.decisionId],
            payload: {
              expanded: expansion,
              selection: {
                families: [...toolContextSelection.families],
                groups: [...toolContextSelection.groups],
                toolIds: [...toolContextSelection.toolIds],
              },
            },
            trustLevel: "runtimeFact",
            metadata: metadataRecord({
              toolCallId: providerCallId,
              toolId: "praxis_expand_tool_context",
              providerToolName: "praxis_expand_tool_context",
              observationStatus: "completed",
              runtimeDecision: "expandToolContext",
            }),
          }));
        }

        const stepBase = turn * 20 + 2;
        await recordMainLoopStep({
          store,
          sessionId,
          createdAt: now(),
          events,
          mainLoopSteps,
          step: createMainLoopStepRecord({
            sessionId,
            turnIndex: turn,
            stepIndex: stepBase + 6 + decisionIndex,
            actionPrimitive: "emitEvent",
            status: "completed",
            inputRefs: [decision.decisionId],
            outputRefs: [
              ...(expansion.family === undefined ? [] : [`baseToolContext.family:${expansion.family}`]),
              ...(expansion.group === undefined || expansion.family === undefined ? [] : [`baseToolContext.group:${expansion.family}/${expansion.group}`]),
              ...(expansion.toolId === undefined ? [] : [`baseToolContext.tool:${expansion.toolId}`]),
            ],
            now: now(),
            metadata: {
              runtimeDecision: "expandToolContext",
              expansion,
              reason: expansion.reason ?? "model requested folded BaseTool documentation",
              selection: {
                families: [...toolContextSelection.families],
                groups: [...toolContextSelection.groups],
                toolIds: [...toolContextSelection.toolIds],
              },
            },
          }),
        });

        return {
          ok: true,
          continueLoop: true,
          events: ["agentCore.execution.mainLoop.runner.expandToolContext"],
        };
      },
      handleFailure: async ({ turnIndex: turn, decisionIndex, decision }) => {
          const stepBase = turn * 20 + 2;
          const error = kernelError("MODEL_DECISION_FAILED", decision.failure?.message ?? "model decision requested failure", "model");
          runnerError = error;
          await recordMainLoopStep({
            store,
            sessionId,
            createdAt: now(),
            events,
            mainLoopSteps,
            step: createMainLoopStepRecord({
              sessionId,
              turnIndex: turn,
              stepIndex: stepBase + 6 + decisionIndex,
              actionPrimitive: "fail",
              status: "failed",
              inputRefs: [decision.decisionId],
              error: {
                code: decision.failure?.code ?? "MODEL_DECISION_FAILED",
                message: decision.failure?.message ?? "model decision requested failure",
                boundary: "model",
                publicSafe: true,
              },
              now: now(),
            }),
          });
          await recordKernelError({
            store,
            sessionId,
            errorId: `error:modelDecisionFail:${turn + 1}:${decisionIndex}`,
            error,
            createdAt: now(),
            metadata: {
              decisionId: decision.decisionId,
              providerRawRef: decision.metadata.providerRawRef,
            },
          });
          return {
            ok: false,
            error: {
              code: error.code,
              message: error.message,
              boundary: "model-decision",
              publicSafe: true,
            },
            events: ["agentCore.execution.mainLoop.runner.fail"],
          };
      },
      handleApproval: async ({ turnIndex: turn, decisionIndex, decision }) => {
          const stepBase = turn * 20 + 2;
          const approval = await requestRuntimeApproval({
            runtimeId,
            sessionId,
            approvalId: `${decision.decisionId}:approval`,
            source: "model",
            reason: decision.approvalRequest?.reason ?? "model requested approval",
            requestedScopes: decision.approvalRequest?.requestedScopes ?? [],
            riskLevel: decision.approvalRequest?.riskLevel,
            resolver: options.approvalResolver,
            store,
            now,
            metadata: {
              decisionId: decision.decisionId,
              modelCallId: `${sessionId}:model:${turn + 1}`,
            },
          });
          events.push(...approval.events);
          await recordHandoffPlan({
            store,
            sessionId,
            createdAt: now(),
            events,
            mainLoopSteps,
            turnIndex: turn,
            startStepIndex: stepBase + 30 + decisionIndex * 10,
            tickKind: "approval-wait",
            inputRefs: [decision.decisionId],
            outputRefs: [approval.envelope.approvalId],
          });
          await recordMainLoopStep({
            store,
            sessionId,
            createdAt: now(),
            events,
            mainLoopSteps,
            step: createMainLoopStepRecord({
              sessionId,
              turnIndex: turn,
              stepIndex: stepBase + 6 + decisionIndex,
              actionPrimitive: "requestApproval",
              status: "waitingApproval",
              inputRefs: [decision.decisionId],
              outputRefs: decision.approvalRequest?.requestedScopes ?? [],
              now: now(),
              metadata: {
                reason: decision.approvalRequest?.reason ?? "model requested approval",
                riskLevel: decision.approvalRequest?.riskLevel ?? "unknown",
                approvalId: approval.envelope.approvalId,
                approvalStatus: approval.status,
              },
            }),
          });
          if (approval.status === "approved") {
            const providerCallId = typeof decision.metadata.callId === "string" && decision.metadata.callId.trim().length > 0
              ? decision.metadata.callId.trim()
              : undefined;
            if (providerCallId !== undefined) {
              observations.push(createObservationMaterial({
                observationId: `${sessionId}:observation:${providerCallId}:approval`,
                source: "runtime",
                status: "completed",
                title: "Runtime approval resolved",
                summary: approval.reason ?? "model approval request was approved",
                refs: [providerCallId, decision.decisionId, approval.envelope.approvalId],
                payload: {
                  status: approval.status,
                  reason: approval.reason,
                  approvalId: approval.envelope.approvalId,
                  requestedScopes: approval.envelope.requestedScopes,
                  riskLevel: approval.envelope.riskLevel,
                },
                trustLevel: "runtimeFact",
                metadata: metadataRecord({
                  toolCallId: providerCallId,
                  toolId: "praxis.request.approval",
                  providerToolName: "praxis_request_approval",
                  observationStatus: "completed",
                  runtimeDecision: "requestApproval",
                  approvalId: approval.envelope.approvalId,
                  approvalStatus: approval.status,
                }),
              }));
            }
            return { ok: true, continueLoop: true, events: approval.events };
          }
          const error = kernelError("APPROVAL_REQUIRED", decision.approvalRequest?.reason ?? "model requested approval", "tool");
          runnerError = error;
          await recordKernelError({
            store,
            sessionId,
            errorId: `error:approval:${approval.envelope.approvalId}`,
            error,
            createdAt: now(),
            metadata: {
              approvalId: approval.envelope.approvalId,
              approvalStatus: approval.status,
              decisionId: decision.decisionId,
            },
          });
          return {
            ok: false,
            error: {
              code: error.code,
              message: error.message,
              boundary: "approval",
              publicSafe: true,
            },
            events: approval.events,
          };
      },
      handleToolCall: async ({ turnIndex: turn, decisionIndex, decision }) => {
          const stepBase = turn * 20 + 2;
          if (decision.toolCall === undefined) {
            return {
              ok: false,
              error: {
                code: "MISSING_TOOL_CALL",
                message: "toolCall decision is missing tool call payload",
                boundary: "tool",
                publicSafe: true,
              },
              events: ["agentCore.execution.mainLoop.runner.toolCallRejected"],
            };
          }
          const preambleText = decision.preambleText?.trim();
          if (preambleText) {
            await options.onTextDelta?.(preambleText, {
              source: "model_tool_preamble",
              decisionId: decision.decisionId,
              toolCallId: decision.toolCall.callId,
              toolId: decision.toolCall.toolId,
            });
          }
          await recordHandoffPlan({
            store,
            sessionId,
            createdAt: now(),
            events,
            mainLoopSteps,
            turnIndex: turn,
            startStepIndex: stepBase + 40 + decisionIndex * 10,
            tickKind: "tool-call",
            toolCallId: decision.toolCall.callId,
            inputRefs: [decision.decisionId],
          });
          await store.appendState(state(sessionId, `state:tool:${decision.toolCall.callId}`, "tool", now(), {
            toolId: decision.toolCall.toolId,
            providerToolName: decision.toolCall.providerToolName,
          }));
          await options.onToolCallProgress?.({
            phase: "started",
            callId: decision.toolCall.callId,
            toolId: decision.toolCall.toolId,
            providerToolName: decision.toolCall.providerToolName,
            arguments: decision.toolCall.arguments,
          });
          const readCacheKey = codeReadCacheKey(decision.toolCall.toolId, decision.toolCall.arguments);
          const cachedRead = readCacheKey === undefined ? undefined : sameTurnCodeReadCache.get(readCacheKey);
          if (cachedRead?.fullFileRead === true) {
            const reused = duplicateCodeReadRecord({
              sessionId,
              toolCallId: decision.toolCall.callId,
              toolId: decision.toolCall.toolId,
              providerToolName: decision.toolCall.providerToolName,
              args: decision.toolCall.arguments,
              previousCallId: cachedRead.callId,
              now: now(),
            });
            await options.onToolCallProgress?.({
              phase: "completed",
              providerToolName: decision.toolCall.providerToolName,
              record: reused.record,
            });
            toolCalls.push(reused.record);
            observations.push(reused.observation);
            await store.appendInvocation(invocation(sessionId, reused.record.callId, "tool", reused.record.toolId, true, now(), {
              ok: true,
              decisionId: decision.decisionId,
              duplicateOfToolCallId: cachedRead.callId,
            }));
            await recordMainLoopStep({
              store,
              sessionId,
              createdAt: now(),
              events,
              mainLoopSteps,
              step: createMainLoopStepRecord({
                sessionId,
                turnIndex: turn,
                stepIndex: stepBase + 6 + decisionIndex,
                actionPrimitive: "invokeBaseTool",
                status: "completed",
                inputRefs: [decision.decisionId],
                outputRefs: [reused.record.callId],
                toolCallId: reused.record.callId,
                observationRefs: [reused.observation.observationId],
                now: now(),
                metadata: {
                  toolId: reused.record.toolId,
                  providerToolName: decision.toolCall.providerToolName ?? "",
                  duplicateObservationReuse: true,
                  duplicateOfToolCallId: cachedRead.callId,
                },
              }),
            });
            return { ok: true, continueLoop: true, events: ["runtime.baseTool.codeRead.duplicateObservationReused"] };
          }
          const executed = await executeBaseToolDecision({
            runtimeId,
            sessionId,
            manifest,
            executor,
            toolCallId: decision.toolCall.callId,
            toolId: decision.toolCall.toolId,
            providerToolName: decision.toolCall.providerToolName,
            args: decision.toolCall.arguments,
            workspaceRoot: toolWorkspaceRoot,
            allowedRoots: toolAllowedRoots,
            allowToolExecution: options.allowToolExecution,
            store,
            approvalResolver: options.approvalResolver,
            dependencyRuntime: options.baseToolDependencyRuntime,
            now,
            events,
          });
          await options.onToolCallProgress?.({
            phase: executed.record.ok ? "completed" : "failed",
            providerToolName: decision.toolCall.providerToolName,
            record: executed.record,
          });
          toolCalls.push(executed.record);
          observations.push(executed.observation);
          if (isCodeMutationTool(executed.record.toolId)) {
            sameTurnCodeReadCache.clear();
          } else if (readCacheKey !== undefined && executed.record.ok) {
            const output = isRecord(executed.record.output) ? executed.record.output : undefined;
            const truncated = output?.truncated === true;
            sameTurnCodeReadCache.set(readCacheKey, {
              callId: executed.record.callId,
              fullFileRead: !codeReadHasRange(executed.record.arguments) && !truncated,
            });
          }
          toolContextHeatState = applyBaseToolContextUsage(
            toolContextHeatState,
            [{ toolId: executed.record.toolId }],
            now(),
          );
          await store.appendState(state(sessionId, `state:toolContextHeat:${executed.record.callId}`, "toolContextHeat", now(), {
            agentId: toolContextHeatState.agentId,
            usage: toolContextHeatState.usage,
          }));
          await store.appendInvocation(invocation(sessionId, executed.record.callId, "tool", executed.record.toolId, executed.record.ok, now(), {
            ok: executed.record.ok,
            decisionId: decision.decisionId,
          }));
          await recordMainLoopStep({
            store,
            sessionId,
            createdAt: now(),
            events,
            mainLoopSteps,
            step: createMainLoopStepRecord({
              sessionId,
              turnIndex: turn,
              stepIndex: stepBase + 6 + decisionIndex,
              actionPrimitive: "invokeBaseTool",
              status: executed.record.ok ? "completed" : (isRecord(executed.record.error) && executed.record.error.code === "APPROVAL_REQUIRED" ? "waitingApproval" : "failed"),
              inputRefs: [decision.decisionId],
              outputRefs: [executed.record.callId],
              toolCallId: executed.record.callId,
              observationRefs: [executed.observation.observationId],
              error: executed.record.ok ? undefined : {
                code: "TOOL_INVOCATION_FAILED",
                message: `tool invocation failed: ${executed.record.toolId}`,
                boundary: "tool",
                publicSafe: true,
              },
              now: now(),
              metadata: {
                toolId: executed.record.toolId,
                providerToolName: decision.toolCall.providerToolName ?? "",
              },
            }),
          });

          if (!executed.record.ok) {
            const approvalRequired = isRecord(executed.record.error) && executed.record.error.code === "APPROVAL_REQUIRED";
            const error = approvalRequired
              ? kernelError("APPROVAL_REQUIRED", `tool invocation requires approval: ${executed.record.toolId}`, "tool")
              : kernelError("TOOL_INVOCATION_FAILED", `tool invocation failed: ${executed.record.toolId}`, "tool");
            await recordKernelError({
              store,
              sessionId,
              errorId: `error:tool:${executed.record.callId}`,
              error,
              createdAt: now(),
              metadata: {
                toolCallId: executed.record.callId,
                toolId: executed.record.toolId,
                approvalRequired,
              },
            });
            if (!approvalRequired) {
              return {
                ok: true,
                continueLoop: true,
                events: [...executed.events, "agentCore.execution.mainLoop.runner.toolFailureObservation"],
              };
            }
            runnerError = error;
            return {
              ok: false,
              error: {
                code: error.code,
                message: error.message,
                boundary: approvalRequired ? "approval" : "tool",
                publicSafe: true,
              },
              events: executed.events,
            };
          }
          return { ok: true, continueLoop: true, events: executed.events };
      },
      handleEphemeralProcedure: async ({ turnIndex: turn, decisionIndex, decision }) => {
          const stepBase = turn * 20 + 2;
          if (decision.ephemeralProcedurePlan === undefined) {
            return {
              ok: false,
              error: {
                code: "MISSING_EPHEMERAL_PROCEDURE_PLAN",
                message: "ephemeralProcedurePlan decision is missing a procedure plan",
                boundary: "procedure",
                publicSafe: true,
              },
              events: ["agentCore.execution.mainLoop.runner.procedureRejected"],
            };
          }
          const procedureCreatedAt = now();
          await recordHandoffPlan({
            store,
            sessionId,
            createdAt: procedureCreatedAt,
            events,
            mainLoopSteps,
            turnIndex: turn,
            startStepIndex: stepBase + 50 + decisionIndex * 10,
            tickKind: "ephemeral-procedure",
            procedureId: decision.ephemeralProcedurePlan.procedureId,
            inputRefs: [decision.decisionId],
          });
          await store.appendProcedure({
            sessionId,
            procedureId: decision.ephemeralProcedurePlan.procedureId,
            status: decision.ephemeralProcedurePlan.approval.required ? "waitingApproval" : "running",
            createdAt: procedureCreatedAt,
            summary: {
              decisionId: decision.decisionId,
              executionMode: decision.ephemeralProcedurePlan.executionMode,
              requiredBaseTools: decision.ephemeralProcedurePlan.requiredBaseTools,
              riskLevel: decision.ephemeralProcedurePlan.riskLevel,
            },
          });
          await store.appendInvocation(invocation(sessionId, decision.ephemeralProcedurePlan.procedureId, "procedure", decision.ephemeralProcedurePlan.purpose, true, now(), {
            decisionId: decision.decisionId,
            status: "planned",
          }));
          const procedureResult = await executeEphemeralProcedure({
            runtimeId,
            sessionId,
            manifest,
            executor,
            plan: decision.ephemeralProcedurePlan,
            workspaceRoot: toolWorkspaceRoot,
            allowedRoots: toolAllowedRoots,
            allowToolExecution: options.allowToolExecution,
            store,
            approvalResolver: options.approvalResolver,
            dependencyRuntime: options.baseToolDependencyRuntime,
            onToolCallProgress: options.onToolCallProgress,
            now,
            events,
          });
          await store.appendProcedure({
            sessionId,
            procedureId: decision.ephemeralProcedurePlan.procedureId,
            status: procedureResult.ok ? "completed" : (procedureResult.error?.code === "APPROVAL_REQUIRED" ? "waitingApproval" : "failed"),
            createdAt: procedureCreatedAt,
            updatedAt: now(),
            summary: {
              decisionId: decision.decisionId,
              executionMode: decision.ephemeralProcedurePlan.executionMode,
              requiredBaseTools: decision.ephemeralProcedurePlan.requiredBaseTools,
              recordCount: procedureResult.records.length,
              observationCount: procedureResult.observations.length,
              errorCode: procedureResult.error?.code,
            },
          });
          toolCalls.push(...procedureResult.records);
          observations.push(...procedureResult.observations);
          const providerCallId = typeof decision.metadata.callId === "string" && decision.metadata.callId.trim().length > 0
            ? decision.metadata.callId.trim()
            : undefined;
          if (providerCallId !== undefined) {
            observations.push(createObservationMaterial({
              observationId: `${sessionId}:observation:${providerCallId}:ephemeral-procedure`,
              source: "ephemeralProcedure",
              status: procedureResult.ok ? "completed" : (procedureResult.error?.code === "APPROVAL_REQUIRED" ? "waitingApproval" : "failed"),
              title: `EphemeralProcedure ${decision.ephemeralProcedurePlan.procedureId}`,
              summary: procedureResult.ok
                ? "ephemeral procedure completed"
                : procedureResult.error?.message ?? "ephemeral procedure failed",
              refs: [providerCallId, decision.decisionId, decision.ephemeralProcedurePlan.procedureId],
              payload: {
                ok: procedureResult.ok,
                procedureId: decision.ephemeralProcedurePlan.procedureId,
                recordCount: procedureResult.records.length,
                observationCount: procedureResult.observations.length,
                error: procedureResult.error,
              },
              metadata: metadataRecord({
                toolCallId: providerCallId,
                toolId: "praxis_ephemeral_procedure",
                providerToolName: "praxis_ephemeral_procedure",
                observationStatus: procedureResult.ok ? "completed" : "failed",
                procedureId: decision.ephemeralProcedurePlan.procedureId,
              }),
            }));
          }
          if (procedureResult.records.length > 0) {
            toolContextHeatState = applyBaseToolContextUsage(
              toolContextHeatState,
              procedureResult.records.map((record) => ({ toolId: record.toolId })),
              now(),
            );
            await store.appendState(state(sessionId, `state:toolContextHeat:${decision.ephemeralProcedurePlan.procedureId}`, "toolContextHeat", now(), {
              agentId: toolContextHeatState.agentId,
              procedureId: decision.ephemeralProcedurePlan.procedureId,
              usage: toolContextHeatState.usage,
            }));
          }
          for (const record of procedureResult.records) {
            await store.appendInvocation(invocation(sessionId, record.callId, "tool", record.toolId, record.ok, now(), {
              ok: record.ok,
              procedureId: decision.ephemeralProcedurePlan.procedureId,
              decisionId: decision.decisionId,
            }));
          }
          await recordMainLoopStep({
            store,
            sessionId,
            createdAt: now(),
            events,
            mainLoopSteps,
            step: createMainLoopStepRecord({
              sessionId,
              turnIndex: turn,
              stepIndex: stepBase + 6 + decisionIndex,
              actionPrimitive: "executeEphemeralProcedure",
              status: procedureResult.ok ? "completed" : (procedureResult.error?.code === "APPROVAL_REQUIRED" ? "waitingApproval" : "failed"),
              inputRefs: [decision.decisionId],
              outputRefs: procedureResult.records.map((record) => record.callId),
              procedureId: decision.ephemeralProcedurePlan.procedureId,
              observationRefs: procedureResult.observations.map((observation) => observation.observationId),
              error: procedureResult.ok || procedureResult.error === undefined ? undefined : {
                code: procedureResult.error.code,
                message: procedureResult.error.message,
                boundary: "procedure",
                publicSafe: true,
              },
              now: now(),
              metadata: {
                executionMode: decision.ephemeralProcedurePlan.executionMode,
                requiredBaseTools: decision.ephemeralProcedurePlan.requiredBaseTools,
              },
            }),
          });

          if (!procedureResult.ok) {
            const error = procedureResult.error ?? kernelError("PROCEDURE_INVOCATION_FAILED", "procedure invocation failed", "tool");
            await recordKernelError({
              store,
              sessionId,
              errorId: `error:procedure:${decision.ephemeralProcedurePlan.procedureId}`,
              error,
              createdAt: now(),
              metadata: {
                procedureId: decision.ephemeralProcedurePlan.procedureId,
                decisionId: decision.decisionId,
                approvalRequired: error.code === "APPROVAL_REQUIRED",
              },
            });
            if (error.code !== "APPROVAL_REQUIRED") {
              return {
                ok: true,
                continueLoop: true,
                events: ["agentCore.execution.mainLoop.runner.procedureFailureObservation"],
              };
            }
            runnerError = error;
            return {
              ok: false,
              error: {
                code: error.code,
                message: error.message,
                boundary: error.code === "APPROVAL_REQUIRED" ? "approval" : "procedure",
                publicSafe: true,
              },
              events: [],
            };
          }
          return { ok: true, continueLoop: true, events: [] };
      },
      onModelDryRun: async () => ({
        ok: true,
        finalOutput: "PraxisRuntimeKernel dry-run completed.",
        events: ["agentCore.execution.mainLoop.runner.dryRunFinal"],
      }),
      onNoFinalOutput: async (input) => ({
        ok: true,
        finalOutput: input.reason === "tool_call_limit"
          ? "PraxisRuntimeKernel reached the tool call limit before a final answer."
          : input.reason === "no_continuation"
            ? "PraxisRuntimeKernel stopped without a final answer."
            : "PraxisRuntimeKernel reached the model turn limit before a final answer.",
        events: [`agentCore.execution.mainLoop.runner.noFinalOutput.${input.reason}`],
      }),
    });

    events.push(...runnerResult.events);
    if (!runnerResult.ok) {
      const fallbackCode: PraxisRuntimeKernelErrorCode =
        runnerResult.error.boundary === "prompt"
          ? "PROMPT_PACK_FAILED"
          : runnerResult.error.boundary === "model" || runnerResult.error.boundary === "model-decision"
            ? "MODEL_DECISION_FAILED"
            : runnerResult.error.boundary === "tool"
              ? "TOOL_INVOCATION_FAILED"
              : runnerResult.error.boundary === "procedure"
                ? "PROCEDURE_INVOCATION_FAILED"
                : runnerResult.error.boundary === "approval"
                  ? "APPROVAL_REQUIRED"
                  : "TEXT_OUTPUT_REJECTED";
      const fallbackBoundary: PraxisRuntimeKernelError["boundary"] =
        runnerResult.error.boundary === "model" || runnerResult.error.boundary === "model-decision"
          ? "model"
          : runnerResult.error.boundary === "tool" || runnerResult.error.boundary === "procedure" || runnerResult.error.boundary === "approval"
            ? "tool"
            : runnerResult.error.boundary === "output"
              ? "io"
              : "runtime-state";
      const error = runnerError ?? kernelError(fallbackCode, runnerResult.error.message, fallbackBoundary);
      await store.updateSessionStatus(sessionId, error.code === "APPROVAL_REQUIRED" ? "waitingApproval" : "failed");
      const snapshot = await store.readSession(sessionId);
      return {
        ok: false,
        runtimeId,
        sessionId,
        manifest,
        error,
        mainLoopSteps,
        events,
        state: snapshot,
      };
    }

    const finalOutput = runnerResult.finalOutput;

    const output = exposeTextOutput({
      outputId: `${sessionId}:output:final`,
      runtimeId,
      sessionId,
      source: "model",
      stage: "final",
      text: finalOutput,
      governance: { accepted: true },
      contract: { accepted: true },
    });
    events.push(...output.events);
    const outputStepIndex = Math.max(
      0,
      ...mainLoopSteps.map((step) => step.stepIndex),
    ) + 1;
    if (!output.ok) {
      const error = kernelError("TEXT_OUTPUT_REJECTED", output.error.message, "io");
      await store.updateSessionStatus(sessionId, "failed");
      await recordMainLoopStep({
        store,
        sessionId,
        createdAt: now(),
        events,
        mainLoopSteps,
        step: createMainLoopStepRecord({
          sessionId,
          turnIndex: maxModelTurns,
          stepIndex: outputStepIndex,
          actionPrimitive: "exposeOutput",
          status: "failed",
          inputRefs: ["runtime.output.final"],
          error: {
            code: output.error.code,
            message: output.error.message,
            boundary: "output",
            publicSafe: true,
          },
          now: now(),
        }),
      });
      await recordKernelError({
        store,
        sessionId,
        errorId: "error:output:final",
        error,
        createdAt: now(),
        metadata: { outputId: `${sessionId}:output:final` },
      });
      const snapshot = await store.readSession(sessionId);
      return {
        ok: false,
        runtimeId,
        sessionId,
        manifest,
        error,
        mainLoopSteps,
        events,
        state: snapshot,
      };
    }
    await recordMainLoopStep({
      store,
      sessionId,
      createdAt: now(),
      events,
      mainLoopSteps,
      step: createMainLoopStepRecord({
          sessionId,
          turnIndex: maxModelTurns,
          stepIndex: outputStepIndex,
          actionPrimitive: "exposeOutput",
        status: "completed",
        inputRefs: ["runtime.output.final"],
        outputRefs: [output.exposed.outputId],
        now: now(),
      }),
    });

    await store.appendEvent(event(sessionId, "event:output.final", "runtime.output.final", now(), {
      outputId: output.exposed.outputId,
    }));
    await store.appendState(state(sessionId, "state:completed", "completed", now()));
    await store.updateSessionStatus(sessionId, "completed");

    return {
      ok: true,
      runtimeId,
      sessionId,
      manifest,
      finalOutput,
      modelCalls,
      toolCalls,
      mainLoopSteps,
      events,
      state: await store.readSession(sessionId),
    };
  }
}

export function createPraxisRuntimeKernel(options: { runtimeId?: string; store?: RuntimeSessionStateEventStore } = {}): PraxisRuntimeKernel {
  return new PraxisRuntimeKernel(options);
}
