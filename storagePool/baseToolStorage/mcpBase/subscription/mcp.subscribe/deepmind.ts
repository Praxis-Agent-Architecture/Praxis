import { createHostExecutorMcpSubscribeProvider, type McpSubscribeProviderPractice } from "./dependencies.js";

export const deepmindMcpSubscribePractice: McpSubscribeProviderPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini CLI McpClient notification lifecycle",
    path: "/home/proview/Desktop/three/gemini_cli_0_39_0/packages/core/src/tools/mcp-client.ts",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-owned-client",
  notes: [
    "Gemini CLI's McpClient owns connection status, notification handlers, discovery, and request timeout behavior.",
    "DiscoveredMCPTool remains a model-callable shell over a runtime MCP client, not a client owner.",
    "Praxis follows the same boundary with a fixed mcp.subscribe tool over a runtime-owned MCP executor.",
  ],
  createProvider: ({ executor, provider }) => provider ?? createHostExecutorMcpSubscribeProvider(executor),
};
