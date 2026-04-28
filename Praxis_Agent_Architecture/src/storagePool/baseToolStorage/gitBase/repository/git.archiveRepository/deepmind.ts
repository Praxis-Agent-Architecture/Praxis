import type { GitArchiveRepositoryProviderPractice } from "./dependencies.js";
import { createHostExecutorGitArchiveRepositoryProvider } from "./dependencies.js";

export const deepmindGitArchiveRepositoryPractice: GitArchiveRepositoryProviderPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini CLI git archive practice with shell policy and repository ownership boundaries",
  },
  directCliSupport: true,
  sideEffectPolicy: "workspace-mutation",
  notes: [
    "Gemini-style practice keeps git effects inside shell policy and repository service ownership.",
    "Praxis translates that into a fixed git archive action rather than a generic git.execute surface.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitArchiveRepositoryProvider(executor),
};
