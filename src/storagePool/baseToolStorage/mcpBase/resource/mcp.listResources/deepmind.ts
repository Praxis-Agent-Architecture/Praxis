import { createHostExecutorMcpListResourcesProvider, type McpListResourcesProviderPractice } from "./dependencies.js";

export const deepmindMcpListResourcesPractice: McpListResourcesProviderPractice = {
  providerName: "deepmind",
  source: { kind: "cli", label: "Gemini CLI McpClient resource discovery", path: "/home/proview/Desktop/three/gemini_cli_0_39_0/packages/core/src/tools/mcp-client.ts" },
  directCliSupport: true,
  sideEffectPolicy: "runtime-owned-client",
  notes: ["Gemini CLI keeps MCP resource discovery in McpClient and exposes normalized tool wrappers."],
  createProvider: ({ executor, provider }) => provider ?? createHostExecutorMcpListResourcesProvider(executor),
};
