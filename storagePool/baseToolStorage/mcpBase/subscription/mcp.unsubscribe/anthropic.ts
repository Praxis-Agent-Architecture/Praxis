import { createHostExecutorMcpUnsubscribeProvider, type McpUnsubscribeProviderPractice } from "./dependencies.js";

export const anthropicMcpUnsubscribePractice: McpUnsubscribeProviderPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code MCP client notification cleanup",
    path: "/home/proview/Desktop/three/claude_code_2_1_88/services/mcp/client.ts",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-owned-client",
  notes: [
    "Claude Code keeps MCP session and notification cleanup inside the MCP service/client layer.",
    "Model-visible tools request an action; they do not own listener handles or transport cleanup.",
    "Praxis mirrors this by making mcp.unsubscribe a fixed contract over BaseToolExecutorPort.mcp.unsubscribe.",
  ],
  createProvider: ({ executor, provider }) => provider ?? createHostExecutorMcpUnsubscribeProvider(executor),
};
