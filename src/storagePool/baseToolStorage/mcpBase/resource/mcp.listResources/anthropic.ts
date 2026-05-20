import { createHostExecutorMcpListResourcesProvider, type McpListResourcesProviderPractice } from "./dependencies.js";

export const anthropicMcpListResourcesPractice: McpListResourcesProviderPractice = {
  providerName: "anthropic",
  source: { kind: "cli", label: "Claude Code ListMcpResourcesTool", path: "/home/proview/Desktop/three/claude_code_2_1_88/tools/ListMcpResourcesTool" },
  directCliSupport: true,
  sideEffectPolicy: "runtime-owned-client",
  notes: ["Claude Code exposes MCP resource listing as a fixed tool while the MCP client stays runtime-owned."],
  createProvider: ({ executor, provider }) => provider ?? createHostExecutorMcpListResourcesProvider(executor),
};
