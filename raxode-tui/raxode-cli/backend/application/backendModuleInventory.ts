/*
 * 文件定位：raxode-cli/backend application module inventory。
 * 核心目的：把 Raxode 后端接入 Praxis 新模块的事实源整理成 TUI/GUI 可验证清单。
 */

import type { AgentManifest } from "@praxis-ai/praxis";

import { topology } from "../topology/multiagentTopology.js";

export type RaxodeBackendModuleId =
  | "basetool"
  | "promptPack"
  | "context"
  | "memory"
  | "dependency"
  | "auth"
  | "projectSession"
  | "modelAdapter"
  | "sandbox"
  | "cache"
  | "multiagent";

export type RaxodeBackendModuleStatus = "ready" | "passive-ready" | "contract-ready" | "degraded" | "missing";

export type RaxodeBackendModuleInventoryItem = {
  moduleId: RaxodeBackendModuleId;
  status: RaxodeBackendModuleStatus;
  surface: string;
  owner: "praxis" | "raxode-application" | "runtime";
  summary: string;
  evidence: readonly string[];
};

export type RaxodeBackendModuleInventory = {
  kind: "raxode.backendModuleInventory";
  schemaVersion: "raxode.backendModuleInventory.v1";
  generatedAt: string;
  applicationId: string;
  agentId: string;
  modules: readonly RaxodeBackendModuleInventoryItem[];
};

function hasModuleMode(manifest: AgentManifest, moduleId: string): boolean {
  const modules = manifest.harness.modules as Record<string, unknown> | undefined;
  const moduleValue = modules?.[moduleId];
  return moduleValue !== undefined;
}

function hasRequirement(manifest: AgentManifest, requirement: string): boolean {
  return manifest.harness.runtimeRequirements?.includes(requirement) ?? false;
}

function moduleStatus(input: {
  manifest: AgentManifest;
  requiredEvidence: readonly boolean[];
  passive?: boolean;
  contract?: boolean;
}): RaxodeBackendModuleStatus {
  if (!input.requiredEvidence.every(Boolean)) return "missing";
  if (input.passive === true) return "passive-ready";
  if (input.contract === true) return "contract-ready";
  return "ready";
}

function moduleMode(manifest: AgentManifest, moduleId: string): string | undefined {
  const modules = manifest.harness.modules as Record<string, unknown> | undefined;
  const moduleValue = modules?.[moduleId];
  if (typeof moduleValue !== "object" || moduleValue === null || Array.isArray(moduleValue)) return undefined;
  const mode = (moduleValue as { mode?: unknown }).mode;
  return typeof mode === "string" ? mode : undefined;
}

