import type { GitRevertCommitProviderPractice } from "./dependencies.js";
import { createHostExecutorGitRevertCommitProvider } from "./dependencies.js";

export const deepmindGitRevertCommitPractice: GitRevertCommitProviderPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini CLI git revert practice with shell policy and repository ownership boundaries",
  },
  directCliSupport: true,
  sideEffectPolicy: "history-mutation",
  notes: [
    "Gemini-style practice keeps git effects inside shell policy and repository service ownership.",
    "Praxis translates that into a fixed git revert action rather than a generic git.execute surface.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitRevertCommitProvider(executor),
};
