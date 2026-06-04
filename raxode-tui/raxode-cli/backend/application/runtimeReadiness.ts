/*
 * 文件定位：raxode-cli/backend application readiness。
 * 核心目的：把 Raxode 后端对 Praxis 新模块的接入状态整理成 TUI/GUI 可消费的公开安全事实。
 */

import type {
  AgentManifest,
  DependencyDeclaration,
} from "@praxis-ai/praxis";
import { praxis } from "@praxis-ai/praxis";
import type {
  PraxisApplicationEvent,
  PraxisApplicationViewModel,
} from "@praxis-ai/praxis/application-layer";

import RaxodeCodingAgent from "../agents/codingAgent/agent.js";
import type { RaxodeOptions } from "../agents/codingAgent/config/raxodeOptions.js";
import RaxodeTuiAgent from "../agents/tuiAgent/agent.js";
import { cmpBridge } from "../context/contextBridge.js";
import { mpBridge } from "../memory/memoryBridge.js";
import { providerProfiles } from "../authentication/providerProfiles.js";
import { inspectRaxodeMultiagentTopology, topology } from "../topology/multiagentTopology.js";
import {
  createRaxodeBackendModuleInventory,
  type RaxodeBackendModuleInventory,
} from "./backendModuleInventory.js";
import {
  probeLocalRaxodeReadiness,
  type RaxodeDependencyProbe,
  type RaxodeLocalReadinessProbe,
  type RaxodeLocalReadinessProbeInput,
} from "./localReadinessProbe.js";

export type RaxodeReadinessStatus = "ready" | "passive-ready" | "contract-ready" | "degraded" | "missing";
export type RaxodeReadinessOwner =
  | "basetool"
  | "promptPack"
  | "applicationLayer"
  | "runtime"
  | "authPlane"
  | "dependencyPlane"
  | "sandboxPlane"
  | "cachePlane"
  | "multiagentPlane";
export type RaxodeReadinessPhase = "implemented" | "passive" | "declared" | "adapter-ready" | "missing";
export type RaxodeReadinessSeverity = "ok" | "info" | "warning" | "blocking";

export type RaxodeReadinessArea = {
  area: string;
  status: RaxodeReadinessStatus;
  owner: RaxodeReadinessOwner;
  phase: RaxodeReadinessPhase;
  severity: RaxodeReadinessSeverity;
  summary: string;
  evidence: readonly string[];
  facts: Readonly<Record<string, string | number | boolean | readonly string[]>>;
  next?: string;
};

export type RaxodeBackendReadiness = {
  kind: "raxode.backendReadiness";
  schemaVersion: "raxode.backendReadiness.v1";
  generatedAt: string;
  applicationId: string;
  agentId: string;
  promptPackId: string;
  permissionProfile: string;
  toolProfile: string;
  sandboxProfile: string;
  sessionPersistence: string;
  storageKind: string;
  model: {
    provider?: string;
    endpointShape?: string;
    model: string;
    providerRoute?: string;
  };
  tools: {
    expectedCoreToolIds: readonly string[];
    mountedToolIds: readonly string[];
  };
  dependencies: readonly {
    dependencyId: string;
    kind: DependencyDeclaration["kind"];
    required: boolean;
    install?: DependencyDeclaration["install"];
    reason?: string;
    degrade?: string;
    probe?: Pick<RaxodeDependencyProbe, "status" | "observedVersion" | "resolvedPath" | "message" | "source">;
  }[];
  policy: {
    permissionProfile: string;
    defaultMode: "permissive";
    approvalSurface: "application-layer";
  };
  ports: {
    approvalResolver: "configured" | "default-policy";
    agentReviewResolver: "configured" | "not-configured";
    contextArtifactAdapters: "configured" | "not-configured";
    baseToolAdapters: "configured" | "not-configured";
    sandboxProvider: "configured" | "not-configured";
    authStateProvider: "configured" | "not-configured";
    foundationProject: "configured" | "not-configured";
    liveProviderResolver: "configured" | "raxode-default";
  };
  sandbox: {
    profile: string;
    isolation: string;
    defaultExecution: "host-observed" | "workspace-rollback" | "strong-isolation";
    fallback: "workspace-rollback";
    probe?: RaxodeLocalReadinessProbe["sandbox"];
  };
  moduleInventory: RaxodeBackendModuleInventory;
  probe?: RaxodeLocalReadinessProbe;
  areas: readonly RaxodeReadinessArea[];
};

