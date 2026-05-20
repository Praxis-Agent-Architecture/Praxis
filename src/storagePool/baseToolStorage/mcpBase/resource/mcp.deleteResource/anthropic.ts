import { createHostExecutorMcpDeleteResourceProvider, type McpDeleteResourceProviderPractice } from "./dependencies.js";

export const anthropicMcpDeleteResourcePractice: McpDeleteResourceProviderPractice = {
  providerName: "anthropic",
  source: { kind: "cli", label: "Claude Code MCP service owns resource mutation lifecycle", path: "/home/proview/Desktop/three/claude_code_2_1_88/services/mcp/client.ts" },
  directCliSupport: true,
  sideEffectPolicy: "runtime-owned-client",
  notes: ["Claude Code runtime owns MCP client/session/transport state.", "Destructive resource deletion belongs behind runtime governance and server persistence.", "Praxis maps mcp.deleteResource to BaseToolExecutorPort.mcp.deleteResource."],
  createProvider: ({ executor, provider }) => provider ?? createHostExecutorMcpDeleteResourceProvider(executor),
};
