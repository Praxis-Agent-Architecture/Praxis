import type { GitManageBranchProviderPractice } from "./dependencies.js";
import { createHostExecutorGitManageBranchProvider } from "./dependencies.js";

export const deepmindGitManageBranchPractice: GitManageBranchProviderPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini CLI git branch practice with shell policy and repository ownership boundaries",
  },
  directCliSupport: true,
  sideEffectPolicy: "history-mutation",
  notes: [
    "Gemini-style practice keeps git effects inside shell policy and repository service ownership.",
    "Praxis translates that into a fixed git branch action rather than a generic git.execute surface.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitManageBranchProvider(executor),
};
