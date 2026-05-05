import type { NativeSearchProviderPractice } from "./dependencies.js";
import { createHostExecutorNativeSearchProvider } from "./dependencies.js";

export const openaiNativeSearchPractice = {
  providerName: "openai",
  source: {
    kind: "api-sdk",
    label: "OpenAI Responses API web_search practice",
    path: "https://developers.openai.com/api/docs/guides/tools-web-search",
  },
  directCliSupport: true,
  sideEffectPolicy: "read-only",
  notes: [
    "OpenAI native web search is exposed through Responses tools with { type: \"web_search\" }.",
    "Praxis normalizes web_search_call actions and URL citation annotations into sources and citations while runtime owns the API call.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorNativeSearchProvider(executor),
} as const satisfies NativeSearchProviderPractice;
