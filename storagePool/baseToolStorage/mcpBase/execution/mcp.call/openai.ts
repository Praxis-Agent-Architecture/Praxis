import { createHostExecutorMcpCallProvider, type McpCallProviderPractice } from "./dependencies.js";

export const openaiMcpCallPractice: McpCallProviderPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex Rust McpHandler handle_mcp_tool_call",
    path: "/home/proview/Desktop/three/codex_rust_0_125_0/codex-rs/core/src/tools/handlers/mcp.rs",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-owned-client",
  notes: [
    "Codex Rust routes MCP tool calls through a handler that parses raw JSON arguments before dispatching through runtime state.",
    "The companion mcp_tool_call flow emits begin/end events and keeps approval hooks around the call boundary.",
    "Praxis uses the same split: baseTool normalizes input and returns public-safe errors; runtime owns configured MCP servers.",
  ],
  createProvider: ({ executor, provider }) => provider ?? createHostExecutorMcpCallProvider(executor),
};
