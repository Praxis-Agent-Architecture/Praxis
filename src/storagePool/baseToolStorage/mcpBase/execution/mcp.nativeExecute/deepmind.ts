import { createHostExecutorMcpNativeExecuteProvider, type McpNativeExecuteProviderPractice } from "./dependencies.js";

export const deepmindMcpNativeExecutePractice: McpNativeExecuteProviderPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini CLI McpClient runtime lifecycle and discovered tool wrappers",
    path: "/home/proview/Desktop/three/gemini-cli",
  },
  directCliSupport: false,
  sideEffectPolicy: "runtime-owned-client",
  notes: [
    "Gemini CLI separates MCP client lifecycle from model-visible discovered MCP tools.",
    "Praxis keeps native protocol dispatch in BaseToolExecutorPort.mcp.nativeExecute and documents it as high-risk runtime-admin capability.",
  ],
  createProvider: (dependencies) => dependencies.provider ?? createHostExecutorMcpNativeExecuteProvider(dependencies.executor),
};
