import { createHostExecutorMcpListToolsProvider, type McpListToolsProviderPractice } from "./dependencies.js";

export const deepmindMcpListToolsPractice: McpListToolsProviderPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini CLI DiscoveredMCPTool",
    path: "/home/proview/Desktop/three/gemini_cli_0_39_0/packages/core/src/tools/mcp-tool.ts",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-owned-client",
  notes: [
    "Gemini CLI separates DiscoveredMCPTool descriptors from the McpClient that owns live server contact.",
    "Praxis follows the same split: descriptor normalization in storage, live discovery in runtime.",
  ],
  createProvider: ({ executor, provider }) => provider ?? createHostExecutorMcpListToolsProvider(executor),
};
