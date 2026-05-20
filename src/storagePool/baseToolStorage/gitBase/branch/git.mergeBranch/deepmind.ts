import type { GitMergeBranchProviderPractice } from "./dependencies.js";
import { createHostExecutorGitMergeBranchProvider } from "./dependencies.js";

export const deepmindGitMergeBranchPractice: GitMergeBranchProviderPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini CLI git merge practice with shell policy and repository ownership boundaries",
  },
  directCliSupport: true,
  sideEffectPolicy: "workspace-mutation",
  notes: [
    "Gemini-style practice keeps git effects inside shell policy and repository service ownership.",
    "Praxis translates that into a fixed git merge action rather than a generic git.execute surface.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitMergeBranchProvider(executor),
};
