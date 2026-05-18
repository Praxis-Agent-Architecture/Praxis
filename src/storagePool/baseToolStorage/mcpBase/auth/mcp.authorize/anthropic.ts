import { createHostExecutorMcpAuthorizeProvider, type McpAuthorizeProviderPractice } from "./dependencies.js";

export const anthropicMcpAuthorizePractice: McpAuthorizeProviderPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code MCPTool permission wrapper",
    path: "/home/proview/Desktop/three/claude_code_2_1_88/tools/MCPTool/MCPTool.ts",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-owned-client",
  notes: [
    "Claude Code wraps runtime-discovered MCP tools with permission handling around model-visible calls.",
    "Policy decisions are made outside the basic tool contract.",
    "Praxis mirrors this by making mcp.authorize a fixed policy-input request over BaseToolExecutorPort.mcp.authorize.",
  ],
  createProvider: (dependencies) => dependencies.provider ?? createHostExecutorMcpAuthorizeProvider(dependencies.executor),
};
