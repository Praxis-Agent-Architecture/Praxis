import { createHostExecutorMcpSubscribeProvider, type McpSubscribeProviderPractice } from "./dependencies.js";

export const openaiMcpSubscribePractice: McpSubscribeProviderPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex Rust session-owned MCP connection manager",
    path: "/home/proview/Desktop/three/codex_rust_0_125_0/codex-rs/core/src/session/mcp.rs",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-owned-client",
  notes: [
    "Codex Rust routes MCP work through session-owned MCP connection management rather than exposing transport/session ownership to model tools.",
    "Notification and resource state belongs with the session manager because it must survive request boundaries.",
    "Praxis keeps subscription lifecycle behind BaseToolExecutorPort.mcp.subscribe.",
  ],
  createProvider: ({ executor, provider }) => provider ?? createHostExecutorMcpSubscribeProvider(executor),
};
