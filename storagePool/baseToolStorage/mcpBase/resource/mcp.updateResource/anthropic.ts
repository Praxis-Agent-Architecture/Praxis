import { createHostExecutorMcpUpdateResourceProvider, type McpUpdateResourceProviderPractice } from "./dependencies.js";

export const anthropicMcpUpdateResourcePractice: McpUpdateResourceProviderPractice = {
  providerName: "anthropic",
  source: { kind: "cli", label: "Claude Code MCP service owns resource mutation lifecycle", path: "/home/proview/Desktop/three/claude_code_2_1_88/services/mcp/client.ts" },
  directCliSupport: true,
  sideEffectPolicy: "runtime-owned-client",
  notes: ["Claude Code keeps MCP sessions and transport state inside runtime services.", "Resource update persistence, revision checks, and conflicts belong to runtime/server.", "Praxis keeps mcp.updateResource as a fixed governed request over BaseToolExecutorPort.mcp.updateResource."],
  createProvider: ({ executor, provider }) => provider ?? createHostExecutorMcpUpdateResourceProvider(executor),
};
