import { createHostExecutorMcpStreamProvider, type McpStreamProviderPractice } from "./dependencies.js";

export const anthropicMcpStreamPractice: McpStreamProviderPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code MCP runtime client owns transports, notifications, progress, and stream state",
    path: "/home/proview/Desktop/three/claude_code_2_1_88/services/mcp/client.ts",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-owned-client",
  notes: [
    "Claude Code keeps MCP client sessions, transports, OAuth, and server notifications in its MCP service layer.",
    "Model-visible MCP tools are fixed call shells over runtime-owned client state rather than stream owners.",
    "Praxis maps mcp.stream to BaseToolExecutorPort.mcp.streamTool so stream ids, buffers, and cancellation remain runtime-owned.",
  ],
  createProvider: ({ executor, provider }) => provider ?? createHostExecutorMcpStreamProvider(executor),
};
