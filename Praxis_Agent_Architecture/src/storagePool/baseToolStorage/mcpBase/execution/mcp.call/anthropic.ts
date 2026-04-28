import { createHostExecutorMcpCallProvider, type McpCallProviderPractice } from "./dependencies.js";

export const anthropicMcpCallPractice: McpCallProviderPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code MCPTool runtime client",
    path: "/home/proview/Desktop/three/claude_code_2_1_88/tools/MCPTool/MCPTool.ts",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-owned-client",
  notes: [
    "Claude Code models MCP calls as runtime-discovered tools, with permissions and execution handled around the MCPTool wrapper.",
    "The observed client path keeps transport/session/OAuth concerns outside the tool definition.",
    "Praxis mirrors the boundary: mcp.call owns validation and audit shape, while runtime.execEngine.mcp.callTool owns the actual client call.",
  ],
  createProvider: ({ executor, provider }) => provider ?? createHostExecutorMcpCallProvider(executor),
};
