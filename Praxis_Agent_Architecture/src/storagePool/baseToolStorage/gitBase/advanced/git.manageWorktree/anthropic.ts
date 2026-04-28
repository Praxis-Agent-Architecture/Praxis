import type { GitManageWorktreeProviderPractice } from "./dependencies.js";
import { createHostExecutorGitManageWorktreeProvider } from "./dependencies.js";

export const anthropicGitManageWorktreePractice: GitManageWorktreeProviderPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code git worktree practice through permissioned shell/tool execution",
  },
  directCliSupport: true,
  sideEffectPolicy: "workspace-mutation",
  notes: [
    "Claude-style practice treats worktree changes as permissioned Git operations.",
    "Praxis narrows that surface to fixed git worktree argv and keeps approval outside the baseTool.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitManageWorktreeProvider(executor),
};
