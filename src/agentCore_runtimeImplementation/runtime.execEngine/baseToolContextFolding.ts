/*
 * 文件定位：Agent 运行态实现层 / 执行引擎运行态绑定面 / BaseTool 上下文折叠。
 * 核心目的：把 176 个 BaseTool 的模型可读说明组织成可折叠、可展开、可加权的 PromptPack capability 材料。
 * 边界：这里只构造上下文说明，不执行工具、不替代 provider tool schema、不绕过 registry/handler/executor。
 */

import { existsSync, readFileSync } from "node:fs";

import type { PromptPackMaterialDraft } from "../../agentCore_executionEngine/promptPack/promptDefiner.js";
import type { AgentManifest, ToolSpec } from "../runtimeAgentManifest.js";
import { createBaseToolRealityLedger } from "./baseToolRealityLedger.js";

export type BaseToolContextExposureMode =
  | "allOpen"
  | "autoFolded"
  | "manualCoarse"
  | "manualFine"
  | "semiAuto"
  | "intelligent"
  | "none";

export type BaseToolContextNodeKind = "root" | "family" | "group" | "tool";

export type BaseToolContextHeatWeights = {
  family: number;
  group: number;
  tool: number;
};

export type BaseToolContextUsageRecord = {
  toolId: string;
  count?: number;
};

export type BaseToolContextHeatState = {
  kind: "praxis.baseTool.contextHeatState";
  agentId: string;
  sessionId?: string;
  updatedAt: string;
  usage: readonly Required<BaseToolContextUsageRecord>[];
};

export type BaseToolContextSelection = {
  families?: readonly string[];
  groups?: readonly string[];
  toolIds?: readonly string[];
};

export type BaseToolContextFoldingOptions = {
  mode?: BaseToolContextExposureMode;
  manual?: BaseToolContextSelection;
  auto?: BaseToolContextSelection;
  usage?: readonly BaseToolContextUsageRecord[];
  heatWeights?: Partial<BaseToolContextHeatWeights>;
  keepExpandedScore?: number;
  includeToolMarkdown?: boolean;
};

export type BaseToolContextTreeNode = {
  nodeId: string;
  kind: BaseToolContextNodeKind;
  label: string;
  family?: string;
  group?: string;
  toolId?: string;
  title: string;
  summary: string;
  score: number;
  expanded: boolean;
  children: readonly BaseToolContextTreeNode[];
};

export type BaseToolContextTree = {
  kind: "praxis.baseTool.contextTree";
  mode: BaseToolContextExposureMode;
  root: BaseToolContextTreeNode;
  expandedNodeIds: readonly string[];
  foldedNodeIds: readonly string[];
  selectedToolIds: readonly string[];
  mountedToolCount: number;
  materials: readonly PromptPackMaterialDraft[];
};

const DEFAULT_HEAT_WEIGHTS: BaseToolContextHeatWeights = {
  family: 1,
  group: 3,
  tool: 5,
};

const FAMILY_ORDER = [
  "codeBase",
  "computeruseBase",
  "gitBase",
  "mcpBase",
  "omniBase",
  "searchBase",
  "shellBase",
  "skillBase",
] as const;

function normalizeList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))].sort(compareAscii);
}

