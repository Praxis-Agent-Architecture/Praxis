import { createHostExecutorMcpPingProvider, type McpPingProviderPractice } from "./dependencies.js";

export const deepmindMcpPingPractice: McpPingProviderPractice = {
  providerName: "deepmind",
  source: { kind: "cli", label: "Gemini CLI McpClient connection state", path: "/home/proview/Desktop/three/gemini_cli_0_39_0/packages/core/src/tools/mcp-client.ts" },
  directCliSupport: true,
  sideEffectPolicy: "runtime-owned-client",
  notes: ["Gemini CLI keeps connection state and abort/timeout behavior in McpClient, not in individual tools."],
  createProvider: ({ executor, provider }) => provider ?? createHostExecutorMcpPingProvider(executor),
};
