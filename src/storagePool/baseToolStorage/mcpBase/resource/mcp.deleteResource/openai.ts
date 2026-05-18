import { createHostExecutorMcpDeleteResourceProvider, type McpDeleteResourceProviderPractice } from "./dependencies.js";

export const openaiMcpDeleteResourcePractice: McpDeleteResourceProviderPractice = {
  providerName: "openai",
  source: { kind: "cli", label: "Codex Rust session-owned MCP connection manager", path: "/home/proview/Desktop/three/codex_rust_0_125_0/codex-rs/core/src/session/mcp.rs" },
  directCliSupport: true,
  sideEffectPolicy: "runtime-owned-client",
  notes: ["Codex Rust routes MCP work through runtime/session connection management.", "Deletion targets persistent server state and must not be implemented as hidden local IO.", "Praxis keeps delete semantics in storage core and dispatches through BaseToolExecutorPort.mcp.deleteResource."],
  createProvider: ({ executor, provider }) => provider ?? createHostExecutorMcpDeleteResourceProvider(executor),
};
