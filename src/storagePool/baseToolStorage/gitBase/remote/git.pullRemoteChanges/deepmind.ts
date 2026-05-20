import type { GitPullRemoteChangesProviderPractice } from "./dependencies.js";
import { createHostExecutorGitPullRemoteChangesProvider } from "./dependencies.js";

export const deepmindGitPullRemoteChangesPractice: GitPullRemoteChangesProviderPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini CLI git pull practice with shell policy and repository ownership boundaries",
  },
  directCliSupport: true,
  sideEffectPolicy: "remote-network",
  notes: [
    "Gemini-style practice keeps remote Git effects inside shell policy and repository service ownership.",
    "Praxis translates that into a fixed git pull action rather than a generic git.execute surface.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitPullRemoteChangesProvider(executor),
};
