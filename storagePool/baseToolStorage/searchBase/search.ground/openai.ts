import { createHostExecutorSearchGroundProvider, type SearchGroundProviderPractice } from "./dependencies.js";

export const openaiSearchGroundPractice: SearchGroundProviderPractice = {
  providerName: "openai",
  source: {
    kind: "api-sdk",
    label: "OpenAI Responses web_search grounded answer practice",
    path: "https://developers.openai.com/api/docs/guides/tools-web-search",
  },
  directCliSupport: true,
  sideEffectPolicy: "read-only",
  notes: [
    "OpenAI grounding can be carried by Responses web_search outputs with citation annotations.",
    "Praxis search.ground normalizes answer, sources, and citations while runtime owns provider execution.",
  ],
  createProvider: ({ executor, provider }) => provider ?? createHostExecutorSearchGroundProvider(executor),
};
