import { createHostExecutorMcpCallProvider, type McpCallProviderPractice } from "./dependencies.js";

export const deepmindMcpCallPractice: McpCallProviderPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini CLI DiscoveredMCPTool and McpClient",
    path: "/home/proview/Desktop/three/gemini_cli_0_39_0/packages/core/src/tools/mcp-tool.ts",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-owned-client",
  notes: [
    "Gemini CLI separates discovered MCP tool descriptors from McpClient ownership and confirmation behavior.",
    "Abort signals, progress, timeouts, and server discovery sit with the CLI runtime client layer.",
    "Praxis keeps mcp.call as a contract adapter over BaseToolExecutorPort.mcp.callTool instead of instantiating a client.",
  ],
  createProvider: ({ executor, provider }) => provider ?? createHostExecutorMcpCallProvider(executor),
};
