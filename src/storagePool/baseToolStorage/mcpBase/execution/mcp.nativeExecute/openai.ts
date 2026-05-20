import { createHostExecutorMcpNativeExecuteProvider, type McpNativeExecuteProviderPractice } from "./dependencies.js";

export const openaiMcpNativeExecutePractice: McpNativeExecuteProviderPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex Rust MCP handler session-owned connection manager",
    path: "/home/proview/Desktop/three/codex-rs",
  },
  directCliSupport: false,
  sideEffectPolicy: "runtime-owned-client",
  notes: [
    "Codex routes MCP work through session/runtime connection management instead of exposing client transports to the model.",
    "Praxis treats nativeExecute as a runtime support escape hatch, not as a replacement for fixed mcp.call/read/list tools.",
  ],
  createProvider: (dependencies) => dependencies.provider ?? createHostExecutorMcpNativeExecuteProvider(dependencies.executor),
};
