import { createHostExecutorMcpDisconnectProvider, type McpDisconnectProviderPractice } from "./dependencies.js";

export const anthropicMcpDisconnectPractice: McpDisconnectProviderPractice = {
  providerName: "anthropic",
  source: { kind: "cli", label: "Claude Code MCP connection manager cleanup", path: "/home/proview/Desktop/three/claude_code_2_1_88/services/mcp/useManageMCPConnections.ts" },
  directCliSupport: true,
  sideEffectPolicy: "runtime-owned-client",
  notes: [
    "Claude Code cleans up stale MCP connections and pending reconnect timers inside its MCP connection manager.",
    "Disconnect behavior belongs with the runtime state that owns the active client.",
    "Praxis exposes mcp.disconnect as a governed request into BaseToolExecutorPort.mcp.disconnect.",
  ],
  createProvider: ({ executor, provider }) => provider ?? createHostExecutorMcpDisconnectProvider(executor),
};
