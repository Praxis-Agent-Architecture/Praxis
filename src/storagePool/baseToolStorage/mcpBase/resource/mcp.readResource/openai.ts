import { createHostExecutorMcpReadResourceProvider, type McpReadResourceProviderPractice } from "./dependencies.js";

export const openaiMcpReadResourcePractice: McpReadResourceProviderPractice = {
  providerName: "openai",
  source: { kind: "cli", label: "Codex Rust McpHandler resource path", path: "/home/proview/Desktop/three/codex_rust_0_125_0/codex-rs/core/src/tools/handlers/mcp.rs" },
  directCliSupport: true,
  sideEffectPolicy: "runtime-owned-client",
  notes: ["Codex keeps MCP dispatch behind runtime handlers with public begin/end tool events."],
  createProvider: ({ executor, provider }) => provider ?? createHostExecutorMcpReadResourceProvider(executor),
};
