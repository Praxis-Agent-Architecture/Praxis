import type { GitApplyStashChangesProviderPractice } from "./dependencies.js";
import { createHostExecutorGitApplyStashChangesProvider } from "./dependencies.js";

export const deepmindGitApplyStashChangesPractice: GitApplyStashChangesProviderPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini CLI GitService-style ownership for git stash apply",
  },
  directCliSupport: true,
  sideEffectPolicy: "workspace-mutation",
  notes: [
    "Gemini-style practice separates Git service/runtime ownership from model-facing intent.",
    "Praxis maps that boundary to BaseToolExecutorPort.git.runGit while preserving fixed-action tool semantics.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitApplyStashChangesProvider(executor),
};
