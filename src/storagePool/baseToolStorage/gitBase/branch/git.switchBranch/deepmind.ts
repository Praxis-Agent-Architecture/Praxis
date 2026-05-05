import type { GitSwitchBranchProviderPractice } from "./dependencies.js";
import { createHostExecutorGitSwitchBranchProvider } from "./dependencies.js";

export const deepmindGitSwitchBranchPractice: GitSwitchBranchProviderPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini CLI git switch practice with shell policy and repository ownership boundaries",
  },
  directCliSupport: true,
  sideEffectPolicy: "workspace-mutation",
  notes: [
    "Gemini-style practice keeps git effects inside shell policy and repository service ownership.",
    "Praxis translates that into a fixed git switch action rather than a generic git.execute surface.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitSwitchBranchProvider(executor),
};
