/*
 * 文件定位：Runtime MCP Plane / 官方 MCP 与 MCP+ 组件接入面。
 * 核心目的：把标准 MCP server 声明、MCP+ exposure policy、runtime server profile、
 * dynamic harness tools 和 application view 串成一条 OAO 可编译、可检查、可挂载的合同。
 */

import {
  compileMcpPlusManifest,
  lowerExposurePlanToMcpSurface,
  planExposure,
  type ExposureMode,
  type ExposureState,
  type McpCompatibleSurface,
  type McpPlusManifest,
  type NativeToolDeclaration,
} from "@praxis-ai/mcp-plus";

import type { ToolSpec } from "../runtimeAgentManifest.js";
import type { McpRuntimeServerProfile } from "../runtime.execEngine/mcpRuntimeAdapter.js";

export type McpHarnessServerMode = "native" | "mcp-plus";

export type McpTransportSpec =
  | {
      transport: "stdio";
      command: string;
      args?: readonly string[];
      cwd?: string;
      env?: Readonly<Record<string, string | undefined>>;
      timeoutMs?: number;
      framing?: "content-length" | "line-json";
    }
  | {
      transport: "http" | "sse";
      url: string;
      sseUrl?: string;
      headers?: Readonly<Record<string, string>>;
      timeoutMs?: number;
    };

export type McpHarnessServerSpec = McpTransportSpec & {
  serverId: string;
  mode: McpHarnessServerMode;
  title?: string;
  summary?: string;
  manifest?: McpPlusManifest;
  metadata?: Readonly<Record<string, unknown>>;
};

export type McpApplicationServerInput = McpTransportSpec & {
  serverId: string;
  mode?: McpHarnessServerMode;
  title?: string;
  summary?: string;
  manifest?: McpPlusManifest;
  metadata?: Readonly<Record<string, unknown>>;
};

type HttpMcpHelperInput = {
  url: string;
  sseUrl?: string;
  headers?: Readonly<Record<string, string>>;
  timeoutMs?: number;
} & Partial<Pick<McpHarnessServerSpec, "mode" | "title" | "summary" | "manifest" | "metadata">>;

export type McpHarnessModuleSpec = {
  kind: "praxis.mcp.module";
  version: "praxis.mcp.v1";
  servers: readonly McpHarnessServerSpec[];
  recommended: true;
  metadata?: Readonly<Record<string, unknown>>;
};

export type McpApplicationServerView = {
  serverId: string;
  mode: McpHarnessServerMode;
  transport: McpHarnessServerSpec["transport"];
  title?: string;
  summary?: string;
  manifestPresent: boolean;
  status: "declared" | "mounted" | "error";
  toolCount?: number;
  visibleToolCount?: number;
  indexedToolCount?: number;
  publicSafe: true;
};

export type McpApplicationStateView = {
  servers: readonly McpApplicationServerView[];
  recommendedMode: "mcp-plus";
  nativeCompatible: true;
  publicSafe: true;
};

export type McpExposurePlanServer = {
  serverId: string;
  mode: McpHarnessServerMode;
  surface: McpCompatibleSurface;
  dynamicToolSpecs: readonly ToolSpec[];
};

export type McpHarnessExposurePlan = {
  servers: readonly McpExposurePlanServer[];
};

