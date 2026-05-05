import { createHostExecutorMcpCacheProvider, type McpCacheProviderPractice } from "./dependencies.js";

export const deepmindMcpCachePractice: McpCacheProviderPractice = {
  providerName: "deepmind",
  source: { kind: "cli", label: "Gemini CLI McpClient owns MCP discovery and runtime state", path: "/home/proview/Desktop/three/gemini_cli_0_39_0/packages/core/src/tools/mcp-client.ts" },
  directCliSupport: true,
  sideEffectPolicy: "runtime-owned-client",
  notes: ["Gemini CLI keeps discovered MCP tool/resource state inside McpClient-managed runtime structures.", "Cache lifecycle belongs with the client/session owner so eviction follows server state.", "Praxis maps mcp.cache to BaseToolExecutorPort.mcp.cache rather than embedding cache material in storage core."],
  createProvider: ({ executor, provider }) => provider ?? createHostExecutorMcpCacheProvider(executor),
};
