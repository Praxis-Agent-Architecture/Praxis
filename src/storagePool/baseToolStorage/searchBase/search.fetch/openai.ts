import { createHostExecutorSearchFetchProvider, type SearchFetchProviderPractice } from "./dependencies.js";

export const openaiSearchFetchPractice: SearchFetchProviderPractice = {
  providerName: "openai",
  source: {
    kind: "api-sdk",
    label: "OpenAI portable fetch practice",
    path: "https://developers.openai.com/api/docs/guides/tools-web-search",
  },
  directCliSupport: false,
  sideEffectPolicy: "read-only",
  notes: [
    "OpenAI has provider-native web search, but targeted URL fetch is best represented in Praxis as runtime-owned portable fetch.",
    "The baseTool preserves URL, content-type, maxBytes, and governance shape while runtime owns transport.",
  ],
  createProvider: ({ executor, provider }) => provider ?? createHostExecutorSearchFetchProvider(executor),
};