function compareAscii(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function familyOrder(family: string): number {
  const index = FAMILY_ORDER.indexOf(family as (typeof FAMILY_ORDER)[number]);
  return index === -1 ? FAMILY_ORDER.length : index;
}

function readMarkdown(path: string | undefined): string | undefined {
  if (path === undefined || !existsSync(path)) return undefined;
  try {
    const content = readFileSync(path, "utf8").trim();
    return content.length === 0 ? undefined : content;
  } catch {
    return undefined;
  }
}

function fallbackToolText(tool: ToolSpec): string {
  return [
    `Tool: ${tool.toolId}`,
    `Family: ${tool.family ?? "unknown"}`,
    `Group: ${tool.group ?? "unknown"}`,
    tool.description === undefined ? "Description: mounted Praxis BaseTool." : `Description: ${tool.description}`,
    "Use this tool only when its family, group, and input contract match the current task.",
  ].join("\n");
}

function familyTitle(family: string): string {
  return `${family} tools`;
}

function familySummary(family: string, tools: readonly ToolSpec[]): string {
  const groups = [...new Set(tools.map((tool) => tool.group ?? "(flat)"))].sort();
  return [
    `BaseTool family: ${family}`,
    `Mounted tools: ${tools.length}`,
    `Groups: ${groups.join(", ") || "(flat)"}`,
    "This is a stable family index. Read subgroup and tool summary cards, then request one concrete tool manual if needed.",
  ].join("\n");
}

function groupSummary(family: string, group: string, tools: readonly ToolSpec[]): string {
  return [
    `BaseTool group: ${family}/${group}`,
    `Mounted tools: ${tools.length}`,
    `Tool IDs: ${tools.map((tool) => tool.toolId).sort().join(", ")}`,
    "This is a subgroup index. If the summary is not enough, request the concrete tool manual rather than the whole family.",
  ].join("\n");
}

function riskSummary(tool: ToolSpec, riskLevel: string | undefined): "safe" | "risky" | "dangerous" {
  const explicit = tool.metadata?.riskLevel;
  const raw = typeof explicit === "string" ? explicit : riskLevel;
  if (raw === "dangerous") return "dangerous";
  if (raw === "risky") return "risky";
  return "safe";
}

function inputHint(tool: ToolSpec): string {
  const schema = tool.inputSchema;
  if (schema === undefined || typeof schema !== "object" || schema === null || Array.isArray(schema)) {
    return "object";
  }
  const properties = (schema as { properties?: unknown }).properties;
  const keys = properties !== null && typeof properties === "object" && !Array.isArray(properties)
    ? Object.keys(properties).sort()
    : [];
  const required = Array.isArray((schema as { required?: unknown }).required)
    ? ((schema as { required?: unknown[] }).required ?? []).map(String).filter((key) => keys.includes(key)).sort()
    : [];
  if (keys.length === 0) return "object";
  const keyText = keys.slice(0, 6).join(",");
  return required.length === 0 ? keyText : `${keyText}; required=${required.join(",")}`;
}

function toolPurpose(tool: ToolSpec): string {
  return (tool.description?.trim() || `Use ${tool.toolId} when the task needs this mounted runtime tool.`)
    .replace(/\s+/gu, " ")
    .replace(/;$/u, ".");
}

function toolSummaryCard(tool: ToolSpec, riskLevel: string | undefined): string {
  const family = tool.family ?? "custom";
  const group = tool.group ?? "(flat)";
  return [
    `toolId=${tool.toolId}`,
    `purpose=${toolPurpose(tool)}`,
    `input=${inputHint(tool)}`,
    `risk=${riskSummary(tool, riskLevel)}`,
    `useWhen=${family}/${group} matches the current evidence or action`,
    `manual=praxis_expand_tool_context targetKind=tool toolId=${tool.toolId}`,
  ].join("; ");
}

function usageScores(
  tools: readonly ToolSpec[],
  usage: readonly BaseToolContextUsageRecord[],
  weights: BaseToolContextHeatWeights,
): {
  family: ReadonlyMap<string, number>;
  group: ReadonlyMap<string, number>;
  tool: ReadonlyMap<string, number>;
} {
  const byTool = new Map(tools.map((tool) => [tool.toolId, tool]));
  const family = new Map<string, number>();
  const group = new Map<string, number>();
  const tool = new Map<string, number>();

  for (const item of usage) {
    const count = Number.isFinite(item.count) && (item.count ?? 0) > 0 ? item.count ?? 1 : 1;
    const spec = byTool.get(item.toolId);
    if (spec === undefined) continue;
    const familyId = spec.family ?? "custom";
    const groupId = `${familyId}/${spec.group ?? "(flat)"}`;
    family.set(familyId, (family.get(familyId) ?? 0) + weights.family * count);
    group.set(groupId, (group.get(groupId) ?? 0) + weights.group * count);
    tool.set(spec.toolId, (tool.get(spec.toolId) ?? 0) + weights.tool * count);
  }

  return { family, group, tool };
}

function normalizeCount(value: number | undefined): number {
  return Number.isFinite(value) && (value ?? 0) > 0 ? Math.floor(value ?? 1) : 1;
}

export function createBaseToolContextHeatState(input: {
  agentId: string;
  sessionId?: string;
  usage?: readonly BaseToolContextUsageRecord[];
  updatedAt?: string;
}): BaseToolContextHeatState {
  const counts = new Map<string, number>();
  for (const record of input.usage ?? []) {
    const toolId = record.toolId.trim();
    if (toolId.length === 0) continue;
    counts.set(toolId, (counts.get(toolId) ?? 0) + normalizeCount(record.count));
  }
  return {
    kind: "praxis.baseTool.contextHeatState",
    agentId: input.agentId,
    ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
    updatedAt: input.updatedAt ?? new Date(0).toISOString(),
    usage: [...counts.entries()]
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([toolId, count]) => ({ toolId, count })),
  };
}

