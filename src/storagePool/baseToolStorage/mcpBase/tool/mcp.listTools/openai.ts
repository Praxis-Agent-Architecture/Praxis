import { createHostExecutorMcpListToolsProvider, type McpListToolsProviderPractice } from "./dependencies.js";

export const openaiMcpListToolsPractice: McpListToolsProviderPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex Rust McpHandler tool discovery",
    path: "/home/proview/Desktop/three/codex_rust_0_125_0/codex-rs/core/src/tools/handlers/mcp.rs",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-owned-client",
  notes: [
    "Codex keeps MCP server configuration and dispatch in runtime state, with handlers exposing stable tool-call surfaces.",
    "Praxis keeps tools/list as a named baseTool instead of allowing arbitrary MCP commands.",
  ],
  createProvider: ({ executor, provider }) => provider ?? createHostExecutorMcpListToolsProvider(executor),
};
