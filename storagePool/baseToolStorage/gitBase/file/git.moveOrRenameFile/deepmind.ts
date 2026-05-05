import type { GitMoveOrRenameFileProviderPractice } from "./dependencies.js";
import { createHostExecutorGitMoveOrRenameFileProvider } from "./dependencies.js";

export const deepmindGitMoveOrRenameFilePractice: GitMoveOrRenameFileProviderPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini CLI GitService-style ownership for git move or rename file",
  },
  directCliSupport: true,
  sideEffectPolicy: "workspace-mutation",
  notes: [
    "Gemini-style practice separates Git service/runtime ownership from model-facing intent.",
    "Praxis maps that boundary to BaseToolExecutorPort.git.runGit while preserving fixed-action tool semantics.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitMoveOrRenameFileProvider(executor),
};
