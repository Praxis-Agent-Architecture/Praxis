import type { NativeSearchProviderPractice } from "./dependencies.js";
import { createHostExecutorNativeSearchProvider } from "./dependencies.js";

export const anthropicNativeSearchPractice = {
  providerName: "anthropic",
  source: {
    kind: "api-sdk",
    label: "Anthropic Messages API web_search server tool practice",
    path: "https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool",
  },
  directCliSupport: true,
  sideEffectPolicy: "read-only",
  notes: [
    "Anthropic native web search is carried by the Messages server tool, currently represented by web_search_20260209 or compatible versions.",
    "Praxis keeps the provider-native route explicit and lets runtime/Raxode own Anthropic client configuration and tool execution.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorNativeSearchProvider(executor),
} as const satisfies NativeSearchProviderPractice;
