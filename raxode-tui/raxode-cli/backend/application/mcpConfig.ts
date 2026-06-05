import type { CreateApplicationProjectRuntimeOptions } from "@praxis-ai/praxis/application-layer";

import {
  loadRaxodeMcpConfig,
  type RaxodeMcpConfig,
  type RaxodeMcpServerConfig,
} from "../../frontend/tui/config/raxode-config.js";
import {
  createRaxodeMcpReadinessSummary,
  type RaxodeMcpReadinessSummary,
} from "./mcpReadinessSummary.js";

type RuntimeMcpServer = NonNullable<CreateApplicationProjectRuntimeOptions["mcpServers"]>[number];
type RuntimeMcpPlusOptions = CreateApplicationProjectRuntimeOptions["mcpPlus"];

function runtimeMcpServerFromConfig(server: RaxodeMcpServerConfig): RuntimeMcpServer {
  const common = {
    serverId: server.serverId,
    mode: server.mode,
    title: server.title,
    summary: server.summary,
    timeoutMs: server.timeoutMs,
    manifest: server.manifest as RuntimeMcpServer["manifest"],
    metadata: {
      ...(server.metadata ?? {}),
      source: "raxode.config.mcp",
    },
  };
  if (server.transport === "stdio") {
    return {
      ...common,
      transport: "stdio",
      command: server.command,
      args: server.args,
      cwd: server.cwd,
      env: server.env,
      framing: server.framing,
    };
  }
  return {
    ...common,
    transport: server.transport,
    url: server.url,
    sseUrl: server.sseUrl,
    headers: server.headers,
  };
}

export function loadRaxodeMcpRuntimeOptions(
  fallbackDir = process.cwd(),
): Pick<CreateApplicationProjectRuntimeOptions, "mcpServers" | "mcpPlus"> {
  return createRaxodeMcpRuntimeOptions(loadRaxodeMcpConfig(fallbackDir));
}

export function createRaxodeMcpRuntimeOptions(
  config: RaxodeMcpConfig,
): Pick<CreateApplicationProjectRuntimeOptions, "mcpServers" | "mcpPlus"> {
  const servers = config.servers
    .filter((server) => server.enabled)
    .map(runtimeMcpServerFromConfig);
  const mcpPlus = config.projectId === undefined && config.reprofileConsecutiveIndexedCalls === undefined
    ? undefined
    : {
        projectId: config.projectId,
        reprofileConsecutiveIndexedCalls: config.reprofileConsecutiveIndexedCalls,
      };
  return {
    ...(servers.length === 0 ? {} : { mcpServers: servers }),
    ...(mcpPlus === undefined ? {} : { mcpPlus }),
  };
}

export function loadRaxodeMcpReadinessSummary(
  fallbackDir = process.cwd(),
): RaxodeMcpReadinessSummary {
  return createRaxodeMcpReadinessSummary(loadRaxodeMcpConfig(fallbackDir));
}

export function mergeRaxodeMcpPlusRuntimeOptions(
  configured: RuntimeMcpPlusOptions,
  explicit: RuntimeMcpPlusOptions,
): RuntimeMcpPlusOptions {
  if (configured === undefined) return explicit;
  if (explicit === undefined) return configured;
  return {
    ...configured,
    ...explicit,
  };
}
