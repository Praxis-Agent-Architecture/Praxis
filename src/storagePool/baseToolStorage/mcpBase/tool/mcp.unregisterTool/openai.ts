import { createHostExecutorMcpUnregisterToolProvider, type McpUnregisterToolProviderPractice } from "./dependencies.js";

export const openaiMcpUnregisterToolPractice: McpUnregisterToolProviderPractice = {
  providerName: "openai",
  source: { kind: "cli", label: "Codex Rust McpHandler session boundary", path: "/home/proview/Desktop/three/codex_rust_0_125_0/codex-rs/core/src/tools/handlers/mcp.rs" },
  directCliSupport: true,
  sideEffectPolicy: "runtime-owned-client",
  notes: ["Codex routes MCP work through runtime/session handlers.", "Praxis lets storage core govern the request while runtime owns registry deletion."],
  createProvider: ({ executor, provider }) => provider ?? createHostExecutorMcpUnregisterToolProvider(executor),
};
