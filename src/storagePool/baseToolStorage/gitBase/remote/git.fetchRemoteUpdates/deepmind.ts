import type { GitFetchRemoteUpdatesProviderPractice } from "./dependencies.js";
import { createHostExecutorGitFetchRemoteUpdatesProvider } from "./dependencies.js";

export const deepmindGitFetchRemoteUpdatesPractice: GitFetchRemoteUpdatesProviderPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini CLI git fetch practice with shell policy and repository ownership boundaries",
  },
  directCliSupport: true,
  sideEffectPolicy: "remote-network",
  notes: [
    "Gemini-style practice keeps remote Git effects inside shell policy and repository service ownership.",
    "Praxis translates that into a fixed git fetch action rather than a generic git.execute surface.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitFetchRemoteUpdatesProvider(executor),
};