const EXPECTED_AGENT_CORE_TOOL_IDS = [
  "shell.run",
  "file.read",
  "file.search",
  "patch.apply",
  "web.search",
  "web.fetch",
  "plan.update",
  "user.ask",
  "skill.load",
  "context.load",
  "agent.spawn",
  "agent.message",
  "agent.inbox",
  "agent.list",
  "agent.inspect",
  "agent.wait",
  "agent.stop",
  "agent.kill",
  "mcp.use",
  "mcp.resources",
  "process.wait",
  "process.kill",
  "media.viewImage",
  "tool.discover",
  "tool.describe",
] as const;

function compileReadinessManifest(options: RaxodeOptions = {}): AgentManifest {
  const compiled = praxis.compileAgent(new RaxodeCodingAgent(options));
  if (!compiled.ok) {
    throw new Error(compiled.error.message);
  }
  return compiled.manifest;
}

function compileAuxiliaryManifests(): readonly AgentManifest[] {
  const tuiAgent = praxis.compileAgent(new RaxodeTuiAgent());
  if (!tuiAgent.ok) return [];
  return [tuiAgent.manifest];
}

function missingTools(manifest: AgentManifest): readonly string[] {
  const mounted = new Set(manifest.harness.tools.map((tool) => tool.toolId));
  return EXPECTED_AGENT_CORE_TOOL_IDS.filter((toolId) => !mounted.has(toolId));
}

function dependencySummary(
  dependency: DependencyDeclaration,
  probe?: RaxodeDependencyProbe,
): RaxodeBackendReadiness["dependencies"][number] {
  const degrade = dependency.dependencyId === "dependency.binary.node"
    ? "block-backend-start"
    : dependency.dependencyId === "dependency.npm.tsx"
      ? "use-built-dist-or-install"
      : dependency.dependencyId === "dependency.binary.raxcell" || dependency.dependencyId === "dependency.binary.bwrap"
        ? "degrade-to-workspace-rollback"
        : dependency.dependencyId === "dependency.secret.provider.core.main"
          ? "dry-run-or-auth-required-for-live"
          : "record-and-continue";
  return {
    dependencyId: dependency.dependencyId,
    kind: dependency.kind,
    required: dependency.required ?? true,
    install: dependency.install,
    reason: dependency.reason,
    degrade,
    probe: probe === undefined ? undefined : {
      status: probe.status,
      observedVersion: probe.observedVersion,
      resolvedPath: probe.resolvedPath,
      message: probe.message,
      source: probe.source,
    },
  };
}

function areaSeverity(status: RaxodeReadinessStatus): RaxodeReadinessSeverity {
  if (status === "missing") return "blocking";
  if (status === "degraded") return "warning";
  if (status === "contract-ready" || status === "passive-ready") return "info";
  return "ok";
}

function sandboxExecutionFor(profile: string): RaxodeBackendReadiness["sandbox"]["defaultExecution"] {
  if (profile === "linux-bubblewrap" || profile === "linuxBubblewrap") return "strong-isolation";
  if (profile === "workspace-only" || profile === "workspaceOnly") return "workspace-rollback";
  return "host-observed";
}

