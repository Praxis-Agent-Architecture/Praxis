import { createHostExecutorMcpInvalidateCacheProvider, type McpInvalidateCacheProviderPractice } from "./dependencies.js";

export const anthropicMcpInvalidateCachePractice: McpInvalidateCacheProviderPractice = {
  providerName: "anthropic",
  source: { kind: "cli", label: "Claude Code MCP service owns connection cleanup and client state", path: "/home/proview/Desktop/three/claude_code_2_1_88/services/mcp/client.ts" },
  directCliSupport: true,
  sideEffectPolicy: "runtime-owned-client",
  notes: ["Claude Code keeps MCP transport/session/client state inside the MCP service layer.", "Cache invalidation should follow the runtime-owned server/session lifecycle rather than a hidden local cache.", "Praxis exposes mcp.invalidateCache as a governed request over BaseToolExecutorPort.mcp.invalidateCache."],
  createProvider: ({ executor, provider }) => provider ?? createHostExecutorMcpInvalidateCacheProvider(executor),
};
