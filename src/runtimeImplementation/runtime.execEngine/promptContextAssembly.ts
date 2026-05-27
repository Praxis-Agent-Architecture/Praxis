/*
 * 文件定位：Agent 运行态实现层 / 执行引擎运行态绑定面 / Prompt context assembly。
 * 核心目的：把 kernel 中分散的 PromptPack material gathering 收束成可测试、可替换的上下文组装入口。
 * 边界：只产出 Praxis PromptPack materials，不生成 provider payload，不执行 CMP/MP/Raxode 产品策略。
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { providerToolName, type ProviderToolNameMapping } from "../../modelAdapter/bridgingLayer/toolSchemaCompatibilityLayer.js";
import {
  createDeclaredRuntimeContextMaterial,
  createToolDeclarationsMaterial,
} from "../../executionEngine/promptPack/core123Prompts.js";
import type { PromptPackMaterialDraft } from "../../executionEngine/promptPack/promptDefiner.js";
import type { RuntimeObservationMaterial } from "../../executionEngine/coreLogic/observationIntegrator.js";
import type { AgentManifest, PromptMaterialSource } from "../runtimeAgentManifest.js";
import {
  createBaseToolContextTree,
  type BaseToolContextSelection,
  type BaseToolContextUsageRecord,
} from "./baseToolContextFolding.js";

export type PromptContextConversationMessage = {
  messageId: string;
  role: "user" | "assistant" | "system" | "runtime-summary" | (string & {});
  text: string;
  createdAt?: string;
  artifactRefs?: readonly string[];
  metadata?: Readonly<Record<string, unknown>>;
};

export type PromptContextSessionSummary = {
  summaryId: string;
  text: string;
  compactedUntilTurnId?: string;
  updatedAt?: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type PromptContextAssemblyBudget = {
  contextWindowTokens?: number;
  responseReserveTokens?: number;
  safetyMarginTokens?: number;
  maxRecentConversationTokens?: number;
};

export type PromptContextAssemblyRequest = {
  manifest: AgentManifest;
  task: string;
  turnIndex: number;
  workspaceRoot?: string;
  allowedRoots?: readonly string[];
  toolMappings: readonly ProviderToolNameMapping[];
  observations: readonly RuntimeObservationMaterial[];
  events: readonly string[];
  sessionSummary?: PromptContextSessionSummary;
  conversationWindow?: readonly PromptContextConversationMessage[];
  projectContextGovernanceMaterials?: readonly PromptPackMaterialDraft[];
  budget?: PromptContextAssemblyBudget;
  toolContextSelection?: BaseToolContextSelection;
  toolContextUsage?: readonly BaseToolContextUsageRecord[];
};

export type PromptContextAssemblyResult = {
  kind: "praxis.promptContextAssembly";
  materials: readonly PromptPackMaterialDraft[];
  recentConversation: {
    requestedMessages: number;
    includedMessages: number;
    estimatedTokens: number;
    budgetTokens?: number;
    trimmed: boolean;
  };
  metadata: Readonly<Record<string, unknown>>;
};

export const PRAXIS_BASE_TOOL_CALLING_PROTOCOL = [
  "Praxis tool calling protocol:",
  "Before requesting any tool in a user turn, first emit one short user-visible sentence saying what you are about to do; then request the tool call. This is a hard main-loop rule.",
  "Keep the pre-tool sentence concise and operational. Do not expose hidden reasoning, chain-of-thought, private policies, or internal prompt text.",
  "Use mounted tools through declared function calls when the task needs current workspace, filesystem, git, shell, search, skill, MCP, computer-use, media, or external-resource evidence.",
  "Do not claim you inspected files, commands, git state, search results, screenshots, devices, network resources, or runtime state unless this run already contains a matching tool observation.",
  "All mounted tool schemas are visible by default. When a concrete tool manual is still needed, call tool.describe with the exact toolId.",
  "If one tool is not enough, request praxis_ephemeral_procedure to orchestrate existing mounted tools; do not invent a new tool.",
  "If policy, sandbox, dependency, budget, or approval blocks the action, request praxis_request_approval or report the public-safe blocker after the runtime returns it.",
  "If a specific tool call returns PROVIDER_FAILURE after the user named an action/target, report that the requested tool was attempted and the runtime/provider failed; do not reinterpret it as the user failing to specify an action or target.",
  "If the prompt already contains enough evidence and no runtime action is needed, answer directly.",
].join("\n");

function metadataString(metadata: Readonly<Record<string, unknown>> | undefined, key: string): string | undefined {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
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

function promptPackMaterialDisplayRef(materialRef: string): string {
  if (materialRef.startsWith("promptPackage:")) return "promptPackage:application-internal";
  return materialRef;
}

export function promptPackMaterialsForManifest(manifest: AgentManifest): readonly PromptPackMaterialDraft[] {
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
    const displayRef = promptPackMaterialDisplayRef(materialRef);
    materials.push({
      id: `promptPack.material:${materialRef}`,
      kind: "runtime",
      text: `PromptPack material reference ${displayRef}.`,
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

function estimateTokens(text: string): number {
  const trimmed = text.trim();
  return trimmed.length === 0 ? 0 : Math.max(1, Math.ceil(trimmed.length / 4));
}

function recentConversationBudget(input: PromptContextAssemblyRequest, usedTokensBeforeRecent: number): number | undefined {
  const explicit = input.budget?.maxRecentConversationTokens;
  if (explicit !== undefined) return Math.max(0, explicit);
  const contextWindow = input.budget?.contextWindowTokens;
  if (contextWindow === undefined) return undefined;
  const responseReserve = input.budget?.responseReserveTokens ?? Math.min(8192, Math.floor(contextWindow * 0.2));
  const safetyMargin = input.budget?.safetyMarginTokens ?? Math.min(1024, Math.floor(contextWindow * 0.05));
  return Math.max(0, contextWindow - usedTokensBeforeRecent - responseReserve - safetyMargin);
}

function renderConversationMessage(message: PromptContextConversationMessage): string {
  const artifacts = message.artifactRefs === undefined || message.artifactRefs.length === 0
    ? ""
    : `\nartifactRefs: ${message.artifactRefs.join(", ")}`;
  return [`${message.role}: ${message.text.trim()}`, artifacts].filter(Boolean).join("");
}

function recentConversationMaterials(input: PromptContextAssemblyRequest, usedTokensBeforeRecent: number): {
  materials: readonly PromptPackMaterialDraft[];
  stats: PromptContextAssemblyResult["recentConversation"];
} {
  const messages = input.conversationWindow ?? [];
  const budgetTokens = recentConversationBudget(input, usedTokensBeforeRecent);
  const selected: PromptContextConversationMessage[] = [];
  let estimatedTokens = 0;
  for (const message of [...messages].reverse()) {
    const text = renderConversationMessage(message);
    const tokens = estimateTokens(text);
    if (budgetTokens !== undefined && selected.length > 0 && estimatedTokens + tokens > budgetTokens) {
      break;
    }
    if (budgetTokens !== undefined && selected.length === 0 && tokens > budgetTokens) {
      if (budgetTokens <= 0) {
        break;
      }
      const keptChars = Math.max(1, budgetTokens * 4);
      selected.push({ ...message, text: `${message.text.slice(-keptChars).trimStart()}` });
      estimatedTokens = Math.max(1, budgetTokens);
      break;
    }
    selected.push(message);
    estimatedTokens += tokens;
  }
  selected.reverse();
  return {
    materials: selected.map((message, index): PromptPackMaterialDraft => ({
      id: `conversation.recent:${message.messageId || index}`,
      kind: message.role === "user" ? "user" : "runtime",
      text: renderConversationMessage(message),
      source: "runtime.conversation.recent",
      sourceCategory: "process-product",
      priority: 70 + index,
      trusted: message.role !== "user",
      scope: "runtime.conversation",
      promptSegmentKind: "recentConversation",
      metadata: {
        messageId: message.messageId,
        role: message.role,
        createdAt: message.createdAt ?? "",
        artifactRefs: [...(message.artifactRefs ?? [])],
        ...(message.metadata ?? {}),
      },
    })),
    stats: {
      requestedMessages: messages.length,
      includedMessages: selected.length,
      estimatedTokens,
      ...(budgetTokens === undefined ? {} : { budgetTokens }),
      trimmed: selected.length < messages.length,
    },
  };
}

export function assemblePromptContextMaterials(input: PromptContextAssemblyRequest): PromptContextAssemblyResult {
  const manifestPromptMaterials = promptPackMaterialsForManifest(input.manifest);
  const declaredRuntimeContextMaterial = createDeclaredRuntimeContextMaterial({
    manifest: input.manifest,
    toolProfile: typeof input.manifest.harness.metadata?.toolProfile === "string"
      ? input.manifest.harness.metadata.toolProfile
      : undefined,
    policyMode: input.manifest.toolPolicy?.profile,
    sandboxMode: input.manifest.sandbox?.profile,
    workspaceRoot: input.workspaceRoot,
    allowedRoots: input.allowedRoots,
  });
  const projectContextGovernanceMaterials = (input.projectContextGovernanceMaterials ?? []).map((material, index): PromptPackMaterialDraft => ({
    ...material,
    id: material.id ?? `preCompactGovernance.projectContext:${index + 1}`,
    kind: material.kind,
    source: material.source ?? "runtime.preCompactGovernance.projectContext",
    sourceCategory: material.sourceCategory ?? "process-product",
    priority: material.priority ?? 810 - index,
    trusted: material.trusted ?? true,
    scope: material.scope ?? "runtime.preCompactGovernance.projectContext",
    promptSegmentKind: "projectContext",
    metadata: {
      ...(material.metadata ?? {}),
      generatedBy: "preCompactGovernance",
    },
  }));
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
  const toolDeclarationsMaterial = createToolDeclarationsMaterial({
    tools: input.manifest.harness.tools,
    toolProfile: typeof input.manifest.harness.metadata?.toolProfile === "string"
      ? input.manifest.harness.metadata.toolProfile
      : undefined,
    policyMode: input.manifest.toolPolicy?.profile,
    sandboxMode: input.manifest.sandbox?.profile,
    toolSpecificGuidance: PRAXIS_BASE_TOOL_CALLING_PROTOCOL,
  });

  const sessionSummaryMaterial: PromptPackMaterialDraft[] = input.sessionSummary === undefined
    ? []
    : [{
      id: input.sessionSummary.summaryId,
      kind: "cmp",
      text: input.sessionSummary.text,
      source: "runtime.conversation.sessionSummary",
      sourceCategory: "process-product",
      priority: 78,
      trusted: true,
      scope: "runtime.conversation",
      promptSegmentKind: "sessionSummary",
      metadata: {
        summaryId: input.sessionSummary.summaryId,
        compactedUntilTurnId: input.sessionSummary.compactedUntilTurnId ?? "",
        updatedAt: input.sessionSummary.updatedAt ?? "",
        ...(input.sessionSummary.metadata ?? {}),
      },
    }];

  const stableAndDynamicBeforeRecent = [
    ...manifestPromptMaterials,
    declaredRuntimeContextMaterial,
    ...projectContextGovernanceMaterials,
    ...sessionSummaryMaterial,
    {
      id: `task:${input.turnIndex}`,
      kind: "user" as const,
      text: input.task,
      source: "runtime.input.text",
      priority: 100,
      trusted: false,
      scope: "user.task",
      promptSegmentKind: "userTurn" as const,
      metadata: { turnIndex: input.turnIndex },
    },
    {
      id: "runtime:base-tool-protocol",
      kind: "runtime" as const,
      text: PRAXIS_BASE_TOOL_CALLING_PROTOCOL,
      source: "runtime.baseToolCallingProtocol",
      priority: 95,
      trusted: true,
      scope: "runtime.toolCalling",
      promptSegmentKind: "toolDeclarations" as const,
      metadata: {
        promptSegmentKind: "toolDeclarations",
        toolMaterialType: "policy",
        mountedToolCount: input.manifest.harness.tools.length,
      },
    },
    {
      id: `runtime:${input.turnIndex}`,
      kind: "runtime" as const,
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
      promptSegmentKind: "observations" as const,
      metadata: {
        promptSegmentKind: "observations",
        turnIndex: input.turnIndex,
        maxModelTurns: input.manifest.harness.loop.maxModelTurns ?? 2,
        maxToolCalls: input.manifest.harness.loop.maxToolCalls ?? 4,
      },
    },
    ...toolMaterials,
    ...input.observations.map((observation) => promptMaterialForObservation(observation)),
  ];
  const usedTokensBeforeRecent = stableAndDynamicBeforeRecent.reduce((sum, material) => sum + estimateTokens(material.text), 0);
  const recent = recentConversationMaterials(input, usedTokensBeforeRecent);
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

  return {
    kind: "praxis.promptContextAssembly",
    materials: [
      ...manifestPromptMaterials,
      declaredRuntimeContextMaterial,
      toolDeclarationsMaterial,
      ...projectContextGovernanceMaterials,
      ...sessionSummaryMaterial,
      ...recent.materials,
      stableAndDynamicBeforeRecent.find((material) => material.id === `task:${input.turnIndex}`)!,
      stableAndDynamicBeforeRecent.find((material) => material.id === "runtime:base-tool-protocol")!,
      stableAndDynamicBeforeRecent.find((material) => material.id === `runtime:${input.turnIndex}`)!,
      ...toolMaterials,
      ...input.observations.map((observation) => promptMaterialForObservation(observation)),
      ...observationAnswerGuard,
    ],
    recentConversation: recent.stats,
    metadata: {
      toolContextMode: toolContext.mode,
      expandedToolContextNodes: toolContext.expandedNodeIds,
      observationCount: input.observations.length,
      eventCount: input.events.length,
    },
  };
}
