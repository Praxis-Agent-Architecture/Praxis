import { createHostExecutorMcpAuthorizeProvider, type McpAuthorizeProviderPractice } from "./dependencies.js";

export const deepmindMcpAuthorizePractice: McpAuthorizeProviderPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini CLI DiscoveredMCPTool over runtime McpClient",
    path: "/home/proview/Desktop/three/gemini-cli/packages/core/src/tools/mcp-tool.ts",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-owned-client",
  notes: [
    "Gemini CLI exposes discovered MCP tools while the MCP client remains runtime-owned.",
    "Authorization sits around the discovered tool invocation path.",
    "Praxis keeps mcp.authorize as a policy envelope and delegates the decision to runtime.",
  ],
  createProvider: (dependencies) => dependencies.provider ?? createHostExecutorMcpAuthorizeProvider(dependencies.executor),
};
