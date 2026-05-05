import { createHostExecutorSearchFetchProvider, type SearchFetchProviderPractice } from "./dependencies.js";

export const deepmindSearchFetchPractice: SearchFetchProviderPractice = {
  providerName: "deepmind",
  source: {
    kind: "api-sdk",
    label: "Gemini URL context practice",
    path: "https://ai.google.dev/gemini-api/docs/url-context",
  },
  directCliSupport: true,
  sideEffectPolicy: "read-only",
  notes: [
    "Gemini URL context can combine targeted URL inspection with Google Search grounding.",
    "Praxis keeps search.fetch as targeted page retrieval and leaves URL-context execution to runtime adapters.",
  ],
  createProvider: ({ executor, provider }) => provider ?? createHostExecutorSearchFetchProvider(executor),
};
