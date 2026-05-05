import { createHostExecutorMcpAuthenticateProvider, type McpAuthenticateProviderPractice } from "./dependencies.js";

export const openaiMcpAuthenticatePractice: McpAuthenticateProviderPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex Rust McpHandler session-owned connection manager",
    path: "/home/proview/Desktop/three/codex-rs/core/src/tools/mcp.rs",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-owned-client",
  notes: [
    "Codex routes MCP tool calls through session-owned MCP handling instead of constructing clients in tool definitions.",
    "Authentication and connection material belong beside the runtime MCP session manager.",
    "Praxis keeps credentialRef-only input at baseTool level and asks runtime to authenticate.",
  ],
  createProvider: (dependencies) => dependencies.provider ?? createHostExecutorMcpAuthenticateProvider(dependencies.executor),
};
