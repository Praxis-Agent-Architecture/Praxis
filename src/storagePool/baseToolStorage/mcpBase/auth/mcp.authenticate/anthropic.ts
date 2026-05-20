import { createHostExecutorMcpAuthenticateProvider, type McpAuthenticateProviderPractice } from "./dependencies.js";

export const anthropicMcpAuthenticatePractice: McpAuthenticateProviderPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code MCP client OAuth/auth lifecycle",
    path: "/home/proview/Desktop/three/claude_code_2_1_88/services/mcp/client.ts",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-owned-client",
  notes: [
    "Claude Code keeps MCP OAuth, token, transport, and session state inside the MCP service layer.",
    "Model-visible MCP tools do not receive raw credential material.",
    "Praxis mirrors this by making mcp.authenticate a fixed request over BaseToolExecutorPort.mcp.authenticate.",
  ],
  createProvider: (dependencies) => dependencies.provider ?? createHostExecutorMcpAuthenticateProvider(dependencies.executor),
};
