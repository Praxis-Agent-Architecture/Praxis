import type { GitAddToStagingProviderPractice } from "./dependencies.js";
import { createHostExecutorGitAddToStagingProvider } from "./dependencies.js";

export const deepmindGitAddToStagingPractice: GitAddToStagingProviderPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini CLI GitService-style staging mutation",
  },
  directCliSupport: true,
  sideEffectPolicy: "workspace-mutation",
  notes: [
    "Gemini-style practice treats git access as a runtime service concern.",
    "Praxis maps that service boundary to BaseToolExecutorPort.git.runGit while preserving fixed-action tool semantics.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitAddToStagingProvider(executor),
};
