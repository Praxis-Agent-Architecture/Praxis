import type { GitCherryPickCommitProviderPractice } from "./dependencies.js";
import { createHostExecutorGitCherryPickCommitProvider } from "./dependencies.js";

export const deepmindGitCherryPickCommitPractice: GitCherryPickCommitProviderPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini CLI git cherry-pick practice with shell policy and repository ownership boundaries",
  },
  directCliSupport: true,
  sideEffectPolicy: "history-mutation",
  notes: [
    "Gemini-style practice keeps git effects inside shell policy and repository service ownership.",
    "Praxis translates that into a fixed git cherry-pick action rather than a generic git.execute surface.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitCherryPickCommitProvider(executor),
};
