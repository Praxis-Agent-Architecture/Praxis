import { createHostExecutorMcpUnregisterToolProvider, type McpUnregisterToolProviderPractice } from "./dependencies.js";

export const deepmindMcpUnregisterToolPractice: McpUnregisterToolProviderPractice = {
  providerName: "deepmind",
  source: { kind: "cli", label: "Gemini CLI McpClient lifecycle and tool discovery", path: "/home/proview/Desktop/three/gemini_cli_0_39_0/packages/core/src/tools/mcp-client.ts" },
  directCliSupport: true,
  sideEffectPolicy: "runtime-owned-client",
  notes: ["Gemini CLI keeps MCP lifecycle in McpClient and exposes discovered tools separately.", "Praxis mirrors that ownership split for unregistering MCP tools."],
  createProvider: ({ executor, provider }) => provider ?? createHostExecutorMcpUnregisterToolProvider(executor),
};
