/*
 * 文件定位：Agent 运行态实现层 / 执行引擎运行态绑定面 / BaseTool 真实能力账本。
 * 核心目的：按 family/group/toolId 解释 176 个 storage-owned BaseTool 当前到底是 mounted、host-ready、adapter-required 还是未证明。
 * 边界：只做检查、解释和 inspect 数据，不定义工具语义，不绕过 registry/handler/executor 链。
 */

import { existsSync } from "node:fs";
import path from "node:path";

import type {
  BaseToolDependencyDeclaration,
  BaseToolFamily,
  BaseToolRiskLevel,
} from "../../agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import {
  createBaseToolRegistry,
  baseToolRegistryDescriptor,
} from "../../agent_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import {
  baseToolExecutorPortFactoryDescriptor,
  listRuntimeBaseToolImplementedPortPaths,
} from "./baseToolExecutorPortFactory.js";
import {
  createBaseToolSupportCatalog,
  type BaseToolRuntimeSupportStatus,
  type BaseToolSupportCatalogEntry,
  type BaseToolSupportCatalogOptions,
} from "./baseToolSupportCatalog.js";

export type BaseToolRegistryMountStatus = "mounted" | "missing";
export type BaseToolStorageRealityStatus = "canonical" | "incomplete" | "missing-storage";
export type BaseToolExecutorSupportRealityStatus = "hostReady" | "adapterRequired" | "notReady";
export type BaseToolDependencyRealityStatus =
  | "available"
  | "missing"
  | "installable"
  | "requiresApproval"
  | "blocked"
  | "providerUnavailable";
export type BaseToolLiveRealityStatus = "liveReady" | "notProven";
export type BaseToolRealityCapabilityClass =
  | "contextMaterial"
  | "contextSearch"
  | "governedAuthoring"
  | "hostRuntime"
  | "externalAdapter";
export type BaseToolRealityProjection = "promptPackMaterial" | "runtimeObservation" | "authoringArtifact";
export type BaseToolRealityLiveGate = "noModelSmoke" | "dialogueSmoke" | "adapterSmoke";
export type BaseToolRealityStageStatus =
  | "ready"
  | "notReady"
  | "requiresApproval"
  | "adapterRequired"
  | "notProven";
export type BaseToolDeveloperReadiness =
  | "ready"
  | "usableWithApproval"
  | "adapterRequired"
  | "contractIncomplete"
  | "notLiveProven";

export type BaseToolRealityStages = {
  mounted: BaseToolRealityStageStatus;
  contractReady: BaseToolRealityStageStatus;
  hostReady: BaseToolRealityStageStatus;
  dependencyReady: BaseToolRealityStageStatus;
  liveReady: BaseToolRealityStageStatus;
};

export type BaseToolRealityLedgerEntry = {
  toolId: string;
  family: BaseToolFamily;
  storageFamily: string;
  group: string;
  title: string;
  riskLevel: BaseToolRiskLevel;
  registry: BaseToolRegistryMountStatus;
  storage: BaseToolStorageRealityStatus;
  executorSupport: BaseToolExecutorSupportRealityStatus;
  dependencyStatus: BaseToolDependencyRealityStatus;
  liveStatus: BaseToolLiveRealityStatus;
  capabilityClass: BaseToolRealityCapabilityClass;
  projection: BaseToolRealityProjection;
  modelRequired: boolean;
  recommendedLiveGate: BaseToolRealityLiveGate;
  stages: BaseToolRealityStages;
  developerReadiness: BaseToolDeveloperReadiness;
  readiness: BaseToolRuntimeSupportStatus;
  requiredPorts: readonly string[];
  missingPorts: readonly string[];
  adapterRequiredPorts: readonly string[];
  approvalRequiredSupports: readonly string[];
  dependencies: readonly BaseToolDependencyDeclaration[];
  sourcePath?: string;
  storageDocPath: string;
  storageFiles: {
    core: boolean;
    bestPractice: boolean;
    dependencies: boolean;
    markdown: boolean;
  };
  notes: readonly string[];
};

export type BaseToolRealityLedgerSnapshot = {
  total: number;
  expectedTotal: number;
  byFamily: Readonly<Record<BaseToolFamily, number>>;
  byStorage: Readonly<Record<BaseToolStorageRealityStatus, number>>;
  byExecutorSupport: Readonly<Record<BaseToolExecutorSupportRealityStatus, number>>;
  byDependencyStatus: Readonly<Record<BaseToolDependencyRealityStatus, number>>;
  byLiveStatus: Readonly<Record<BaseToolLiveRealityStatus, number>>;
  stageCounts: {
    mounted: number;
    contractReady: number;
    hostReady: number;
    dependencyReady: number;
    liveReady: number;
    adapterRequired: number;
  };
  developerReadiness: Readonly<Record<BaseToolDeveloperReadiness, number>>;
  entries: readonly BaseToolRealityLedgerEntry[];
};

