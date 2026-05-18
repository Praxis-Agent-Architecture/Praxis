import { createHostExecutorMcpUpdateToolProvider, type McpUpdateToolProviderPractice } from "./dependencies.js";

export const deepmindMcpUpdateToolPractice: McpUpdateToolProviderPractice = {
  providerName: "deepmind",
  source: { kind: "cli", label: "Gemini CLI McpClient and DiscoveredMCPTool", path: "/home/proview/Desktop/three/gemini_cli_0_39_0/packages/core/src/tools/mcp-client.ts" },
  directCliSupport: true,
  sideEffectPolicy: "runtime-owned-client",
  notes: ["Gemini CLI separates MCP client lifecycle from model-visible discovered tools.", "Praxis uses BaseToolExecutorPort.mcp.updateTool for the real registry update."],
  createProvider: ({ executor, provider }) => provider ?? createHostExecutorMcpUpdateToolProvider(executor),
};
