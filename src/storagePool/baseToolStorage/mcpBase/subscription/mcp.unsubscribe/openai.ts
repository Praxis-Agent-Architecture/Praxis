import { createHostExecutorMcpUnsubscribeProvider, type McpUnsubscribeProviderPractice } from "./dependencies.js";

export const openaiMcpUnsubscribePractice: McpUnsubscribeProviderPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex Rust session-owned MCP connection manager",
    path: "/home/proview/Desktop/three/codex_rust_0_125_0/codex-rs/core/src/session/mcp.rs",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-owned-client",
  notes: [
    "Codex Rust keeps MCP connection/session state in session-owned management code.",
    "Cleanup of live MCP handles belongs in runtime because it crosses individual model tool-call boundaries.",
    "Praxis keeps unsubscribe lifecycle behind BaseToolExecutorPort.mcp.unsubscribe.",
  ],
  createProvider: ({ executor, provider }) => provider ?? createHostExecutorMcpUnsubscribeProvider(executor),
};
