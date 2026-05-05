import { createHostExecutorSearchGroundProvider, type SearchGroundProviderPractice } from "./dependencies.js";

export const anthropicSearchGroundPractice: SearchGroundProviderPractice = {
  providerName: "anthropic",
  source: {
    kind: "api-sdk",
    label: "Anthropic web_search grounded answer practice",
    path: "https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool",
  },
  directCliSupport: true,
  sideEffectPolicy: "read-only",
  notes: [
    "Anthropic web_search server tool returns result blocks and citations that can feed grounding.",
    "Provider loop completion and network lifecycle remain runtime-owned.",
  ],
  createProvider: ({ executor, provider }) => provider ?? createHostExecutorSearchGroundProvider(executor),
};
