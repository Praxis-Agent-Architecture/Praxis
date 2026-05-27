import type {
  BaseToolDefinition,
  BaseToolExecutorPort,
  BaseToolFamily,
  BaseToolPolicyRisk,
} from "./types.js";
import { semanticBaseToolCatalog } from "./catalog.js";

export type BaseToolRuntimeSupportStatus =
  | "available"
  | "unavailable"
  | "disabled"
  | "requiresApproval"
  | "notImplemented";

export type BaseToolRuntimeSupportKind =
  | "executor-port"
  | "permission"
  | "runtime-contract"
  | "provider-carrier"
  | "host-dependency";

export type BaseToolRuntimeSupportRequirement = {
  supportId: string;
  dependencyId: string;
  dependencyKind: string;
  supportKind: BaseToolRuntimeSupportKind;
  required: boolean;
  description: string;
  portPath?: string;
  status: BaseToolRuntimeSupportStatus;
};

export type BaseToolSupportCatalogEntry = {
  toolId: string;
  family: BaseToolFamily;
  storageFamily: string;
  group: string;
  title: string;
  riskLevel: BaseToolPolicyRisk;
  permissionHints: readonly string[];
  dependencies: BaseToolDefinition["dependencies"];
  requiredSupports: readonly BaseToolRuntimeSupportRequirement[];
  readiness: BaseToolRuntimeSupportStatus;
  sourcePath?: string;
  storageDocPath: string;
};

export type BaseToolSupportCatalogSnapshot = {
  total: number;
  byFamily: Readonly<Record<string, number>>;
  byReadiness: Readonly<Record<BaseToolRuntimeSupportStatus, number>>;
  entries: readonly BaseToolSupportCatalogEntry[];
};

export type BaseToolSupportCatalogOptions = {
  executor?: BaseToolExecutorPort;
  implementedPortPaths?: readonly string[];
  disabledSupports?: readonly string[];
  approvalRequiredSupports?: readonly string[];
  supportStatusOverrides?: Readonly<Record<string, BaseToolRuntimeSupportStatus>>;
};

export type BaseToolRuntimeReadinessDecision = "allowed" | "blocked" | "requiresApproval";

export type BaseToolRuntimeReadinessPreflight = {
  toolId: string;
  found: boolean;
  decision: BaseToolRuntimeReadinessDecision;
  readiness: BaseToolRuntimeSupportStatus;
  entry?: BaseToolSupportCatalogEntry;
  blockingSupports: readonly BaseToolRuntimeSupportRequirement[];
  approvalSupports: readonly BaseToolRuntimeSupportRequirement[];
  advisorySupports: readonly BaseToolRuntimeSupportRequirement[];
  events: readonly string[];
  reason: string;
};

export type BaseToolRuntimeReadinessPreflightRequest = BaseToolSupportCatalogOptions & {
  toolId: string;
  toolInput?: unknown;
};

function hasExecutorPort(executor: BaseToolExecutorPort | undefined, portPath: string): boolean {
  const [namespace, method] = portPath.split(".", 2);
  if (namespace === undefined || method === undefined) return false;
  const handler = executor?.[namespace]?.[method];
  if (handler === undefined) return false;
  if (typeof handler === "function" && (handler as { __praxisUnavailablePortFallback?: true }).__praxisUnavailablePortFallback === true) return false;
  return true;
}

function statusForPort(portPath: string, options: BaseToolSupportCatalogOptions): BaseToolRuntimeSupportStatus {
  const override = options.supportStatusOverrides?.[portPath];
  if (override !== undefined) return override;
  if (options.disabledSupports?.includes(portPath) === true) return "disabled";
  if (options.approvalRequiredSupports?.includes(portPath) === true) return "requiresApproval";
  if (options.implementedPortPaths?.includes(portPath) === true) return "available";
  if (hasExecutorPort(options.executor, portPath)) return "available";
  return "unavailable";
}

