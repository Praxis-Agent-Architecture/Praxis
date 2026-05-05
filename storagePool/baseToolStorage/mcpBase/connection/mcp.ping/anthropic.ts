import { createHostExecutorMcpPingProvider, type McpPingProviderPractice } from "./dependencies.js";

export const anthropicMcpPingPractice: McpPingProviderPractice = {
  providerName: "anthropic",
  source: { kind: "cli", label: "Claude Code runtime MCP client health checks", path: "/home/proview/Desktop/three/claude_code_2_1_88/services/mcp" },
  directCliSupport: true,
  sideEffectPolicy: "runtime-owned-client",
  notes: ["Claude Code keeps MCP client liveness under runtime services; Praxis exposes ping as a fixed baseTool over that runtime support."],
  createProvider: ({ executor, provider }) => provider ?? createHostExecutorMcpPingProvider(executor),
};
