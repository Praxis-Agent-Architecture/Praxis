import { createHostExecutorSearchGroundProvider, type SearchGroundProviderPractice } from "./dependencies.js";

export const deepmindSearchGroundPractice: SearchGroundProviderPractice = {
  providerName: "deepmind",
  source: {
    kind: "api-sdk",
    label: "Gemini google_search groundingMetadata practice",
    path: "https://ai.google.dev/gemini-api/docs/google-search",
  },
  directCliSupport: true,
  sideEffectPolicy: "read-only",
  notes: [
    "Gemini groundingMetadata and URL context metadata map naturally into sources and citations.",
    "Praxis keeps the evidence ledger and result envelope stable across providers.",
  ],
  createProvider: ({ executor, provider }) => provider ?? createHostExecutorSearchGroundProvider(executor),
};
