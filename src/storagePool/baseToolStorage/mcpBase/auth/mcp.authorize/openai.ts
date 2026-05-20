import { createHostExecutorMcpAuthorizeProvider, type McpAuthorizeProviderPractice } from "./dependencies.js";

export const openaiMcpAuthorizePractice: McpAuthorizeProviderPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex Rust handle_mcp_tool_call through session MCP manager",
    path: "/home/proview/Desktop/three/codex-rs/core/src/tools/mcp.rs",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-owned-client",
  notes: [
    "Codex keeps MCP dispatch behind session/runtime ownership.",
    "Authorization is a runtime/TAP decision around that dispatch, not a generic native execute surface.",
    "Praxis baseTool normalizes subject/action/resource inputs and lets runtime return the policy decision.",
  ],
  createProvider: (dependencies) => dependencies.provider ?? createHostExecutorMcpAuthorizeProvider(dependencies.executor),
};
