import { createHostExecutorMcpDisconnectProvider, type McpDisconnectProviderPractice } from "./dependencies.js";

export const deepmindMcpDisconnectPractice: McpDisconnectProviderPractice = {
  providerName: "deepmind",
  source: { kind: "cli", label: "Gemini CLI McpClient disconnect status", path: "/home/proview/Desktop/three/gemini_cli_0_39_0/packages/core/src/tools/mcp-client.ts" },
  directCliSupport: true,
  sideEffectPolicy: "runtime-owned-client",
  notes: [
    "Gemini CLI models MCP connection status in the McpClient lifecycle.",
    "The runtime client owns transport close and status changes.",
    "Praxis uses BaseToolExecutorPort.mcp.disconnect for the same runtime-owned boundary.",
  ],
  createProvider: ({ executor, provider }) => provider ?? createHostExecutorMcpDisconnectProvider(executor),
};
