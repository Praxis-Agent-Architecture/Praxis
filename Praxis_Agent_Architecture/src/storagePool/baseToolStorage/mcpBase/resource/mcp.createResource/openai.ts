import { createHostExecutorMcpCreateResourceProvider, type McpCreateResourceProviderPractice } from "./dependencies.js";

export const openaiMcpCreateResourcePractice: McpCreateResourceProviderPractice = {
  providerName: "openai",
  source: { kind: "cli", label: "Codex Rust session-owned MCP connection manager", path: "/home/proview/Desktop/three/codex_rust_0_125_0/codex-rs/core/src/session/mcp.rs" },
  directCliSupport: true,
  sideEffectPolicy: "runtime-owned-client",
  notes: ["Codex Rust routes MCP work through a session-owned connection manager.", "Mutation state and server transport are runtime/session material, not model-visible tool state.", "Praxis keeps create semantics in storage core while runtime owns BaseToolExecutorPort.mcp.createResource."],
  createProvider: ({ executor, provider }) => provider ?? createHostExecutorMcpCreateResourceProvider(executor),
};
