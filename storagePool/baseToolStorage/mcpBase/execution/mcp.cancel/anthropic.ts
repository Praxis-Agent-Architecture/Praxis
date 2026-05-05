import { createHostExecutorMcpCancelProvider, type McpCancelProviderPractice } from "./dependencies.js";

export const anthropicMcpCancelPractice: McpCancelProviderPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code MCP service owns running requests and cancellation/progress state",
    path: "/home/proview/Desktop/three/claude_code_2_1_88/services/mcp/client.ts",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-owned-client",
  notes: [
    "Claude Code keeps live MCP request handles and transport state inside the MCP service layer.",
    "Cancellation is a runtime action because it targets live client/session material.",
    "Praxis maps mcp.cancel to BaseToolExecutorPort.mcp.cancelExecution and does not store handles in baseTool.",
  ],
  createProvider: ({ executor, provider }) => provider ?? createHostExecutorMcpCancelProvider(executor),
};
