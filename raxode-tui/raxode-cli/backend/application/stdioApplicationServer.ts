/*
 * 文件定位：raxode-cli/backend application stdio server。
 * 核心目的：把 Raxode applicationLayer runtime 暴露成 JSONL 长会话协议，供 TUI 进程使用。
 */

import { createInterface } from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  createApplicationProjectRuntime,
  createLocalApplicationTransport,
  type PraxisApplicationCommand,
  type PraxisApplicationProtocolMessage,
} from "@praxis-ai/praxis/application-layer";
import type { SandboxExecutionProviderPort } from "@praxis-ai/praxis/agent-core";
import type { RaxodeOptions } from "../agents/codingAgent/config/raxodeOptions.js";
import {
  createRaxodeLiveProvider,
  resolveRaxodeConfiguredModelOptions,
} from "../authentication/liveProvider.js";
import { inspectRaxodeMemoryBridge } from "../memory/memoryBridge.js";
import { raxodeApplication } from "./raxodeApplication.js";
import {
  loadRaxodeMcpReadinessSummary,
  loadRaxodeMcpRuntimeOptions,
} from "./mcpConfig.js";
import type { RaxodeLocalReadinessProbeInput } from "./localReadinessProbe.js";
import { resolveRaxodeRaxcellSandboxProvider } from "./raxcellSandboxProvider.js";
import {
  createRaxodeReadinessEvent,
  inspectRaxodeBackendReadinessWithLocalProbe,
} from "./runtimeReadiness.js";

type StdioServerOptions = RaxodeOptions & {
  projectRoot?: string;
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
  errorOutput?: NodeJS.WritableStream;
  now?: () => string;
  sandboxProvider?: SandboxExecutionProviderPort;
  localReadinessProbe?: Omit<RaxodeLocalReadinessProbeInput, "manifest">;
};

function defaultProjectRoot(): string {
  return new URL("..", import.meta.url).pathname;
}

function defaultWorkspaceRoot(): string {
  return process.env.PRAXIS_WORKSPACE_ROOT?.trim() || process.cwd();
}

function writeJsonLine(output: NodeJS.WritableStream, message: PraxisApplicationProtocolMessage): void {
  output.write(`${JSON.stringify(message)}\n`);
}

function parseCommandLine(line: string): { commandId: string; command: PraxisApplicationCommand } | undefined {
  const trimmed = line.trim();
  if (!trimmed) return undefined;
  const parsed = JSON.parse(trimmed) as Record<string, unknown>;
  if (parsed.type !== "application.command" || typeof parsed.commandId !== "string") {
    throw new Error("expected application.command envelope");
  }
  if (!parsed.command || typeof parsed.command !== "object" || Array.isArray(parsed.command)) {
    throw new Error("application.command envelope requires command object");
  }
  return {
    commandId: parsed.commandId,
    command: parsed.command as PraxisApplicationCommand,
  };
}

export async function startRaxodeStdioApplicationServer(options: StdioServerOptions = {}): Promise<void> {
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  const errorOutput = options.errorOutput ?? process.stderr;
  const startDir = defaultWorkspaceRoot();
  const modelOptions = resolveRaxodeConfiguredModelOptions({
    roleId: "core.main",
    startDir,
  });
  const provider = options.provider ?? modelOptions.provider;
  const endpointShape = options.endpointShape ?? modelOptions.endpointShape;
  const baseURL = options.baseURL ?? modelOptions.baseURL;
  const providerRoute = options.providerRoute ?? modelOptions.providerRoute;
  const model = options.model ?? modelOptions.model;
  const reasoningEffort = options.reasoningEffort ?? modelOptions.reasoningEffort;
  const maxOutputTokens = options.maxOutputTokens ?? modelOptions.maxOutputTokens;
  const permissionProfile = options.policyProfile ?? "permissive";
  const projectRoot = options.projectRoot ?? defaultProjectRoot();
  const memoryBridge = await inspectRaxodeMemoryBridge({
    projectRoot,
    cwd: startDir,
    profile: options.memoryProfile,
    now: options.now,
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
  const sandboxProvider = resolveRaxodeRaxcellSandboxProvider({
    sandboxProfile: options.sandboxProfile,
    sandboxProvider: options.sandboxProvider,
  });
  const configuredMcp = loadRaxodeMcpRuntimeOptions(startDir);
  const mcpReadiness = loadRaxodeMcpReadinessSummary(startDir);
  const created = await createApplicationProjectRuntime(projectRoot, {
    applicationId: raxodeApplication.id,
    cwd: startDir,
    mode: "live",
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
    sandboxProvider,
    now: options.now,
    mcpServers: configuredMcp.mcpServers,
    mcpPlus: configuredMcp.mcpPlus,
    liveProviderResolver: async (manifest, context) => createRaxodeLiveProvider(manifest, {
      startDir,
      sessionId: context?.sessionId,
      runtimeId: context?.runtimeId,
      turnId: context?.turnId,
      onTextDelta: context?.onTextDelta,
      onProviderStreamEvent: context?.onProviderStreamEvent,
    }),
  });
  if (!created.ok) {
    writeJsonLine(output, {
      type: "application.error",
      error: created.error,
    });
    return;
  }

  const transport = createLocalApplicationTransport(created.runtime);
  transport.subscribe((event) => {
    writeJsonLine(output, {
      type: "application.event",
      event,
    });
  });
  const start = await transport.dispatch({
    type: "application.start",
    cwd: startDir,
  });
  writeJsonLine(output, {
    type: "application.ready",
    view: start.view,
  });
  if (start.ok) {
    writeJsonLine(output, {
      type: "application.event",
      event: createRaxodeReadinessEvent({
        readiness: inspectRaxodeBackendReadinessWithLocalProbe({
          view: start.view,
          options: agentOptions,
          now: options.now,
          localProbe: options.localReadinessProbe,
          mcp: mcpReadiness,
          ports: {
            sandboxProvider: sandboxProvider ? "configured" : "not-configured",
            liveProviderResolver: "configured",
          },
        }),
        view: start.view,
        now: options.now,
      }),
    });
  }

  const reader = createInterface({
    input,
    terminal: false,
  });
  const pending = new Set<Promise<void>>();

  for await (const line of reader) {
    let parsed: { commandId: string; command: PraxisApplicationCommand } | undefined;
    try {
      parsed = parseCommandLine(line);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errorOutput.write(`raxode application protocol error: ${message}\n`);
      writeJsonLine(output, {
        type: "application.error",
        commandId: "unknown",
        error: {
          code: "APPLICATION_PROTOCOL_ERROR",
          message,
        },
        view: await transport.getView(),
      });
      continue;
    }
    if (!parsed) continue;
    const task = (async () => {
      try {
        const result = await transport.dispatch(parsed.command);
        writeJsonLine(output, {
          type: "application.commandResult",
          commandId: parsed.commandId,
          result,
        });
        if (parsed.command.type === "application.close") {
          reader.close();
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errorOutput.write(`raxode application protocol error: ${message}\n`);
        writeJsonLine(output, {
          type: "application.error",
          commandId: parsed.commandId,
          error: {
            code: "APPLICATION_PROTOCOL_ERROR",
            message,
          },
          view: await transport.getView(),
        });
      }
    })();
    pending.add(task);
    task.finally(() => pending.delete(task)).catch(() => undefined);
  }
  await Promise.allSettled([...pending]);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await startRaxodeStdioApplicationServer({
    projectRoot: defaultProjectRoot(),
  });
}

export const raxodeStdioApplicationServerPath = fileURLToPath(import.meta.url);
