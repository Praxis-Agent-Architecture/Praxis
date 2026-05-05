import { createHostExecutorMcpRegisterToolProvider, type McpRegisterToolProviderPractice } from "./dependencies.js";

export const deepmindMcpRegisterToolPractice: McpRegisterToolProviderPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini CLI McpClient and DiscoveredMCPTool separation",
    path: "/home/proview/Desktop/three/gemini_cli_0_39_0/packages/core/src/tools/mcp-client.ts",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-owned-client",
  notes: [
    "Gemini CLI keeps MCP client lifecycle and discovered tool state in runtime services.",
    "Praxis mirrors that by making mcp.registerTool a schema/guard wrapper over the runtime MCP executor.",
  ],
  createProvider: ({ executor, provider }) => provider ?? createHostExecutorMcpRegisterToolProvider(executor),
};
