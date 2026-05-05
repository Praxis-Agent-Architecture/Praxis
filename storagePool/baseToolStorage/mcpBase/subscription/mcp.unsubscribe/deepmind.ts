import { createHostExecutorMcpUnsubscribeProvider, type McpUnsubscribeProviderPractice } from "./dependencies.js";

export const deepmindMcpUnsubscribePractice: McpUnsubscribeProviderPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini CLI McpClient notification lifecycle",
    path: "/home/proview/Desktop/three/gemini_cli_0_39_0/packages/core/src/tools/mcp-client.ts",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-owned-client",
  notes: [
    "Gemini CLI's McpClient owns notification handlers, connection state, and timeout behavior.",
    "The model-callable layer is separate from MCP client lifecycle ownership.",
    "Praxis follows the same boundary with a fixed mcp.unsubscribe tool over a runtime-owned MCP executor.",
  ],
  createProvider: ({ executor, provider }) => provider ?? createHostExecutorMcpUnsubscribeProvider(executor),
};
