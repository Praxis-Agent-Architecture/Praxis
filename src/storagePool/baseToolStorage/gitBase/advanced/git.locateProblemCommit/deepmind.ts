import type { GitLocateProblemCommitProviderPractice } from "./dependencies.js";
import { createHostExecutorGitLocateProblemCommitProvider } from "./dependencies.js";

export const deepmindGitLocateProblemCommitPractice: GitLocateProblemCommitProviderPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini CLI git history practice with shell policy and repository ownership boundaries",
  },
  directCliSupport: true,
  sideEffectPolicy: "read-only-inspection",
  notes: [
    "Gemini-style practice keeps git inspection inside shell policy and repository service ownership.",
    "Praxis translates that into a fixed git rev-list action rather than a generic git.execute surface.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitLocateProblemCommitProvider(executor),
};