export type BaseToolRealityLedgerOptions = BaseToolSupportCatalogOptions & {
  implementedPortPaths?: readonly string[];
  liveProvenToolIds?: readonly string[];
};

const emptyFamilyCounts = (): Record<BaseToolFamily, number> => ({
  code: 0,
  shell: 0,
  git: 0,
  mcp: 0,
  computeruse: 0,
  office: 0,
  omni: 0,
  search: 0,
  skill: 0,
  custom: 0,
});

function countRecord<T extends string>(keys: readonly T[]): Record<T, number> {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<T, number>;
}

function storageFilesFor(entry: BaseToolSupportCatalogEntry): BaseToolRealityLedgerEntry["storageFiles"] {
  const directory = path.dirname(entry.storageDocPath);
  return {
    core: existsSync(path.join(directory, "core.ts")),
    bestPractice: existsSync(path.join(directory, "bestPractice.ts")),
    dependencies: existsSync(path.join(directory, "dependencies.ts")),
    markdown: existsSync(entry.storageDocPath),
  };
}

function storageStatus(files: BaseToolRealityLedgerEntry["storageFiles"]): BaseToolStorageRealityStatus {
  if (!files.markdown && !files.bestPractice && !files.core && !files.dependencies) return "missing-storage";
  return files.markdown && files.bestPractice && files.core && files.dependencies ? "canonical" : "incomplete";
}

function contractStage(input: {
  registry: BaseToolRegistryMountStatus;
  storage: BaseToolStorageRealityStatus;
  group: string;
}): BaseToolRealityStageStatus {
  if (input.registry !== "mounted") return "notReady";
  if (input.storage !== "canonical") return "notReady";
  if (input.group.trim().length === 0) return "notReady";
  return "ready";
}

function requiredPortsFor(entry: BaseToolSupportCatalogEntry): readonly string[] {
  return [
    ...new Set(entry.requiredSupports
      .map((support) => support.portPath)
      .filter((portPath): portPath is string => portPath !== undefined)),
  ].sort();
}

function missingPortsFor(entry: BaseToolSupportCatalogEntry): readonly string[] {
  return [
    ...new Set(entry.requiredSupports
      .filter((support) => (
        support.required &&
        support.portPath !== undefined &&
        (support.status === "notImplemented" || support.status === "unavailable" || support.status === "disabled")
      ))
      .map((support) => support.portPath as string)),
  ].sort();
}

function executorSupportFor(entry: BaseToolSupportCatalogEntry, missingPorts: readonly string[]): BaseToolExecutorSupportRealityStatus {
  const requiredPorts = requiredPortsFor(entry);
  if (requiredPorts.length === 0) return missingPorts.length === 0 ? "hostReady" : "adapterRequired";
  if (missingPorts.length === 0) return "hostReady";
  if (requiredPorts.length === missingPorts.length) return "adapterRequired";
  return "notReady";
}

function dependencyStatusFor(entry: BaseToolSupportCatalogEntry, missingPorts: readonly string[]): BaseToolDependencyRealityStatus {
  const requiredSupports = entry.requiredSupports.filter((support) => support.required);
  if (requiredSupports.some((support) => support.status === "disabled")) return "blocked";
  if (missingPorts.length > 0) return "providerUnavailable";
  if (requiredSupports.some((support) => support.status === "requiresApproval")) return "requiresApproval";
  if (requiredSupports.some((support) => support.supportKind === "host-dependency" && support.status === "unavailable")) {
    return "missing";
  }
  return "available";
}

function capabilityClassFor(
  entry: BaseToolSupportCatalogEntry,
  executorSupport: BaseToolExecutorSupportRealityStatus,
): BaseToolRealityCapabilityClass {
  if (entry.family === "skill") {
    if (entry.toolId === "skill.ripgrep") return "contextSearch";
    if (entry.toolId === "skill.generate" || entry.toolId === "skill.iterate" || entry.toolId === "skill.remove") {
      return "governedAuthoring";
    }
    return "contextMaterial";
  }
  return executorSupport === "hostReady" ? "hostRuntime" : "externalAdapter";
}

