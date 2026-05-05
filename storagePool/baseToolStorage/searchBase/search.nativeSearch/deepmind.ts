import type { NativeSearchProviderPractice } from "./dependencies.js";
import { createHostExecutorNativeSearchProvider } from "./dependencies.js";

export const deepmindNativeSearchPractice = {
  providerName: "deepmind",
  source: {
    kind: "api-sdk",
    label: "Gemini API google_search grounding practice",
    path: "https://ai.google.dev/gemini-api/docs/google-search",
  },
  directCliSupport: true,
  sideEffectPolicy: "read-only",
  notes: [
    "Gemini native web search is exposed as Google Search grounding with structured groundingMetadata, sources, and citation supports.",
    "Praxis normalizes grounding chunks/supports into sources and citations while runtime owns the Gemini API call.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorNativeSearchProvider(executor),
} as const satisfies NativeSearchProviderPractice;
