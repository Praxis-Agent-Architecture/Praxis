import type {
  BaseToolDependencyDeclaration,
  BaseToolFamily,
  BaseToolRiskLevel,
} from "../../basetool/types.js";
import {
  createBaseToolSupportCatalog,
  type BaseToolRuntimeSupportStatus,
  type BaseToolSupportCatalogEntry,
  type BaseToolSupportCatalogOptions,
} from "./baseToolSupportCatalog.js";

export type BaseToolRegistryMountStatus = "mounted" | "missing";
export type BaseToolStorageRealityStatus = "semantic-catalog" | "missing-storage" | "canonical" | "incomplete";
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
  byFamily: Readonly<Record<string, number>>;
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

function requiredPortsFor(entry: BaseToolSupportCatalogEntry): readonly string[] {
  return entry.requiredSupports
    .map((support) => support.portPath)
    .filter((portPath): portPath is string => portPath !== undefined)
    .sort();
}

function capabilityClass(entry: BaseToolSupportCatalogEntry): BaseToolRealityCapabilityClass {
  if (entry.storageFamily === "coreBase" && entry.group === "filesystem") return "contextMaterial";
  if (entry.storageFamily === "coreBase" && entry.group === "web") return "contextSearch";
  if (entry.storageFamily === "agentBase") return "externalAdapter";
  if (entry.riskLevel === "risky" || entry.riskLevel === "dangerous") return "hostRuntime";
  return "governedAuthoring";
}

function toLedgerEntry(entry: BaseToolSupportCatalogEntry, liveProvenToolIds: readonly string[] = []): BaseToolRealityLedgerEntry {
  const requiredPorts = requiredPortsFor(entry);
  const missingPorts = entry.requiredSupports
    .filter((support) => support.status === "unavailable" || support.status === "notImplemented" || support.status === "disabled")
    .map((support) => support.portPath ?? support.supportId);
  const approvalRequiredSupports = entry.requiredSupports
    .filter((support) => support.status === "requiresApproval")
    .map((support) => support.supportId);
  const executorSupport: BaseToolExecutorSupportRealityStatus =
    missingPorts.length === 0
      ? "hostReady"
      : requiredPorts.length > 0
        ? "adapterRequired"
        : "notReady";
  const dependencyStatus: BaseToolDependencyRealityStatus =
    approvalRequiredSupports.length > 0
      ? "requiresApproval"
      : missingPorts.length > 0
        ? "providerUnavailable"
        : "available";
  const liveStatus: BaseToolLiveRealityStatus = liveProvenToolIds.includes(entry.toolId) ? "liveReady" : "notProven";
  const hostReadyStage: BaseToolRealityStageStatus =
    executorSupport === "hostReady" ? "ready" : executorSupport === "adapterRequired" ? "adapterRequired" : "notReady";
  const dependencyStage: BaseToolRealityStageStatus =
    dependencyStatus === "available" ? "ready" : dependencyStatus === "requiresApproval" ? "requiresApproval" : "adapterRequired";

  return {
    toolId: entry.toolId,
    family: entry.family,
    storageFamily: entry.storageFamily,
    group: entry.group,
    title: entry.title,
    riskLevel: entry.riskLevel === "safe" ? "safe" : entry.riskLevel === "dangerous" ? "dangerous" : "risky",
    registry: "mounted",
    storage: "semantic-catalog",
    executorSupport,
    dependencyStatus,
    liveStatus,
    capabilityClass: capabilityClass(entry),
    projection: entry.family === "runtime" ? "authoringArtifact" : "runtimeObservation",
    modelRequired: entry.family !== "runtime",
    recommendedLiveGate: entry.riskLevel === "safe" ? "adapterSmoke" : "dialogueSmoke",
    stages: {
      mounted: "ready",
      contractReady: "ready",
      hostReady: hostReadyStage,
      dependencyReady: dependencyStage,
      liveReady: liveStatus === "liveReady" ? "ready" : "notProven",
    },
    developerReadiness:
      executorSupport === "hostReady"
        ? "ready"
        : approvalRequiredSupports.length > 0
          ? "usableWithApproval"
          : "adapterRequired",
    readiness: entry.readiness,
    requiredPorts,
    missingPorts,
    adapterRequiredPorts: missingPorts,
    approvalRequiredSupports,
    dependencies: entry.dependencies,
    sourcePath: entry.sourcePath,
    storageDocPath: entry.storageDocPath,
    storageFiles: {
      core: true,
      bestPractice: true,
      dependencies: entry.dependencies.length > 0,
      markdown: false,
    },
    notes: ["semantic basetool catalog entry"],
  };
}

