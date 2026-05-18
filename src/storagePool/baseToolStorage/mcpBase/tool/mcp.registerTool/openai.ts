import { createHostExecutorMcpRegisterToolProvider, type McpRegisterToolProviderPractice } from "./dependencies.js";

export const openaiMcpRegisterToolPractice: McpRegisterToolProviderPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex Rust McpHandler session-owned MCP path",
    path: "/home/proview/Desktop/three/codex_rust_0_125_0/codex-rs/core/src/tools/handlers/mcp.rs",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-owned-client",
  notes: [
    "Codex routes MCP tool work through session-owned MCP handlers rather than model-defined ad hoc execution.",
    "Praxis follows that boundary: the runtime mutates any tool registry state and storage core normalizes the result.",
  ],
  createProvider: ({ executor, provider }) => provider ?? createHostExecutorMcpRegisterToolProvider(executor),
};
