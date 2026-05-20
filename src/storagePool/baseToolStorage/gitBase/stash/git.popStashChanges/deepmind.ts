import type { GitPopStashChangesProviderPractice } from "./dependencies.js";
import { createHostExecutorGitPopStashChangesProvider } from "./dependencies.js";

export const deepmindGitPopStashChangesPractice: GitPopStashChangesProviderPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini CLI GitService-style ownership for git stash pop",
  },
  directCliSupport: true,
  sideEffectPolicy: "workspace-mutation",
  notes: [
    "Gemini-style practice separates Git service/runtime ownership from model-facing intent.",
    "Praxis maps that boundary to BaseToolExecutorPort.git.runGit while preserving fixed-action tool semantics.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitPopStashChangesProvider(executor),
};
