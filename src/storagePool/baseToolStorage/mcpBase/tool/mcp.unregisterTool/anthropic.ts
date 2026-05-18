import { createHostExecutorMcpUnregisterToolProvider, type McpUnregisterToolProviderPractice } from "./dependencies.js";

export const anthropicMcpUnregisterToolPractice: McpUnregisterToolProviderPractice = {
  providerName: "anthropic",
  source: { kind: "cli", label: "Claude Code MCP runtime tool exposure", path: "/home/proview/Desktop/three/claude_code_2_1_88/tools/MCPTool/MCPTool.ts" },
  directCliSupport: true,
  sideEffectPolicy: "runtime-owned-client",
  notes: ["Claude Code keeps MCP client and discovered tool state in runtime services.", "Praxis makes unregistration a fixed BaseToolExecutorPort.mcp.unregisterTool mutation request."],
  createProvider: ({ executor, provider }) => provider ?? createHostExecutorMcpUnregisterToolProvider(executor),
};
