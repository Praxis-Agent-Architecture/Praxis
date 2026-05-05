import type { GitResetStagingOrCommitProviderPractice } from "./dependencies.js";
import { createHostExecutorGitResetStagingOrCommitProvider } from "./dependencies.js";

export const deepmindGitResetStagingOrCommitPractice: GitResetStagingOrCommitProviderPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini CLI GitService-style reset mutation",
  },
  directCliSupport: true,
  sideEffectPolicy: "history-mutation",
  notes: [
    "Gemini-style practice treats Git access as a runtime service concern with policy around mutations.",
    "Praxis maps that service boundary to BaseToolExecutorPort.git.runGit while preserving fixed-action tool semantics.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitResetStagingOrCommitProvider(executor),
};
