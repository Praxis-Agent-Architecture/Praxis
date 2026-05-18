import type { GitRemoveTrackedFileProviderPractice } from "./dependencies.js";
import { createHostExecutorGitRemoveTrackedFileProvider } from "./dependencies.js";

export const deepmindGitRemoveTrackedFilePractice: GitRemoveTrackedFileProviderPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini CLI GitService-style ownership for git remove tracked file",
  },
  directCliSupport: true,
  sideEffectPolicy: "destructive",
  notes: [
    "Gemini-style practice separates Git service/runtime ownership from model-facing intent.",
    "Praxis maps that boundary to BaseToolExecutorPort.git.runGit while preserving fixed-action tool semantics.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitRemoveTrackedFileProvider(executor),
};
