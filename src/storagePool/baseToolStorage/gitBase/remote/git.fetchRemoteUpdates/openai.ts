import type { GitFetchRemoteUpdatesProviderPractice } from "./dependencies.js";
import { createHostExecutorGitFetchRemoteUpdatesProvider } from "./dependencies.js";

export const openaiGitFetchRemoteUpdatesPractice: GitFetchRemoteUpdatesProviderPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex git fetch practice through sandboxed runtime executor ownership",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Codex-style practice keeps host process and network execution behind runtime policy.",
    "Praxis stores the fetch contract in gitBase while runtime owns the real git process.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitFetchRemoteUpdatesProvider(executor),
};
