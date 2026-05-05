import { createHostExecutorMcpCacheProvider, type McpCacheProviderPractice } from "./dependencies.js";

export const anthropicMcpCachePractice: McpCacheProviderPractice = {
  providerName: "anthropic",
  source: { kind: "cli", label: "Claude Code MCP service owns session/client cache material", path: "/home/proview/Desktop/three/claude_code_2_1_88/services/mcp/client.ts" },
  directCliSupport: true,
  sideEffectPolicy: "runtime-owned-client",
  notes: ["Claude Code keeps MCP client/session state behind the MCP service layer.", "Cache material should remain a runtime concern because it can contain resource or tool-call envelopes.", "Praxis exposes mcp.cache as a fixed governed request over BaseToolExecutorPort.mcp.cache."],
  createProvider: ({ executor, provider }) => provider ?? createHostExecutorMcpCacheProvider(executor),
};
