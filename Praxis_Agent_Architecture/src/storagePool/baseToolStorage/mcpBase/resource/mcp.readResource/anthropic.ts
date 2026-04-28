import { createHostExecutorMcpReadResourceProvider, type McpReadResourceProviderPractice } from "./dependencies.js";

export const anthropicMcpReadResourcePractice: McpReadResourceProviderPractice = {
  providerName: "anthropic",
  source: { kind: "cli", label: "Claude Code ReadMcpResourceTool", path: "/home/proview/Desktop/three/claude_code_2_1_88/tools/ReadMcpResourceTool" },
  directCliSupport: true,
  sideEffectPolicy: "runtime-owned-client",
  notes: ["Claude Code exposes MCP resource reading as a fixed tool while the runtime client owns live server contact."],
  createProvider: ({ executor, provider }) => provider ?? createHostExecutorMcpReadResourceProvider(executor),
};
