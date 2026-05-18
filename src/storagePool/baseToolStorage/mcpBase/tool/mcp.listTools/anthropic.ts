import { createHostExecutorMcpListToolsProvider, type McpListToolsProviderPractice } from "./dependencies.js";

export const anthropicMcpListToolsPractice: McpListToolsProviderPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code MCPTool discovery",
    path: "/home/proview/Desktop/three/claude_code_2_1_88/tools/MCPTool/MCPTool.ts",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-owned-client",
  notes: [
    "Claude Code discovers MCP tools through runtime-managed MCP clients and exposes them as tool definitions.",
    "Praxis mirrors this by treating mcp.listTools as a fixed baseTool over BaseToolExecutorPort.mcp.listTools.",
  ],
  createProvider: ({ executor, provider }) => provider ?? createHostExecutorMcpListToolsProvider(executor),
};
