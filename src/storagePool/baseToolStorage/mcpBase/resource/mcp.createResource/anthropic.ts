import { createHostExecutorMcpCreateResourceProvider, type McpCreateResourceProviderPractice } from "./dependencies.js";

export const anthropicMcpCreateResourcePractice: McpCreateResourceProviderPractice = {
  providerName: "anthropic",
  source: { kind: "cli", label: "Claude Code MCP service owns resource mutation lifecycle", path: "/home/proview/Desktop/three/claude_code_2_1_88/services/mcp/client.ts" },
  directCliSupport: true,
  sideEffectPolicy: "runtime-owned-client",
  notes: ["Claude Code keeps MCP client/session/transport state in the MCP service layer.", "Resource mutation must remain a runtime-owned operation because persistence and conflicts live behind the MCP server.", "Praxis makes mcp.createResource a fixed governed request over BaseToolExecutorPort.mcp.createResource."],
  createProvider: ({ executor, provider }) => provider ?? createHostExecutorMcpCreateResourceProvider(executor),
};
