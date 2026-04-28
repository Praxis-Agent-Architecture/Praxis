import { createHostExecutorMcpHealthCheckProvider, type McpHealthCheckProviderPractice } from "./dependencies.js";

export const anthropicMcpHealthCheckPractice: McpHealthCheckProviderPractice = {
  providerName: "anthropic",
  source: { kind: "cli", label: "Claude Code MCP service health", path: "/home/proview/Desktop/three/claude_code_2_1_88/services/mcp" },
  directCliSupport: true,
  sideEffectPolicy: "runtime-owned-client",
  notes: ["Claude Code owns MCP service status in runtime services; the baseTool should only expose a fixed health-check contract."],
  createProvider: ({ executor, provider }) => provider ?? createHostExecutorMcpHealthCheckProvider(executor),
};
