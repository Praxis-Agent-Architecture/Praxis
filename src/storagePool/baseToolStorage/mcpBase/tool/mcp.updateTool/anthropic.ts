import { createHostExecutorMcpUpdateToolProvider, type McpUpdateToolProviderPractice } from "./dependencies.js";

export const anthropicMcpUpdateToolPractice: McpUpdateToolProviderPractice = {
  providerName: "anthropic",
  source: { kind: "cli", label: "Claude Code MCPTool runtime-managed tool surface", path: "/home/proview/Desktop/three/claude_code_2_1_88/tools/MCPTool/MCPTool.ts" },
  directCliSupport: true,
  sideEffectPolicy: "runtime-owned-client",
  notes: ["Claude Code keeps MCP tool exposure behind runtime MCP client services.", "Praxis keeps mcp.updateTool as a fixed registry mutation contract over runtime support."],
  createProvider: ({ executor, provider }) => provider ?? createHostExecutorMcpUpdateToolProvider(executor),
};
