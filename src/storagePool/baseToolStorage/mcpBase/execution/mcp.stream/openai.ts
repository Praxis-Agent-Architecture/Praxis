import { createHostExecutorMcpStreamProvider, type McpStreamProviderPractice } from "./dependencies.js";

export const openaiMcpStreamPractice: McpStreamProviderPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex Rust session-owned McpHandler and MCP connection manager",
    path: "/home/proview/Desktop/three/codex_rust_0_125_0/codex-rs/core/src/session/mcp.rs",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-owned-client",
  notes: [
    "Codex Rust routes MCP work through session-owned handlers and connection management.",
    "Streaming/progress state is session runtime material because it must survive a single model tool-call frame.",
    "Praxis keeps mcp.stream as a fixed BaseTool contract over BaseToolExecutorPort.mcp.streamTool.",
  ],
  createProvider: ({ executor, provider }) => provider ?? createHostExecutorMcpStreamProvider(executor),
};
