import {
  baseToolProfileNames,
  getBaseToolProfile,
  listBaseToolProfiles,
} from "./profiles.js";
import {
  createBaseToolSupportCatalog,
  type BaseToolRuntimeSupportStatus,
  type BaseToolSupportCatalogEntry,
} from "./supportCatalog.js";
import type {
  BaseToolDefinition,
  BaseToolLayer,
  BaseToolPolicyRisk,
  BaseToolProfileName,
  BaseToolRiskLevel,
} from "./types.js";
import {
  semanticBaseToolCatalog,
} from "./catalog.js";

export type BaseToolEffectKind =
  | "none"
  | "filesystem.read"
  | "filesystem.write"
  | "network.egress"
  | "process.spawn"
  | "process.control"
  | "user.interaction"
  | "runtime.metadata"
  | "extension.call";

export type BaseToolSandboxHint = {
  filesystem?: "none" | "read" | "write";
  network?: "none" | "egress";
  process?: "none" | "spawn" | "control";
  userInteraction?: boolean;
  externalAdapter?: boolean;
};

export type BaseToolPolicyFact = {
  policyRisk: BaseToolPolicyRisk;
  riskLevel: BaseToolRiskLevel;
  permissionHints: readonly string[];
  effectKinds: readonly BaseToolEffectKind[];
};

export type BaseToolCatalogFactRow = {
  toolId: string;
  title: string;
  description: string;
  layer: BaseToolLayer;
  family: string;
  storageFamily: string;
  group: string;
  inputSchema: BaseToolDefinition["inputSchema"];
};

export type BaseToolExposureFactRow = {
  toolId: string;
  profiles: readonly BaseToolProfileName[];
  defaultVisibility: BaseToolDefinition["visibility"];
  modelVisibleByDefault: boolean;
  runtimeOnly: boolean;
};

export type BaseToolProfileFactRow = {
  name: BaseToolProfileName;
  title: string;
  summary: string;
  defaultPolicyProfile: string;
  visibleToolIds: readonly string[];
  deferredToolIds: readonly string[];
  runtimeToolIds: readonly string[];
  extensionSlots: readonly string[];
};

export type BaseToolRuntimePortFactRow = {
  toolId: string;
  runtimePorts: readonly string[];
  supportStatus: BaseToolRuntimeSupportStatus;
  missingPorts: readonly string[];
};

export type BaseToolDependencyFactRow = {
  toolId: string;
  dependencies: BaseToolDefinition["dependencies"];
};

export type BaseToolRiskFactRow = BaseToolPolicyFact & {
  toolId: string;
  sandboxHint: BaseToolSandboxHint;
};

export type BaseToolVerificationFactRow = {
  toolId: string;
  registryHandlerRequired: true;
  schemaRequired: true;
  runtimePortRequired: boolean;
  liveToolCallRequired: boolean;
  currentEvidence: {
    catalog: true;
    registry: true;
    runtimePort: boolean;
    liveToolCall: "not-recorded" | "manual-live-proven";
  };
};

export type BaseToolFactMatrixSnapshot = {
  surface: "basetool.factMatrix";
  version: "praxis.basetool.factMatrix.v1";
  total: number;
  profiles: readonly BaseToolProfileFactRow[];
  catalog: readonly BaseToolCatalogFactRow[];
  exposure: readonly BaseToolExposureFactRow[];
  runtimePorts: readonly BaseToolRuntimePortFactRow[];
  dependencies: readonly BaseToolDependencyFactRow[];
  risk: readonly BaseToolRiskFactRow[];
  verification: readonly BaseToolVerificationFactRow[];
  boundaries: {
    oaoAuthoring: "declares tool ids and profiles; does not execute side effects";
    basetool: "declares tool semantics, schemas, runtime ports, risk facts, and dependency facts";
    runtime: "mounts executor ports, evaluates sandbox and policy, owns approvals and live resources";
    sandbox: "consumes sandbox hints and runtime policy; not authored inside tool handlers";
    policy: "consumes risk facts and policy profiles; does not mutate tool contracts";
  };
};

function effectKindsFor(definition: BaseToolDefinition): readonly BaseToolEffectKind[] {
  const ports = new Set(definition.runtimePorts);
  const effects = new Set<BaseToolEffectKind>();
  if (definition.toolId === "plan.update" || definition.toolId.startsWith("tool.")) effects.add("runtime.metadata");
  if (definition.toolId === "user.ask") effects.add("user.interaction");
  if (ports.has("filesystem.readText") || ports.has("search.ripgrep")) effects.add("filesystem.read");
  if (ports.has("filesystem.writeText") || ports.has("filesystem.deletePath")) effects.add("filesystem.write");
  if ([...ports].some((port) => port.startsWith("network."))) effects.add("network.egress");
  if (ports.has("shell.run")) effects.add("process.spawn");
  if (ports.has("process.wait") || ports.has("process.kill")) effects.add("process.control");
  if ([...ports].some((port) => port.startsWith("mcp.") || port.startsWith("skill.") || port.startsWith("context."))) {
    effects.add("extension.call");
  }
  return effects.size === 0 ? ["none"] : [...effects].sort();
}

