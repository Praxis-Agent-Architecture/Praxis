import { createHostExecutorMcpDeleteResourceProvider, type McpDeleteResourceProviderPractice } from "./dependencies.js";

export const deepmindMcpDeleteResourcePractice: McpDeleteResourceProviderPractice = {
  providerName: "deepmind",
  source: { kind: "cli", label: "Gemini CLI McpClient owns connection and request lifecycle", path: "/home/proview/Desktop/three/gemini_cli_0_39_0/packages/core/src/tools/mcp-client.ts" },
  directCliSupport: true,
  sideEffectPolicy: "runtime-owned-client",
  notes: ["Gemini CLI keeps MCP server contact in McpClient.", "Destructive resource deletion needs runtime-owned request lifecycle and governance.", "Praxis routes mcp.deleteResource through a fixed runtime executor port."],
  createProvider: ({ executor, provider }) => provider ?? createHostExecutorMcpDeleteResourceProvider(executor),
};
