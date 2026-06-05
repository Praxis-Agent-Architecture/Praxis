/*
 * 文件定位：raxode-cli / frontend bridge readiness helpers。
 * 核心目的：让 TUI/GUI 通过 application event 消费后端准备态事实矩阵，而不是解析自然语言 summary。
 */

import type { PraxisApplicationEvent } from "@praxis-ai/praxis/application-layer";

import type {
  RaxodeBackendReadiness,
  RaxodeBackendModuleInventory,
  RaxodeBackendModuleInventoryItem,
  RaxodeBackendModuleStatus,
  RaxodeReadinessArea,
  RaxodeReadinessSeverity,
  RaxodeReadinessStatus,
} from "../../contracts.js";

export type RaxodeModuleInventoryDigest = {
  kind: "raxode.moduleInventoryDigest";
  status: "ready" | "attention" | "blocked";
  generatedAt: string;
  readyModules: readonly string[];
  passiveModules: readonly string[];
  contractModules: readonly string[];
  warningModules: readonly string[];
  missingModules: readonly string[];
  summaryLines: readonly string[];
};

export type RaxodeReadinessDigest = {
  kind: "raxode.readinessDigest";
  status: "ready" | "attention" | "blocked";
  generatedAt: string;
  blockingAreas: readonly string[];
  warningAreas: readonly string[];
  passiveAreas: readonly string[];
  contractAreas: readonly string[];
  readyAreas: readonly string[];
  moduleInventory?: RaxodeModuleInventoryDigest;
  summaryLines: readonly string[];
};

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function isReadinessStatus(value: unknown): value is RaxodeReadinessStatus {
  return value === "ready" ||
    value === "passive-ready" ||
    value === "contract-ready" ||
    value === "degraded" ||
    value === "missing";
}

function isReadinessSeverity(value: unknown): value is RaxodeReadinessSeverity {
  return value === "ok" || value === "info" || value === "warning" || value === "blocking";
}

function isModuleStatus(value: unknown): value is RaxodeBackendModuleStatus {
  return value === "ready" ||
    value === "passive-ready" ||
    value === "contract-ready" ||
    value === "degraded" ||
    value === "missing";
}

function isReadinessArea(value: unknown): value is RaxodeReadinessArea {
  const record = recordValue(value);
  return record !== undefined &&
    typeof record.area === "string" &&
    isReadinessStatus(record.status) &&
    typeof record.owner === "string" &&
    typeof record.phase === "string" &&
    isReadinessSeverity(record.severity) &&
    typeof record.summary === "string" &&
    Array.isArray(record.evidence) &&
    record.evidence.every((entry) => typeof entry === "string") &&
    recordValue(record.facts) !== undefined;
}

