import type { GitPushLocalChangesProviderPractice } from "./dependencies.js";
import { createHostExecutorGitPushLocalChangesProvider } from "./dependencies.js";

export const deepmindGitPushLocalChangesPractice: GitPushLocalChangesProviderPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini CLI git push practice with shell policy and repository ownership boundaries",
  },
  directCliSupport: true,
  sideEffectPolicy: "remote-network",
  notes: [
    "Gemini-style practice keeps remote Git effects inside shell policy and repository service ownership.",
    "Praxis translates that into a fixed git push action rather than a generic git.execute surface.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitPushLocalChangesProvider(executor),
};
