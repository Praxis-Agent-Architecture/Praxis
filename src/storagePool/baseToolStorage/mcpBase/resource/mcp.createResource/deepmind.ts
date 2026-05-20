import { createHostExecutorMcpCreateResourceProvider, type McpCreateResourceProviderPractice } from "./dependencies.js";

export const deepmindMcpCreateResourcePractice: McpCreateResourceProviderPractice = {
  providerName: "deepmind",
  source: { kind: "cli", label: "Gemini CLI McpClient owns connection status and request lifecycle", path: "/home/proview/Desktop/three/gemini_cli_0_39_0/packages/core/src/tools/mcp-client.ts" },
  directCliSupport: true,
  sideEffectPolicy: "runtime-owned-client",
  notes: ["Gemini CLI separates model-visible discovered MCP tools from the runtime McpClient.", "Persistent resource mutations belong behind that runtime client.", "Praxis routes mcp.createResource through an injected runtime executor port."],
  createProvider: ({ executor, provider }) => provider ?? createHostExecutorMcpCreateResourceProvider(executor),
};
