import type { GitMoveOrRenameFileProviderPractice } from "./dependencies.js";
import { createHostExecutorGitMoveOrRenameFileProvider } from "./dependencies.js";

export const anthropicGitMoveOrRenameFilePractice: GitMoveOrRenameFileProviderPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code git move or rename file practice through permissioned shell/tool execution",
  },
  directCliSupport: true,
  sideEffectPolicy: "workspace-mutation",
  notes: [
    "Claude-style practice treats git mv as a write action behind explicit tool permission boundaries.",
    "Praxis narrows that surface to fixed git mv argv for repository-relative source and destination paths.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitMoveOrRenameFileProvider(executor),
};