export function inspectRaxodeBackendReadiness(input: {
  manifest?: AgentManifest;
  view?: PraxisApplicationViewModel;
  options?: RaxodeOptions;
  now?: () => string;
  probe?: RaxodeLocalReadinessProbe;
  ports?: Partial<RaxodeBackendReadiness["ports"]>;
} = {}): RaxodeBackendReadiness {
  const manifest = input.manifest ?? compileReadinessManifest(input.options);
  const view = input.view;
  const missing = missingTools(manifest);
  const probe = input.probe;
  const dependencyProbes = new Map(probe?.dependencies.map((dependency) => [dependency.dependencyId, dependency]));
  const blockingProbeGaps = probe?.dependencies.filter((dependency) => dependency.required && (
    dependency.status === "missing" || dependency.status === "version-mismatch"
  )) ?? [];
  const promptMetadata = manifest.promptPack.metadata ?? {};
  const harnessMetadata = manifest.harness.metadata ?? {};
  const moduleInventory = createRaxodeBackendModuleInventory({
    manifest,
    now: input.now,
  });
  const multiagent = inspectRaxodeMultiagentTopology({
    primaryManifest: manifest,
    auxiliaryManifests: compileAuxiliaryManifests(),
  });
  const providerRoute = typeof manifest.model.metadata?.providerRoute === "string"
    ? manifest.model.metadata.providerRoute
    : undefined;
  const modelRouteReady = providerProfiles.primary.authSource === "codex-openai-profile"
    && (providerRoute !== undefined || manifest.model.endpointShape !== undefined);

  const areas: RaxodeReadinessArea[] = [
    {
      area: "tools",
      status: missing.length === 0 ? "ready" : "missing",
      owner: "basetool",
      phase: missing.length === 0 ? "implemented" : "missing",
      severity: areaSeverity(missing.length === 0 ? "ready" : "missing"),
      summary: "New Praxis semantic basetool profile is mounted for the coding backend.",
      evidence: [
        `toolProfile=${view?.toolProfile ?? harnessMetadata.toolProfile ?? "agentCore"}`,
        `mounted=${manifest.harness.tools.length}`,
        `missing=${missing.join(",") || "none"}`,
      ],
      facts: {
        toolProfile: String(view?.toolProfile ?? harnessMetadata.toolProfile ?? "agentCore"),
        mountedToolCount: manifest.harness.tools.length,
        expectedToolCount: EXPECTED_AGENT_CORE_TOOL_IDS.length,
        missingToolIds: missing,
      },
      next: missing.length === 0 ? undefined : "Mount every expected agentCore tool before live TUI use.",
    },
    {
      area: "promptPack",
      status: promptMetadata.providerPayloadBuiltHere === false ? "ready" : "degraded",
      owner: "promptPack",
      phase: promptMetadata.providerPayloadBuiltHere === false ? "implemented" : "declared",
      severity: areaSeverity(promptMetadata.providerPayloadBuiltHere === false ? "ready" : "degraded"),
      summary: "PromptPack keeps Praxis stableSystemCore separate from Raxode declared runtime context and tool declarations.",
      evidence: [
        `promptPackId=${manifest.promptPack.promptPackId}`,
        `applicationInstructions=${typeof promptMetadata.applicationInstructions === "string" ? "present" : "missing"}`,
        "providerPayloadBuiltHere=false",
      ],
      facts: {
        promptPackId: manifest.promptPack.promptPackId,
        applicationInstructions: typeof promptMetadata.applicationInstructions === "string",
        providerPayloadBuiltHere: promptMetadata.providerPayloadBuiltHere === false,
      },
    },
    {
      area: "context",
      status: cmpBridge.status,
      owner: "applicationLayer",
      phase: "passive",
      severity: areaSeverity(cmpBridge.status),
      summary: "Context is passive and application-owned; dynamic material flows through PromptPack/context.load.",
      evidence: [
        `bridge=${cmpBridge.moduleId}`,
        `refs=${manifest.harness.contextRefs.join(",")}`,
        `surfaces=${cmpBridge.surfaces.join(",")}`,
      ],
      facts: {
        bridge: cmpBridge.moduleId,
        ownership: cmpBridge.ownership,
        refs: manifest.harness.contextRefs,
        surfaces: cmpBridge.surfaces,
      },
    },
    {
      area: "memory",
      status: mpBridge.status,
      owner: "applicationLayer",
      phase: "passive",
      severity: areaSeverity(mpBridge.status),
      summary: "Memory is passive session/project guidance, not an active MP/RAG agent.",
      evidence: [
        `bridge=${mpBridge.moduleId}`,
        `mode=${manifest.harness.memory?.mode ?? "unspecified"}`,
        `surfaces=${mpBridge.surfaces.join(",")}`,
        `promptGuide=${promptMetadata.memoryPromptGuide === true ? "present" : "missing"}`,
      ],
      facts: {
        bridge: mpBridge.moduleId,
        ownership: mpBridge.ownership,
        mode: manifest.harness.memory?.mode ?? "unspecified",
        surfaces: mpBridge.surfaces,
        promptGuide: promptMetadata.memoryPromptGuide === true,
      },
    },
    {
      area: "dependency",
      status: manifest.dependencies.length === 0
        ? "missing"
        : blockingProbeGaps.length > 0
          ? "degraded"
          : probe === undefined
            ? "contract-ready"
            : "ready",
      owner: "dependencyPlane",
      phase: manifest.dependencies.length > 0 ? (probe === undefined ? "declared" : "implemented") : "missing",
      severity: areaSeverity(manifest.dependencies.length === 0
        ? "missing"
        : blockingProbeGaps.length > 0
          ? "degraded"
          : probe === undefined
            ? "contract-ready"
            : "ready"),
      summary: probe === undefined
        ? "External dependencies are declared for the dependency plane to detect, install, or degrade."
        : "External dependencies are declared and local preflight probe results are attached.",
      evidence: manifest.dependencies.map((dependency) => {
        const dependencyProbe = dependencyProbes.get(dependency.dependencyId);
        return `${dependency.dependencyId}:${dependency.install ?? "unspecified"}:${dependencyProbe?.status ?? "not-run"}`;
      }),
      facts: {
        dependencyCount: manifest.dependencies.length,
        requiredDependencyIds: manifest.dependencies
          .filter((dependency) => dependency.required ?? true)
          .map((dependency) => dependency.dependencyId),
        optionalDependencyIds: manifest.dependencies
          .filter((dependency) => !(dependency.required ?? true))
          .map((dependency) => dependency.dependencyId),
        probeStatus: probe === undefined ? "not-run" : "attached",
        blockingProbeGaps: blockingProbeGaps.map((dependency) => dependency.dependencyId),
      },
    },
    {
      area: "auth-and-model",
      status: modelRouteReady ? "ready" : "degraded",
      owner: "authPlane",
      phase: modelRouteReady ? "implemented" : "adapter-ready",
      severity: areaSeverity(modelRouteReady ? "ready" : "degraded"),
      summary: "Provider auth, model route, and live provider lowering are wired through Praxis model adapter surfaces.",
      evidence: [
        `provider=${manifest.model.provider}`,
        `endpointShape=${manifest.model.endpointShape ?? "responses"}`,
        `model=${manifest.model.model}`,
        `providerRoute=${providerRoute ?? "auto"}`,
        `authSource=${providerProfiles.primary.authSource}`,
        "liveProvider=raxode-default",
      ],
      facts: {
        provider: manifest.model.provider,
        endpointShape: manifest.model.endpointShape ?? "responses",
        model: manifest.model.model,
        providerRoute: providerRoute ?? "auto",
        authSource: providerProfiles.primary.authSource,
      },
    },
    {
      area: "project-session",
      status: "ready",
      owner: "applicationLayer",
      phase: "implemented",
      severity: "ok",
      summary: "Project/session state is owned by the application runtime with sqlite persistence by default.",
      evidence: [
        `projectId=${view?.projectId ?? "loaded-by-application-project"}`,
        `sessionPersistence=${manifest.session.persistence}`,
        `storageKind=${manifest.storage.kind ?? "unspecified"}`,
      ],
      facts: {
        projectId: view?.projectId ?? "loaded-by-application-project",
        sessionPersistence: manifest.session.persistence,
        storageKind: manifest.storage.kind ?? "unspecified",
      },
    },
    {
      area: "sandbox",
      status: probe?.sandbox.status === "degraded"
        ? "degraded"
        : manifest.sandbox.profile === "host-observed" && probe === undefined
          ? "contract-ready"
          : "ready",
      owner: "sandboxPlane",
      phase: probe === undefined ? "declared" : "implemented",
      severity: areaSeverity(probe?.sandbox.status === "degraded"
        ? "degraded"
        : manifest.sandbox.profile === "host-observed" && probe === undefined
          ? "contract-ready"
          : "ready"),
      summary: probe === undefined
        ? "Sandbox policy is declared now; runtime can upgrade to strong isolation or degrade to workspace rollback."
        : "Sandbox policy is declared and local provider availability has been probed.",
      evidence: [
        `profile=${manifest.sandbox.profile}`,
        `providerFamily=${manifest.sandbox.providerFamily ?? "auto"}`,
        `filesystem=${manifest.sandbox.filesystem}`,
        `network=${manifest.sandbox.network}`,
        `shell=${manifest.sandbox.shell}`,
        `probe=${probe?.sandbox.status ?? "not-run"}`,
      ],
      facts: {
        profile: manifest.sandbox.profile,
        providerFamily: manifest.sandbox.providerFamily ?? "auto",
        filesystem: manifest.sandbox.filesystem,
        network: manifest.sandbox.network,
        shell: manifest.sandbox.shell,
        defaultExecution: sandboxExecutionFor(manifest.sandbox.profile),
        fallback: "workspace-rollback",
        probeStatus: probe?.sandbox.status ?? "not-run",
        probeMessage: probe?.sandbox.message ?? "",
      },
    },
    {
      area: "cache",
      status: "ready",
      owner: "cachePlane",
      phase: "implemented",
      severity: "ok",
      summary: "PromptPack cache xray is runtime-owned and exposed through model cacheDebug events.",
      evidence: [
        `module=${String(manifest.harness.modules?.cachePlane && "cachePlane")}`,
        "cacheMode=prompt-pack-cache-xray",
        "eventSurface=model.cacheDebug",
      ],
      facts: {
        module: "cachePlane",
        cacheMode: "prompt-pack-cache-xray",
        eventSurface: "model.cacheDebug",
      },
    },
    {
      area: "multiagent",
      status: multiagent.status,
      owner: "multiagentPlane",
      phase: multiagent.status === "ready" ? "implemented" : "missing",
      severity: areaSeverity(multiagent.status),
      summary: "Raxode multiagent topology is compiled for the primary coding agent and TUI auxiliary agent.",
      evidence: [
        `topology=${topology.topologyId}`,
        `primary=${topology.primaryAgent}`,
        `agents=${multiagent.expectedAgents.join(",")}`,
        `compiled=${multiagent.compiledAgents.join(",")}`,
        `missing=${multiagent.missingAgents.join(",") || "none"}`,
      ],
      facts: {
        topology: topology.topologyId,
        primary: topology.primaryAgent,
        agents: multiagent.expectedAgents,
        compiledAgents: multiagent.compiledAgents,
        auxiliaryAgents: multiagent.auxiliaryAgents,
        missingAgents: multiagent.missingAgents,
      },
    },
  ];

  return {
    kind: "raxode.backendReadiness",
    schemaVersion: "raxode.backendReadiness.v1",
    generatedAt: input.now?.() ?? new Date().toISOString(),
    applicationId: view?.applicationId ?? "application.raxode.coding",
    agentId: manifest.identity.id,
    promptPackId: manifest.promptPack.promptPackId,
    permissionProfile: view?.permissionProfile ?? manifest.toolPolicy.profile,
    toolProfile: view?.toolProfile ?? String(harnessMetadata.toolProfile ?? "agentCore"),
    sandboxProfile: manifest.sandbox.profile,
    sessionPersistence: manifest.session.persistence,
    storageKind: manifest.storage.kind ?? "unknown",
    model: {
      provider: manifest.model.provider,
      endpointShape: manifest.model.endpointShape,
      model: manifest.model.model,
      providerRoute,
    },
    tools: {
      expectedCoreToolIds: EXPECTED_AGENT_CORE_TOOL_IDS,
      mountedToolIds: manifest.harness.tools.map((tool) => tool.toolId),
    },
    dependencies: manifest.dependencies.map((dependency) => dependencySummary(
      dependency,
      dependencyProbes.get(dependency.dependencyId),
    )),
    policy: {
      permissionProfile: view?.permissionProfile ?? manifest.toolPolicy.profile,
      defaultMode: "permissive",
      approvalSurface: "application-layer",
    },
    ports: {
      approvalResolver: input.ports?.approvalResolver ?? "default-policy",
      agentReviewResolver: input.ports?.agentReviewResolver ?? "not-configured",
      contextArtifactAdapters: input.ports?.contextArtifactAdapters ?? "not-configured",
      baseToolAdapters: input.ports?.baseToolAdapters ?? "not-configured",
      sandboxProvider: input.ports?.sandboxProvider ?? "not-configured",
      authStateProvider: input.ports?.authStateProvider ?? (view?.auth ? "configured" : "not-configured"),
      foundationProject: input.ports?.foundationProject ?? (view?.foundationProject ? "configured" : "not-configured"),
      liveProviderResolver: input.ports?.liveProviderResolver ?? "raxode-default",
    },
    sandbox: {
      profile: manifest.sandbox.profile,
      isolation: String(manifest.capabilities.find((capability) => capability.capabilityId === "capability.raxode.sandbox")?.metadata?.selectedProfile ?? manifest.sandbox.profile),
      defaultExecution: sandboxExecutionFor(manifest.sandbox.profile),
      fallback: "workspace-rollback",
      probe: probe?.sandbox,
    },
    moduleInventory,
    probe,
    areas,
  };
}

