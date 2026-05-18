import type { GitMoveOrRenameFileProviderPractice } from "./dependencies.js";
import { createHostExecutorGitMoveOrRenameFileProvider } from "./dependencies.js";

export const openaiGitMoveOrRenameFilePractice: GitMoveOrRenameFileProviderPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex sandbox/runtime executor pattern for git move or rename file",
  },
  directCliSupport: true,
  sideEffectPolicy: "workspace-mutation",
  notes: [
    "Codex-style practice keeps host process execution behind sandbox/runtime ownership.",
    "Praxis storage builds fixed argv and delegates only BaseToolExecutorPort.git.runGit to runtime.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitMoveOrRenameFileProvider(executor),
};
