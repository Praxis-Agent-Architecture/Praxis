import {
  readFile,
} from "node:fs/promises";
import path from "node:path";

import { praxis } from "@praxis-ai/praxis";
import type {
  BaseToolExecutorPort,
  FrameworkToolReadinessInput,
  RuntimeApprovalResolver,
  RuntimeCompositionSurfaceInput,
  RuntimeSurfaceDescriptor,
} from "@praxis-ai/praxis";

import {
  DeepPermissiveRepoInspectorAgent,
  RepoInspectorAgent,
} from "../agents/repoInspector/agent.js";
import type {
  RepoInspectorPolicyProfile,
  RepoInspectorSandboxProfile,
} from "../agents/repoInspector/config/repoInspectorOptions.js";
import { repoInspectorApprovalResolver } from "../agents/repoInspector/interfaces/approvalSurface.js";
import { buildRuntimeReadinessMap } from "./runtimeReadinessMap.js";

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

async function readPromptPackageManifest(filePath: unknown): Promise<Readonly<Record<string, unknown>> | { error: string; path: unknown }> {
  if (typeof filePath !== "string" || filePath.trim().length === 0) {
    return { error: "prompt package manifest path is not declared", path: filePath };
  }

  try {
    return JSON.parse(await readFile(filePath, "utf8")) as Readonly<Record<string, unknown>>;
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "failed to read prompt package manifest",
      path: filePath,
    };
  }
}

const mode = process.argv.includes("--deep") ? "deep" : "quick";
const policyProfile = (argValue("policy") ?? "standard") as RepoInspectorPolicyProfile;
const sandboxProfile = (argValue("sandbox") ?? "hostObserved") as RepoInspectorSandboxProfile;
const persistence = process.argv.includes("--sqlite") ? "sqlite" : "memory";
const useDerivedAgent = process.argv.includes("--derived");
const storageWorkspaceRoot = persistence === "sqlite"
  ? path.join(process.cwd(), ".rax_workspace", "example-runs", `${Date.now()}-${process.pid}`)
  : undefined;
const runtimeId = "runtime.example.repoInspector";

type RuntimeMcpNativeToolInventory = NonNullable<
  Parameters<typeof praxis.runtime.inspectMcpMountMatrix>[0]["nativeToolInventoryByServerId"]
>;
type RuntimeMcpNativeToolDeclaration = RuntimeMcpNativeToolInventory[string][number];

const exampleMcpNativeTools: readonly RuntimeMcpNativeToolDeclaration[] = [
  {
    name: "repo.read",
    description: "Read repository metadata through a native MCP server.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
      },
      required: ["path"],
      additionalProperties: false,
    },
  },
  {
    name: "repo.search",
    description: "Search repository metadata through a native MCP server.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
] as const;

