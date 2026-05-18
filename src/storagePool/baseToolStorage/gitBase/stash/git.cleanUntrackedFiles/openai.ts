import type { GitCleanUntrackedFilesProviderPractice } from "./dependencies.js";
import { createHostExecutorGitCleanUntrackedFilesProvider } from "./dependencies.js";

export const openaiGitCleanUntrackedFilesPractice: GitCleanUntrackedFilesProviderPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex sandbox/runtime executor pattern for git clean untracked",
  },
  directCliSupport: true,
  sideEffectPolicy: "destructive",
  notes: [
    "Codex-style practice keeps host process execution behind sandbox/runtime ownership.",
    "Praxis storage builds fixed argv and delegates only BaseToolExecutorPort.git.runGit to runtime.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitCleanUntrackedFilesProvider(executor),
};