function sandboxHintFor(effectKinds: readonly BaseToolEffectKind[]): BaseToolSandboxHint {
  return {
    filesystem: effectKinds.includes("filesystem.write")
      ? "write"
      : effectKinds.includes("filesystem.read")
        ? "read"
        : "none",
    network: effectKinds.includes("network.egress") ? "egress" : "none",
    process: effectKinds.includes("process.control")
      ? "control"
      : effectKinds.includes("process.spawn")
        ? "spawn"
        : "none",
    userInteraction: effectKinds.includes("user.interaction"),
    externalAdapter: effectKinds.includes("extension.call"),
  };
}

function profilesFor(toolId: string): readonly BaseToolProfileName[] {
  return baseToolProfileNames.filter((name) => {
    const profile = getBaseToolProfile(name);
    return profile.visibleToolIds.includes(toolId) || profile.deferredToolIds.includes(toolId);
  });
}

function missingPortsFor(entry: BaseToolSupportCatalogEntry): readonly string[] {
  return entry.requiredSupports
    .filter((support) => support.status !== "available")
    .map((support) => support.portPath ?? support.supportId)
    .sort();
}

export function createBaseToolFactMatrixSnapshot(
  input: {
    liveProvenToolIds?: readonly string[];
  } = {},
): BaseToolFactMatrixSnapshot {
  const supportByToolId = new Map(createBaseToolSupportCatalog().map((entry) => [entry.toolId, entry]));
  const liveProven = new Set(input.liveProvenToolIds ?? []);
  const catalog = semanticBaseToolCatalog.map((definition) => ({
    toolId: definition.toolId,
    title: definition.title,
    description: definition.description,
    layer: definition.layer,
    family: definition.family,
    storageFamily: definition.storageFamily,
    group: definition.group,
    inputSchema: definition.inputSchema,
  }));
  const profiles = listBaseToolProfiles().map((profile) => ({
    name: profile.name,
    title: profile.title,
    summary: profile.summary,
    defaultPolicyProfile: profile.defaultPolicyProfile,
    visibleToolIds: profile.visibleToolIds,
    deferredToolIds: profile.deferredToolIds,
    runtimeToolIds: profile.runtimeToolIds,
    extensionSlots: profile.extensionSlots ?? [],
  }));
  const exposure = semanticBaseToolCatalog.map((definition) => {
    const profiles = profilesFor(definition.toolId);
    return {
      toolId: definition.toolId,
      profiles,
      defaultVisibility: definition.visibility,
      modelVisibleByDefault: profiles.some((profile) => profile === "codingCore" || profile === "agentCore"),
      runtimeOnly: definition.layer === "runtime" || definition.visibility === "runtime",
    };
  });
  const runtimePorts = semanticBaseToolCatalog.map((definition) => {
    const support = supportByToolId.get(definition.toolId);
    return {
      toolId: definition.toolId,
      runtimePorts: definition.runtimePorts,
      supportStatus: support?.readiness ?? "unavailable",
      missingPorts: support === undefined ? definition.runtimePorts : missingPortsFor(support),
    };
  });
  const dependencies = semanticBaseToolCatalog.map((definition) => ({
    toolId: definition.toolId,
    dependencies: definition.dependencies,
  }));
  const risk = semanticBaseToolCatalog.map((definition) => {
    const effectKinds = effectKindsFor(definition);
    return {
      toolId: definition.toolId,
      policyRisk: definition.policyRisk,
      riskLevel: definition.riskLevel,
      permissionHints: definition.permissionHints,
      effectKinds,
      sandboxHint: sandboxHintFor(effectKinds),
    };
  });
  const verification: BaseToolVerificationFactRow[] = semanticBaseToolCatalog.map((definition) => {
    const support = supportByToolId.get(definition.toolId);
    const runtimePort = support?.readiness === "available";
    return {
      toolId: definition.toolId,
      registryHandlerRequired: true as const,
      schemaRequired: true as const,
      runtimePortRequired: definition.runtimePorts.length > 0,
      liveToolCallRequired: definition.visibility !== "runtime",
      currentEvidence: {
        catalog: true,
        registry: true,
        runtimePort,
        liveToolCall: liveProven.has(definition.toolId) ? "manual-live-proven" : "not-recorded",
      },
    };
  });

  return {
    surface: "basetool.factMatrix",
    version: "praxis.basetool.factMatrix.v1",
    total: semanticBaseToolCatalog.length,
    profiles,
    catalog,
    exposure,
    runtimePorts,
    dependencies,
    risk,
    verification,
    boundaries: {
      oaoAuthoring: "declares tool ids and profiles; does not execute side effects",
      basetool: "declares tool semantics, schemas, runtime ports, risk facts, and dependency facts",
      runtime: "mounts executor ports, evaluates sandbox and policy, owns approvals and live resources",
      sandbox: "consumes sandbox hints and runtime policy; not authored inside tool handlers",
      policy: "consumes risk facts and policy profiles; does not mutate tool contracts",
    },
  };
}

export const baseToolFactMatrixDescriptor = {
  surface: "basetool.factMatrix",
  version: "praxis.basetool.factMatrix.v1",
  matrixKinds: ["profiles", "catalog", "exposure", "runtimePorts", "dependencies", "risk", "verification"],
  preservesOaoBoundary: true,
  runtimeConsumesFacts: true,
} as const;
