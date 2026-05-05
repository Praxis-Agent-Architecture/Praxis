import { createHostExecutorMcpUpdateResourceProvider, type McpUpdateResourceProviderPractice } from "./dependencies.js";

export const openaiMcpUpdateResourcePractice: McpUpdateResourceProviderPractice = {
  providerName: "openai",
  source: { kind: "cli", label: "Codex Rust session-owned MCP connection manager", path: "/home/proview/Desktop/three/codex_rust_0_125_0/codex-rs/core/src/session/mcp.rs" },
  directCliSupport: true,
  sideEffectPolicy: "runtime-owned-client",
  notes: ["Codex Rust keeps MCP connection state in the runtime session.", "Mutation requests should be normalized above the provider and executed by runtime.", "Praxis maps mcp.updateResource to BaseToolExecutorPort.mcp.updateResource."],
  createProvider: ({ executor, provider }) => provider ?? createHostExecutorMcpUpdateResourceProvider(executor),
};
