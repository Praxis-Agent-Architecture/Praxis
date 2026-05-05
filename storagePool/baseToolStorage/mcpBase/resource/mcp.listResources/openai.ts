import { createHostExecutorMcpListResourcesProvider, type McpListResourcesProviderPractice } from "./dependencies.js";

export const openaiMcpListResourcesPractice: McpListResourcesProviderPractice = {
  providerName: "openai",
  source: { kind: "cli", label: "Codex Rust McpHandler resource path", path: "/home/proview/Desktop/three/codex_rust_0_125_0/codex-rs/core/src/tools/handlers/mcp.rs" },
  directCliSupport: true,
  sideEffectPolicy: "runtime-owned-client",
  notes: ["Codex routes MCP work through handlers over runtime MCP state, not through hidden per-tool clients."],
  createProvider: ({ executor, provider }) => provider ?? createHostExecutorMcpListResourcesProvider(executor),
};
