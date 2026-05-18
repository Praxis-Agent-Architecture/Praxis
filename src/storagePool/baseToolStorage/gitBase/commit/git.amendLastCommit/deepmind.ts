import type { GitAmendLastCommitProviderPractice } from "./dependencies.js";
import { createHostExecutorGitAmendLastCommitProvider } from "./dependencies.js";

export const deepmindGitAmendLastCommitPractice: GitAmendLastCommitProviderPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini CLI git amend practice with shell policy and repository ownership boundaries",
  },
  directCliSupport: true,
  sideEffectPolicy: "history-mutation",
  notes: [
    "Gemini-style practice keeps git effects inside shell policy and repository service ownership.",
    "Praxis translates that into a fixed git commit --amend action rather than a generic git.execute surface.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitAmendLastCommitProvider(executor),
};
