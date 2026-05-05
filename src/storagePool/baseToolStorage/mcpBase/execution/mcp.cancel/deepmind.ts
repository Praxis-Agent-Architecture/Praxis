import { createHostExecutorMcpCancelProvider, type McpCancelProviderPractice } from "./dependencies.js";

export const deepmindMcpCancelPractice: McpCancelProviderPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini CLI McpClient owns request lifecycle and cancellation-relevant state",
    path: "/home/proview/Desktop/three/gemini_cli_0_39_0/packages/core/src/tools/mcp-client.ts",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-owned-client",
  notes: [
    "Gemini CLI's McpClient owns connection status, request timeouts, and notification handlers.",
    "Model-visible MCP tools remain fixed discovered tools over the runtime client.",
    "Praxis follows that split: mcp.cancel validates and requests runtime cancellation through an injected executor port.",
  ],
  createProvider: ({ executor, provider }) => provider ?? createHostExecutorMcpCancelProvider(executor),
};
