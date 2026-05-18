import { createHostExecutorMcpDisconnectProvider, type McpDisconnectProviderPractice } from "./dependencies.js";

export const openaiMcpDisconnectPractice: McpDisconnectProviderPractice = {
  providerName: "openai",
  source: { kind: "cli", label: "Codex Rust session MCP manager lifecycle", path: "/home/proview/Desktop/three/codex_rust_0_125_0/codex-rs/core/src/session/mcp.rs" },
  directCliSupport: true,
  sideEffectPolicy: "runtime-owned-client",
  notes: [
    "Codex Rust places MCP lifecycle under session services and the connection manager.",
    "Tool handlers call into that runtime-owned manager instead of owning connections.",
    "Praxis keeps disconnect as a fixed baseTool contract over the runtime executor port.",
  ],
  createProvider: ({ executor, provider }) => provider ?? createHostExecutorMcpDisconnectProvider(executor),
};