export function applyBaseToolContextUsage(
  state: BaseToolContextHeatState,
  usage: readonly BaseToolContextUsageRecord[],
  updatedAt: string,
): BaseToolContextHeatState {
  return createBaseToolContextHeatState({
    agentId: state.agentId,
    sessionId: state.sessionId,
    updatedAt,
    usage: [...state.usage, ...usage],
  });
}

function shouldExpand(input: {
  mode: BaseToolContextExposureMode;
  kind: BaseToolContextNodeKind;
  family?: string;
  group?: string;
  toolId?: string;
  manual: Required<BaseToolContextSelection>;
  auto: Required<BaseToolContextSelection>;
  score: number;
  keepExpandedScore: number;
}): boolean {
  if (input.kind === "root") return true;
  if (input.mode === "none") return false;
  if (input.mode === "allOpen") return true;

  const groupId = input.family !== undefined && input.group !== undefined ? `${input.family}/${input.group}` : undefined;
  const manualFamily = input.family !== undefined && input.manual.families.includes(input.family);
  const manualGroup = groupId !== undefined && input.manual.groups.includes(groupId);
  const manualTool = input.toolId !== undefined && input.manual.toolIds.includes(input.toolId);
  const autoFamily = input.family !== undefined && input.auto.families.includes(input.family);
  const autoGroup = groupId !== undefined && input.auto.groups.includes(groupId);
  const autoTool = input.toolId !== undefined && input.auto.toolIds.includes(input.toolId);

  if (input.mode === "intelligent") return input.kind === "tool" && (manualTool || autoTool);
  if (input.score >= input.keepExpandedScore) return true;
  if (input.mode === "manualCoarse") return input.kind !== "tool" && (manualFamily || manualGroup);
  if (input.mode === "manualFine") return manualTool;
  if (input.mode === "semiAuto") return manualFamily || manualGroup || manualTool || autoFamily || autoGroup || autoTool;
  if (input.mode === "autoFolded") return autoFamily || autoGroup || autoTool;
  return false;
}

function material(input: {
  id: string;
  text: string;
  priority: number;
  node: BaseToolContextTreeNode;
  materialType: "index" | "family" | "group" | "tool";
  toolMaterialType?: "policy" | "declaration";
  inputSchema?: ToolSpec["inputSchema"];
}): PromptPackMaterialDraft {
  const toolMaterialType = input.toolMaterialType
    ?? (input.materialType === "tool" ? "declaration" : "policy");
  return {
    id: input.id,
    kind: input.materialType === "index" ? "tool-summary" : "tool",
    text: input.text,
    source: "runtime.baseToolContextFolding",
    sourceCategory: "declared-built-in",
    priority: input.priority,
    trusted: true,
    scope: "runtime.toolProjection",
    promptSegmentKind: "toolDeclarations",
    metadata: {
      promptSegmentKind: "toolDeclarations",
      toolMaterialType,
      baseToolContextNodeKind: input.node.kind,
      baseToolContextNodeId: input.node.nodeId,
      baseToolContextExpanded: input.node.expanded,
      baseToolContextScore: input.node.score,
      ...(input.node.family === undefined ? {} : { family: input.node.family }),
      ...(input.node.group === undefined ? {} : { group: input.node.group }),
      ...(input.node.toolId === undefined ? {} : { toolId: input.node.toolId, toolName: input.node.toolId }),
      ...(input.inputSchema === undefined ? {} : { inputSchema: input.inputSchema as object }),
    },
  };
}

