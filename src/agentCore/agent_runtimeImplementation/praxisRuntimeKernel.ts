/*
 * 文件定位：Agent 运行态实现层 / PraxisRuntimeKernel。
 * 核心目的：执行已编译 AgentManifest，把 text IO、codex responses、BaseTool mount 和 session/event 记录串成第一条可用 agent 链。
 * 能力要求1：runtime 执行 manifest，不直接执行 Agent class 内部逻辑，run(agent) 只作为 compile 后的语法糖。
 * 能力要求2：支持 codex_responses 模型调用、一次工具调用回填、BaseToolExecutorPort 注入和最小 session/state/event 记录。
 * 边界：不设计 promptPack 终局语义，不加厚 mainLoop/coreLogic 动作原语，不吞并 baseTool storage 语义。
 * 对接：需要服务 OAO compile、runtime.modelAdapter、runtime.execEngine、IOTransceiver 和后续 inspection/debug。
 * 实现提示：先提供可测试纵向闭环，再由用户监督 promptPack 与 mainLoop/coreLogic 的正式设计。
 */

import type { AuthEnvelope } from "../agent_modelAdapter/authProfileLayer/authEnvelope.js";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import type { OpenAIV1ResponsesProviderCaller } from "../agent_modelAdapter/actualInvocationLayer/openai/v1_responses.js";
import {
  createProviderToolMappings,
  lowerProviderToolResult,
  lowerPraxisToolsForProvider,
  providerToolName,
  type ProviderToolDeclarationBundle,
  type ProviderToolResultEnvelope,
  type ProviderToolNameMapping,
} from "../agent_modelAdapter/bridgingLayer/toolSchemaCompatibilityLayer.js";
import type { BaseToolExecutorPort } from "../agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { receiveTextInput } from "../agent_executionEngine/IOTransceiver/inputReceiver/textReceiver.js";
import { exposeTextOutput } from "../agent_executionEngine/IOTransceiver/outputExposer/textExposer.js";
import {
  createMainLoopStepRecord,
  decideMainLoopFinalAcceptance,
  planFrameworkMainLoopHandoff,
  runMainLoop,
  runMainLoopRunner,
  type MainLoopRunnerError,
  type MainLoopTurnRecord,
  type MainLoopStepRecord,
} from "../agent_executionEngine/coreLogic/mainLoop.js";
import {
  interpretModelDecision,
} from "../agent_executionEngine/coreLogic/modelDecision.js";
import {
  type EphemeralProcedurePlan,
  type EphemeralProcedureStep,
} from "../agent_executionEngine/coreLogic/ephemeralProcedure.js";
import {
  createObservationMaterial,
  type RuntimeObservationMaterial,
} from "../agent_executionEngine/coreLogic/observationIntegrator.js";
import type { StandardPromptPack } from "../agent_executionEngine/promptPack/promptAssembler.js";
import {
  type PromptPackMaterialDraft,
} from "../agent_executionEngine/promptPack/promptDefiner.js";
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
  lowerPromptForModelAdapter,
  type LoweredPromptEnvelope,
} from "./runtime.modelAdapter/promptLoweringRuntime.js";
import {
  compileAgent,
  type AgentManifest,
  type BaseToolPolicyProfile,
  type PraxisAgent,
  type PraxisAgentInput,
} from "./runtimeAgentManifest.js";
import {
  approvalInterfaceEnvelope,
  type InterfaceEnvelope,
} from "../agent_interfaceAdapter/interfaceEnvelope.js";
import type { ToolDependencyProbe } from "../agent_executionEngine/basic_toolLayer/toolDependency/dependencyManager.js";
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
  executor?: BaseToolExecutorPort;
  baseToolAdapters?: Partial<BaseToolExecutorPort>;
  baseToolPolicy?: RuntimeBaseToolExecutorPolicy;
  baseToolResourceLimits?: RuntimeBaseToolExecutorResourceLimits;
  store?: RuntimeSessionStateEventStore;
  allowProviderCall?: boolean;
  allowToolExecution?: boolean;
  exposeProviderTools?: boolean;
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
      error?: PraxisRuntimeKernelError;
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

function readStringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  const values: string[] = [];
  for (const item of value) {
    const text = readString(item);
    if (text !== undefined && !values.includes(text)) values.push(text);
  }
  return values;
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

function runtimeGrantedPermissionsForTool(toolId: string, profile: BaseToolPolicyProfile): readonly string[] {
  if (toolId.startsWith("git.")) return ["git:read", "filesystem:read"];
  if (toolId.startsWith("code.")) return ["filesystem:read", "filesystem:write"];
  if (toolId.startsWith("skill.")) return ["skill:read", "skill:write", "filesystem:read", "filesystem:write"];
  if (toolId.startsWith("search.")) return ["network:read", "search:fetch", "network:egress", "network:search", "search:native"];
  if (toolId.startsWith("shell.")) return ["shell:execute", "shell:observe", "shell:validate"];
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
  const workspaceRoot = readString(args.workspaceRoot) ?? manifest.harness.policy.workspaceRoot ?? runtimeContext.workspaceRoot;
  const allowedRoots = Array.isArray(args.allowedRoots)
    ? args.allowedRoots
    : manifest.harness.policy.allowedRoots ?? runtimeContext.allowedRoots;
  const grantedPermissions = grantedPermissionsForTool(toolId, rawContext.grantedPermissions, manifest.toolPolicy.profile);
  const requestedScopes = mergeStringLists(readStringArray(rawContext.requestedScopes), ["tool.execute", `tool.${toolId}`]);
  const allowedScopes = mergeStringLists(readStringArray(rawContext.allowedScopes), manifest.harness.policy.scopes, ["tool.execute", `tool.${toolId}`, toolId]);
  const allowedRepositoryRoots = Array.isArray(rawContext.allowedRepositoryRoots)
    ? rawContext.allowedRepositoryRoots
    : [workspaceRoot, ...(allowedRoots ?? [])].filter((root): root is string => typeof root === "string" && root.trim().length > 0);
  const defaultServerId = defaultMcpServerId(toolId, args);
  const allowedServerIds = mergeStringLists(readStringArray(rawContext.allowedServerIds), defaultServerId === undefined ? undefined : [defaultServerId]);
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

const PRAXIS_BASE_TOOL_CALLING_PROTOCOL = [
  "Praxis BaseTool calling protocol:",
  "Use mounted BaseTools through declared function calls when the task needs current workspace, filesystem, git, shell, search, skill, MCP, computer-use, media, or external-resource evidence.",
  "Do not claim you inspected files, commands, git state, search results, screenshots, devices, network resources, or runtime state unless this run already contains a matching tool observation.",
  "When BaseTool documentation is folded and you need a more precise family/group/tool manual, request praxis_expand_tool_context before choosing the concrete tool.",
  "If one BaseTool is not enough, request praxis_ephemeral_procedure to orchestrate existing mounted BaseTools; do not invent a new tool.",
  "If policy, sandbox, dependency, budget, or approval blocks the action, request praxis_request_approval or report the public-safe blocker after the runtime returns it.",
  "If a specific tool call returns PROVIDER_FAILURE after the user named an action/target, report that the requested tool was attempted and the runtime/provider failed; do not reinterpret it as the user failing to specify an action or target.",
  "If the prompt already contains enough evidence and no runtime action is needed, answer directly.",
].join("\n");

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
  const observationUsage = input.observations
    .map((observation) => {
      const toolId = typeof observation.material.metadata?.toolId === "string"
        ? observation.material.metadata.toolId
        : undefined;
      return toolId === undefined ? undefined : { toolId };
    })
    .filter((usage): usage is { toolId: string } => usage !== undefined);
  const toolContext = createBaseToolContextTree(input.manifest.harness.tools, {
    mode: "autoFolded",
    auto: input.toolContextSelection,
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

  const observationMaterials = input.observations.map((observation) => observation.material);
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
      id: `runtime:base-tool-protocol:${input.turnIndex}`,
      kind: "runtime",
      text: PRAXIS_BASE_TOOL_CALLING_PROTOCOL,
      source: "runtime.baseToolCallingProtocol",
      priority: 95,
      trusted: true,
      scope: "runtime.toolCalling",
      promptSegmentKind: "stableSystemCore",
      metadata: {
        promptSegmentKind: "stableSystemCore",
        turnIndex: input.turnIndex,
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

function observationPayloadText(observation: RuntimeObservationMaterial): string {
  if (typeof observation.payload === "string") return observation.payload;
  try {
    return JSON.stringify(observation.payload);
  } catch {
    return observation.material.text;
  }
}

function providerToolResultsFromObservations(
  observations: readonly RuntimeObservationMaterial[],
): readonly ProviderToolResultEnvelope[] {
  return observations
    .map((observation): ProviderToolResultEnvelope | undefined => {
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
      return {
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
      };
    })
    .filter((result): result is ProviderToolResultEnvelope => result !== undefined);
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
  return {
    type: "function_call",
    name,
    call_id: callId,
    arguments: args,
    status,
  };
}

function extractOpenAIResponseOutputItems(raw: unknown): readonly Readonly<Record<string, unknown>>[] {
  if (typeof raw === "string") {
    const items = kernelSseDataObjects(raw).flatMap((object) => {
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
    });
    const seen = new Set<string>();
    return items.filter((item, index) => {
      const key = outputItemKey(item, index);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).map(normalizeOpenAIResponseOutputItemForInput)
      .filter((item): item is Readonly<Record<string, unknown>> => item !== undefined);
  }

  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return [];
  }

  const output = (raw as { output?: unknown }).output;
  if (!Array.isArray(output)) {
    return [];
  }

  return output
    .filter((item): item is Readonly<Record<string, unknown>> => {
      return item !== null && typeof item === "object" && !Array.isArray(item);
    })
    .map(normalizeOpenAIResponseOutputItemForInput)
    .filter((item): item is Readonly<Record<string, unknown>> => item !== undefined);
}

function buildCodexResponsesBodyFromPromptPack(
  manifest: AgentManifest,
  promptPack: StandardPromptPack,
  mappings: readonly ProviderToolMapping[],
  options: {
    exposeProviderTools?: boolean;
    observations?: readonly RuntimeObservationMaterial[];
    previousProviderOutputItems?: readonly Readonly<Record<string, unknown>>[];
  } = {},
): Readonly<Record<string, unknown>> {
  const toolResultInputs = providerToolResultsFromObservations(options.observations ?? [])
    .map((result) => lowerProviderToolResult({ providerFamily: "openaiResponses", result }));
  const body: Record<string, unknown> = {
    model: manifest.model.model,
    input: [
      {
        role: "developer",
        content: [{
          type: "input_text",
          text: [
            "You are running inside PraxisRuntimeKernel. Use the Praxis PromptPack as current situation context.",
            PRAXIS_BASE_TOOL_CALLING_PROTOCOL,
          ].join("\n\n"),
        }],
      },
      {
        role: "user",
        content: [{
          type: "input_text",
          text: promptPack.renderedText,
        }],
      },
      ...(options.previousProviderOutputItems ?? []),
      ...toolResultInputs,
    ],
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

  const providerToolBundle = lowerPraxisToolsForProvider({
    providerFamily: "openaiResponses",
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
      capabilityId: "codex-responses",
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
    output: toolResult.ok && toolResult.toolResult.ok ? toolResult.toolResult.output : undefined,
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
  allowToolExecution?: boolean;
  store: RuntimeSessionStateEventStore;
  approvalResolver?: RuntimeApprovalResolver;
  dependencyRuntime?: NonNullable<PraxisRuntimeKernelOptions["baseToolDependencyRuntime"]>;
  now: () => string;
  events: string[];
}): Promise<{
  ok: boolean;
  records: readonly AgentToolCallRecord[];
  observations: readonly RuntimeObservationMaterial[];
  error?: PraxisRuntimeKernelError;
}> {
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
    const results = await Promise.all(wave.map((step) => executeBaseToolDecision({
      runtimeId: input.runtimeId,
      sessionId: input.sessionId,
      manifest: input.manifest,
      executor: input.executor,
      toolCallId: `${input.plan.procedureId}:${step.stepId}`,
      toolId: step.baseToolId,
      args: step.input,
      allowToolExecution: input.allowToolExecution,
      store: input.store,
      approvalResolver: input.approvalResolver,
      dependencyRuntime: input.dependencyRuntime,
      now: input.now,
      events: input.events,
    })));

    for (const [index, result] of results.entries()) {
      const step = wave[index];
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
    const toolWorkspaceRoot = path.resolve(options.sandbox?.cwd ?? options.storage?.cwd ?? process.cwd());
    const toolAllowedRoots = Array.from(new Set([
      toolWorkspaceRoot,
      storageRuntime.layout.workspace.root,
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
    const executor = options.executor ?? createRuntimeBaseToolExecutorPort({
      runtimeId,
      sessionId,
      policy: {
        workspaceRoot: manifest.harness.policy.workspaceRoot,
        allowedRoots: manifest.harness.policy.allowedRoots,
        allowShellExecution: manifest.harness.policy.allowToolExecution ?? options.allowToolExecution,
        allowGitExecution: manifest.harness.policy.allowToolExecution ?? options.allowToolExecution,
        allowProcessExecution: manifest.harness.policy.allowToolExecution ?? options.allowToolExecution,
        allowFilesystemWrite: manifest.harness.policy.allowToolExecution ?? options.allowToolExecution,
        allowFilesystemDelete: manifest.harness.policy.allowToolExecution ?? options.allowToolExecution,
        allowRipgrep: true,
        allowNetworkFetch: true,
        allowNetworkSearch: true,
        ...(options.baseToolPolicy ?? {}),
      },
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
    const toolContextSelection: {
      families: string[];
      groups: string[];
      toolIds: string[];
    } = { families: [], groups: [], toolIds: [] };
    const providerResponseOutputItems: Readonly<Record<string, unknown>>[] = [];
    let toolContextHeatState: BaseToolContextHeatState = createBaseToolContextHeatState({
      agentId: manifest.identity.id,
      sessionId,
      updatedAt: createdAt,
    });

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
        capability: { capabilityId: "codex-responses", kind: "responses" },
        carrier: { carrierId: manifest.model.carrierId, provider: manifest.model.provider },
        mode: "single",
        dryRun,
        allowProviderCall: options.allowProviderCall ?? manifest.harness.policy.allowProviderCall ?? !dryRun,
        auth: options.auth,
        providerCaller: options.providerCaller,
        providerBody: buildCodexResponsesBodyFromPromptPack(manifest, prompt.promptPack, prompt.providerToolBundle.mappings, {
          exposeProviderTools: options.exposeProviderTools,
          observations,
          previousProviderOutputItems: providerResponseOutputItems,
        }),
        governance: { accepted: true },
        contract: { accepted: true },
        clientName: manifest.model.clientName,
        clientVersion: manifest.model.clientVersion,
      });
      await options.onModelCallProgress?.({
        phase: modelResult.ok ? "completed" : "failed",
        invocationId: modelInvocationId,
        turnIndex: turn,
        provider: manifest.model.provider,
        carrierId: manifest.model.carrierId,
        model: manifest.model.model,
        ok: modelResult.ok,
        error: modelResult.ok
          ? undefined
          : kernelError("MODEL_INVOCATION_FAILED", modelResult.error.message, "model"),
      });
      events.push(...modelResult.events);
      modelCalls.push({
        invocationId: modelInvocationId,
        raw: modelResult.ok ? modelResult.raw : null,
        ok: modelResult.ok,
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

      providerResponseOutputItems.push(...extractOpenAIResponseOutputItems(modelResult.raw));

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
        providerFamily: "openaiResponses",
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
            allowToolExecution: options.allowToolExecution,
            store,
            approvalResolver: options.approvalResolver,
            dependencyRuntime: options.baseToolDependencyRuntime,
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
      onNoFinalOutput: async () => ({
        ok: true,
        finalOutput: "PraxisRuntimeKernel completed without text output.",
        events: ["agentCore.execution.mainLoop.runner.noFinalOutput"],
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
