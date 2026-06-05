/*
 * 文件定位：raxode-cli / Raxode applicationLayer 后端。
 * 核心目的：让 Raxode CLI/TUI 通过 framework applicationLayer 使用 Praxis 后端项目。
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createApplicationProjectRuntime,
  createApplicationRestServer,
  createApplicationWebSocketServer,
  createLocalApplicationTransport,
  type CreateApplicationProjectRuntimeOptions,
  type PraxisApplicationCommand,
  type PraxisApplicationCommandResult,
  type PraxisApplicationPermissionProfile,
  type PraxisApplicationReasoningEffort,
  type PraxisApplicationRestServer,
  type PraxisApplicationRuntimeMode,
  type PraxisApplicationToolProfile,
  type PraxisApplicationViewModel,
  type PraxisApplicationWebSocketServer,
} from "@praxis-ai/praxis/application-layer";
import {
  createRaxodeLiveProvider,
  resolveRaxodeConfiguredModelOptions,
} from "./authentication/liveProvider.js";
import { resolveRaxodeRaxcellSandboxProvider } from "./application/raxcellSandboxProvider.js";
import { createRaxodeAuthStateProvider } from "./authentication/authStateProvider.js";
import { createRaxodeContextAdapter } from "./context/contextBridge.js";
import type { RaxodeOptions } from "./agents/codingAgent/config/raxodeOptions.js";
import { inspectRaxodeMemoryBridge } from "./memory/memoryBridge.js";
import {
  loadRaxodeMcpRuntimeOptions,
  mergeRaxodeMcpPlusRuntimeOptions,
} from "./application/mcpConfig.js";
import { createRaxodeMcpReadinessSummaryFromRuntimeOptions } from "./application/mcpReadinessSummary.js";
import type { RaxodeLocalReadinessProbeInput } from "./application/localReadinessProbe.js";
import {
  inspectRaxodeBackendReadinessWithLocalProbe,
  type RaxodeBackendReadiness,
} from "./application/runtimeReadiness.js";

function configuredRuntimePorts(options: RaxodeBackendOptions): Partial<RaxodeBackendReadiness["ports"]> {
  return {
    approvalResolver: options.approvalResolver ? "configured" : "default-policy",
    agentReviewResolver: options.agentReviewResolver ? "configured" : "not-configured",
    contextArtifactAdapters: options.contextArtifactAdapters ? "configured" : "not-configured",
    baseToolAdapters: options.baseToolAdapters ? "configured" : "not-configured",
    sandboxProvider: options.sandboxProvider ? "configured" : "not-configured",
    authStateProvider: options.authStateProvider ? "configured" : "not-configured",
    foundationProject: options.foundationProject || options.openFoundationProject ? "configured" : "not-configured",
    liveProviderResolver: options.liveProviderResolver ? "configured" : "raxode-default",
  };
}

export type RaxodeBackendCommand = {
  task?: string;
  cwd?: string;
  mode?: PraxisApplicationRuntimeMode;
  sessionId?: string;
  model?: string;
  reasoningEffort?: PraxisApplicationReasoningEffort;
  permissionProfile?: PraxisApplicationPermissionProfile;
  toolProfile?: PraxisApplicationToolProfile;
};

export type RaxodeBackendResult = PraxisApplicationCommandResult;

type RaxodeBackendRuntimePorts = Pick<
  CreateApplicationProjectRuntimeOptions,
  | "approvalResolver"
  | "agentReviewResolver"
  | "contextArtifactAdapters"
  | "baseToolAdapters"
  | "authStateProvider"
  | "sandboxProvider"
  | "foundationProject"
  | "openFoundationProject"
  | "liveProviderResolver"
  | "compactExecutor"
  | "preCompactGovernanceExecutor"
  | "preCompactGovernanceEnabled"
  | "compactContextWindowTokens"
  | "compactThresholdRatio"
  | "mcpServers"
  | "mcpPlusServers"
  | "mcpModule"
  | "mcpPlus"
>;

export type RaxodeBackendOptions = RaxodeOptions & RaxodeBackendRuntimePorts & {
  projectRoot?: string;
  cwd?: string;
  runtimeId?: string;
  sessionId?: string;
  now?: () => string;
  projectMemoryRoot?: string;
  globalMemoryRoot?: string;
  localReadinessProbe?: Omit<RaxodeLocalReadinessProbeInput, "manifest">;
};

export type RaxodeBackend = {
  readonly backendId: "applicationLayer";
  readonly projectRoot: string;
  getView(): Promise<PraxisApplicationViewModel>;
  inspectReadiness(): Promise<RaxodeBackendReadiness>;
  dispatch(command: PraxisApplicationCommand): Promise<PraxisApplicationCommandResult>;
  run(command?: RaxodeBackendCommand): Promise<RaxodeBackendResult>;
};

export type RaxodeBackendServerOptions = {
  host?: string;
  port?: number;
} & RaxodeBackendOptions;

async function createRaxodeRuntime(options: RaxodeBackendOptions = {}) {
  const projectRoot = path.resolve(options.projectRoot ?? fileURLToPath(new URL(".", import.meta.url)));
  const startDir = path.resolve(options.cwd ?? process.cwd());
  const memoryBridge = await inspectRaxodeMemoryBridge({
    projectRoot,
    cwd: startDir,
    profile: options.memoryProfile,
    projectMemoryRoot: options.projectMemoryRoot,
    globalMemoryRoot: options.globalMemoryRoot,
    now: options.now,
  });
  const modelOptions = resolveRaxodeConfiguredModelOptions({ roleId: "core.main", startDir });
  const provider = options.provider ?? modelOptions.provider;
  const endpointShape = options.endpointShape ?? modelOptions.endpointShape;
  const baseURL = options.baseURL ?? modelOptions.baseURL;
  const providerRoute = options.providerRoute ?? modelOptions.providerRoute;
  const model = options.model ?? modelOptions.model;
  const reasoningEffort = options.reasoningEffort ?? modelOptions.reasoningEffort;
  const maxOutputTokens = options.maxOutputTokens ?? modelOptions.maxOutputTokens;
  const permissionProfile = options.policyProfile ?? "permissive";
  const configuredMcp = loadRaxodeMcpRuntimeOptions(startDir);
  const mcpServers = options.mcpServers ?? configuredMcp.mcpServers;
  const mcpPlus = mergeRaxodeMcpPlusRuntimeOptions(configuredMcp.mcpPlus, options.mcpPlus);
  const mcpReadiness = createRaxodeMcpReadinessSummaryFromRuntimeOptions({
    mcpServers,
    mcpPlus,
  });
  const agentOptions: RaxodeOptions = {
    policyProfile: permissionProfile,
    sandboxProfile: options.sandboxProfile,
    persistence: options.persistence,
    includeAllCatalogTools: options.includeAllCatalogTools,
    provider,
    endpointShape,
    baseURL,
    providerRoute,
    model,
    reasoningEffort,
    maxOutputTokens,
    memoryProfile: memoryBridge.profile,
    memoryPromptGuide: memoryBridge.promptGuide,
  };
  const contextArtifactAdapters = options.contextArtifactAdapters ?? {
    context: createRaxodeContextAdapter({
      projectRoot,
      cwd: startDir,
      memoryRoots: memoryBridge.roots,
    }),
  };
  const authStateProvider = options.authStateProvider ?? createRaxodeAuthStateProvider({
    startDir,
    now: options.now,
  });
  const openFoundationProject = options.openFoundationProject ?? true;
  const sandboxProvider = resolveRaxodeRaxcellSandboxProvider({
    sandboxProfile: options.sandboxProfile,
    sandboxProvider: options.sandboxProvider,
  });
  const runtimeResult = await createApplicationProjectRuntime(projectRoot, {
    applicationId: "application.raxode.coding",
    runtimeId: options.runtimeId,
    sessionId: options.sessionId,
    cwd: startDir,
    mode: "dry-run",
    provider,
    endpointShape,
    baseURL,
    providerRoute,
    model,
    reasoningEffort,
    maxOutputTokens,
    permissionProfile,
    toolProfile: "agentCore",
    agentOptions,
    now: options.now,
    approvalResolver: options.approvalResolver,
    agentReviewResolver: options.agentReviewResolver,
    contextArtifactAdapters,
    baseToolAdapters: options.baseToolAdapters,
    sandboxProvider,
    authStateProvider,
    foundationProject: options.foundationProject,
    openFoundationProject,
    compactExecutor: options.compactExecutor,
    preCompactGovernanceExecutor: options.preCompactGovernanceExecutor,
    preCompactGovernanceEnabled: options.preCompactGovernanceEnabled,
    compactContextWindowTokens: options.compactContextWindowTokens,
    compactThresholdRatio: options.compactThresholdRatio,
    mcpServers,
    mcpPlusServers: options.mcpPlusServers,
    mcpModule: options.mcpModule,
    mcpPlus,
    liveProviderResolver: options.liveProviderResolver ?? (async (manifest, context) => createRaxodeLiveProvider(manifest, {
      startDir,
      sessionId: context?.sessionId,
      runtimeId: context?.runtimeId,
      turnId: context?.turnId,
      onTextDelta: context?.onTextDelta,
      onProviderStreamEvent: context?.onProviderStreamEvent,
    })),
  });
  if (!runtimeResult.ok) {
    throw new Error(runtimeResult.error.message);
  }
  return {
    projectRoot,
    runtime: runtimeResult.runtime,
    readinessOptions: agentOptions,
    readinessPorts: configuredRuntimePorts({
      ...options,
      contextArtifactAdapters,
      sandboxProvider,
      authStateProvider,
      openFoundationProject,
    }),
    mcpReadiness,
  };
}

export async function createRaxodeBackend(options: RaxodeBackendOptions = {}): Promise<RaxodeBackend> {
  const { projectRoot, runtime, readinessOptions, readinessPorts, mcpReadiness } = await createRaxodeRuntime(options);
  const transport = createLocalApplicationTransport(runtime);

  return {
    backendId: "applicationLayer",
    projectRoot,
    async getView() {
      return await transport.getView();
    },
    async inspectReadiness() {
      return inspectRaxodeBackendReadinessWithLocalProbe({
        view: await transport.getView(),
        options: readinessOptions,
        now: options.now,
        localProbe: options.localReadinessProbe,
        ports: readinessPorts,
        mcp: mcpReadiness,
      });
    },
    async dispatch(command) {
      return await transport.dispatch(command);
    },
    async run(command = {}) {
      const mode = command.mode ?? "dry-run";
      const cwd = path.resolve(command.cwd ?? process.cwd());
      const start = await transport.dispatch({
        type: "application.start",
        sessionId: command.sessionId,
        cwd,
        mode,
      });
      if (!start.ok) return start;
      if (command.model || command.reasoningEffort) {
        const model = await transport.dispatch({
          type: "application.changeModel",
          sessionId: command.sessionId,
          model: command.model ?? start.view.model.model,
          reasoningEffort: command.reasoningEffort ?? start.view.model.reasoningEffort,
        });
        if (!model.ok) return model;
      }
      if (command.permissionProfile) {
        const permission = await transport.dispatch({
          type: "application.changePermissionProfile",
          sessionId: command.sessionId,
          profile: command.permissionProfile,
        });
        if (!permission.ok) return permission;
      }
      if (command.toolProfile) {
        const toolProfile = await transport.dispatch({
          type: "application.changeToolProfile",
          sessionId: command.sessionId,
          profile: command.toolProfile,
        });
        if (!toolProfile.ok) return toolProfile;
      }
      return await transport.dispatch({
        type: "application.submitTurn",
        sessionId: command.sessionId,
        mode,
        input: {
          type: "application.input",
          text: command.task?.trim() || "Describe the Raxode application backend readiness.",
          cwd,
        },
      });
    },
  };
}

export async function createRaxodeBackendRestServer(
  options: RaxodeBackendServerOptions = {},
): Promise<PraxisApplicationRestServer> {
  const { runtime } = await createRaxodeRuntime(options);
  return await createApplicationRestServer(runtime, {
    host: options.host,
    port: options.port,
  });
}

export async function createRaxodeBackendWebSocketServer(
  options: RaxodeBackendServerOptions = {},
): Promise<PraxisApplicationWebSocketServer> {
  const { runtime } = await createRaxodeRuntime(options);
  return await createApplicationWebSocketServer(runtime, {
    host: options.host,
    port: options.port,
  });
}
