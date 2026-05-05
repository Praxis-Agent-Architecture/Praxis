import { createHostExecutorMcpReadResourceProvider, type McpReadResourceProviderPractice } from "./dependencies.js";

export const deepmindMcpReadResourcePractice: McpReadResourceProviderPractice = {
  providerName: "deepmind",
  source: { kind: "cli", label: "Gemini CLI McpClient read resource flow", path: "/home/proview/Desktop/three/gemini_cli_0_39_0/packages/core/src/tools/mcp-client.ts" },
  directCliSupport: true,
  sideEffectPolicy: "runtime-owned-client",
  notes: ["Gemini CLI keeps resource content retrieval inside McpClient and wraps it as a discovered tool capability."],
  createProvider: ({ executor, provider }) => provider ?? createHostExecutorMcpReadResourceProvider(executor),
};
