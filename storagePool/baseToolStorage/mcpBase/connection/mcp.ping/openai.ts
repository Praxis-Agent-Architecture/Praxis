import { createHostExecutorMcpPingProvider, type McpPingProviderPractice } from "./dependencies.js";

export const openaiMcpPingPractice: McpPingProviderPractice = {
  providerName: "openai",
  source: { kind: "cli", label: "Codex Rust MCP runtime handler", path: "/home/proview/Desktop/three/codex_rust_0_125_0/codex-rs/core/src/tools/handlers/mcp.rs" },
  directCliSupport: true,
  sideEffectPolicy: "runtime-owned-client",
  notes: ["Codex keeps MCP server status and calls in runtime state; ping remains a runtime support primitive."],
  createProvider: ({ executor, provider }) => provider ?? createHostExecutorMcpPingProvider(executor),
};
