import type { GitCleanUntrackedFilesProviderPractice } from "./dependencies.js";
import { createHostExecutorGitCleanUntrackedFilesProvider } from "./dependencies.js";

export const deepmindGitCleanUntrackedFilesPractice: GitCleanUntrackedFilesProviderPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini CLI GitService-style ownership for git clean untracked",
  },
  directCliSupport: true,
  sideEffectPolicy: "destructive",
  notes: [
    "Gemini-style practice separates Git service/runtime ownership from model-facing intent.",
    "Praxis maps that boundary to BaseToolExecutorPort.git.runGit while preserving fixed-action tool semantics.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitCleanUntrackedFilesProvider(executor),
};