export type McpPlusApplicationServerInput = McpTransportSpec & {
  serverId: string;
  manifest: McpPlusManifest;
  title?: string;
  summary?: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export function mcpServer(
  serverId: string,
  input: McpTransportSpec & Partial<Pick<McpHarnessServerSpec, "mode" | "title" | "summary" | "manifest" | "metadata">>,
): McpHarnessServerSpec {
  return {
    ...input,
    serverId,
    mode: input.mode ?? (input.manifest === undefined ? "native" : "mcp-plus"),
  };
}

export const mcp = {
  module(input: {
    servers: readonly McpHarnessServerSpec[];
    metadata?: Readonly<Record<string, unknown>>;
  }): McpHarnessModuleSpec {
    return {
      kind: "praxis.mcp.module",
      version: "praxis.mcp.v1",
      servers: input.servers,
      recommended: true,
      metadata: input.metadata,
    };
  },
  stdio(
    serverId: string,
    input: Omit<Extract<McpTransportSpec, { transport: "stdio" }>, "transport"> &
      Partial<Pick<McpHarnessServerSpec, "mode" | "title" | "summary" | "manifest" | "metadata">>,
  ): McpHarnessServerSpec {
    return mcpServer(serverId, { ...input, transport: "stdio" });
  },
  http(
    serverId: string,
    input: HttpMcpHelperInput,
  ): McpHarnessServerSpec {
    return mcpServer(serverId, { ...input, transport: "http" });
  },
  sse(
    serverId: string,
    input: HttpMcpHelperInput,
  ): McpHarnessServerSpec {
    return mcpServer(serverId, { ...input, transport: "sse" });
  },
  recommendedTools(): readonly ToolSpec[] {
    return [
      {
        toolId: "mcp.use",
        metadata: { source: "praxis.mcp.recommendedTools", toolProviderKind: "mcp-static" },
      },
      {
        toolId: "mcp.resources",
        metadata: { source: "praxis.mcp.recommendedTools", toolProviderKind: "mcp-static" },
      },
    ];
  },
} as const;

export function isMcpHarnessModuleSpec(value: unknown): value is McpHarnessModuleSpec {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return record.kind === "praxis.mcp.module" && Array.isArray(record.servers);
}

export function mcpHarnessModuleFrom(input: {
  modules?: Readonly<Record<string, unknown>>;
}): McpHarnessModuleSpec | undefined {
  const candidate = input.modules?.mcp;
  return isMcpHarnessModuleSpec(candidate) ? candidate : undefined;
}

export function runtimeRequirementsForMcpModule(
  module: McpHarnessModuleSpec | undefined,
): readonly string[] {
  return module === undefined || module.servers.length === 0 ? [] : ["runtime.mcp"];
}

export function toMcpRuntimeServerProfile(server: McpHarnessServerSpec): McpRuntimeServerProfile {
  if (server.transport === "stdio") {
    return {
      serverId: server.serverId,
      transport: "stdio",
      command: server.command,
      args: server.args,
      cwd: server.cwd,
      env: server.env,
      timeoutMs: server.timeoutMs,
      framing: server.framing,
    };
  }
  return {
    serverId: server.serverId,
    transport: server.transport,
    url: server.url,
    sseUrl: server.sseUrl,
    headers: server.headers,
    timeoutMs: server.timeoutMs,
  };
}

export function buildMcpServerProfilesFromManifest(input: {
  harness: {
    modules: Readonly<Record<string, unknown>>;
  };
}): readonly McpRuntimeServerProfile[] {
  const module = mcpHarnessModuleFrom(input.harness);
  return (module?.servers ?? []).map(toMcpRuntimeServerProfile);
}

export function createMcpApplicationStateView(
  module: McpHarnessModuleSpec | undefined,
): McpApplicationStateView {
  return {
    servers: (module?.servers ?? []).map((server) => ({
      serverId: server.serverId,
      mode: server.mode,
      transport: server.transport,
      title: server.title ?? server.manifest?.server.title,
      summary: server.summary ?? server.manifest?.server.summary,
      manifestPresent: server.manifest !== undefined,
      status: "declared",
      publicSafe: true,
    })),
    recommendedMode: "mcp-plus",
    nativeCompatible: true,
    publicSafe: true,
  };
}

function toolIdPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/gu, ".").replace(/^\.+|\.+$/gu, "") || "tool";
}

function dynamicToolSpecForNativeTool(
  serverId: string,
  tool: NativeToolDeclaration,
): ToolSpec {
  return {
    toolId: `mcp.${toolIdPart(serverId)}.${toolIdPart(tool.name)}`,
    family: "mcp",
    group: serverId,
    description: tool.description,
    inputSchema: tool.inputSchema,
    metadata: {
      toolProviderKind: "mcp-static",
      serverId,
      nativeToolName: tool.name,
      runtimeToolId: "mcp.use",
      runtimeArguments: { serverId, toolName: tool.name },
      source: "runtime.mcpPlane.dynamicTool",
    },
  };
}

function dynamicToolSpecsForSurface(serverId: string, surface: McpCompatibleSurface): readonly ToolSpec[] {
  return surface.tools
    .filter((tool) => tool.name !== "mcp_plus.expand")
    .map((tool) => dynamicToolSpecForNativeTool(serverId, tool));
}

export function planMcpHarnessExposure(
  manifest: {
    harness: {
      modules: Readonly<Record<string, unknown>>;
    };
  },
  nativeToolInventoryByServerId: Readonly<Record<string, readonly NativeToolDeclaration[]>>,
  stateByServerId: Readonly<Record<string, Partial<ExposureState>>> = {},
): McpHarnessExposurePlan {
  const module = mcpHarnessModuleFrom(manifest.harness);
  const servers = (module?.servers ?? []).map((server): McpExposurePlanServer => {
    const nativeTools = [...(nativeToolInventoryByServerId[server.serverId] ?? [])];
    if (server.mode !== "mcp-plus" || server.manifest === undefined) {
      const surface: McpCompatibleSurface = {
        tools: nativeTools,
        sidecar: {
          serverCard: {
            id: server.serverId,
            title: server.title ?? server.serverId,
            summary: server.summary ?? "Native MCP server.",
            mode: "expanded" satisfies ExposureMode,
          },
          toolIndex: [],
          skillIndex: [],
        },
      };
      return {
        serverId: server.serverId,
        mode: "native",
        surface,
        dynamicToolSpecs: nativeTools.map((tool) => dynamicToolSpecForNativeTool(server.serverId, tool)),
      };
    }
    const graph = compileMcpPlusManifest(server.manifest, nativeTools);
    const state: ExposureState = {
      serverId: server.serverId,
      mode: stateByServerId[server.serverId]?.mode ?? "expanded",
      activeTools: stateByServerId[server.serverId]?.activeTools ?? [],
    };
    const surface = lowerExposurePlanToMcpSurface(planExposure(graph, state));
    return {
      serverId: server.serverId,
      mode: "mcp-plus",
      surface,
      dynamicToolSpecs: dynamicToolSpecsForSurface(server.serverId, surface),
    };
  });
  return { servers };
}
