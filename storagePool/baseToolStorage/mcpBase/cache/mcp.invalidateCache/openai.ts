import { createHostExecutorMcpInvalidateCacheProvider, type McpInvalidateCacheProviderPractice } from "./dependencies.js";

export const openaiMcpInvalidateCachePractice: McpInvalidateCacheProviderPractice = {
  providerName: "openai",
  source: { kind: "cli", label: "Codex Rust McpHandler dispatches MCP through session-owned runtime", path: "/home/proview/Desktop/three/codex_rust_0_125_0/codex-rs/core/src/tools/handlers/mcp.rs" },
  directCliSupport: true,
  sideEffectPolicy: "runtime-owned-client",
  notes: ["Codex MCP calls are handled by runtime/session infrastructure, not a model-facing generic executor.", "Invalidating cached MCP discovery/resource/tool-call results belongs to the same runtime owner.", "Praxis keeps invalidation scope validation in storage core and eviction in BaseToolExecutorPort.mcp.invalidateCache."],
  createProvider: ({ executor, provider }) => provider ?? createHostExecutorMcpInvalidateCacheProvider(executor),
};