export function createRaxodeBackendModuleInventory(input: {
  manifest: AgentManifest;
  now?: () => string;
}): RaxodeBackendModuleInventory {
  const manifest = input.manifest;
  const toolIds = new Set(manifest.harness.tools.map((tool) => tool.toolId));
  const dependencyIds = new Set(manifest.dependencies.map((dependency) => dependency.dependencyId));
  const capabilityIds = new Set(manifest.capabilities.map((capability) => capability.capabilityId));
  const modules: RaxodeBackendModuleInventoryItem[] = [
    {
      moduleId: "basetool",
      status: moduleStatus({
        manifest,
        requiredEvidence: [
          hasRequirement(manifest, "praxis.basetool.agentCore"),
          toolIds.has("file.read"),
          toolIds.has("patch.apply"),
          toolIds.has("shell.run"),
          toolIds.has("tool.describe"),
        ],
      }),
      surface: "harness.tools",
      owner: "praxis",
      summary: "Agent Core semantic basetools are mounted through Praxis tool specs.",
      evidence: [
        `toolCount=${manifest.harness.tools.length}`,
        `hasFileRead=${toolIds.has("file.read")}`,
        `hasPatchApply=${toolIds.has("patch.apply")}`,
        `hasShellRun=${toolIds.has("shell.run")}`,
      ],
    },
    {
      moduleId: "promptPack",
      status: moduleStatus({
        manifest,
        requiredEvidence: [
          hasRequirement(manifest, "praxis.promptPack.core123"),
          manifest.promptPack.promptPackId === "prompt.raxode.coding",
          manifest.promptPack.metadata?.providerPayloadBuiltHere === false,
        ],
      }),
      surface: "promptPack",
      owner: "praxis",
      summary: "PromptPack keeps stableSystemCore, declaredRuntimeContext, and toolDeclarations separated.",
      evidence: [
        `promptPackId=${manifest.promptPack.promptPackId}`,
        `providerPayloadBuiltHere=${String(manifest.promptPack.metadata?.providerPayloadBuiltHere)}`,
      ],
    },
    {
      moduleId: "context",
      status: moduleStatus({
        manifest,
        requiredEvidence: [
          hasModuleMode(manifest, "contextPlane"),
          manifest.harness.contextRefs.includes("context.raxode.praxisContextBridge"),
          toolIds.has("context.load"),
        ],
      }),
      surface: "harness.context",
      owner: "raxode-application",
      summary: "Passive context is declared for project/retrieved material and context.load.",
      evidence: [
        `contextRefs=${manifest.harness.contextRefs.join(",")}`,
        `hasContextLoad=${toolIds.has("context.load")}`,
      ],
    },
    {
      moduleId: "memory",
      status: moduleStatus({
        manifest,
        requiredEvidence: [
          hasModuleMode(manifest, "memoryPlane"),
          manifest.harness.memoryRefs.includes("memory.raxode.praxisMemoryBridge"),
          moduleMode(manifest, "memoryPlane") !== "off",
        ],
      }),
      surface: "harness.memory",
      owner: "raxode-application",
      summary: "Passive memory is declared for session/project memory and skill-guided recall.",
      evidence: [
        `memoryRefs=${manifest.harness.memoryRefs.join(",")}`,
        `memoryMode=${manifest.harness.memory?.mode ?? "unspecified"}`,
      ],
    },
    {
      moduleId: "dependency",
      status: moduleStatus({
        manifest,
        requiredEvidence: [
          hasModuleMode(manifest, "dependencyPlane"),
          dependencyIds.has("dependency.binary.node"),
          dependencyIds.has("dependency.npm.tsx"),
          dependencyIds.has("dependency.binary.bwrap"),
        ],
      }),
      surface: "manifest.dependencies",
      owner: "runtime",
      summary: "Dependency declarations are available for prepare/probe/degrade flows.",
      evidence: [...dependencyIds].sort(),
    },
    {
      moduleId: "auth",
      status: moduleStatus({
        manifest,
        requiredEvidence: [
          hasModuleMode(manifest, "authPlane"),
          dependencyIds.has("dependency.secret.provider.core.main"),
          typeof manifest.model.provider === "string",
        ],
      }),
      surface: "model/auth provider profile",
      owner: "runtime",
      summary: "Provider auth is routed through the auth/model adapter surface.",
      evidence: [
        `provider=${manifest.model.provider}`,
        `endpointShape=${manifest.model.endpointShape ?? "responses"}`,
        `model=${manifest.model.model}`,
      ],
    },
    {
      moduleId: "projectSession",
      status: moduleStatus({
        manifest,
        requiredEvidence: [
          hasModuleMode(manifest, "projectPlane"),
          hasModuleMode(manifest, "sessionPlane"),
          hasRequirement(manifest, "praxis.projectSession.runtime"),
        ],
      }),
      surface: "application project/session runtime",
      owner: "praxis",
      summary: "Project and session state flow through Praxis application project runtime.",
      evidence: [
        `sessionPersistence=${manifest.session.persistence}`,
        `storageKind=${manifest.storage.kind ?? "unknown"}`,
      ],
    },
    {
      moduleId: "modelAdapter",
      status: moduleStatus({
        manifest,
        requiredEvidence: [
          typeof manifest.model.provider === "string",
          typeof manifest.model.model === "string",
          typeof manifest.model.metadata?.providerRoute === "string" || manifest.model.endpointShape !== undefined,
        ],
      }),
      surface: "manifest.model",
      owner: "praxis",
      summary: "Model provider route is wired for Praxis adapter lowering and Raxode live provider calls.",
      evidence: [
        `provider=${manifest.model.provider}`,
        `endpointShape=${manifest.model.endpointShape ?? "auto"}`,
        `providerRoute=${String(manifest.model.metadata?.providerRoute ?? "auto")}`,
        "liveProvider=raxode-default",
      ],
    },
    {
      moduleId: "sandbox",
      status: moduleStatus({
        manifest,
        requiredEvidence: [
          hasRequirement(manifest, "praxis.sandboxPlane.declaredCapabilities"),
          capabilityIds.has("capability.raxode.sandbox"),
          typeof manifest.sandbox.profile === "string",
          dependencyIds.has("dependency.binary.bwrap"),
        ],
      }),
      surface: "manifest.sandbox",
      owner: "runtime",
      summary: "Sandbox profile and capability are declared for runtime governance and fallback.",
      evidence: [
        `profile=${manifest.sandbox.profile}`,
        `providerFamily=${manifest.sandbox.providerFamily ?? "auto"}`,
        `hasBwrapDependency=${dependencyIds.has("dependency.binary.bwrap")}`,
      ],
    },
    {
      moduleId: "cache",
      status: moduleStatus({
        manifest,
        requiredEvidence: [
          hasModuleMode(manifest, "cachePlane"),
          hasRequirement(manifest, "praxis.cachePlane.promptPackXray"),
        ],
      }),
      surface: "harness.modules.cachePlane",
      owner: "runtime",
      summary: "PromptPack cache observation is implemented through runtime model cacheDebug events.",
      evidence: [
        `cachePlane=${JSON.stringify((manifest.harness.modules as Record<string, unknown> | undefined)?.cachePlane ?? {})}`,
        "eventSurface=model.cacheDebug",
      ],
    },
    {
      moduleId: "multiagent",
      status: moduleStatus({
        manifest,
        requiredEvidence: [
          hasModuleMode(manifest, "multiagentPlane"),
          hasRequirement(manifest, "praxis.multiagent.contract"),
          topology.primaryAgent === manifest.identity.id,
          (topology.agents as readonly string[]).includes(manifest.identity.id),
        ],
      }),
      surface: "harness.modules.multiagentPlane",
      owner: "runtime",
      summary: "Multiagent topology is declared for the primary coding agent and auxiliary TUI agent.",
      evidence: [
        `multiagentPlane=${JSON.stringify((manifest.harness.modules as Record<string, unknown> | undefined)?.multiagentPlane ?? {})}`,
        `topology=${topology.topologyId}`,
        `primary=${topology.primaryAgent}`,
        `agents=${topology.agents.join(",")}`,
      ],
    },
  ];

  return {
    kind: "raxode.backendModuleInventory",
    schemaVersion: "raxode.backendModuleInventory.v1",
    generatedAt: input.now?.() ?? new Date().toISOString(),
    applicationId: "application.raxode.coding",
    agentId: manifest.identity.id,
    modules,
  };
}
