import { createHostExecutorMcpInvalidateCacheProvider, type McpInvalidateCacheProviderPractice } from "./dependencies.js";

export const deepmindMcpInvalidateCachePractice: McpInvalidateCacheProviderPractice = {
  providerName: "deepmind",
  source: { kind: "cli", label: "Gemini CLI McpClient owns MCP discovery/cache state", path: "/home/proview/Desktop/three/gemini_cli_0_39_0/packages/core/src/tools/mcp-client.ts" },
  directCliSupport: true,
  sideEffectPolicy: "runtime-owned-client",
  notes: ["Gemini CLI maintains MCP client and discovered tool/resource state in runtime services.", "Cache invalidation needs the same runtime context to avoid stale server state.", "Praxis exposes a fixed invalidation contract while runtime owns the actual cache store."],
  createProvider: ({ executor, provider }) => provider ?? createHostExecutorMcpInvalidateCacheProvider(executor),
};
