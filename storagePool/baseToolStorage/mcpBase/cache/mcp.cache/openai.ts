import { createHostExecutorMcpCacheProvider, type McpCacheProviderPractice } from "./dependencies.js";

export const openaiMcpCachePractice: McpCacheProviderPractice = {
  providerName: "openai",
  source: { kind: "cli", label: "Codex Rust McpHandler keeps MCP dispatch under runtime session", path: "/home/proview/Desktop/three/codex_rust_0_125_0/codex-rs/core/src/tools/handlers/mcp.rs" },
  directCliSupport: true,
  sideEffectPolicy: "runtime-owned-client",
  notes: ["Codex routes MCP tool/resource calls through runtime handlers with public begin/end events.", "Any cache of MCP results belongs beside the session/runtime manager, not inside model-visible tool code.", "Praxis keeps mcp.cache as shape and governance, while BaseToolExecutorPort.mcp.cache owns storage."],
  createProvider: ({ executor, provider }) => provider ?? createHostExecutorMcpCacheProvider(executor),
};
