import type { GitInitializeRepositoryProviderPractice } from "./dependencies.js";
import { createHostExecutorGitInitializeRepositoryProvider } from "./dependencies.js";

export const deepmindGitInitializeRepositoryPractice: GitInitializeRepositoryProviderPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini CLI git init practice with shell policy and repository ownership boundaries",
  },
  directCliSupport: true,
  sideEffectPolicy: "workspace-mutation",
  notes: [
    "Gemini-style practice keeps git effects inside shell policy and repository service ownership.",
    "Praxis translates that into a fixed git init action rather than a generic git.execute surface.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitInitializeRepositoryProvider(executor),
};
