import type { GitCloneRepositoryProviderPractice } from "./dependencies.js";
import { createHostExecutorGitCloneRepositoryProvider } from "./dependencies.js";

export const deepmindGitCloneRepositoryPractice: GitCloneRepositoryProviderPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini CLI git clone practice with shell policy and repository ownership boundaries",
  },
  directCliSupport: true,
  sideEffectPolicy: "remote-network",
  notes: [
    "Gemini-style practice keeps git effects inside shell policy and repository service ownership.",
    "Praxis translates that into a fixed git clone action rather than a generic git.execute surface.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitCloneRepositoryProvider(executor),
};