function projectionFor(entry: BaseToolSupportCatalogEntry, capabilityClass: BaseToolRealityCapabilityClass): BaseToolRealityProjection {
  if (entry.family === "skill" && (capabilityClass === "contextMaterial" || capabilityClass === "contextSearch")) {
    return "promptPackMaterial";
  }
  if (entry.family === "skill" && capabilityClass === "governedAuthoring") return "authoringArtifact";
  return "runtimeObservation";
}

function modelRequiredFor(entry: BaseToolSupportCatalogEntry): boolean {
  if (entry.family === "skill") return false;
  return entry.family === "omni";
}

function recommendedLiveGateFor(entry: BaseToolSupportCatalogEntry, capabilityClass: BaseToolRealityCapabilityClass): BaseToolRealityLiveGate {
  if (entry.family === "skill") return "noModelSmoke";
  if (capabilityClass === "externalAdapter") return "adapterSmoke";
  return "dialogueSmoke";
}

function stagesFor(input: {
  registry: BaseToolRegistryMountStatus;
  storage: BaseToolStorageRealityStatus;
  group: string;
  executorSupport: BaseToolExecutorSupportRealityStatus;
  dependencyStatus: BaseToolDependencyRealityStatus;
  liveStatus: BaseToolLiveRealityStatus;
}): BaseToolRealityStages {
  return {
    mounted: input.registry === "mounted" ? "ready" : "notReady",
    contractReady: contractStage(input),
    hostReady: input.executorSupport === "hostReady" ? "ready" : "adapterRequired",
    dependencyReady:
      input.dependencyStatus === "available"
        ? "ready"
        : input.dependencyStatus === "requiresApproval" || input.dependencyStatus === "installable"
          ? "requiresApproval"
          : "notReady",
    liveReady: input.liveStatus === "liveReady" ? "ready" : "notProven",
  };
}

function developerReadinessFor(stages: BaseToolRealityStages): BaseToolDeveloperReadiness {
  if (stages.mounted !== "ready" || stages.contractReady !== "ready") return "contractIncomplete";
  if (stages.hostReady === "adapterRequired" || stages.dependencyReady === "notReady") return "adapterRequired";
  if (stages.dependencyReady === "requiresApproval") return "usableWithApproval";
  if (stages.liveReady !== "ready") return "notLiveProven";
  return "ready";
}

function notesFor(input: {
  entry: BaseToolSupportCatalogEntry;
  registry: BaseToolRegistryMountStatus;
  storage: BaseToolStorageRealityStatus;
  missingPorts: readonly string[];
  dependencyStatus: BaseToolDependencyRealityStatus;
  liveStatus: BaseToolLiveRealityStatus;
}): readonly string[] {
  const notes: string[] = [];
  if (input.registry === "missing") notes.push("registry lookup failed");
  if (input.storage !== "canonical") notes.push(`storage is ${input.storage}`);
  if (input.missingPorts.length > 0) notes.push(`missing runtime ports: ${input.missingPorts.join(", ")}`);
  if (input.dependencyStatus === "requiresApproval") notes.push("one or more required supports need approval");
  if (input.entry.family === "skill") {
    notes.push("skillBase is local context material or governed skill authoring; no model provider is required by the skill host");
  }
  if (input.liveStatus === "notProven") notes.push("no live smoke proof registered for this tool");
  return notes;
}

export function createBaseToolRealityLedger(
  options: BaseToolRealityLedgerOptions = {},
): readonly BaseToolRealityLedgerEntry[] {
  const implementedPortPaths = options.implementedPortPaths ?? listRuntimeBaseToolImplementedPortPaths();
  const catalog = createBaseToolSupportCatalog({ ...options, implementedPortPaths });
  const registry = createBaseToolRegistry();
  const liveProven = new Set(options.liveProvenToolIds ?? []);

  return catalog.map((entry) => {
    const lookup = registry.lookupHandler(entry.toolId);
    const registryStatus: BaseToolRegistryMountStatus = lookup.ok ? "mounted" : "missing";
    const storageFiles = storageFilesFor(entry);
    const storage = storageStatus(storageFiles);
    const missingPorts = missingPortsFor(entry);
    const executorSupport = executorSupportFor(entry, missingPorts);
    const dependencyStatus = dependencyStatusFor(entry, missingPorts);
    const capabilityClass = capabilityClassFor(entry, executorSupport);
    const projection = projectionFor(entry, capabilityClass);
    const modelRequired = modelRequiredFor(entry);
    const recommendedLiveGate = recommendedLiveGateFor(entry, capabilityClass);
    const approvalRequiredSupports = entry.requiredSupports
      .filter((support) => support.status === "requiresApproval")
      .map((support) => support.supportId)
      .sort();
    const liveStatus: BaseToolLiveRealityStatus = liveProven.has(entry.toolId) ? "liveReady" : "notProven";
    const stages = stagesFor({
      registry: registryStatus,
      storage,
      group: entry.group,
      executorSupport,
      dependencyStatus,
      liveStatus,
    });

    return {
      toolId: entry.toolId,
      family: entry.family,
      storageFamily: entry.storageFamily,
      group: entry.group,
      title: entry.title,
      riskLevel: entry.riskLevel,
      registry: registryStatus,
      storage,
      executorSupport,
      dependencyStatus,
      liveStatus,
      capabilityClass,
      projection,
      modelRequired,
      recommendedLiveGate,
      stages,
      developerReadiness: developerReadinessFor(stages),
      readiness: entry.readiness,
      requiredPorts: requiredPortsFor(entry),
      missingPorts,
      adapterRequiredPorts: missingPorts,
      approvalRequiredSupports,
      dependencies: entry.dependencies,
      sourcePath: entry.sourcePath,
      storageDocPath: entry.storageDocPath,
      storageFiles,
      notes: notesFor({ entry, registry: registryStatus, storage, missingPorts, dependencyStatus, liveStatus }),
    };
  });
}

