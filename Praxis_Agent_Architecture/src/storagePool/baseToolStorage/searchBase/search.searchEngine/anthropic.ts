import { createHostExecutorSearchEngineProvider, type SearchEngineProviderPractice } from "./dependencies.js";

export const anthropicSearchEnginePractice: SearchEngineProviderPractice = {
  providerName: "anthropic",
  source: { kind: "cli", label: "Claude Code external search separation practice" },
  directCliSupport: false,
  sideEffectPolicy: "read-only",
  notes: [
    "Claude-native web_search remains search.nativeSearch; search.searchEngine is the portable/custom search-engine lane.",
    "Runtime owns the backing service and result collection.",
  ],
  createProvider: ({ executor, provider }) => provider ?? createHostExecutorSearchEngineProvider(executor),
};
