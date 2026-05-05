import type { GitRestoreWorkingTreeProviderPractice } from "./dependencies.js";
import { createHostExecutorGitRestoreWorkingTreeProvider } from "./dependencies.js";

export const anthropicGitRestoreWorkingTreePractice: GitRestoreWorkingTreeProviderPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code git restore practice through permissioned shell/tool execution",
  },
  directCliSupport: true,
  sideEffectPolicy: "workspace-mutation",
  notes: [
    "Claude-style practice treats worktree restore as a write action behind explicit tool permission boundaries.",
    "Praxis narrows that surface to fixed git restore --worktree argv for repository-relative paths.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitRestoreWorkingTreeProvider(executor),
};