export function snapshotBaseToolRealityLedger(
  options: BaseToolRealityLedgerOptions = {},
): BaseToolRealityLedgerSnapshot {
  const entries = createBaseToolRealityLedger(options);
  const byFamily = emptyFamilyCounts();
  const byStorage = countRecord<BaseToolStorageRealityStatus>(["canonical", "incomplete", "missing-storage"]);
  const byExecutorSupport = countRecord<BaseToolExecutorSupportRealityStatus>(["hostReady", "adapterRequired", "notReady"]);
  const byDependencyStatus = countRecord<BaseToolDependencyRealityStatus>([
    "available",
    "missing",
    "installable",
    "requiresApproval",
    "blocked",
    "providerUnavailable",
  ]);
  const byLiveStatus = countRecord<BaseToolLiveRealityStatus>(["liveReady", "notProven"]);
  const developerReadiness = countRecord<BaseToolDeveloperReadiness>([
    "ready",
    "usableWithApproval",
    "adapterRequired",
    "contractIncomplete",
    "notLiveProven",
  ]);
  const stageCounts = {
    mounted: 0,
    contractReady: 0,
    hostReady: 0,
    dependencyReady: 0,
    liveReady: 0,
    adapterRequired: 0,
  };

  for (const entry of entries) {
    byFamily[entry.family] += 1;
    byStorage[entry.storage] += 1;
    byExecutorSupport[entry.executorSupport] += 1;
    byDependencyStatus[entry.dependencyStatus] += 1;
    byLiveStatus[entry.liveStatus] += 1;
    developerReadiness[entry.developerReadiness] += 1;
    if (entry.stages.mounted === "ready") stageCounts.mounted += 1;
    if (entry.stages.contractReady === "ready") stageCounts.contractReady += 1;
    if (entry.stages.hostReady === "ready") stageCounts.hostReady += 1;
    if (entry.stages.dependencyReady === "ready") stageCounts.dependencyReady += 1;
    if (entry.stages.liveReady === "ready") stageCounts.liveReady += 1;
    if (entry.stages.hostReady === "adapterRequired") stageCounts.adapterRequired += 1;
  }

  return {
    total: entries.length,
    expectedTotal: baseToolRegistryDescriptor.builtinToolCountTarget,
    byFamily,
    byStorage,
    byExecutorSupport,
    byDependencyStatus,
    byLiveStatus,
    stageCounts,
    developerReadiness,
    entries,
  };
}

export function inspectBaseToolReality(
  toolId: string,
  options: BaseToolRealityLedgerOptions = {},
): BaseToolRealityLedgerEntry | undefined {
  return createBaseToolRealityLedger(options).find((entry) => entry.toolId === toolId.trim());
}

export const baseToolRealityLedgerDescriptor = {
  surface: "runtime.execEngine.baseToolRealityLedger",
  catalogSource: "runtime.execEngine.baseToolSupportCatalog",
  registryChainRequired: true,
  storageCanonicalFiles: ["core.ts", "bestPractice.ts", "dependencies.ts", "*.md"],
  defaultLiveStatus: "notProven",
  statusAxis: ["mounted", "contractReady", "hostReady", "adapterReady", "liveReady"],
  implementedAdaptersSource: baseToolExecutorPortFactoryDescriptor.surface,
} as const;
