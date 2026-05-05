import { createHostExecutorMcpUpdateResourceProvider, type McpUpdateResourceProviderPractice } from "./dependencies.js";

export const deepmindMcpUpdateResourcePractice: McpUpdateResourceProviderPractice = {
  providerName: "deepmind",
  source: { kind: "cli", label: "Gemini CLI McpClient owns request lifecycle", path: "/home/proview/Desktop/three/gemini_cli_0_39_0/packages/core/src/tools/mcp-client.ts" },
  directCliSupport: true,
  sideEffectPolicy: "runtime-owned-client",
  notes: ["Gemini CLI's McpClient owns request lifecycle and server contact.", "Resource update semantics should be fixed at the tool layer but persisted by runtime.", "Praxis keeps updateResource provider-backed through the runtime executor."],
  createProvider: ({ executor, provider }) => provider ?? createHostExecutorMcpUpdateResourceProvider(executor),
};
