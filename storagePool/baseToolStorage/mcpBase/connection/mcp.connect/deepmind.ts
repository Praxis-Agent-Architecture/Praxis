import { createHostExecutorMcpConnectProvider, type McpConnectProviderPractice } from "./dependencies.js";

export const deepmindMcpConnectPractice: McpConnectProviderPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini CLI McpClient connect lifecycle",
    path: "/home/proview/Desktop/three/gemini_cli_0_39_0/packages/core/src/tools/mcp-client.ts",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-owned-client",
  notes: [
    "Gemini CLI's McpClient owns connect, status transitions, notification handlers, discovery, and request timeout behavior.",
    "DiscoveredMCPTool is separate from the client lifecycle.",
    "Praxis follows the same boundary with a fixed mcp.connect tool over a runtime-owned MCP executor.",
  ],
  createProvider: ({ executor, provider }) => provider ?? createHostExecutorMcpConnectProvider(executor),
};
