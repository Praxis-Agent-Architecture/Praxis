import { createRuntimeSearchEngineProvider, type SearchEngineProviderPractice } from "./dependencies.js";

export const deepmindSearchEnginePractice: SearchEngineProviderPractice = {
  providerName: "deepmind",
  source: { kind: "api-sdk", label: "Gemini portable search separation practice" },
  directCliSupport: false,
  sideEffectPolicy: "read-only",
  notes: [
    "Gemini google_search grounding belongs to search.nativeSearch/search.ground, not this generic search engine primitive.",
    "This tool keeps ordinary search result collection behind runtime.network.search.",
  ],
  createProvider: (dependencies) => createRuntimeSearchEngineProvider(dependencies),
};
