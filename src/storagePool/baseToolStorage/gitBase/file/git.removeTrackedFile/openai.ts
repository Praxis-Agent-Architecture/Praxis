import type { GitRemoveTrackedFileProviderPractice } from "./dependencies.js";
import { createHostExecutorGitRemoveTrackedFileProvider } from "./dependencies.js";

export const openaiGitRemoveTrackedFilePractice: GitRemoveTrackedFileProviderPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex sandbox/runtime executor pattern for git remove tracked file",
  },
  directCliSupport: true,
  sideEffectPolicy: "destructive",
  notes: [
    "Codex-style practice keeps host process execution behind sandbox/runtime ownership.",
    "Praxis storage builds fixed argv and delegates only BaseToolExecutorPort.git.runGit to runtime.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitRemoveTrackedFileProvider(executor),
};
