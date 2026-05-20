import type { GitApplyStashChangesProviderPractice } from "./dependencies.js";
import { createHostExecutorGitApplyStashChangesProvider } from "./dependencies.js";

export const openaiGitApplyStashChangesPractice: GitApplyStashChangesProviderPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex sandbox/runtime executor pattern for git stash apply",
  },
  directCliSupport: true,
  sideEffectPolicy: "workspace-mutation",
  notes: [
    "Codex-style practice keeps host process execution behind sandbox/runtime ownership.",
    "Praxis storage builds fixed argv and delegates only BaseToolExecutorPort.git.runGit to runtime.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitApplyStashChangesProvider(executor),
};
