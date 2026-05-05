import type { GitRebaseBranchProviderPractice } from "./dependencies.js";
import { createHostExecutorGitRebaseBranchProvider } from "./dependencies.js";

export const deepmindGitRebaseBranchPractice: GitRebaseBranchProviderPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini CLI git rebase practice with shell policy and repository ownership boundaries",
  },
  directCliSupport: true,
  sideEffectPolicy: "workspace-mutation",
  notes: [
    "Gemini-style practice keeps git effects inside shell policy and repository service ownership.",
    "Praxis translates that into a fixed git rebase action rather than a generic git.execute surface.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitRebaseBranchProvider(executor),
};