function isModuleInventoryItem(value: unknown): value is RaxodeBackendModuleInventoryItem {
  const record = recordValue(value);
  return record !== undefined &&
    typeof record.moduleId === "string" &&
    isModuleStatus(record.status) &&
    typeof record.surface === "string" &&
    typeof record.summary === "string" &&
    Array.isArray(record.evidence);
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isReadinessModel(value: unknown): value is RaxodeBackendReadiness["model"] {
  const record = recordValue(value);
  return record !== undefined &&
    (record.provider === undefined || typeof record.provider === "string") &&
    (record.endpointShape === undefined || typeof record.endpointShape === "string") &&
    typeof record.model === "string" &&
    (record.providerRoute === undefined || typeof record.providerRoute === "string");
}

function isReadinessTools(value: unknown): value is RaxodeBackendReadiness["tools"] {
  const record = recordValue(value);
  return record !== undefined &&
    isStringArray(record.expectedCoreToolIds) &&
    isStringArray(record.mountedToolIds);
}

function isReadinessMcp(value: unknown): value is RaxodeBackendReadiness["mcp"] {
  const record = recordValue(value);
  return record !== undefined &&
    record.kind === "raxode.mcpReadinessSummary" &&
    record.schemaVersion === "raxode.mcpReadinessSummary.v1" &&
    typeof record.configuredServerCount === "number" &&
    typeof record.enabledServerCount === "number" &&
    typeof record.disabledServerCount === "number" &&
    typeof record.enabledMcpPlusServerCount === "number" &&
    typeof record.enabledNativeServerCount === "number" &&
    isStringArray(record.configuredServerIds) &&
    isStringArray(record.enabledServerIds) &&
    isStringArray(record.enabledMcpPlusServerIds) &&
    isStringArray(record.enabledNativeServerIds) &&
    record.recommendedMode === "mcp-plus" &&
    record.nativeCompatible === true &&
    record.publicSafe === true &&
    record.profileIdentity === "serverId+project" &&
    record.runtimeOverlayIdentity === "serverId+session" &&
    record.schemaRefreshBoundary === "session-checkpoint" &&
    (record.projectId === undefined || typeof record.projectId === "string") &&
    (record.reprofileConsecutiveIndexedCalls === undefined || typeof record.reprofileConsecutiveIndexedCalls === "number");
}

function isReadinessDependency(value: unknown): value is RaxodeBackendReadiness["dependencies"][number] {
  const record = recordValue(value);
  const probe = recordValue(record?.probe);
  return record !== undefined &&
    typeof record.dependencyId === "string" &&
    typeof record.kind === "string" &&
    typeof record.required === "boolean" &&
    (record.install === undefined || typeof record.install === "string") &&
    (record.reason === undefined || typeof record.reason === "string") &&
    (record.degrade === undefined || typeof record.degrade === "string") &&
    (record.probe === undefined || (
      probe !== undefined &&
      typeof probe.status === "string" &&
      (probe.observedVersion === undefined || typeof probe.observedVersion === "string") &&
      (probe.resolvedPath === undefined || typeof probe.resolvedPath === "string") &&
      (probe.message === undefined || typeof probe.message === "string") &&
      (probe.source === undefined || typeof probe.source === "string")
    ));
}

function isReadinessPolicy(value: unknown): value is RaxodeBackendReadiness["policy"] {
  const record = recordValue(value);
  return record !== undefined &&
    typeof record.permissionProfile === "string" &&
    record.defaultMode === "permissive" &&
    record.approvalSurface === "application-layer";
}

function isSandboxDefaultExecution(value: unknown): value is RaxodeBackendReadiness["sandbox"]["defaultExecution"] {
  return value === "host-observed" ||
    value === "workspace-rollback" ||
    value === "strong-isolation";
}

function isReadinessSandbox(value: unknown): value is RaxodeBackendReadiness["sandbox"] {
  const record = recordValue(value);
  return record !== undefined &&
    typeof record.profile === "string" &&
    typeof record.isolation === "string" &&
    isSandboxDefaultExecution(record.defaultExecution) &&
    record.fallback === "workspace-rollback" &&
    (record.probe === undefined || recordValue(record.probe) !== undefined);
}

function isLocalProbe(value: unknown): value is RaxodeBackendReadiness["probe"] {
  if (value === undefined) return true;
  const record = recordValue(value);
  return record !== undefined &&
    record.kind === "raxode.localReadinessProbe" &&
    record.schemaVersion === "raxode.localReadinessProbe.v1" &&
    typeof record.generatedAt === "string" &&
    Array.isArray(record.dependencies) &&
    record.dependencies.every((dependency) => recordValue(dependency) !== undefined) &&
    recordValue(record.sandbox) !== undefined;
}

function isModuleInventory(value: unknown): value is RaxodeBackendModuleInventory {
  const record = recordValue(value);
  return record !== undefined &&
    record.kind === "raxode.backendModuleInventory" &&
    record.schemaVersion === "raxode.backendModuleInventory.v1" &&
    typeof record.generatedAt === "string" &&
    Array.isArray(record.modules) &&
    record.modules.every(isModuleInventoryItem);
}

function isConfiguredOrNot(value: unknown): value is "configured" | "not-configured" {
  return value === "configured" || value === "not-configured";
}

function isApprovalResolverPort(value: unknown): value is RaxodeBackendReadiness["ports"]["approvalResolver"] {
  return value === "configured" || value === "default-policy";
}

function isLiveProviderResolverPort(value: unknown): value is RaxodeBackendReadiness["ports"]["liveProviderResolver"] {
  return value === "configured" || value === "raxode-default";
}

function isRuntimePorts(value: unknown): value is RaxodeBackendReadiness["ports"] {
  const record = recordValue(value);
  return record !== undefined &&
    isApprovalResolverPort(record.approvalResolver) &&
    isConfiguredOrNot(record.agentReviewResolver) &&
    isConfiguredOrNot(record.contextArtifactAdapters) &&
    isConfiguredOrNot(record.baseToolAdapters) &&
    isConfiguredOrNot(record.authStateProvider) &&
    isConfiguredOrNot(record.foundationProject) &&
    isLiveProviderResolverPort(record.liveProviderResolver);
}

export function isRaxodeBackendReadiness(value: unknown): value is RaxodeBackendReadiness {
  const record = recordValue(value);
  return record !== undefined &&
    record.kind === "raxode.backendReadiness" &&
    record.schemaVersion === "raxode.backendReadiness.v1" &&
    typeof record.generatedAt === "string" &&
    typeof record.applicationId === "string" &&
    typeof record.agentId === "string" &&
    typeof record.promptPackId === "string" &&
    typeof record.permissionProfile === "string" &&
    typeof record.toolProfile === "string" &&
    typeof record.sandboxProfile === "string" &&
    typeof record.sessionPersistence === "string" &&
    typeof record.storageKind === "string" &&
    isReadinessModel(record.model) &&
    isReadinessTools(record.tools) &&
    isReadinessMcp(record.mcp) &&
    Array.isArray(record.dependencies) &&
    record.dependencies.every(isReadinessDependency) &&
    isReadinessPolicy(record.policy) &&
    isRuntimePorts(record.ports) &&
    isReadinessSandbox(record.sandbox) &&
    isModuleInventory(record.moduleInventory) &&
    isLocalProbe(record.probe) &&
    Array.isArray(record.areas) &&
    record.areas.every(isReadinessArea);
}

export function extractRaxodeReadinessFromEvent(event: PraxisApplicationEvent): RaxodeBackendReadiness | undefined {
  if (event.eventId !== "raxode.backend.readiness") return undefined;
  const readiness = recordValue(event.metadata)?.readiness;
  return isRaxodeBackendReadiness(readiness) ? readiness : undefined;
}

export function summarizeRaxodeReadiness(readiness: RaxodeBackendReadiness): RaxodeReadinessDigest {
  const blockingAreas = readiness.areas
    .filter((area) => area.severity === "blocking")
    .map((area) => area.area);
  const warningAreas = readiness.areas
    .filter((area) => area.severity === "warning")
    .map((area) => area.area);
  const passiveAreas = readiness.areas
    .filter((area) => area.status === "passive-ready")
    .map((area) => area.area);
  const contractAreas = readiness.areas
    .filter((area) => area.status === "contract-ready")
    .map((area) => area.area);
  const readyAreas = readiness.areas
    .filter((area) => area.status === "ready")
    .map((area) => area.area);
  const status = blockingAreas.length > 0
    ? "blocked"
    : warningAreas.length > 0
      ? "attention"
      : "ready";
  const moduleInventory = readiness.moduleInventory === undefined
    ? undefined
    : summarizeRaxodeModuleInventory(readiness.moduleInventory);
  return {
    kind: "raxode.readinessDigest",
    status,
    generatedAt: readiness.generatedAt,
    blockingAreas,
    warningAreas,
    passiveAreas,
    contractAreas,
    readyAreas,
    moduleInventory,
    summaryLines: readiness.areas.map((area) =>
      `${area.area}: ${area.status} (${area.owner}/${area.phase})`),
  };
}

export function summarizeRaxodeModuleInventory(inventory: RaxodeBackendModuleInventory): RaxodeModuleInventoryDigest {
  const readyModules = inventory.modules
    .filter((module) => module.status === "ready")
    .map((module) => module.moduleId);
  const passiveModules = inventory.modules
    .filter((module) => module.status === "passive-ready")
    .map((module) => module.moduleId);
  const contractModules = inventory.modules
    .filter((module) => module.status === "contract-ready")
    .map((module) => module.moduleId);
  const warningModules = inventory.modules
    .filter((module) => module.status === "degraded")
    .map((module) => module.moduleId);
  const missingModules = inventory.modules
    .filter((module) => module.status === "missing")
    .map((module) => module.moduleId);
  const status = missingModules.length > 0
    ? "blocked"
    : warningModules.length > 0
      ? "attention"
      : "ready";
  return {
    kind: "raxode.moduleInventoryDigest",
    status,
    generatedAt: inventory.generatedAt,
    readyModules,
    passiveModules,
    contractModules,
    warningModules,
    missingModules,
    summaryLines: inventory.modules.map((module) =>
      `${module.moduleId}: ${module.status} (${module.owner}/${module.surface})`),
  };
}
