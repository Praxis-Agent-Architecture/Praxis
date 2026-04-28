import { createHostExecutorMcpNativeExecuteProvider, type McpNativeExecuteProviderPractice } from "./dependencies.js";

export const anthropicMcpNativeExecutePractice: McpNativeExecuteProviderPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code MCP runtime client and MCPTool surface",
    path: "/home/proview/Desktop/three/claude_code_2_1_88/tools/MCPTool/MCPTool.ts",
  },
  directCliSupport: false,
  sideEffectPolicy: "runtime-owned-client",
  notes: [
    "Claude Code exposes discovered MCP tools through model-visible MCPTool wrappers while runtime services own MCP clients.",
    "Raw protocol calls are not a normal model-facing happy path; Praxis keeps mcp.nativeExecute behind explicit runtime approval.",
  ],
  createProvider: (dependencies) => dependencies.provider ?? createHostExecutorMcpNativeExecuteProvider(dependencies.executor),
};
