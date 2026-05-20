import { createHostExecutorMcpStreamProvider, type McpStreamProviderPractice } from "./dependencies.js";

export const deepmindMcpStreamPractice: McpStreamProviderPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini CLI McpClient owns status, notifications, timeout, and request lifecycle",
    path: "/home/proview/Desktop/three/gemini_cli_0_39_0/packages/core/src/tools/mcp-client.ts",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-owned-client",
  notes: [
    "Gemini CLI's McpClient owns connection state, notification handlers, and request lifecycle.",
    "DiscoveredMCPTool is the model-callable surface, not the owner of stream buffers or transport handles.",
    "Praxis mirrors this boundary by routing mcp.stream through the runtime MCP executor.",
  ],
  createProvider: ({ executor, provider }) => provider ?? createHostExecutorMcpStreamProvider(executor),
};