export function inspectRaxodeBackendReadinessWithLocalProbe(input: {
  manifest?: AgentManifest;
  view?: PraxisApplicationViewModel;
  options?: RaxodeOptions;
  now?: () => string;
  localProbe?: Omit<RaxodeLocalReadinessProbeInput, "manifest">;
  ports?: Partial<RaxodeBackendReadiness["ports"]>;
} = {}): RaxodeBackendReadiness {
  const manifest = input.manifest ?? compileReadinessManifest(input.options);
  const probe = probeLocalRaxodeReadiness({
    manifest,
    now: input.localProbe?.now ?? input.now,
    nodeVersion: input.localProbe?.nodeVersion,
    pathEnv: input.localProbe?.pathEnv,
    env: input.localProbe?.env,
    platform: input.localProbe?.platform,
    fileExists: input.localProbe?.fileExists,
    resolvePackage: input.localProbe?.resolvePackage,
  });
  return inspectRaxodeBackendReadiness({
    manifest,
    view: input.view,
    options: input.options,
    now: input.now,
    probe,
    ports: input.ports,
  });
}

export function createRaxodeReadinessEvent(input: {
  readiness: RaxodeBackendReadiness;
  view: PraxisApplicationViewModel;
  now?: () => string;
}): PraxisApplicationEvent {
  const blockedAreas = input.readiness.areas
    .filter((area) => area.status === "missing" || area.status === "degraded")
    .map((area) => area.area);
  return {
    eventId: "raxode.backend.readiness",
    kind: "runtime",
    status: input.view.status,
    message: blockedAreas.length === 0
      ? "raxode backend readiness prepared"
      : `raxode backend readiness has gaps: ${blockedAreas.join(", ")}`,
    createdAt: input.now?.() ?? new Date().toISOString(),
    sessionId: input.view.sessionId,
    runtimeId: input.view.runtimeId,
    publicSafe: true,
    metadata: {
      readiness: input.readiness,
    },
  };
}
