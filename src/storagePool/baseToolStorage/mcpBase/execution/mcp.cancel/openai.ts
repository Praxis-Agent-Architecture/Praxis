import { createHostExecutorMcpCancelProvider, type McpCancelProviderPractice } from "./dependencies.js";

export const openaiMcpCancelPractice: McpCancelProviderPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex Rust session-owned MCP connection manager and tool-call path",
    path: "/home/proview/Desktop/three/codex_rust_0_125_0/codex-rs/core/src/session/mcp.rs",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-owned-client",
  notes: [
    "Codex Rust keeps MCP connection/session ownership in the runtime session manager.",
    "Cancellation belongs to runtime/session state rather than a model-visible tool dictionary.",
    "Praxis keeps mcp.cancel as a fixed action that only shapes and governs BaseToolExecutorPort.mcp.cancelExecution.",
  ],
  createProvider: ({ executor, provider }) => provider ?? createHostExecutorMcpCancelProvider(executor),
};
