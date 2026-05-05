import { createHostExecutorMcpConnectProvider, type McpConnectProviderPractice } from "./dependencies.js";

export const anthropicMcpConnectPractice: McpConnectProviderPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code MCP client lifecycle",
    path: "/home/proview/Desktop/three/claude_code_2_1_88/services/mcp/client.ts",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-owned-client",
  notes: [
    "Claude Code keeps MCP server connection, OAuth, transport, and reconnection logic in the services/mcp client layer.",
    "Model-visible MCP tools sit above that runtime client and do not create their own transport.",
    "Praxis mirrors this by making mcp.connect a contract adapter over BaseToolExecutorPort.mcp.connect.",
  ],
  createProvider: ({ executor, provider }) => provider ?? createHostExecutorMcpConnectProvider(executor),
};
