import { createHostExecutorMcpRegisterToolProvider, type McpRegisterToolProviderPractice } from "./dependencies.js";

export const anthropicMcpRegisterToolPractice: McpRegisterToolProviderPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code MCPTool runtime discovery and client ownership",
    path: "/home/proview/Desktop/three/claude_code_2_1_88/tools/MCPTool/MCPTool.ts",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-owned-client",
  notes: [
    "Claude Code exposes MCP tools through runtime-managed MCP clients; baseTool-visible surfaces do not own transports.",
    "Praxis keeps registration as a fixed action over BaseToolExecutorPort.mcp.registerTool.",
  ],
  createProvider: ({ executor, provider }) => provider ?? createHostExecutorMcpRegisterToolProvider(executor),
};
