import { createHostExecutorMcpSubscribeProvider, type McpSubscribeProviderPractice } from "./dependencies.js";

export const anthropicMcpSubscribePractice: McpSubscribeProviderPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code MCP client notification and resource subscription lifecycle",
    path: "/home/proview/Desktop/three/claude_code_2_1_88/services/mcp/client.ts",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-owned-client",
  notes: [
    "Claude Code keeps MCP client sessions, transports, OAuth, and server notifications inside the MCP service layer.",
    "Model-visible MCP tools sit above that runtime service and do not own event listeners or stream buffers.",
    "Praxis mirrors this by making mcp.subscribe a fixed contract over BaseToolExecutorPort.mcp.subscribe.",
  ],
  createProvider: ({ executor, provider }) => provider ?? createHostExecutorMcpSubscribeProvider(executor),
};
