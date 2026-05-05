import type { GitRestoreWorkingTreeProviderPractice } from "./dependencies.js";
import { createHostExecutorGitRestoreWorkingTreeProvider } from "./dependencies.js";

export const deepmindGitRestoreWorkingTreePractice: GitRestoreWorkingTreeProviderPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini CLI GitService-style worktree restore mutation",
  },
  directCliSupport: true,
  sideEffectPolicy: "workspace-mutation",
  notes: [
    "Gemini-style practice treats Git access as a runtime service concern with policy around mutations.",
    "Praxis maps that service boundary to BaseToolExecutorPort.git.runGit while preserving fixed-action tool semantics.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitRestoreWorkingTreeProvider(executor),
};
