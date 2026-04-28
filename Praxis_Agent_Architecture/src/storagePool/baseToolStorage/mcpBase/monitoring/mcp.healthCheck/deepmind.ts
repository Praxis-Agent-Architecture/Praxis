import { createHostExecutorMcpHealthCheckProvider, type McpHealthCheckProviderPractice } from "./dependencies.js";

export const deepmindMcpHealthCheckPractice: McpHealthCheckProviderPractice = {
  providerName: "deepmind",
  source: { kind: "cli", label: "Gemini CLI McpClient connection state", path: "/home/proview/Desktop/three/gemini_cli_0_39_0/packages/core/src/tools/mcp-client.ts" },
  directCliSupport: true,
  sideEffectPolicy: "runtime-owned-client",
  notes: ["Gemini CLI keeps liveness, abort, timeout, and transport behavior in McpClient; baseTools should only shape the request/result."],
  createProvider: ({ executor, provider }) => provider ?? createHostExecutorMcpHealthCheckProvider(executor),
};
