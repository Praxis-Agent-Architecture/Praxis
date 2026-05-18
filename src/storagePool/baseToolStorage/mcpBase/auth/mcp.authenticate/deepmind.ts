import { createHostExecutorMcpAuthenticateProvider, type McpAuthenticateProviderPractice } from "./dependencies.js";

export const deepmindMcpAuthenticatePractice: McpAuthenticateProviderPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini CLI McpClient owns connection/auth state",
    path: "/home/proview/Desktop/three/gemini-cli/packages/core/src/tools/mcp-client.ts",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-owned-client",
  notes: [
    "Gemini CLI separates MCP client/session management from discovered model-visible tools.",
    "Auth material and server connectivity live in the runtime MCP client.",
    "Praxis exposes mcp.authenticate as a normalized runtime request, not as a hidden client.",
  ],
  createProvider: (dependencies) => dependencies.provider ?? createHostExecutorMcpAuthenticateProvider(dependencies.executor),
};
