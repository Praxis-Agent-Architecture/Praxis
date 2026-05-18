import { createHostExecutorSearchFetchProvider, type SearchFetchProviderPractice } from "./dependencies.js";

export const anthropicSearchFetchPractice: SearchFetchProviderPractice = {
  providerName: "anthropic",
  source: {
    kind: "api-sdk",
    label: "Anthropic Messages web_fetch server tool practice",
    path: "https://platform.claude.com/docs/en/docs/agents-and-tools/tool-use/web-fetch-tool",
  },
  directCliSupport: true,
  sideEffectPolicy: "read-only",
  notes: [
    "Anthropic exposes web fetch as a server tool; Praxis records that shape but still routes execution through runtime.",
    "Domain policy, SSRF protection, timeout, and network lifecycle stay outside the baseTool.",
  ],
  createProvider: ({ executor, provider }) => provider ?? createHostExecutorSearchFetchProvider(executor),
};
