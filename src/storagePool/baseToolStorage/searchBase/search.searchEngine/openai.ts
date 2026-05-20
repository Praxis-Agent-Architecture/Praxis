import { createRuntimeSearchEngineProvider, type SearchEngineProviderPractice } from "./dependencies.js";

export const openaiSearchEnginePractice: SearchEngineProviderPractice = {
  providerName: "openai",
  source: { kind: "api-sdk", label: "OpenAI portable search-engine lowering practice" },
  directCliSupport: false,
  sideEffectPolicy: "read-only",
  notes: [
    "search.searchEngine is intentionally not OpenAI provider-native web_search; that belongs to search.nativeSearch.",
    "OpenAI-family routes can still carry a generic search backend through runtime.network.search.",
  ],
  createProvider: (dependencies) => createRuntimeSearchEngineProvider(dependencies),
};
