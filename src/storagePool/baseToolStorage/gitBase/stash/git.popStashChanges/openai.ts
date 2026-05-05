import type { GitPopStashChangesProviderPractice } from "./dependencies.js";
import { createHostExecutorGitPopStashChangesProvider } from "./dependencies.js";

export const openaiGitPopStashChangesPractice: GitPopStashChangesProviderPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex sandbox/runtime executor pattern for git stash pop",
  },
  directCliSupport: true,
  sideEffectPolicy: "workspace-mutation",
  notes: [
    "Codex-style practice keeps host process execution behind sandbox/runtime ownership.",
    "Praxis storage builds fixed argv and delegates only BaseToolExecutorPort.git.runGit to runtime.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitPopStashChangesProvider(executor),
};