const exampleMcpPlusNativeTools: readonly RuntimeMcpNativeToolDeclaration[] = [
  ...exampleMcpNativeTools,
  {
    name: "repo.networkDiagnostics",
    description: "Inspect repository network diagnostics only when needed.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
] as const;

const agent = useDerivedAgent
  ? new DeepPermissiveRepoInspectorAgent({ persistence, sandboxProfile })
  : new RepoInspectorAgent({
      mode,
      policyProfile,
      sandboxProfile,
      persistence,
      includeShell: process.argv.includes("--shell"),
      includeSkillAuthoring: process.argv.includes("--skill-authoring"),
      includeAllTestable: process.argv.includes("--all-testable"),
    });

function createExampleSkillAdapters(): Partial<BaseToolExecutorPort> {
  return {
    skill: {
      load: async (request) => ({
        ok: true,
        output: {
          name: typeof request?.name === "string" && request.name.trim().length > 0
            ? request.name
            : "example.repoInspector.skill",
          path: typeof request?.path === "string" ? request.path : undefined,
          summary: "Example application-owned skill.load adapter mounted through Runtime BaseToolExecutorPort.",
        },
        metadata: {
          source: "examples.fullstack.application.runtimeAdapters",
        },
      }),
    },
  };
}

function createExampleMcpModule() {
  return praxis.mcp.module({
    servers: [
      praxis.mcp.stdio("repo-native", {
        command: "node",
        args: ["examples/fullstack/mcp/repo-native-server.js"],
        title: "Repo Native MCP",
        summary: "Example native MCP declaration for runtime mount inspection.",
      }),
      praxis.mcp.stdio("repo-plus", {
        command: "node",
        args: ["examples/fullstack/mcp/repo-plus-server.js"],
        mode: "mcp-plus",
        title: "Repo MCP+",
        summary: "Example MCP+ declaration for runtime mount inspection.",
        manifest: {
          server: {
            id: "repo-plus",
            title: "Repo MCP+",
            summary: "Example MCP+ exposure policy for repository tools.",
          },
          exposure: {
            pinnedTools: ["repo.read", "repo.search"],
            indexedTools: ["repo.networkDiagnostics"],
            toolCards: {
              "repo.networkDiagnostics": {
                title: "Network diagnostics",
                summary: "Use only when repository connectivity is relevant.",
                keywords: ["network", "diagnostics"],
              },
            },
          },
          skills: {
            chapters: [{
              id: "repo-inspection",
              title: "Repository inspection",
              summary: "Read first, search second, expand diagnostics only when needed.",
            }],
          },
        },
      }),
    ],
    metadata: {
      source: "examples.fullstack.application.runtimeMountMatrix",
    },
  });
}

function developerReadinessFor(readiness: string | undefined): FrameworkToolReadinessInput["developerReadiness"] {
  if (readiness === "available") return "ready";
  if (readiness === "requiresApproval") return "usableWithApproval";
  if (readiness === "disabled") return "contractIncomplete";
  return "adapterRequired";
}

function createFrameworkToolReadiness(input: {
  manifestTools: readonly { toolId: string; family?: string; group?: string }[];
  executor: BaseToolExecutorPort;
}): readonly FrameworkToolReadinessInput[] {
  const supportByToolId = new Map(
    praxis.createBaseToolSupportCatalog({ executor: input.executor }).map((entry) => [entry.toolId, entry]),
  );

  return input.manifestTools.map((tool) => {
    const support = supportByToolId.get(tool.toolId);
    const missingPorts = support?.requiredSupports
      .filter((item) => item.status !== "available" && item.status !== "requiresApproval")
      .map((item) => item.portPath ?? item.supportId) ?? [];
    const ready = support?.readiness === "available" || support?.readiness === "requiresApproval";
    return {
      toolId: tool.toolId,
      family: tool.family,
      group: tool.group,
      ready,
      required: true,
      developerReadiness: developerReadinessFor(support?.readiness),
      executorSupport: support?.readiness,
      missingPorts,
      reason: support === undefined
        ? `BaseTool ${tool.toolId} is not present in the runtime support catalog`
        : ready
          ? undefined
          : `BaseTool ${tool.toolId} requires runtime adapter ports: ${missingPorts.join(", ")}`,
    };
  });
}

function outputPreview(output: unknown): unknown {
  if (typeof output === "string") return output.slice(0, 160);
  if (typeof output !== "object" || output === null || Array.isArray(output)) return output;
  const record = output as Readonly<Record<string, unknown>>;
  return Object.fromEntries(
    ["path", "bytesRead", "truncated", "exitCode", "stdout", "name", "summary"]
      .filter((key) => record[key] !== undefined)
      .map((key) => {
        const value = record[key];
        return [key, typeof value === "string" ? value.slice(0, 160) : value];
      }),
  );
}

async function runBaseToolMountSmoke(input: {
  executor: BaseToolExecutorPort;
  runtimeId: string;
  sessionId: string;
}) {
  const registry = praxis.createBaseToolRegistry();
  const invoke = async (toolId: string, toolInput: Readonly<Record<string, unknown>>) => {
    const lookup = registry.lookupHandler(toolId);
    if (!lookup.ok) {
      return {
        toolId,
        ok: false,
        error: lookup.error.message,
      };
    }
    const result = await lookup.handler.invoke({
      toolId,
      input: toolInput,
      executor: input.executor,
      runtime: {
        runtimeId: input.runtimeId,
        sessionId: input.sessionId,
        cwd: process.cwd(),
      },
    });
    return {
      toolId,
      ok: result.ok,
      runtimePort: result.metadata?.runtimePort,
      event: result.events?.at(-1),
      output: outputPreview(result.output ?? result.value),
      error: result.error?.message,
    };
  };

  return Promise.all([
    invoke("file.read", { path: "package.json", maxBytes: 240 }),
    invoke("file.search", { query: "@praxis-ai/praxis", cwd: "package.json" }),
    invoke("skill.load", { name: "repoInspector.skill.runtimeMount" }),
  ]);
}

function createExampleRuntimeSurfaceDescriptors(): readonly RuntimeSurfaceDescriptor[] {
  return [
    {
      surfaceId: "runtime.applicationSurface",
      kind: "applicationSurface",
      owner: "examples.fullstack.application",
      capabilities: ["agent.compile", "agent.validate", "agent.runManifest", "approval.resolve"],
      scopes: ["runtime:invoke", "runtime:inspect"],
      callers: ["application", "management"],
    },
    {
      surfaceId: "runtime.contractSurface",
      kind: "contractSurface",
      owner: "runtime.agentManifest",
      capabilities: ["manifest.validate", "frameworkCore.verify"],
      scopes: ["runtime:inspect"],
      callers: ["runtime", "inspection"],
    },
    {
      surfaceId: "runtime.governancePlane",
      kind: "governancePlane",
      owner: "runtime.governance",
      capabilities: ["policy.evaluate", "approval.route", "scope.check"],
      scopes: ["runtime:invoke", "runtime:inspect"],
      callers: ["runtime", "application", "official-module"],
    },
    {
      surfaceId: "runtime.invocationMethod",
      kind: "invocationMethod",
      owner: "runtime.kernel",
      capabilities: ["runManifest", "dryRun", "session.bind"],
      scopes: ["runtime:invoke", "runtime:inspect"],
      callers: ["application", "runtime"],
    },
    {
      surfaceId: "runtime.execEngine",
      kind: "execEngine",
      owner: "runtime.execEngine",
      capabilities: ["baseTool.registry", "baseTool.executorPort", "mainLoop.stepRecords"],
      scopes: ["runtime:invoke", "runtime:inspect"],
      callers: ["runtime", "application", "inspection"],
    },
    {
      surfaceId: "runtime.modelAdapter",
      kind: "modelAdapter",
      owner: "runtime.modelAdapter",
      capabilities: ["dryRun.provider", "provider.carrier"],
      scopes: ["runtime:invoke", "runtime:inspect"],
      callers: ["runtime", "application", "inspection"],
      metadata: {
        exampleProviderMode: "dry-run",
      },
    },
    {
      surfaceId: "runtime.interfaceAdapter",
      kind: "interfaceAdapter",
      owner: "runtime.interfaceAdapter",
      capabilities: ["approval.interface", "event.interface", "state.interface"],
      scopes: ["runtime:observe", "runtime:inspect"],
      callers: ["application", "runtime"],
    },
    {
      surfaceId: "runtime.inspection",
      kind: "inspection",
      owner: "runtime.inspection",
      capabilities: ["frameworkInspectionReport", "runtimeSurfaceInspector"],
      scopes: ["runtime:inspect"],
      callers: ["application", "inspection", "debug"],
    },
    {
      surfaceId: "runtime.sessionStateEvent",
      kind: "sessionStateEvent",
      owner: "runtime.sessionStateEventStore",
      capabilities: ["session.create", "state.append", "event.append", "checkpoint.read"],
      scopes: ["runtime:observe", "runtime:inspect"],
      callers: ["runtime", "application", "inspection", "debug"],
    },
    {
      surfaceId: "runtime.officialModuleSurface",
      kind: "officialModuleSurface",
      owner: "runtime.officialModuleSurface",
      ready: false,
      required: false,
      capabilities: ["tap.contract", "cmp.contract", "mp.contract", "multiagent.contract"],
      scopes: ["runtime:inspect"],
      callers: ["runtime", "official-module", "inspection"],
      metadata: {
        exampleState: "contract-only in this fullstack dry-run example",
      },
    },
  ];
}

function createCompositionSurfaceInputs(
  surfaces: readonly RuntimeSurfaceDescriptor[],
): readonly RuntimeCompositionSurfaceInput[] {
  return surfaces
    .filter((surface) => surface.mounted !== false && surface.ready !== false)
    .map((surface) => ({
      surface: surface.surfaceId as RuntimeCompositionSurfaceInput["surface"],
      bindingId: `${surface.surfaceId}:binding`,
      capabilities: surface.capabilities,
      metadata: {
        owner: surface.owner,
      },
    }));
}

const compiled = praxis.compileAgent(agent, {
  compiledAt: "2026-05-06T00:00:00.000Z",
});

if (!compiled.ok) {
  console.error("compile failed:", compiled.error);
  process.exitCode = 1;
} else {
  const validation = praxis.validateAgentManifest(compiled.manifest);
  if (!validation.ok) {
    console.error("manifest validation failed:", validation.error);
    process.exitCode = 1;
  } else {
    const sessionId = `session.example.repoInspector.${validation.manifest.identity.id}`;
    const exampleBaseToolAdapters = createExampleSkillAdapters();
    const exampleMcpModule = createExampleMcpModule();
    const exampleMcpManifest = {
      ...validation.manifest,
      harness: {
        ...validation.manifest.harness,
        modules: {
          ...validation.manifest.harness.modules,
          mcp: exampleMcpModule,
        },
      },
    };
    const exampleMcpProfiles = praxis.buildMcpServerProfilesFromManifest(exampleMcpManifest);
    const exampleMcpSkillStore = praxis.createInMemoryMcpPlusSkillStore([{
      id: "repo-plus:repo-inspection:read-search-expand",
      serverId: "repo-plus",
      projectId: "project.example.repoInspector",
      chapter: "repo-inspection",
      title: "Read search expand",
      summary: "Read first, search second, expand diagnostics only when repository connectivity matters.",
      createdAt: "2026-06-04T00:00:00.000Z",
      updatedAt: "2026-06-04T00:00:00.000Z",
    }]);
    const runtimeSessionStore = praxis.runtime.createInMemorySessionStateEventStore();
    const runtimeExecutor = praxis.runtime.createBaseToolExecutorPort({
      runtimeId,
      sessionId,
      policy: {
        workspaceRoot: process.cwd(),
        allowedRoots: [process.cwd()],
        allowRipgrep: true,
        allowNetworkFetch: false,
        allowNetworkSearch: false,
      },
      mcpServers: exampleMcpProfiles,
      adapters: exampleBaseToolAdapters,
    });
    const runtimeMcpMountMatrix = await praxis.runtime.inspectMcpMountMatrix({
      manifest: exampleMcpManifest,
      executor: runtimeExecutor,
      implementedPortPaths: praxis.runtime.listBaseToolImplementedPortPaths({
        adapters: exampleBaseToolAdapters,
        mcpServers: exampleMcpProfiles,
      }),
      nativeToolInventoryByServerId: {
        "repo-native": exampleMcpNativeTools,
        "repo-plus": exampleMcpPlusNativeTools,
      },
      projectId: "project.example.repoInspector",
      skillStore: exampleMcpSkillStore,
    });
    const runtimeSandboxPrepared = await praxis.sandboxPlane.prepareSandboxRuntime(validation.manifest.sandbox, {
      cwd: process.cwd(),
      runSmoke: false,
    });
    const runtimeSandboxMountMatrix = await praxis.runtime.inspectSandboxMountMatrix({
      sandbox: validation.manifest.sandbox,
      policyProfile: validation.manifest.toolPolicy.profile,
      preparedSandbox: runtimeSandboxPrepared,
      sandboxProviderInjected: runtimeSandboxPrepared.probe.metadata.injectedProvider === true,
      toolId: "shell.run",
      command: {
        program: "true",
        cwd: process.cwd(),
      },
    });
    const manifestToolReadiness = createFrameworkToolReadiness({
      manifestTools: validation.manifest.harness.tools,
      executor: runtimeExecutor,
    });
    const baseToolMountSmoke = await runBaseToolMountSmoke({
      executor: runtimeExecutor,
      runtimeId,
      sessionId,
    });
    const runtimeSurfaces = createExampleRuntimeSurfaceDescriptors();
    const surfaceRegistry = praxis.runtime.createSurfaceRegistry({
      runtimeId,
      runtimeReady: true,
      surfaces: runtimeSurfaces,
    });
    const surfaceInspection = surfaceRegistry.ok
      ? praxis.inspection.inspectRuntimeSurfaces({
          runtimeId,
          surfaces: surfaceRegistry.registry.surfaces.map((surface) => ({
            surfaceId: surface.surfaceId,
            mounted: surface.mounted,
            ready: surface.ready,
            required: surface.required,
            owner: surface.owner,
            exposedCapabilities: surface.capabilities,
          })),
          requestedScopes: ["runtime:inspect"],
          allowedScopes: ["runtime:inspect"],
        })
      : surfaceRegistry;
    const runtimeComposition = praxis.runtime.createCompositionRoot({
      runtimeId,
      caller: {
        kind: "application",
        id: "examples.fullstack.repoInspector",
        sessionId,
      },
      requestedScopes: ["runtime:invoke", "runtime:inspect"],
      allowedScopes: ["runtime:invoke", "runtime:inspect"],
      surfaces: createCompositionSurfaceInputs(runtimeSurfaces),
    });
    const manifestInspection = praxis.inspectAgentManifest(validation.manifest);
    const promptPackageManifest = await readPromptPackageManifest(validation.manifest.promptPack.metadata.promptPackageManifest);
    const developerCatalog = praxis.listBaseToolDeveloperCatalog();
    const turnPreview = praxis.execution.prepareMainLoopTurn({
      runtimeId,
      sessionId: "session.example.repoInspector.preview",
      promptPackId: validation.manifest.promptPack.promptPackId,
      turnIndex: 0,
      targetModel: validation.manifest.model.model,
      materials: [
        {
          id: "agent-base-preview",
          kind: "system",
          text: "RepoInspector base prompt from the developer prompt package.",
          source: "example.fullstack.promptPackage",
          trusted: true,
          promptSegmentKind: "declaredRuntimeContext",
        },
        {
          id: "project-rules-preview",
          kind: "file",
          text: "Project rules and repository inspection conventions.",
          source: "example.fullstack.projectRules",
          trusted: true,
          promptSegmentKind: "projectContext",
        },
        ...validation.manifest.harness.tools.map((tool, index) => ({
          id: `tool-preview:${tool.toolId}`,
          kind: "tool" as const,
          text: tool.description ?? `Mounted ${tool.toolId}`,
          source: "example.fullstack.toolProjection",
          trusted: true,
          priority: 80 - index,
          metadata: {
            promptSegmentKind: "toolDeclarations",
            toolMaterialType: "declaration",
            toolProviderKind: tool.metadata?.toolProviderKind ?? "baseTool",
            toolId: tool.toolId,
            toolName: tool.toolId.replaceAll(".", "_"),
            inputSchema: tool.inputSchema ?? { type: "object", additionalProperties: true },
          },
        })),
        {
          id: "cmp-preview",
          kind: "cmp",
          text: "CMP bridge contract declares how the application may request prompt context materials on demand.",
          source: "example.fullstack.cmpBridge",
          trusted: true,
          promptSegmentKind: "sessionSummary",
        },
        {
          id: "mp-preview",
          kind: "memory",
          text: "MP bridge contract declares how the application may request memory references on demand.",
          source: "example.fullstack.mpBridge",
          trusted: true,
          promptSegmentKind: "memoryContext",
        },
        {
          id: "turn-preview",
          kind: "user",
          text: "Inspect this fullstack example project.",
          source: "user",
          promptSegmentKind: "userTurn",
        },
      ],
    });
    const storageRuntime = praxis.storagePlane.createStoragePlaneRuntime({
      cwd: process.cwd(),
      workspaceRoot: storageWorkspaceRoot,
      agentId: validation.manifest.identity.id,
      initMode: validation.manifest.storage.init,
    });
    const frameworkInspection = praxis.inspection.createFrameworkInspectionReport({
      runtimeId,
      manifest: validation.manifest,
      storage: {
        cwd: process.cwd(),
        workspaceRoot: storageWorkspaceRoot,
      },
      tools: manifestToolReadiness,
      providers: [
        {
          providerId: "codex_responses",
          role: "primary",
          ready: false,
          required: false,
          reason: "example 默认使用 dry-run；接 live provider 时再注入 auth/modelClient。",
        },
      ],
      promptPackPreview: turnPreview.ok
        ? {
            promptPackId: turnPreview.promptPackId,
            cachePlan: turnPreview.cachePlan,
            materials: turnPreview.promptPack.materials.map((material) => ({
              materialId: material.id,
              kind: material.kind,
              sourceCategory: material.sourceCategory,
              preview: material.text,
              trusted: material.trusted,
            })),
          }
        : undefined,
    });

    console.log("=== Agent Manifest ===");
    console.log({
      manifestId: validation.manifest.manifestId,
      hash: validation.manifest.manifestHash,
      identity: validation.manifest.identity,
      source: validation.manifest.source,
      model: validation.manifest.model,
      modelFleetEndpoints: Object.keys(validation.manifest.modelFleet.endpoints),
      promptPack: {
        id: validation.manifest.promptPack.promptPackId,
        packageRoot: validation.manifest.promptPack.metadata.promptPackageRoot,
        packageManifest: validation.manifest.promptPack.metadata.promptPackageManifest,
        patchIds: validation.manifest.promptPack.patches.map((patch) => patch.patchId),
      },
      mainLoop: validation.manifest.mainLoop,
      sandbox: validation.manifest.sandbox,
      toolPolicy: {
        profile: validation.manifest.toolPolicy.profile,
        matrixId: validation.manifest.toolPolicy.matrixId,
        defaultDecision: validation.manifest.toolPolicy.defaultDecision,
      },
      storage: validation.manifest.storage,
      session: validation.manifest.session,
      statePlane: validation.manifest.statePlane,
      tools: validation.manifest.harness.tools.map((tool) => `${tool.family}/${tool.group}/${tool.toolId}`),
      harnessAssembly: {
        modelRef: validation.manifest.harness.modelRef,
        modelFleetRef: validation.manifest.harness.modelFleetRef,
        promptPackRef: validation.manifest.harness.promptPackRef,
        toolPolicyRef: validation.manifest.harness.toolPolicyRef,
        mainLoopRef: validation.manifest.harness.mainLoopRef,
        sandboxRef: validation.manifest.harness.sandboxRef,
        storageRef: validation.manifest.harness.storageRef,
        sessionRef: validation.manifest.harness.sessionRef,
        statePlaneRef: validation.manifest.harness.statePlaneRef,
        interfaceRefs: validation.manifest.harness.interfaceRefs,
        contextRefs: validation.manifest.harness.contextRefs,
        memoryRefs: validation.manifest.harness.memoryRefs,
      },
      frameworkCore: validation.manifest.frameworkCore,
    });

    console.log("\n=== Prompt Package ===");
    console.log({
      manifest: promptPackageManifest,
      patchCount: validation.manifest.promptPack.patches.length,
      stateMutationCount: validation.manifest.promptPack.stateMachineMutations.length,
    });

    console.log("\n=== Manifest Inspection ===");
    console.log({
      frameworkCore: manifestInspection.frameworkCore,
      harnessToolCount: validation.manifest.harness.tools.length,
      modelFleetEndpointCount: manifestInspection.model.endpoints.length,
      promptPatchCount: manifestInspection.promptPack.patchCount,
      mainLoopHookCount: manifestInspection.mainLoop.hookCount,
    });

    console.log("\n=== Developer Tool API ===");
    console.log({
      catalogSize: developerCatalog.length,
      firstFiveTools: developerCatalog.slice(0, 5).map((tool) => ({
        toolId: tool.toolId,
        family: tool.family,
        group: tool.group,
        projection: tool.projection,
        modelRequired: tool.modelRequired,
      })),
      directHelper: praxis.basetool.core.fileSearch({ profileName: "codingCore" }),
      unknownLookup: praxis.tryBaseToolById("code.thisToolDoesNotExist"),
      mountedRuntimePorts: praxis.runtime.listBaseToolImplementedPortPaths({
        adapters: exampleBaseToolAdapters,
        mcpServers: exampleMcpProfiles,
      }).filter((portPath) => ["filesystem.readText", "search.ripgrep", "skill.load", "mcp.call", "mcp.listResources"].includes(portPath)),
    });

    console.log("\n=== BaseTool Runtime Mount Smoke ===");
    console.log(baseToolMountSmoke);

    console.log("\n=== Runtime MCP Mount Matrix ===");
    console.log({
      status: runtimeMcpMountMatrix.status,
      requiredRuntimeRequirements: runtimeMcpMountMatrix.requiredRuntimeRequirements,
      baseTools: runtimeMcpMountMatrix.baseTools.map((tool) => ({
        toolId: tool.toolId,
        decision: tool.decision,
        activeReadiness: tool.activeReadiness,
        evidenceStatus: tool.evidenceStatus,
        portEvidence: tool.portEvidence,
        missingPortPaths: tool.missingPortPaths,
      })),
      servers: runtimeMcpMountMatrix.servers.map((server) => ({
        serverId: server.serverId,
        mode: server.mode,
        runtimeProfilePresent: server.runtimeProfilePresent,
        profileStatus: server.profileStatus,
        nativeToolInventoryStatus: server.nativeToolInventoryStatus,
        dynamicToolCount: server.dynamicToolCount,
        mcpPlusControlToolIds: server.mcpPlusControlToolIds,
        skillNoteCount: server.skillNoteCount,
      })),
      totals: runtimeMcpMountMatrix.totals,
    });

    console.log("\n=== Runtime Sandbox Mount Matrix ===");
    console.log({
      status: runtimeSandboxMountMatrix.status,
      sandbox: runtimeSandboxMountMatrix.sandbox,
      provider: runtimeSandboxMountMatrix.provider,
      baseToolSandboxPlan: runtimeSandboxMountMatrix.baseToolSandboxPlan,
      commandPlanPreview: runtimeSandboxMountMatrix.commandPlanPreview,
      raxcell: runtimeSandboxMountMatrix.raxcell,
      policyMiddleware: runtimeSandboxMountMatrix.policyMiddleware,
      falseReadyGuards: runtimeSandboxMountMatrix.falseReadyGuards,
    });

    console.log("\n=== Runtime Surface Composition ===");
    console.log({
      registry: surfaceRegistry.ok
        ? {
            readySurfaceIds: surfaceRegistry.registry.readySurfaceIds,
            missingRequiredSurfaceIds: surfaceRegistry.registry.missingRequiredSurfaceIds,
            degradedSurfaceIds: surfaceRegistry.registry.degradedSurfaceIds,
            resolvesApplicationSurface: surfaceRegistry.registry.resolve({
              surfaceId: "runtime.applicationSurface",
              caller: "application",
              requestedScopes: ["runtime:invoke"],
            }).ok,
          }
        : surfaceRegistry.error,
      inspection: surfaceInspection.ok
        ? {
            status: surfaceInspection.inspection.status,
            missingRequiredSurfaceIds: surfaceInspection.inspection.missingRequiredSurfaceIds,
            degradedSurfaceIds: surfaceInspection.inspection.degradedSurfaceIds,
            entryCount: surfaceInspection.inspection.entries.length,
            unsafeSideEffects: surfaceInspection.inspection.unsafeSideEffects,
          }
        : surfaceInspection.error,
      composition: runtimeComposition.ok
        ? {
            phase: runtimeComposition.composition.phase,
            surface: runtimeComposition.composition.surface,
            surfaceNames: runtimeComposition.composition.surfaceNames,
            requiredSurfaces: runtimeComposition.composition.requiredSurfaces,
            acceptedScopes: runtimeComposition.composition.acceptedScopes,
            dryRun: runtimeComposition.composition.dryRun,
          }
        : runtimeComposition.error,
    });

    console.log("\n=== Storage Plane ===");
    console.log(storageRuntime.ok
      ? {
          home: storageRuntime.runtime.layout.home.root,
          workspace: storageRuntime.runtime.layout.workspace.root,
          sessionSqlite: storageRuntime.runtime.layout.workspace.sessionSqlitePath,
          agentRoot: storageRuntime.runtime.layout.workspace.agent?.root,
          initMode: storageRuntime.runtime.initMode,
          directoriesToCreate: storageRuntime.runtime.initPlan.directories.length,
          writesSecrets: storageRuntime.runtime.initPlan.writesSecrets,
        }
      : storageRuntime.error);

    console.log("\n=== Framework Inspection ===");
    console.log(frameworkInspection.ok
      ? {
          status: frameworkInspection.report.status,
          storage: frameworkInspection.report.storage,
          toolReadiness: frameworkInspection.report.toolReadiness,
          promptCache: frameworkInspection.report.promptPackPreview?.cachePlan,
          findings: frameworkInspection.report.findings,
        }
      : frameworkInspection.error);

    console.log("\n=== PromptPack Turn Preview ===");
    console.log(turnPreview.ok
      ? {
          segmentKinds: turnPreview.cachePlan.segments.map((segment) => segment.segmentKind),
          cacheablePrefixSegmentKinds: turnPreview.cachePlan.cacheablePrefixSegmentKinds,
          dynamicSegmentKinds: turnPreview.cachePlan.dynamicSegmentKinds,
          cacheRiskWarnings: turnPreview.cachePlan.cacheRiskWarnings,
          stepRecords: turnPreview.turnRecord.stepRecords.map((step) => `${step.stepIndex}:${step.actionPrimitive}:${step.status}`),
        }
      : turnPreview.error);

    const approvalResolver: RuntimeApprovalResolver = repoInspectorApprovalResolver;
    const kernel = praxis.runtime.createPraxisRuntimeKernel({
      runtimeId,
    });
    const result = await kernel.runManifest(
      validation.manifest,
      "请观察当前仓库：先判断 agentCore framework 示例是否已经能编译和启动，再指出下一步该测试什么。",
      {
        sessionId,
        dryRun: true,
        store: runtimeSessionStore,
        executor: runtimeExecutor,
        approvalResolver,
        storage: {
          cwd: process.cwd(),
          workspaceRoot: storageWorkspaceRoot,
          initMode: "on-run",
        },
        now: () => "2026-05-06T00:00:00.000Z",
      },
    );
    const runtimeSessionSnapshot = await runtimeSessionStore.readSession(sessionId);

    console.log("\n=== Runtime Session Store ===");
    console.log({
      sessionStatus: runtimeSessionSnapshot.session?.status,
      agentId: runtimeSessionSnapshot.session?.agentId,
      manifestHash: runtimeSessionSnapshot.session?.manifestHash,
      counts: {
        states: runtimeSessionSnapshot.states.length,
        events: runtimeSessionSnapshot.events.length,
        invocations: runtimeSessionSnapshot.invocations.length,
        mainLoopSteps: runtimeSessionSnapshot.mainLoopSteps.length,
        approvals: runtimeSessionSnapshot.approvals.length,
        errors: runtimeSessionSnapshot.errors.length,
      },
      latestState: runtimeSessionSnapshot.states.at(-1) === undefined
        ? undefined
        : {
            stateId: runtimeSessionSnapshot.states.at(-1)?.stateId,
            phase: runtimeSessionSnapshot.states.at(-1)?.phase,
          },
      checkpointSteps: runtimeSessionSnapshot.mainLoopSteps
        .filter((step) => step.status === "completed")
        .slice(0, 5)
        .map((step) => `${step.stepIndex}:${step.actionPrimitive}`),
      eventTypes: [...new Set(runtimeSessionSnapshot.events.map((event) => event.type))].slice(0, 8),
    });

    console.log("\n=== Runtime Result ===");
    console.log(result.ok
      ? {
          ok: result.ok,
          finalOutput: result.finalOutput,
          modelCalls: result.modelCalls.length,
          toolCalls: result.toolCalls.length,
          mainLoopSteps: result.mainLoopSteps.map((step) => `${step.stepIndex}:${step.actionPrimitive}:${step.status}`),
          cachePlanSteps: result.mainLoopSteps
            .filter((step) => step.actionPrimitive === "buildCachePlan" && step.status === "completed")
            .map((step) => step.metadata),
          stateSummary: {
            sessions: result.state.session === undefined ? 0 : 1,
            events: result.state.events.length,
            invocations: result.state.invocations.length,
            steps: result.state.mainLoopSteps.length,
          },
        }
      : {
          ok: result.ok,
          error: result.error,
          events: result.events,
          state: result.state,
        });
    if (!result.ok) process.exitCode = 1;

    const runtimeReadinessMap = buildRuntimeReadinessMap({
      surfaceInspectionStatus: surfaceInspection.ok ? surfaceInspection.inspection.status : "blocked",
      missingRequiredSurfaceIds: surfaceInspection.ok ? surfaceInspection.inspection.missingRequiredSurfaceIds : [],
      degradedSurfaceIds: surfaceInspection.ok ? surfaceInspection.inspection.degradedSurfaceIds : [],
      mcpMountStatus: runtimeMcpMountMatrix.status,
      mcpMissingPortCount: runtimeMcpMountMatrix.baseTools.reduce(
        (count, tool) => count + tool.missingPortPaths.length,
        0,
      ),
      sandboxMountStatus: runtimeSandboxMountMatrix.status,
      sandboxProviderPrepared: runtimeSandboxMountMatrix.provider.prepared,
      toolFindingCount: frameworkInspection.ok ? frameworkInspection.report.findings.length : 1,
      promptCacheWarningCount: turnPreview.ok ? turnPreview.cachePlan.cacheRiskWarnings.length : 1,
      sessionStatus: runtimeSessionSnapshot.session?.status,
      runtimeResultOk: result.ok,
    });

    console.log("\n=== Runtime Readiness Gaps ===");
    console.log(runtimeReadinessMap);
  }
}