function toEntry(definition: BaseToolDefinition, options: BaseToolSupportCatalogOptions): BaseToolSupportCatalogEntry {
  const requiredSupports = definition.runtimePorts.map((portPath) => ({
    supportId: `executor:${portPath}`,
    dependencyId: `runtime.executor.${portPath}`,
    dependencyKind: "runtime",
    supportKind: "executor-port" as const,
    required: true,
    description: `Requires BaseToolExecutorPort.${portPath}.`,
    portPath,
    status: statusForPort(portPath, options),
  }));
  const readiness = requiredSupports.some((support) => support.status === "disabled")
    ? "disabled"
    : requiredSupports.some((support) => support.status === "requiresApproval")
      ? "requiresApproval"
      : requiredSupports.some((support) => support.status === "unavailable" || support.status === "notImplemented")
        ? "unavailable"
        : "available";
  return {
    toolId: definition.toolId,
    family: definition.family,
    storageFamily: definition.storageFamily,
    group: definition.group,
    title: definition.title,
    riskLevel: definition.policyRisk,
    permissionHints: definition.permissionHints,
    dependencies: definition.dependencies,
    requiredSupports,
    readiness,
    sourcePath: definition.sourcePath,
    storageDocPath: definition.toolSkill.docPath,
  };
}

export function createBaseToolSupportCatalog(options: BaseToolSupportCatalogOptions = {}): readonly BaseToolSupportCatalogEntry[] {
  return semanticBaseToolCatalog.map((definition) => toEntry(definition, options));
}

function toolInputRecord(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Readonly<Record<string, unknown>> : {};
}

function activeSupportsFor(
  entry: BaseToolSupportCatalogEntry,
  toolInput: unknown,
): readonly BaseToolRuntimeSupportRequirement[] {
  if (entry.toolId !== "mcp.resources") return entry.requiredSupports;
  const operation = toolInputRecord(toolInput).operation;
  if (operation === "list") {
    return entry.requiredSupports.filter((support) => support.portPath !== "mcp.readResource");
  }
  if (operation === "read") {
    return entry.requiredSupports.filter((support) => support.portPath !== "mcp.listResources");
  }
  return entry.requiredSupports;
}

export function snapshotBaseToolSupportCatalog(options: BaseToolSupportCatalogOptions = {}): BaseToolSupportCatalogSnapshot {
  const entries = createBaseToolSupportCatalog(options);
  const byFamily: Record<string, number> = {};
  const byReadiness: Record<BaseToolRuntimeSupportStatus, number> = {
    available: 0,
    unavailable: 0,
    disabled: 0,
    requiresApproval: 0,
    notImplemented: 0,
  };
  for (const entry of entries) {
    byFamily[entry.family] = (byFamily[entry.family] ?? 0) + 1;
    byReadiness[entry.readiness] += 1;
  }
  return { total: entries.length, byFamily, byReadiness, entries };
}

export function evaluateBaseToolRuntimeReadiness(request: BaseToolRuntimeReadinessPreflightRequest): BaseToolRuntimeReadinessPreflight {
  const entry = createBaseToolSupportCatalog(request).find((candidate) => candidate.toolId === request.toolId);
  if (entry === undefined) {
    return {
      toolId: request.toolId,
      found: false,
      decision: "blocked",
      readiness: "unavailable",
      blockingSupports: [],
      approvalSupports: [],
      advisorySupports: [],
      events: ["basetool.supportCatalog.preflight.missingTool"],
      reason: `basetool ${request.toolId} is not present in the semantic support catalog`,
    };
  }
  const activeSupports = activeSupportsFor(entry, request.toolInput);
  const blockingSupports = activeSupports.filter((support) => support.status === "unavailable" || support.status === "disabled" || support.status === "notImplemented");
  const approvalSupports = activeSupports.filter((support) => support.status === "requiresApproval");
  const decision: BaseToolRuntimeReadinessDecision = blockingSupports.length > 0 ? "blocked" : approvalSupports.length > 0 ? "requiresApproval" : "allowed";
  return {
    toolId: request.toolId,
    found: true,
    decision,
    readiness: entry.readiness,
    entry,
    blockingSupports,
    approvalSupports,
    advisorySupports: activeSupports.filter((support) => !blockingSupports.includes(support) && !approvalSupports.includes(support)),
    events: [`basetool.supportCatalog.preflight.${decision}`],
    reason: decision === "allowed"
      ? `basetool ${request.toolId} has required runtime support available`
      : decision === "requiresApproval"
        ? `basetool ${request.toolId} requires runtime approval`
        : `basetool ${request.toolId} is missing runtime support`,
  };
}

export const baseToolSupportCatalogDescriptor = {
  surface: "basetool.supportCatalog",
  semanticCatalog: true,
  supportsRuntimeReadinessPreflight: true,
} as const;