function increment<T extends string>(record: Record<T, number>, key: T): void {
  record[key] = (record[key] ?? 0) + 1;
}

export function createBaseToolRealityLedger(
  options: BaseToolRealityLedgerOptions = {},
): readonly BaseToolRealityLedgerEntry[] {
  return createBaseToolSupportCatalog(options)
    .map((entry) => toLedgerEntry(entry, options.liveProvenToolIds))
    .sort((left, right) => left.toolId.localeCompare(right.toolId));
}

export function snapshotBaseToolRealityLedger(
  options: BaseToolRealityLedgerOptions = {},
): BaseToolRealityLedgerSnapshot {
  const entries = createBaseToolRealityLedger(options);
  const byFamily: Record<string, number> = {};
  const byStorage: Record<BaseToolStorageRealityStatus, number> = {
    "semantic-catalog": 0,
    "missing-storage": 0,
    canonical: 0,
    incomplete: 0,
  };
  const byExecutorSupport: Record<BaseToolExecutorSupportRealityStatus, number> = {
    hostReady: 0,
    adapterRequired: 0,
    notReady: 0,
  };
  const byDependencyStatus: Record<BaseToolDependencyRealityStatus, number> = {
    available: 0,
    missing: 0,
    installable: 0,
    requiresApproval: 0,
    blocked: 0,
    providerUnavailable: 0,
  };
  const byLiveStatus: Record<BaseToolLiveRealityStatus, number> = {
    liveReady: 0,
    notProven: 0,
  };
  const developerReadiness: Record<BaseToolDeveloperReadiness, number> = {
    ready: 0,
    usableWithApproval: 0,
    adapterRequired: 0,
    contractIncomplete: 0,
    notLiveProven: 0,
  };
  const stageCounts = {
    mounted: 0,
    contractReady: 0,
    hostReady: 0,
    dependencyReady: 0,
    liveReady: 0,
    adapterRequired: 0,
  };

  for (const entry of entries) {
    byFamily[entry.family] = (byFamily[entry.family] ?? 0) + 1;
    increment(byStorage, entry.storage);
    increment(byExecutorSupport, entry.executorSupport);
    increment(byDependencyStatus, entry.dependencyStatus);
    increment(byLiveStatus, entry.liveStatus);
    increment(developerReadiness, entry.developerReadiness);
    if (entry.stages.mounted === "ready") stageCounts.mounted += 1;
    if (entry.stages.contractReady === "ready") stageCounts.contractReady += 1;
    if (entry.stages.hostReady === "ready") stageCounts.hostReady += 1;
    if (entry.stages.dependencyReady === "ready") stageCounts.dependencyReady += 1;
    if (entry.stages.liveReady === "ready") stageCounts.liveReady += 1;
    if (entry.stages.hostReady === "adapterRequired" || entry.stages.dependencyReady === "adapterRequired") stageCounts.adapterRequired += 1;
  }

  return {
    total: entries.length,
    expectedTotal: entries.length,
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
  semanticCatalog: true,
  expectedTotal: "semantic basetool catalog size",
  implementedAdaptersSource: "runtime.execEngine.baseToolExecutorPortFactory",
} as const;
