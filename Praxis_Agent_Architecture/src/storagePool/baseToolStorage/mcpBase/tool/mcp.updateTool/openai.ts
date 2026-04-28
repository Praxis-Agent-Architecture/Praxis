import { createHostExecutorMcpUpdateToolProvider, type McpUpdateToolProviderPractice } from "./dependencies.js";

export const openaiMcpUpdateToolPractice: McpUpdateToolProviderPractice = {
  providerName: "openai",
  source: { kind: "cli", label: "Codex Rust McpHandler session-managed MCP calls", path: "/home/proview/Desktop/three/codex_rust_0_125_0/codex-rs/core/src/tools/handlers/mcp.rs" },
  directCliSupport: true,
  sideEffectPolicy: "runtime-owned-client",
  notes: ["Codex places MCP state behind session/runtime handlers.", "Praxis lets storage core validate the update patch while runtime owns mutation and persistence."],
  createProvider: ({ executor, provider }) => provider ?? createHostExecutorMcpUpdateToolProvider(executor),
};