export function createBaseToolContextTree(
  tools: readonly ToolSpec[],
  options: BaseToolContextFoldingOptions = {},
): BaseToolContextTree {
  const mode = options.mode ?? "intelligent";
  const manual = {
    families: normalizeList(options.manual?.families),
    groups: normalizeList(options.manual?.groups),
    toolIds: normalizeList(options.manual?.toolIds),
  };
  const auto = {
    families: normalizeList(options.auto?.families),
    groups: normalizeList(options.auto?.groups),
    toolIds: normalizeList(options.auto?.toolIds),
  };
  const weights = { ...DEFAULT_HEAT_WEIGHTS, ...(options.heatWeights ?? {}) };
  const keepExpandedScore = options.keepExpandedScore ?? 15;
  const scores = usageScores(tools, options.usage ?? [], weights);
  const ledger = createBaseToolRealityLedger();
  const ledgerDocs = new Map(ledger.map((entry) => [entry.toolId, entry.storageDocPath]));
  const ledgerRisk = new Map(ledger.map((entry) => [entry.toolId, entry.riskLevel]));

  const byFamily = new Map<string, ToolSpec[]>();
  for (const tool of tools) {
    const family = tool.family ?? "custom";
    byFamily.set(family, [...(byFamily.get(family) ?? []), tool]);
  }

  const materials: PromptPackMaterialDraft[] = [];
  const expandedNodeIds: string[] = [];
  const foldedNodeIds: string[] = [];

  const rootNode: BaseToolContextTreeNode = {
    nodeId: "baseTool_index",
    kind: "root",
    label: "baseTool_index.md",
    title: "Praxis BaseTool index",
    summary: mode === "intelligent"
      ? [
          "Praxis BaseTools are runtime-governed tools grouped by family, subgroup, and concrete toolId.",
          "All mounted provider tool schemas are available separately; this PromptPack section is the stable manual index and compact tool summary layer.",
          "Read tool summary cards first. If a concrete tool remains unclear or repeated calls fail, request praxis_expand_tool_context with targetKind=tool and the exact toolId.",
          "Expanded concrete manuals are one-turn material and should be treated as read-once guidance.",
        ].join("\n")
      : [
          "Praxis BaseTools are runtime-governed tools grouped by family, group, and toolId.",
          "Start from family summaries, expand likely families, then expand groups and concrete tools.",
          "Use concrete tools through provider function calls after the matching tool declaration is visible.",
        ].join("\n"),
    score: 0,
    expanded: mode !== "none",
    children: [],
  };
  if (rootNode.expanded) expandedNodeIds.push(rootNode.nodeId);
  materials.push(material({
    id: "baseTool:context:index",
    text: rootNode.summary,
    priority: 90,
    node: rootNode,
    materialType: "index",
  }));

  const familyNodes: BaseToolContextTreeNode[] = [];
  const sortedFamilies = [...byFamily.entries()].sort((left, right) => familyOrder(left[0]) - familyOrder(right[0]) || compareAscii(left[0], right[0]));
  for (const [family, familyTools] of sortedFamilies) {
    const familyScore = scores.family.get(family) ?? 0;
    const familyNode: BaseToolContextTreeNode = {
      nodeId: `family:${family}`,
      kind: "family",
      label: `${family}.md`,
      family,
      title: familyTitle(family),
      summary: familySummary(family, familyTools),
      score: familyScore,
      expanded: shouldExpand({ mode, kind: "family", family, manual, auto, score: familyScore, keepExpandedScore }),
      children: [],
    };
    (familyNode.expanded ? expandedNodeIds : foldedNodeIds).push(familyNode.nodeId);
    materials.push(material({
      id: `baseTool:context:family:${family}`,
      text: familyNode.summary,
      priority: 85 - familyOrder(family),
      node: familyNode,
      materialType: "family",
    }));

    const byGroup = new Map<string, ToolSpec[]>();
    for (const tool of familyTools) {
      const group = tool.group ?? "(flat)";
      byGroup.set(group, [...(byGroup.get(group) ?? []), tool]);
    }

    const groupNodes: BaseToolContextTreeNode[] = [];
    for (const [group, groupTools] of [...byGroup.entries()].sort((left, right) => compareAscii(left[0], right[0]))) {
      const groupId = `${family}/${group}`;
      const groupScore = scores.group.get(groupId) ?? 0;
      const groupShouldExpand = shouldExpand({ mode, kind: "group", family, group, manual, auto, score: groupScore, keepExpandedScore });
      const groupNode: BaseToolContextTreeNode = {
        nodeId: `group:${groupId}`,
        kind: "group",
        label: `${group}_index.md`,
        family,
        group,
        title: `${family}/${group}`,
        summary: groupSummary(family, group, groupTools),
        score: groupScore,
        expanded: mode === "intelligent" ? groupShouldExpand : familyNode.expanded || groupShouldExpand,
        children: [],
      };
      (groupNode.expanded ? expandedNodeIds : foldedNodeIds).push(groupNode.nodeId);
      if (groupNode.expanded || mode === "intelligent") {
        materials.push(material({
          id: `baseTool:context:group:${family}:${group}`,
          text: groupNode.summary,
          priority: 70 - groupNodes.length,
          node: groupNode,
          materialType: "group",
        }));
      }

      const toolNodes = [...groupTools].sort((left, right) => compareAscii(left.toolId, right.toolId)).map((toolSpec): BaseToolContextTreeNode => {
        const toolScore = scores.tool.get(toolSpec.toolId) ?? 0;
        const toolShouldExpand = shouldExpand({ mode, kind: "tool", family, group, toolId: toolSpec.toolId, manual, auto, score: toolScore, keepExpandedScore });
        const expanded = mode === "intelligent" ? toolShouldExpand : groupNode.expanded || toolShouldExpand;
        const docText = options.includeToolMarkdown === false ? undefined : readMarkdown(ledgerDocs.get(toolSpec.toolId));
        const compactSummary = toolSummaryCard(toolSpec, ledgerRisk.get(toolSpec.toolId));
        const summary = mode === "intelligent" ? compactSummary : docText ?? fallbackToolText(toolSpec);
        const node: BaseToolContextTreeNode = {
          nodeId: `tool:${toolSpec.toolId}`,
          kind: "tool",
          label: `${toolSpec.toolId}.basetool`,
          family,
          group,
          toolId: toolSpec.toolId,
          title: toolSpec.description ?? toolSpec.toolId,
          summary,
          score: toolScore,
          expanded,
          children: [],
        };
        (expanded ? expandedNodeIds : foldedNodeIds).push(node.nodeId);
        if (mode === "intelligent") {
          materials.push(material({
            id: `baseTool:summary:tool:${toolSpec.toolId}`,
            text: compactSummary,
            priority: 65 - materials.length / 1000,
            node,
            materialType: "group",
            toolMaterialType: "policy",
            inputSchema: toolSpec.inputSchema,
          }));
        }
        if (expanded) {
          materials.push(material({
            id: mode === "intelligent" ? `baseTool:manual:tool:${toolSpec.toolId}` : `tool:${toolSpec.toolId}`,
            text: mode === "intelligent" ? docText ?? fallbackToolText(toolSpec) : summary,
            priority: 60 - materials.length / 1000,
            node,
            materialType: "tool",
            toolMaterialType: mode === "intelligent" ? "policy" : "declaration",
            inputSchema: toolSpec.inputSchema,
          }));
        }
        return node;
      });

      groupNodes.push({ ...groupNode, children: toolNodes });
    }

    familyNodes.push({ ...familyNode, children: groupNodes });
  }

  return {
    kind: "praxis.baseTool.contextTree",
    mode,
    root: { ...rootNode, children: familyNodes },
    expandedNodeIds,
    foldedNodeIds,
    selectedToolIds: tools.map((tool) => tool.toolId).sort(),
    mountedToolCount: tools.length,
    materials: mode === "none" ? [] : materials,
  };
}

export function createBaseToolContextPromptMaterials(input: {
  manifest: AgentManifest;
  usage?: readonly BaseToolContextUsageRecord[];
  options?: BaseToolContextFoldingOptions;
}): readonly PromptPackMaterialDraft[] {
  return createBaseToolContextTree(input.manifest.harness.tools, {
    usage: input.usage,
    ...(input.options ?? {}),
  }).materials;
}

export const baseToolContextFoldingDescriptor = {
  surface: "runtime.execEngine.baseToolContextFolding",
  contextShape: "baseTool_index/family/group/tool",
  defaultMode: "intelligent",
  mutatesHost: false,
  executesTools: false,
  promptSegmentKind: "toolDeclarations",
} as const;
