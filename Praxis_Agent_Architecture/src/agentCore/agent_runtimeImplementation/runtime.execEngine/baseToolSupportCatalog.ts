/*
 * 文件定位：Agent 运行态实现层 / 执行引擎运行态绑定面 / baseTool 支持目录。
 * 核心目的：按 storage-owned baseTool 的 family/group/toolId 和 dependencies.ts 合同生成 runtime 支持视图。
 * 能力要求1：需要覆盖已经进入 builtinBaseToolHandlers 的 175 个 baseTool handler。
 * 能力要求2：需要把 BaseToolExecutorPort 视为底层宿主能力插座，而不是新的 baseTool 分类法。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import type {
  BaseToolDefinition,
  BaseToolDependencyDeclaration,
  BaseToolFamily,
} from "../../agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { builtinBaseToolHandlers } from "../../agent_executionEngine/basic_toolLayer/baseTools/builtinBaseToolHandlers.js";

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
  dependencyKind: BaseToolDependencyDeclaration["kind"];
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
  riskLevel: BaseToolDefinition["riskLevel"];
  permissionHints: readonly string[];
  dependencies: readonly BaseToolDependencyDeclaration[];
  requiredSupports: readonly BaseToolRuntimeSupportRequirement[];
  readiness: BaseToolRuntimeSupportStatus;
  sourcePath?: string;
  storageDocPath: string;
};

export type BaseToolSupportCatalogSnapshot = {
  total: number;
  byFamily: Readonly<Record<BaseToolFamily, number>>;
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

export type BaseToolRuntimeReadinessDecision =
  | "allowed"
  | "blocked"
  | "requiresApproval";

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
};

const familyDirectoryByFamily: Readonly<Record<BaseToolFamily, string>> = {
  code: "codeBase",
  shell: "shellBase",
  git: "gitBase",
  mcp: "mcpBase",
  computeruse: "computeruseBase",
  office: "officeBase",
  omni: "omniBase",
  search: "searchBase",
  skill: "skillBase",
  custom: "custom",
};

const executorRoots = new Set([
  "artifact",
  "computeruse",
  "custom",
  "debug",
  "device",
  "filesystem",
  "git",
  "lsp",
  "mcp",
  "network",
  "office",
  "omni",
  "process",
  "search",
  "shell",
  "skill",
]);

function emptyFamilyCounts(): Record<BaseToolFamily, number> {
  return {
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
  };
}

function emptyReadinessCounts(): Record<BaseToolRuntimeSupportStatus, number> {
  return {
    available: 0,
    unavailable: 0,
    disabled: 0,
    requiresApproval: 0,
    notImplemented: 0,
  };
}

function normalizePath(value: string | undefined): string | undefined {
  return value?.split("\\").join("/");
}

function pathSegmentsAfter(pathValue: string | undefined, marker: string): readonly string[] {
  const normalized = normalizePath(pathValue);
  if (normalized === undefined) return [];
  const markerIndex = normalized.indexOf(marker);
  if (markerIndex === -1) return [];
  return normalized.slice(markerIndex + marker.length).split("/").filter(Boolean);
}

function storageCoordinates(definition: BaseToolDefinition): { storageFamily: string; group: string; storageDocPath: string } {
  const storageSegments = pathSegmentsAfter(definition.toolSkill.docPath, "/baseToolStorage/");
  if (storageSegments.length >= 4) {
    return {
      storageFamily: storageSegments[0] ?? familyDirectoryByFamily[definition.family],
      group: storageSegments[1] ?? "(flat)",
      storageDocPath: definition.toolSkill.docPath,
    };
  }

  if (storageSegments.length >= 3) {
    return {
      storageFamily: storageSegments[0] ?? familyDirectoryByFamily[definition.family],
      group: "(flat)",
      storageDocPath: definition.toolSkill.docPath,
    };
  }

  const sourceSegments = pathSegmentsAfter(definition.sourcePath, "/baseTools/");
  if (sourceSegments.length >= 3) {
    return {
      storageFamily: sourceSegments[0] ?? familyDirectoryByFamily[definition.family],
      group: sourceSegments[1] ?? "(flat)",
      storageDocPath: definition.toolSkill.docPath,
    };
  }

  return {
    storageFamily: familyDirectoryByFamily[definition.family],
    group: "(flat)",
    storageDocPath: definition.toolSkill.docPath,
  };
}

function splitRuntimeLeaf(value: string): readonly string[] {
  const [root, rest] = value.split(".", 2);
  if (root === undefined || rest === undefined) {
    return value.trim().length > 0 ? [value.trim()] : [];
  }

  return rest
    .split(/[|/]/u)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => (part.includes(".") ? part : `${root}.${part}`));
}

function portPathsFromDependencyId(dependencyId: string): readonly string[] {
  if (dependencyId === "runtime.execEngine.shellExecutor") return ["shell.run"];

  const runtimePrefixes = ["runtime.execEngine.", "runtime.executor."];
  for (const prefix of runtimePrefixes) {
    if (!dependencyId.startsWith(prefix)) continue;
    const rest = dependencyId.slice(prefix.length);
    const [root, leaf = ""] = rest.split(".", 2);
    if (root === undefined || !executorRoots.has(root)) return [];
    if (leaf.length === 0) return [];
    return splitRuntimeLeaf(rest);
  }

  return [];
}

function portPathsFromDescription(description: string): readonly string[] {
  const matches = [...description.matchAll(/BaseToolExecutorPort\.([A-Za-z0-9_.|/]+)/gu)];
  return matches.flatMap((match) => splitRuntimeLeaf(match[1] ?? ""));
}

function supportKindForDependency(dependency: BaseToolDependencyDeclaration, portPath: string | undefined): BaseToolRuntimeSupportKind {
  if (portPath !== undefined) return "executor-port";
  if (dependency.kind === "permission") return "permission";
  if (dependency.dependencyId.startsWith("provider.")) return "provider-carrier";
  if (dependency.kind === "binary" || dependency.kind === "package" || dependency.kind === "device" || dependency.kind === "network") {
    return "host-dependency";
  }
  return "runtime-contract";
}

function hasPortMethod(executor: BaseToolExecutorPort | undefined, portPath: string | undefined): boolean {
  if (executor === undefined || portPath === undefined) return false;
  const [namespace, method] = portPath.split(".");
  if (namespace === undefined || method === undefined) return false;
  const namespaceValue = (executor as unknown as Record<string, unknown>)[namespace];
  if (typeof namespaceValue !== "object" || namespaceValue === null) return false;
  return typeof (namespaceValue as Record<string, unknown>)[method] === "function";
}

function isDeclaredImplementedPort(options: BaseToolSupportCatalogOptions, portPath: string | undefined): boolean {
  if (portPath === undefined) return false;
  if (options.implementedPortPaths === undefined) return true;
  return options.implementedPortPaths.includes(portPath);
}

function statusForRequirement(
  supportId: string,
  supportKind: BaseToolRuntimeSupportKind,
  portPath: string | undefined,
  options: BaseToolSupportCatalogOptions,
): BaseToolRuntimeSupportStatus {
  const override = options.supportStatusOverrides?.[supportId] ?? (portPath !== undefined ? options.supportStatusOverrides?.[portPath] : undefined);
  if (override !== undefined) return override;
  if (options.disabledSupports?.includes(supportId) === true || (portPath !== undefined && options.disabledSupports?.includes(portPath) === true)) {
    return "disabled";
  }
  if (
    options.approvalRequiredSupports?.includes(supportId) === true ||
    (portPath !== undefined && options.approvalRequiredSupports?.includes(portPath) === true)
  ) {
    return "requiresApproval";
  }
  if (supportKind === "permission") return "requiresApproval";
  if (supportKind === "executor-port") {
    return hasPortMethod(options.executor, portPath) && isDeclaredImplementedPort(options, portPath)
      ? "available"
      : "notImplemented";
  }
  return "unavailable";
}

function requirementsForDependency(
  dependency: BaseToolDependencyDeclaration,
  options: BaseToolSupportCatalogOptions,
): readonly BaseToolRuntimeSupportRequirement[] {
  const portPaths = [...new Set([...portPathsFromDependencyId(dependency.dependencyId), ...portPathsFromDescription(dependency.description)])];
  const explicitPortPaths = portPaths.length > 0 ? portPaths : [undefined];

  return explicitPortPaths.map((portPath) => {
    const supportKind = supportKindForDependency(dependency, portPath);
    const supportId = portPath ?? dependency.dependencyId;
    return {
      supportId,
      dependencyId: dependency.dependencyId,
      dependencyKind: dependency.kind,
      supportKind,
      required: dependency.required,
      description: dependency.description,
      portPath,
      status: statusForRequirement(supportId, supportKind, portPath, options),
    };
  });
}

function entryReadiness(requirements: readonly BaseToolRuntimeSupportRequirement[]): BaseToolRuntimeSupportStatus {
  const required = requirements.filter((requirement) => requirement.required);
  if (required.some((requirement) => requirement.status === "disabled")) return "disabled";
  if (required.some((requirement) => requirement.status === "requiresApproval")) return "requiresApproval";
  if (required.some((requirement) => requirement.status === "notImplemented")) return "notImplemented";
  if (required.some((requirement) => requirement.status === "unavailable")) return "unavailable";
  return "available";
}

function entryFromDefinition(
  definition: BaseToolDefinition,
  options: BaseToolSupportCatalogOptions,
): BaseToolSupportCatalogEntry {
  const coordinates = storageCoordinates(definition);
  const requiredSupports = definition.dependencies.flatMap((dependency) => requirementsForDependency(dependency, options));
  return {
    toolId: definition.toolId,
    family: definition.family,
    storageFamily: coordinates.storageFamily,
    group: coordinates.group,
    title: definition.title,
    riskLevel: definition.riskLevel,
    permissionHints: definition.permissionHints,
    dependencies: definition.dependencies,
    requiredSupports,
    readiness: entryReadiness(requiredSupports),
    sourcePath: definition.sourcePath,
    storageDocPath: coordinates.storageDocPath,
  };
}

export function createBaseToolSupportCatalog(
  options: BaseToolSupportCatalogOptions = {},
): readonly BaseToolSupportCatalogEntry[] {
  return builtinBaseToolHandlers
    .map((handler) => entryFromDefinition(handler.definition, options))
    .sort((left, right) => left.toolId.localeCompare(right.toolId));
}

export function snapshotBaseToolSupportCatalog(
  options: BaseToolSupportCatalogOptions = {},
): BaseToolSupportCatalogSnapshot {
  const entries = createBaseToolSupportCatalog(options);
  const byFamily = emptyFamilyCounts();
  const byReadiness = emptyReadinessCounts();

  for (const entry of entries) {
    byFamily[entry.family] += 1;
    byReadiness[entry.readiness] += 1;
  }

  return {
    total: entries.length,
    byFamily,
    byReadiness,
    entries,
  };
}

export function evaluateBaseToolRuntimeReadiness(
  request: BaseToolRuntimeReadinessPreflightRequest,
): BaseToolRuntimeReadinessPreflight {
  const toolId = request.toolId.trim();
  const entry = createBaseToolSupportCatalog(request).find((candidate) => candidate.toolId === toolId);
  if (entry === undefined) {
    return {
      toolId,
      found: false,
      decision: "blocked",
      readiness: "notImplemented",
      blockingSupports: [],
      approvalSupports: [],
      advisorySupports: [],
      events: ["runtime.execEngine.baseToolSupportCatalog.preflight.missingTool"],
      reason: `baseTool ${toolId} is not present in runtime support catalog`,
    };
  }

  const required = entry.requiredSupports.filter((support) => support.required);
  const blockingSupports = required.filter((support) => (
    support.supportKind === "executor-port" &&
    (support.status === "disabled" || support.status === "notImplemented" || support.status === "unavailable")
  ));
  const approvalSupports = required.filter((support) => support.status === "requiresApproval");
  const advisorySupports = required.filter((support) => (
    support.supportKind !== "executor-port" &&
    (support.status === "unavailable" || support.status === "notImplemented")
  ));

  if (blockingSupports.length > 0) {
    return {
      toolId,
      found: true,
      decision: "blocked",
      readiness: entry.readiness,
      entry,
      blockingSupports,
      approvalSupports,
      advisorySupports,
      events: ["runtime.execEngine.baseToolSupportCatalog.preflight.blocked"],
      reason: `baseTool ${toolId} is missing runtime executor support: ${blockingSupports.map((support) => support.supportId).join(", ")}`,
    };
  }

  if (approvalSupports.length > 0) {
    return {
      toolId,
      found: true,
      decision: "requiresApproval",
      readiness: entry.readiness,
      entry,
      blockingSupports,
      approvalSupports,
      advisorySupports,
      events: ["runtime.execEngine.baseToolSupportCatalog.preflight.requiresApproval"],
      reason: `baseTool ${toolId} has runtime supports that require approval: ${approvalSupports.map((support) => support.supportId).join(", ")}`,
    };
  }

  return {
    toolId,
    found: true,
    decision: "allowed",
    readiness: entry.readiness,
    entry,
    blockingSupports,
    approvalSupports,
    advisorySupports,
    events: ["runtime.execEngine.baseToolSupportCatalog.preflight.allowed"],
    reason: `baseTool ${toolId} has required executor support available`,
  };
}

export const baseToolSupportCatalogDescriptor = {
  surface: "runtime.execEngine.baseToolSupportCatalog",
  catalogSource: "agentCore.basicTool.builtinBaseToolHandlers.definition.dependencies",
  classificationAxis: "storage-family-group-toolId",
  toolCountTarget: 175,
  excludesOfficialTapOfficeBase: true,
  executorPortIsSupportPrimitive: true,
  preflightDecision: "blocks-missing-runtime-executor-support",
} as const;
