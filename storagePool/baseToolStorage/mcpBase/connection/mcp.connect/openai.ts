import { createHostExecutorMcpConnectProvider, type McpConnectProviderPractice } from "./dependencies.js";

export const openaiMcpConnectPractice: McpConnectProviderPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex Rust session-owned MCP connection manager",
    path: "/home/proview/Desktop/three/codex_rust_0_125_0/codex-rs/core/src/session/mcp.rs",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-owned-client",
  notes: [
    "Codex Rust routes MCP calls and resource reads through a session-owned mcp_connection_manager.",
    "Refreshing configured MCP servers creates runtime connection managers rather than exposing raw transport creation as a model tool.",
    "Praxis keeps server connection lifecycle behind BaseToolExecutorPort.mcp.connect.",
  ],
  createProvider: ({ executor, provider }) => provider ?? createHostExecutorMcpConnectProvider(executor),
};
