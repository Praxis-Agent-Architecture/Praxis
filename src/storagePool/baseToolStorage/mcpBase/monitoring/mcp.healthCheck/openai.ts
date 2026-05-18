import { createHostExecutorMcpHealthCheckProvider, type McpHealthCheckProviderPractice } from "./dependencies.js";

export const openaiMcpHealthCheckPractice: McpHealthCheckProviderPractice = {
  providerName: "openai",
  source: { kind: "cli", label: "Codex Rust MCP runtime handler", path: "/home/proview/Desktop/three/codex_rust_0_125_0/codex-rs/core/src/tools/handlers/mcp.rs" },
  directCliSupport: true,
  sideEffectPolicy: "runtime-owned-client",
  notes: ["Codex keeps MCP availability in runtime-owned handler state; Praxis healthCheck maps that state into a stable baseTool result."],
  createProvider: ({ executor, provider }) => provider ?? createHostExecutorMcpHealthCheckProvider(executor),
};
