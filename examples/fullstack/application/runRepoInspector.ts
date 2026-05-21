import {
  readFile,
} from "node:fs/promises";
import path from "node:path";

import { praxis } from "@praxis-ai/praxis";
import type { RuntimeApprovalResolver } from "@praxis-ai/praxis";

import {
  DeepPermissiveRepoInspectorAgent,
  RepoInspectorAgent,
} from "../agents/repoInspector/agent.js";
import type {
  RepoInspectorPolicyProfile,
  RepoInspectorSandboxProfile,
} from "../agents/repoInspector/config/repoInspectorOptions.js";
import { repoInspectorApprovalResolver } from "../agents/repoInspector/interfaces/approvalSurface.js";

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

const agent = useDerivedAgent
  ? new DeepPermissiveRepoInspectorAgent({ persistence, sandboxProfile })
  : new RepoInspectorAgent({
      mode,
      policyProfile,
      sandboxProfile,
      persistence,
      includeShell: process.argv.includes("--shell"),
      includeSkillAuthoring: process.argv.includes("--skill-authoring"),
      includeOmni: process.argv.includes("--omni"),
      includeComputerUse: process.argv.includes("--computeruse"),
      includeAllTestable: process.argv.includes("--all-testable"),
    });

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
    const manifestInspection = praxis.inspectAgentManifest(validation.manifest);
    const promptPackageManifest = await readPromptPackageManifest(validation.manifest.promptPack.metadata.promptPackageManifest);
    const developerCatalog = praxis.listBaseToolDeveloperCatalog();
    const turnPreview = praxis.execution.prepareMainLoopTurn({
      runtimeId: "runtime.example.repoInspector",
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
          text: "CMP will own long-running context summaries once the official module is mounted.",
          source: "example.fullstack.cmpBridge",
          trusted: true,
          promptSegmentKind: "sessionSummary",
        },
        {
          id: "mp-preview",
          kind: "memory",
          text: "MP will own memory and retrieval projection once the official module is mounted.",
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
      runtimeId: "runtime.example.repoInspector",
      manifest: validation.manifest,
      storage: {
        cwd: process.cwd(),
        workspaceRoot: storageWorkspaceRoot,
      },
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
      directHelper: praxis.baseTools.git.getRepositoryStatus(),
      unknownLookup: praxis.tryBaseToolById("code.thisToolDoesNotExist"),
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
      runtimeId: "runtime.example.repoInspector",
    });
    const result = await kernel.runManifest(
      validation.manifest,
      "请观察当前仓库：先判断 agentCore framework 示例是否已经能编译和启动，再指出下一步该测试什么。",
      {
        sessionId: `session.example.repoInspector.${validation.manifest.identity.id}`,
        dryRun: true,
        approvalResolver,
        storage: {
          cwd: process.cwd(),
          workspaceRoot: storageWorkspaceRoot,
          initMode: "on-run",
        },
        now: () => "2026-05-06T00:00:00.000Z",
      },
    );

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
  }
}
