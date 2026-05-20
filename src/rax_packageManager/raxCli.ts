/*
 * 文件定位：rax 开发者 CLI。
 * 核心目的：提供 rax build init / inspect / test / run 的最小真实入口。
 * 边界：不做远程 marketplace、不静默安装依赖、不绕过 agentCore public API。
 */

import { createInterface } from "node:readline/promises";
import { readFileSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import os from "node:os";
import { stdin as input, stdout as output } from "node:process";
import path from "node:path";
import { pathToFileURL } from "node:url";

import type { OpenAIV1ResponsesProviderCaller } from "../agentCore_modelAdapter/actualInvocationLayer/openai/v1_responses.js";
import type { AuthEnvelope } from "../agentCore_modelAdapter/authProfileLayer/authEnvelope.js";
import { resolveAuthEnvelope } from "../agentCore_modelAdapter/authProfileLayer/authResolver.js";
import { createCredentialRef } from "../agentCore_modelAdapter/authProfileLayer/credentialRef.js";
import { createProviderCaller } from "../agentCore_modelAdapter/providerAccessLayer/providerCaller.js";
import { createChatGPTCodexResponsesCarrier } from "../agentCore_modelAdapter/providerAccessLayer/providerCarrier.js";
import { fetchProviderTransport } from "../agentCore_modelAdapter/providerAccessLayer/transportCaller.js";
import { praxis, type AgentManifest, type AgentRunResult, type PromptMaterialSource } from "../agentCore/index.js";
import {
  createRuntimeBaseToolExecutorPort,
  listRuntimeBaseToolImplementedPortPaths,
} from "../agentCore_runtimeImplementation/runtime.execEngine/baseToolExecutorPortFactory.js";
import {
  preflightBaseToolDependencies,
  type BaseToolDependencyRuntimeMode,
} from "../agentCore_runtimeImplementation/runtime.execEngine/baseToolDependencyRuntime.js";
import {
  createBaseToolRealityLedger,
} from "../agentCore_runtimeImplementation/runtime.execEngine/baseToolRealityLedger.js";
import {
  evaluateBaseToolRuntimeReadiness,
} from "../agentCore_runtimeImplementation/runtime.execEngine/baseToolSupportCatalog.js";
import {
  createRaxBuildInitPlan,
  initRaxProject,
  type RaxBuildInitOptions,
  type RaxBuildInitPreset,
} from "./raxBuildInit.js";
import { planRaxDeveloperCommand } from "./raxDeveloperCommandContract.js";
import {
  runSelfRepairRuntime,
  type SelfRepairRuntimeResult,
} from "../agentCore_runtimeImplementation/runtime.selfRepair/selfRepairRuntime.js";
import { runDevDoctor } from "../devdoctor/index.js";

export type RaxCliResult = {
  exitCode: number;
  output: string;
};

const RAX_USAGE = [
  "Usage:",
  "  rax build init minimal|fullstack|custom [--dir path] [--dry-run]",
  "  rax inspect/test/run agent.ts",
  "  rax devdoctor run|inspect|report|cache-xray",
  "",
].join("\n");

type RaxProjectDescriptor = {
  entry?: string;
  export?: string;
};

type RaxProjectResolution = {
  agentPath: string;
  exportName?: string;
  projectRoot?: string;
};

type LiveProviderBinding =
  | {
      ok: true;
      auth: AuthEnvelope;
      providerCaller: OpenAIV1ResponsesProviderCaller;
      authSource: string;
      carrierId: string;
      events: readonly string[];
    }
  | {
      ok: false;
      reason: string;
      authSource?: string;
      events: readonly string[];
    };

type RaxCliSelfRepairFault = {
  faultId: string;
  kind: string;
  source: string;
  message: string;
  repairability?: string;
  nextStep?: string;
  planId?: string;
  stepSummaries: readonly string[];
};

type RaxCliSelfRepairPreflightReport = {
  mode: "test-auto-plan" | "run-report-only";
  status: "not-needed" | "plan-ready" | "approval-required" | "escalated" | "failed";
  dryRun: true;
  modelUsed: false;
  unsafeSideEffects: false;
  faults: readonly RaxCliSelfRepairFault[];
  publicSafeMessages: readonly string[];
};

type RaxCliDependencyPreparationReport = {
  mode: BaseToolDependencyRuntimeMode;
  managedRoot: string;
  total: number;
  ready: number;
  installed: number;
  requiresApproval: number;
  blocked: number;
  results: readonly {
    toolId: string;
    decision: string;
    status: string;
    reason: string;
    installableDependencies: readonly string[];
    missingDependencies: readonly string[];
  }[];
};

function argValue(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  return args[index + 1];
}

function hasFlag(args: readonly string[], name: string): boolean {
  return args.includes(name);
}

function wantsHelp(args: readonly string[]): boolean {
  return args.includes("--help") || args.includes("-h") || args.includes("help");
}

function commandTaskFromArgs(args: readonly string[]): string {
  const values: string[] = [];
  const flagsWithValue = new Set(["--export", "--codex-auth-file", "--auth-file", "--dependency-mode", "--managed-root"]);
  for (let index = 1; index < args.length; index += 1) {
    const value = args[index];
    if (flagsWithValue.has(value)) {
      index += 1;
      continue;
    }
    if (value.startsWith("--")) {
      continue;
    }
    values.push(value);
  }
  return values.join(" ").trim();
}

function parseBoolean(value: string): boolean {
  return ["yes", "y", "true", "1", "on"].includes(value.trim().toLowerCase());
}

async function ask(question: string, defaultValue: string): Promise<string> {
  const rl = createInterface({ input, output });
  try {
    const answer = await rl.question(`${question} (${defaultValue}): `);
    return answer.trim() || defaultValue;
  } finally {
    rl.close();
  }
}

async function customOptions(args: readonly string[]): Promise<RaxBuildInitOptions> {
  const projectName = argValue(args, "--name") ?? await ask("Project name", "praxis-agent");
  const targetDir = argValue(args, "--dir") ?? await ask("Target directory", projectName);
  const modelName = argValue(args, "--model") ?? await ask("Model name", "gpt-5.4");
  const sandboxProfile = (argValue(args, "--sandbox") ?? await ask("Sandbox profile hostObserved/workspaceOnly/linuxBubblewrap/rootlessContainer", "hostObserved")) as RaxBuildInitOptions["sandboxProfile"];
  const toolPolicyProfile = (argValue(args, "--tool-policy") ?? await ask("Tool policy standard/permissive/restricted/yolo/bapr", "standard")) as RaxBuildInitOptions["toolPolicyProfile"];
  const sessionPersistence = (argValue(args, "--session") ?? await ask("Session persistence memory/sqlite", "sqlite")) as RaxBuildInitOptions["sessionPersistence"];
  const includeShellTools = parseBoolean(argValue(args, "--shell-tools") ?? await ask("Include shell tools yes/no", "yes"));
  const includeGitTools = parseBoolean(argValue(args, "--git-tools") ?? await ask("Include git tools yes/no", "yes"));
  const includeInterfaceSurface = parseBoolean(argValue(args, "--interface") ?? await ask("Include interface surface yes/no", "yes"));

  return {
    preset: "custom",
    projectName,
    targetDir,
    modelName,
    sandboxProfile,
    toolPolicyProfile,
    sessionPersistence,
    includeShellTools,
    includeGitTools,
    includeInterfaceSurface,
  };
}

async function handleBuildInit(args: readonly string[]): Promise<RaxCliResult> {
  if (wantsHelp(args)) {
    return { exitCode: 0, output: RAX_USAGE };
  }

  const preset = (args[0] ?? "minimal") as RaxBuildInitPreset;
  if (!["minimal", "fullstack", "custom"].includes(preset)) {
    return { exitCode: 1, output: `Unknown rax build init preset: ${preset}\n` };
  }

  const options = preset === "custom"
    ? await customOptions(args.slice(1))
    : {
        preset,
        projectName: argValue(args, "--name") ?? "praxis-agent",
        targetDir: argValue(args, "--dir") ?? argValue(args, "--name") ?? "praxis-agent",
        sandboxProfile: (argValue(args, "--sandbox") as RaxBuildInitOptions["sandboxProfile"] | undefined) ?? (preset === "fullstack" ? "linuxBubblewrap" : "hostObserved"),
        toolPolicyProfile: (argValue(args, "--tool-policy") as RaxBuildInitOptions["toolPolicyProfile"] | undefined) ?? "standard",
        sessionPersistence: (argValue(args, "--session") as RaxBuildInitOptions["sessionPersistence"] | undefined) ?? (preset === "minimal" ? "memory" : "sqlite"),
      };

  if (hasFlag(args, "--dry-run")) {
    const plan = createRaxBuildInitPlan(options);
    return { exitCode: 0, output: `${JSON.stringify(plan, null, 2)}\n` };
  }

  const result = await initRaxProject(options);
  if (!result.ok) {
    return { exitCode: 1, output: `${result.error.message}\n` };
  }

  return {
    exitCode: 0,
    output: [
      `Created Praxis ${result.plan.preset} project at ${result.plan.targetDir}`,
      `Files: ${result.writtenFiles.length}`,
      "Next:",
      ...result.plan.nextCommands.map((command) => `  ${command}`),
      "",
    ].join("\n"),
  };
}

async function loadAgentModule(agentPath: string): Promise<Record<string, unknown>> {
  const absolute = path.resolve(agentPath);
  return await import(pathToFileURL(absolute).href) as Record<string, unknown>;
}

async function pathExists(pathname: string): Promise<boolean> {
  try {
    await stat(pathname);
    return true;
  } catch {
    return false;
  }
}

async function resolveAgentEntry(inputPath: string, exportName?: string): Promise<{ agentPath: string; exportName?: string }> {
  const absolute = path.resolve(inputPath);
  const info = await stat(absolute);
  if (!info.isDirectory()) {
    return { agentPath: absolute, exportName };
  }

  const descriptorPath = path.join(absolute, "rax.project.json");
  if (await pathExists(descriptorPath)) {
    const descriptor = JSON.parse(await readFile(descriptorPath, "utf8")) as RaxProjectDescriptor;
    if (typeof descriptor.entry === "string" && descriptor.entry.trim().length > 0) {
      return {
        agentPath: path.resolve(absolute, descriptor.entry),
        exportName: exportName ?? descriptor.export,
      };
    }
  }

  const conventionalEntries = [
    "praxis.agent.ts",
    "agents/mainAgent.ts",
    "agents/repoInspectorAgent.ts",
  ];
  for (const entry of conventionalEntries) {
    const candidate = path.join(absolute, entry);
    if (await pathExists(candidate)) {
      return { agentPath: candidate, exportName };
    }
  }

  throw new Error(`no Praxis agent entry found in ${inputPath}. Add rax.project.json with {"entry":"praxis.agent.ts"}.`);
}

async function resolveProjectAgentEntry(inputPath: string, exportName?: string): Promise<RaxProjectResolution> {
  const absolute = path.resolve(inputPath);
  const info = await stat(absolute);
  if (!info.isDirectory()) {
    return { agentPath: absolute, exportName };
  }

  const resolved = await resolveAgentEntry(inputPath, exportName);
  return { ...resolved, projectRoot: absolute };
}

async function compileAgentFile(agentPath: string, exportName?: string) {
  const entry = await resolveProjectAgentEntry(agentPath, exportName);
  const module = await loadAgentModule(entry.agentPath);
  const effectiveExportName = entry.exportName;
  if (effectiveExportName !== undefined && effectiveExportName.trim().length > 0) {
    return praxis.compileAgent(module[effectiveExportName] as never);
  }

  const candidates = [
    ["default", module.default],
    ...Object.entries(module).filter(([name]) => name !== "default"),
  ] as [string, unknown][];
  let lastFailure: ReturnType<typeof praxis.compileAgent> | undefined;
  const validAgents: { exportName: string; compiled: ReturnType<typeof praxis.compileAgent> }[] = [];
  for (const [name, candidate] of candidates) {
    const compiled = praxis.compileAgent(candidate as never);
    if (compiled.ok) {
      validAgents.push({ exportName: name, compiled });
      continue;
    }
    lastFailure = compiled;
  }

  if (validAgents.length === 1) {
    return validAgents[0].compiled;
  }

  if (validAgents.length > 1) {
    throw new Error(`multiple Praxis Agent exports found: ${validAgents.map((agent) => agent.exportName).join(", ")}. Use --export <name>.`);
  }

  return lastFailure ?? praxis.compileAgent(undefined as never);
}

function homeDir(): string {
  return process.env.HOME?.trim() || os.homedir();
}

async function firstExistingPath(paths: readonly string[]): Promise<string | undefined> {
  for (const candidate of paths) {
    if (candidate.trim().length === 0) {
      continue;
    }
    if (await pathExists(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

async function resolveCodexAuthFile(args: readonly string[], projectRoot: string | undefined): Promise<string | undefined> {
  const explicit = argValue(args, "--codex-auth-file") ?? argValue(args, "--auth-file");
  if (explicit !== undefined && explicit.trim().length > 0) {
    return path.resolve(explicit);
  }

  const codexHome = process.env.CODEX_HOME?.trim() || path.join(homeDir(), ".codex");
  const candidates = [
    process.env.AGENTCORE_CODEX_AUTH_FILE,
    process.env.RAX_CODEX_AUTH_FILE,
    projectRoot === undefined ? undefined : path.join(projectRoot, ".rax_workspace", "auth", "openai", "default", "auth.json"),
    projectRoot === undefined ? undefined : path.join(projectRoot, ".rax_workspace", "auth", "codex", "auth.json"),
    path.join(homeDir(), ".rax", "auth", "openai", "default", "auth.json"),
    path.join(codexHome, "auth.json"),
  ].filter((candidate): candidate is string => typeof candidate === "string" && candidate.trim().length > 0);

  return firstExistingPath(candidates);
}

async function createLiveProviderBinding(input: {
  args: readonly string[];
  manifest: AgentManifest;
  projectRoot?: string;
}): Promise<LiveProviderBinding> {
  const authFile = await resolveCodexAuthFile(input.args, input.projectRoot);
  if (authFile === undefined) {
    return {
      ok: false,
      reason: "No Codex auth file found. Provide --codex-auth-file, AGENTCORE_CODEX_AUTH_FILE, project .rax_workspace auth, ~/.rax auth, or ~/.codex/auth.json.",
      events: ["rax.provider.liveAuth.missing"],
    };
  }

  const credentialRef = createCredentialRef({
    id: `rax:${input.manifest.identity.id}:chatgpt-codex`,
    provider: "openai",
    credentialType: "chatgpt_codex_oauth",
    source: { kind: "codex-auth-file", filePath: authFile },
  });
  if (!credentialRef.ok) {
    return {
      ok: false,
      authSource: authFile,
      reason: credentialRef.error.message,
      events: credentialRef.events,
    };
  }

  const auth = resolveAuthEnvelope({
    credentialRef: credentialRef.credentialRef,
    readFile: (filePath) => {
      try {
        return readFileSync(filePath, "utf8");
      } catch {
        return undefined;
      }
    },
  });
  if (!auth.ok) {
    return {
      ok: false,
      authSource: authFile,
      reason: auth.error.message,
      events: auth.events,
    };
  }

  const carrier = createChatGPTCodexResponsesCarrier({
    carrierId: input.manifest.model.carrierId,
    model: input.manifest.model.model,
    credentialRef: credentialRef.credentialRef,
    clientName: input.manifest.model.clientName ?? "praxis-rax-cli",
    clientVersion: input.manifest.model.clientVersion ?? process.env.AGENTCORE_CODEX_CLIENT_VERSION ?? "0.118.0",
  });
  if (!carrier.ok) {
    return {
      ok: false,
      authSource: authFile,
      reason: carrier.error.message,
      events: carrier.events,
    };
  }

  return {
    ok: true,
    auth: auth.resolved.envelope,
    providerCaller: createProviderCaller({
      transport: fetchProviderTransport,
      authMaterial: auth.resolved.privateMaterial,
      timeoutMs: Number(process.env.RAX_PROVIDER_TIMEOUT_MS ?? "60000"),
    }),
    authSource: authFile,
    carrierId: carrier.carrier.carrierId,
    events: [...auth.events, ...carrier.events],
  };
}

function materialSourceText(material: PromptMaterialSource, fallbackRef: string): string {
  if (material.kind === "markdown") {
    return material.text;
  }
  if (material.kind === "markdownFile") {
    try {
      return readFileSync(path.resolve(material.path), "utf8");
    } catch {
      return `Prompt markdown file declared at ${material.path}.`;
    }
  }
  return `Prompt material reference declared as ${material.ref || fallbackRef}.`;
}

function materialSourceRef(material: PromptMaterialSource, fallbackRef: string): string {
  if (material.kind === "markdown") {
    return material.ref || fallbackRef;
  }
  if (material.kind === "markdownFile") {
    return material.ref || material.path;
  }
  return material.ref || fallbackRef;
}

function buildPromptPreviewMaterials(manifest: AgentManifest): Parameters<typeof praxis.execution.prepareMainLoopTurn>[0]["materials"] {
  type PromptPreviewMaterials = NonNullable<Parameters<typeof praxis.execution.prepareMainLoopTurn>[0]["materials"]>;
  const materials: PromptPreviewMaterials[number][] = [];
  if (manifest.promptPack.base !== undefined) {
    materials.push({
      id: materialSourceRef(manifest.promptPack.base, `${manifest.promptPack.promptPackId}:base`),
      kind: manifest.promptPack.base.kind === "markdownFile" ? "file" : "system",
      text: materialSourceText(manifest.promptPack.base, `${manifest.promptPack.promptPackId}:base`),
      source: "manifest.promptPack.base",
      trusted: true,
      promptSegmentKind: "declaredRuntimeContext",
    });
  }

  for (const inherited of manifest.promptPack.inherits) {
    materials.push({
      id: `promptPack.inherits:${inherited}`,
      kind: "runtime",
      text: `PromptPack inherits ${inherited}.`,
      source: "manifest.promptPack.inherits",
      trusted: true,
      promptSegmentKind: "projectContext",
    });
  }

  for (const patch of [...manifest.promptPack.patches, ...manifest.promptPack.stateMachineMutations]) {
    materials.push({
      id: patch.patchId,
      kind: patch.material.kind === "markdownFile" ? "file" : "system",
      text: materialSourceText(patch.material, patch.patchId),
      source: `manifest.promptPack.${patch.operation}`,
      trusted: true,
      metadata: {
        promptSegmentKind: "projectContext",
        patchId: patch.patchId,
        operation: patch.operation,
        targetRef: patch.targetRef,
        sceneTrigger: patch.sceneTrigger ?? "",
      },
    });
  }

  for (const materialRef of manifest.promptPack.materials) {
    materials.push({
      id: `promptPack.material:${materialRef}`,
      kind: "runtime",
      text: `PromptPack material reference ${materialRef}.`,
      source: "manifest.promptPack.materials",
      trusted: true,
      promptSegmentKind: "projectContext",
    });
  }

  for (const [index, tool] of manifest.harness.tools.entries()) {
    materials.push({
      id: `tool:${tool.family}:${tool.group}:${tool.toolId}`,
      kind: "tool",
      text: tool.description ?? `Mounted BaseTool ${tool.toolId}.`,
      source: "manifest.harness.tools",
      trusted: true,
      priority: 100 - index,
      metadata: {
        promptSegmentKind: "toolDeclarations",
        toolMaterialType: "declaration",
        toolProviderKind: "baseTool",
        toolId: tool.toolId,
        toolName: tool.toolId.replaceAll(".", "_"),
        inputSchema: tool.inputSchema ?? { type: "object", additionalProperties: true },
      },
    });
  }

  for (const contextRef of manifest.harness.contextRefs) {
    materials.push({
      id: `context:${contextRef}`,
      kind: "cmp",
      text: `Context bridge reference ${contextRef}.`,
      source: "manifest.harness.contextRefs",
      trusted: true,
      promptSegmentKind: "sessionSummary",
    });
  }

  for (const memoryRef of manifest.harness.memoryRefs) {
    materials.push({
      id: `memory:${memoryRef}`,
      kind: "memory",
      text: `Memory bridge reference ${memoryRef}.`,
      source: "manifest.harness.memoryRefs",
      trusted: true,
      promptSegmentKind: "memoryContext",
    });
  }

  materials.push({
    id: "rax.inspect.turn",
    kind: "user",
    text: "Inspect this Praxis Agent project for readiness and cache health.",
    source: "rax.inspect",
    trusted: true,
    promptSegmentKind: "userTurn",
  });

  return materials;
}

function prepareInspectionPromptPreview(manifest: AgentManifest) {
  const turn = praxis.execution.prepareMainLoopTurn({
    runtimeId: "runtime.rax.cli.inspect",
    sessionId: `${manifest.identity.id}:inspect`,
    promptPackId: manifest.promptPack.promptPackId,
    turnIndex: 0,
    targetModel: manifest.model.model,
    materials: buildPromptPreviewMaterials(manifest),
  });
  if (!turn.ok) {
    return undefined;
  }

  return {
    promptPackId: turn.promptPackId,
    cachePlan: turn.cachePlan,
    materials: turn.promptPack.materials.map((material) => ({
      materialId: material.id,
      kind: material.kind,
      sourceCategory: material.sourceCategory,
      preview: material.text,
      trusted: material.trusted,
    })),
  };
}

function createCliBaseToolReadiness(input: {
  manifest: AgentManifest;
  projectRoot?: string;
  sandbox: Awaited<ReturnType<typeof praxis.sandboxPlane.prepareSandboxRuntime>>;
  includeAllTestable?: boolean;
}) {
  const workspaceRoot = path.resolve(input.projectRoot ?? process.cwd());
  const executor = createRuntimeBaseToolExecutorPort({
    runtimeId: "runtime.rax.cli.inspect",
    sessionId: `${input.manifest.identity.id}:inspect`,
    policy: {
      workspaceRoot,
      allowedRoots: [workspaceRoot],
      allowGitExecution: true,
      allowRipgrep: true,
      allowNetworkFetch: false,
      allowShellExecution: false,
      allowProcessExecution: false,
      allowFilesystemWrite: false,
      allowFilesystemDelete: false,
    },
    resourceLimits: {
      timeoutMs: 10_000,
      maxOutputBytes: 256 * 1024,
      maxReadBytes: 256 * 1024,
      maxListEntries: 500,
    },
    sandbox: {
      providerFamily: input.sandbox.providerFamily,
      profile: input.sandbox.profile,
      ready: input.sandbox.ready,
      probe: {
        status: input.sandbox.probe.status,
        publicSafeMessage: input.sandbox.probe.publicSafeMessage,
      },
      smoke: input.sandbox.smoke === undefined
        ? undefined
        : {
            status: input.sandbox.smoke.status,
            publicSafeMessage: input.sandbox.smoke.publicSafeMessage,
          },
    },
  });
  const implementedPortPaths = listRuntimeBaseToolImplementedPortPaths({ adapters: executor });
  const ledger = new Map(createBaseToolRealityLedger({ executor, implementedPortPaths }).map((entry) => [entry.toolId, entry]));
  const selectedTools = input.includeAllTestable
    ? [...ledger.values()]
        .sort((left, right) => left.toolId.localeCompare(right.toolId))
        .map((entry) => ({
          toolId: entry.toolId,
          family: entry.storageFamily,
          group: entry.group,
        }))
    : input.manifest.harness.tools;

  return selectedTools.map((tool) => {
    const entry = ledger.get(tool.toolId);
    if (entry === undefined) {
      return {
        toolId: tool.toolId,
        family: tool.family,
        group: tool.group,
        ready: false,
        required: true,
        reason: `BaseTool ${tool.toolId} is not present in the runtime reality ledger`,
      };
    }

    const ready = entry.developerReadiness === "ready" ||
      entry.developerReadiness === "notLiveProven" ||
      entry.developerReadiness === "usableWithApproval";
    const reason = ready
      ? entry.liveStatus === "notProven"
        ? `BaseTool ${entry.toolId} has runtime host adapters but no live smoke proof yet`
        : undefined
      : entry.missingPorts.length > 0
        ? `BaseTool ${entry.toolId} requires runtime adapter ports: ${entry.missingPorts.join(", ")}`
        : `BaseTool ${entry.toolId} is not ready for this CLI runtime`;

    return {
      toolId: entry.toolId,
      family: entry.storageFamily,
      group: entry.group,
      ready,
      required: true,
      reason,
      developerReadiness: entry.developerReadiness,
      stages: entry.stages,
      dependencyStatus: entry.dependencyStatus,
      executorSupport: entry.executorSupport,
      missingPorts: entry.missingPorts,
    };
  });
}

function normalizeDependencyMode(value: string | undefined): BaseToolDependencyRuntimeMode {
  if (value === "auto" || value === "full" || value === "autoInstallTrustedManaged" || value === "observe") {
    return value;
  }
  return "observe";
}

function defaultToolInputForDependency(toolId: string, projectRoot: string): Readonly<Record<string, unknown>> {
  if (toolId.startsWith("code.lsp_")) {
    return {
      target: {
        filePath: path.join(projectRoot, "src", "index.ts"),
        languageId: "typescript",
        line: 1,
        character: 1,
      },
      context: {
        workspaceRoot: projectRoot,
      },
    };
  }
  return {
    context: {
      workspaceRoot: projectRoot,
    },
  };
}

async function prepareCliBaseToolDependencies(input: {
  manifest: AgentManifest;
  projectRoot?: string;
  includeAllTestable?: boolean;
  mode: BaseToolDependencyRuntimeMode;
  managedRoot?: string;
}): Promise<RaxCliDependencyPreparationReport> {
  const projectRoot = path.resolve(input.projectRoot ?? process.cwd());
  const managedRoot = path.resolve(input.managedRoot ?? path.join(projectRoot, ".rax_workspace", "tool-deps"));
  const executor = createRuntimeBaseToolExecutorPort({
    runtimeId: "runtime.rax.cli.dependencies",
    sessionId: `${input.manifest.identity.id}:dependencies`,
    policy: {
      workspaceRoot: projectRoot,
      allowedRoots: [projectRoot],
      allowGitExecution: true,
      allowRipgrep: true,
      allowNetworkFetch: true,
      allowShellExecution: false,
      allowProcessExecution: false,
      allowFilesystemWrite: false,
      allowFilesystemDelete: false,
    },
  });
  const implementedPortPaths = listRuntimeBaseToolImplementedPortPaths({ adapters: executor });
  const ledger = new Map(createBaseToolRealityLedger({ executor, implementedPortPaths }).map((entry) => [entry.toolId, entry]));
  const toolsToCheck = input.includeAllTestable
    ? [...ledger.keys()].sort().map((toolId) => ({ toolId }))
    : input.manifest.harness.tools;

  const results = [];
  for (const toolSpec of toolsToCheck) {
    const readiness = evaluateBaseToolRuntimeReadiness({
      toolId: toolSpec.toolId,
      executor,
      implementedPortPaths,
    });
    const preflight = await preflightBaseToolDependencies({
      executor,
      readiness,
      catalogEntry: readiness.entry,
      implementedPortPaths,
      context: {
        runtimeId: "runtime.rax.cli.dependencies",
        sessionId: `${input.manifest.identity.id}:dependencies`,
        invocationId: `rax-dependency:${toolSpec.toolId}`,
        toolId: toolSpec.toolId,
        toolInput: defaultToolInputForDependency(toolSpec.toolId, projectRoot),
        governanceAccepted: true,
        allowedScopes: input.manifest.harness.policy.scopes,
        mode: input.mode,
        managedRoot,
      },
    });
    results.push({
      toolId: toolSpec.toolId,
      decision: preflight.decision,
      status: preflight.status,
      reason: preflight.reason,
      installableDependencies: preflight.installableDependencies,
      missingDependencies: preflight.missingDependencies,
    });
  }

  return {
    mode: input.mode,
    managedRoot,
    total: results.length,
    ready: results.filter((result) => result.decision === "ready").length,
    installed: results.filter((result) => result.status === "installed").length,
    requiresApproval: results.filter((result) => result.decision === "requiresApproval").length,
    blocked: results.filter((result) => result.decision === "blocked").length,
    results,
  };
}

function summarizeSelfRepairResult(result: SelfRepairRuntimeResult): RaxCliSelfRepairFault {
  if (!result.ok) {
    return {
      faultId: `selfRepair:${result.error.code}`,
      kind: result.error.code,
      source: `runtime.selfRepair.${result.error.boundary}`,
      message: result.error.message,
      stepSummaries: [],
    };
  }

  return {
    faultId: result.outcome.classification.faultId,
    kind: result.outcome.classification.kind,
    source: result.outcome.classification.source,
    message: result.outcome.classification.reason,
    repairability: result.outcome.classification.repairability,
    nextStep: result.outcome.nextStep,
    planId: result.outcome.plan?.planId,
    stepSummaries: result.outcome.plan?.steps.map((step) => step.summary) ?? [],
  };
}

function createCliSelfRepairPreflightReport(input: {
  command: "test" | "run";
  manifest: AgentManifest;
  sandbox: Awaited<ReturnType<typeof praxis.sandboxPlane.prepareSandboxRuntime>>;
  runtimeDryRun?: AgentRunResult;
}): RaxCliSelfRepairPreflightReport {
  const mode = input.command === "test" ? "test-auto-plan" : "run-report-only";
  const publicSafeMessages: string[] = [];
  const outcomes: SelfRepairRuntimeResult[] = [];

  const runRepairPlan = input.command === "test";
  const sandboxFaultNeeded = !input.sandbox.ready ||
    input.sandbox.probe.status !== "available" ||
    input.sandbox.probe.missingDependencies.length > 0;
  if (sandboxFaultNeeded) {
    const message = input.sandbox.probe.publicSafeMessage ||
      `sandbox ${input.sandbox.profile} is not ready for runtime use`;
    publicSafeMessages.push(message);
    for (const hint of input.sandbox.probe.selfRepairHints) {
      publicSafeMessages.push(hint.message);
    }

    if (runRepairPlan) {
      outcomes.push(runSelfRepairRuntime({
        runtimeId: "runtime.rax.cli.test",
        runtimeReady: true,
        signal: {
          faultId: `${input.manifest.identity.id}:sandbox-preflight`,
          kind: "runtime-state.dependency-preflight",
          source: "rax.test.sandbox",
          message,
          severity: "recoverable",
          retryable: true,
          runtimeReady: input.sandbox.ready,
          tags: [
            "dependency-preflight",
            input.sandbox.profile,
            input.sandbox.providerFamily,
            ...input.sandbox.probe.missingDependencies,
          ],
        },
        allowedFaultKinds: ["runtime-state.dependency-preflight", "runtime-state.runManifest"],
        allowedStepKinds: ["observe", "restart-surface"],
        contract: { accepted: true },
        governance: { accepted: true },
      }));
    }
  }

  if (input.runtimeDryRun !== undefined && !input.runtimeDryRun.ok) {
    const message = input.runtimeDryRun.error.message;
    publicSafeMessages.push(message);
    if (runRepairPlan) {
      outcomes.push(runSelfRepairRuntime({
        runtimeId: "runtime.rax.cli.test",
        runtimeReady: true,
        signal: {
          faultId: `${input.manifest.identity.id}:runManifest:${input.runtimeDryRun.error.code}`,
          kind: "runtime-state.runManifest",
          source: "rax.test.runManifest",
          message,
          severity: "recoverable",
          retryable: true,
          runtimeReady: false,
          executionPhase: "runManifest",
          tags: ["runtime-dry-run", input.runtimeDryRun.error.code],
        },
        allowedFaultKinds: ["runtime-state.dependency-preflight", "runtime-state.runManifest"],
        allowedStepKinds: ["observe", "restart-surface"],
        contract: { accepted: true },
        governance: { accepted: true },
      }));
    }
  }

  const faults = outcomes.map(summarizeSelfRepairResult);
  const failed = outcomes.some((outcome) => !outcome.ok);
  const approvalRequired = outcomes.some((outcome) => outcome.ok && outcome.outcome.status === "approval-required");
  const escalated = outcomes.some((outcome) => outcome.ok && outcome.outcome.status === "escalated");
  const planReady = outcomes.some((outcome) => outcome.ok && outcome.outcome.status === "plan-ready");
  const status: RaxCliSelfRepairPreflightReport["status"] = failed
    ? "failed"
    : escalated
      ? "escalated"
      : approvalRequired
        ? "approval-required"
        : planReady
          ? "plan-ready"
          : "not-needed";

  return {
    mode,
    status,
    dryRun: true,
    modelUsed: false,
    unsafeSideEffects: false,
    faults,
    publicSafeMessages: [...new Set(publicSafeMessages.filter(Boolean))],
  };
}

function formatReadinessConsole(input: {
  command: "inspect" | "test";
  manifest: ReturnType<typeof praxis.inspectAgentManifest>;
  sandbox: Awaited<ReturnType<typeof praxis.sandboxPlane.prepareSandboxRuntime>>;
  inspection: unknown;
  promptCache?: {
    segmentCount: number;
    cacheablePrefixSegmentKinds: readonly string[];
    dynamicSegmentKinds: readonly string[];
    cacheRiskWarnings: readonly string[];
  };
  runtimeDryRun?: AgentRunResult;
  selfRepairPreflight?: RaxCliSelfRepairPreflightReport;
  dependencyPreparation?: RaxCliDependencyPreparationReport;
}): string {
  const hints = input.sandbox.probe.selfRepairHints.map((hint) => `  - ${hint.message}`).join("\n") || "  - none";
  const missing = input.sandbox.probe.missingDependencies.join(", ") || "none";
  const smoke = input.sandbox.smoke?.status ?? "not-run";
  const runtimeDryRun = input.runtimeDryRun === undefined
    ? "not-run"
    : input.runtimeDryRun.ok
      ? "passed"
      : `failed:${input.runtimeDryRun.error.code}`;
  return [
    `rax ${input.command}`,
    `agent: ${input.manifest.identityId}`,
    `sandbox: ${input.sandbox.profile} / ${input.sandbox.providerFamily}`,
    `sandbox ready: ${input.sandbox.ready}`,
    `sandbox probe: ${input.sandbox.probe.status}`,
    `sandbox smoke: ${smoke}`,
    `runtime dry-run: ${runtimeDryRun}`,
    `missing dependencies: ${missing}`,
    `prompt cache segments: ${input.promptCache?.segmentCount ?? "not-built"}`,
    `prompt cache prefix: ${input.promptCache?.cacheablePrefixSegmentKinds.join(", ") || "none"}`,
    `prompt cache dynamic: ${input.promptCache?.dynamicSegmentKinds.join(", ") || "none"}`,
    `prompt cache warnings: ${input.promptCache?.cacheRiskWarnings.join(", ") || "none"}`,
    `self-repair preflight: ${input.selfRepairPreflight?.status ?? "not-run"}`,
    `self-repair mode: ${input.selfRepairPreflight?.mode ?? "none"}`,
    `dependency mode: ${input.dependencyPreparation?.mode ?? "not-run"}`,
    `dependency ready: ${input.dependencyPreparation === undefined ? "not-run" : `${input.dependencyPreparation.ready}/${input.dependencyPreparation.total}`}`,
    `dependency installed: ${input.dependencyPreparation?.installed ?? "not-run"}`,
    `dependency blocked: ${input.dependencyPreparation?.blocked ?? "not-run"}`,
    "self-repair hints:",
    input.selfRepairPreflight?.publicSafeMessages.map((message) => `  - ${message}`).join("\n") || hints,
    "",
    JSON.stringify({ inspection: input.inspection }, null, 2),
    "",
  ].join("\n");
}

function formatRunConsole(result: AgentRunResult): string {
  const common = [
    "rax run",
    `ok: ${result.ok}`,
    `runtime: ${result.runtimeId ?? "unknown"}`,
    `session: ${result.sessionId ?? "unknown"}`,
  ];

  if (result.ok) {
    return [
      ...common,
      `final output: ${result.finalOutput}`,
      `model calls: ${result.modelCalls.length}`,
      `tool calls: ${result.toolCalls.length}`,
      `events: ${result.events.length}`,
      "",
    ].join("\n");
  }

  const pendingApprovals = result.state?.approvals.filter((approval) => approval.status === "pending") ?? [];
  const repairEvents = result.state?.events
    .filter((event) => event.type === "runtime.sandboxPlane.prepared")
    .flatMap((event) => {
      const sandbox = (event.payload as { sandbox?: { probe?: { selfRepairHints?: { message?: string }[] } } }).sandbox;
      return sandbox?.probe?.selfRepairHints?.map((hint) => hint.message).filter((message): message is string => typeof message === "string") ?? [];
    }) ?? [];

  return [
    ...common,
    `error: ${result.error.code}`,
    result.error.message,
    `pending approvals: ${pendingApprovals.length}`,
    "self-repair hints:",
    ...(repairEvents.length > 0 ? repairEvents.map((hint) => `  - ${hint}`) : ["  - none"]),
    "",
  ].join("\n");
}

async function handleInspectTestRun(command: "inspect" | "test" | "run", args: readonly string[]): Promise<RaxCliResult> {
  const agentPath = args[0];
  if (agentPath === undefined || agentPath.trim().length === 0) {
    return { exitCode: 1, output: `rax ${command} requires an agent file\n` };
  }

  const exportName = argValue(args, "--export");
  let resolvedEntry: RaxProjectResolution | undefined;
  try {
    resolvedEntry = await resolveProjectAgentEntry(agentPath, exportName);
  } catch {
    resolvedEntry = undefined;
  }
  const plan = planRaxDeveloperCommand({
    command,
    input: { kind: "agentFile", path: agentPath, exportName },
    cwd: process.cwd(),
    runtimeId: "runtime.rax.cli",
  });
  if (!plan.ok) {
    return { exitCode: 1, output: `${plan.error.message}\n` };
  }

  let compiled: Awaited<ReturnType<typeof compileAgentFile>>;
  try {
    compiled = await compileAgentFile(resolvedEntry?.agentPath ?? agentPath, resolvedEntry?.exportName ?? exportName);
  } catch (error) {
    const message = error instanceof Error ? error.message : "failed to load agent file";
    const multipleExports = message.includes("multiple Praxis Agent exports found");
    return {
      exitCode: 1,
      output: [
        `rax ${command} could not load ${agentPath}`,
        message,
        "self-repair hints:",
        multipleExports
          ? "  - rerun with --export <AgentClassName>"
          : "  - run npm install in the generated agent project",
        multipleExports
          ? "  - add a default export if this file has one intended Agent"
          : "  - verify @praxis-ai/praxis is installed or linked",
        "  - rerun rax inspect after the issue is fixed",
        "",
      ].join("\n"),
    };
  }
  if (!compiled.ok) {
    return { exitCode: 1, output: `${compiled.error.message}\n` };
  }

  const live = hasFlag(args, "--live");
  const liveProvider = live
    ? await createLiveProviderBinding({
        args,
        manifest: compiled.manifest,
        projectRoot: resolvedEntry?.projectRoot,
      })
    : undefined;

  if (command === "inspect" || command === "test") {
    const dependencyMode = normalizeDependencyMode(argValue(args, "--dependency-mode"));
    const dependencyPreparation = command === "test"
      ? await prepareCliBaseToolDependencies({
          manifest: compiled.manifest,
          projectRoot: resolvedEntry?.projectRoot,
          includeAllTestable: hasFlag(args, "--all-testable"),
          mode: dependencyMode,
          managedRoot: argValue(args, "--managed-root"),
        })
      : undefined;
    const sandboxReadiness = await praxis.sandboxPlane.prepareSandboxRuntime(compiled.manifest.sandbox, {
      cwd: process.cwd(),
      runSmoke: command === "test",
    });
    const toolReadiness = createCliBaseToolReadiness({
      manifest: compiled.manifest,
      projectRoot: resolvedEntry?.projectRoot,
      sandbox: sandboxReadiness,
      includeAllTestable: hasFlag(args, "--all-testable"),
    });
    const promptPackPreview = prepareInspectionPromptPreview(compiled.manifest);
    const report = praxis.inspection.createFrameworkInspectionReport({
      runtimeId: "runtime.rax.cli",
      manifest: compiled.manifest,
      tools: toolReadiness,
      providers: [{
        providerId: compiled.manifest.model.provider,
        ready: liveProvider?.ok === true,
        reason:
          liveProvider === undefined
            ? "provider probe is deferred; rerun with --live to use chatgpt_codex_responses"
            : liveProvider.ok
              ? `chatgpt_codex_responses auth resolved from ${liveProvider.authSource}`
              : liveProvider.reason,
      }],
      dependencies: sandboxReadiness.probe.dependencyChecks.map((check) => ({
        dependencyId: check.dependencyId,
        owner: "runtime",
        ready: check.status === "available",
        required: check.required,
        reason: check.publicSafeMessage,
      })),
      promptPackPreview,
    });
    const manifestInspection = praxis.inspectAgentManifest(compiled.manifest);
    const runtimeDryRun = command === "test"
      ? await praxis.runtime.createPraxisRuntimeKernel({
          runtimeId: "runtime.rax.cli.test",
          store: praxis.runtime.createInMemorySessionStateEventStore(),
        }).runManifest(compiled.manifest, live ? "Praxis rax test live provider probe." : "Praxis rax test dry-run.", {
          dryRun: !live,
          allowProviderCall: live,
          allowToolExecution: false,
          storage: { cwd: process.cwd(), initMode: "never" },
          sandbox: { cwd: process.cwd(), failOnUnavailable: true },
          auth: liveProvider?.ok === true ? liveProvider.auth : undefined,
          providerCaller: liveProvider?.ok === true ? liveProvider.providerCaller : undefined,
          exposeProviderTools: !live,
        })
      : undefined;
    const selfRepairPreflight = command === "test"
      ? createCliSelfRepairPreflightReport({
          command: "test",
          manifest: compiled.manifest,
          sandbox: sandboxReadiness,
          runtimeDryRun,
        })
      : undefined;
    const payload = {
      command,
      plan: plan.plan,
      manifest: manifestInspection,
      sandbox: sandboxReadiness,
      readiness: report.ok ? report.report : report.error,
      runtimeDryRun,
      selfRepairPreflight,
      dependencyPreparation,
      liveProvider: liveProvider === undefined
        ? undefined
        : liveProvider.ok
          ? { ok: true, authSource: liveProvider.authSource, carrierId: liveProvider.carrierId, events: liveProvider.events }
          : { ok: false, authSource: liveProvider.authSource, reason: liveProvider.reason, events: liveProvider.events },
    };
    const ok = report.ok && (liveProvider?.ok !== false) && (command === "inspect" || runtimeDryRun?.ok === true);
    return {
      exitCode: ok ? 0 : 1,
      output: hasFlag(args, "--json")
        ? `${JSON.stringify(payload, null, 2)}\n`
        : formatReadinessConsole({
            command,
            manifest: manifestInspection,
            sandbox: sandboxReadiness,
            inspection: report.ok ? report.report : report.error,
            promptCache: report.ok ? report.report.promptPackPreview?.cachePlan : undefined,
            runtimeDryRun,
            selfRepairPreflight,
            dependencyPreparation,
          }),
    };
  }

  const runtime = praxis.runtime.createPraxisRuntimeKernel({ runtimeId: "runtime.rax.cli" });
  const task = commandTaskFromArgs(args) || "Run this Praxis agent.";
  const dryRun = hasFlag(args, "--dry-run") || !live;
  if (liveProvider?.ok === false) {
    return {
      exitCode: 1,
      output: [
        "rax run live provider is not ready",
        liveProvider.reason,
        "self-repair hints:",
        "  - provide --codex-auth-file <path>",
        "  - or set AGENTCORE_CODEX_AUTH_FILE",
        "  - or place auth.json under project .rax_workspace/auth/openai/default/",
        "",
      ].join("\n"),
    };
  }
  const result = await runtime.runManifest(compiled.manifest, task, {
    dryRun,
    allowProviderCall: live,
    auth: liveProvider?.ok === true ? liveProvider.auth : undefined,
    providerCaller: liveProvider?.ok === true ? liveProvider.providerCaller : undefined,
    exposeProviderTools: !hasFlag(args, "--no-provider-tools"),
  });
  const selfRepairReport = result.ok
    ? undefined
    : createCliSelfRepairPreflightReport({
        command: "run",
        manifest: compiled.manifest,
        sandbox: await praxis.sandboxPlane.prepareSandboxRuntime(compiled.manifest.sandbox, {
          cwd: process.cwd(),
          runSmoke: false,
        }),
        runtimeDryRun: result,
      });
  return {
    exitCode: result.ok ? 0 : 1,
    output: hasFlag(args, "--json")
      ? `${JSON.stringify({ ...result, selfRepairReport }, null, 2)}\n`
      : formatRunConsole(result),
  };
}

export async function runRaxCli(argv = process.argv.slice(2)): Promise<RaxCliResult> {
  if (wantsHelp(argv)) {
    return { exitCode: 0, output: RAX_USAGE };
  }

  const [command, subcommand, ...rest] = argv;
  if (command === "build" && subcommand === "init") {
    return handleBuildInit(rest);
  }
  if (command === "devdoctor") {
    return runDevDoctor([subcommand, ...rest].filter((value): value is string => value !== undefined));
  }
  if (command === "inspect" || command === "test" || command === "run") {
    return handleInspectTestRun(command, [subcommand, ...rest].filter((value): value is string => value !== undefined));
  }
  return {
    exitCode: 1,
    output: RAX_USAGE,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const result = await runRaxCli();
  process.stdout.write(result.output);
  process.exitCode = result.exitCode;
}
