import type { GitCreateCommitProviderPractice } from "./dependencies.js";
import { createHostExecutorGitCreateCommitProvider } from "./dependencies.js";

export const deepmindGitCreateCommitPractice: GitCreateCommitProviderPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini CLI git commit practice with shell policy and repository ownership boundaries",
  },
  directCliSupport: true,
  sideEffectPolicy: "history-mutation",
  notes: [
    "Gemini-style practice keeps git effects inside shell policy and repository service ownership.",
    "Praxis translates that into a fixed git commit action rather than a generic git.execute surface.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitCreateCommitProvider(executor),
};
