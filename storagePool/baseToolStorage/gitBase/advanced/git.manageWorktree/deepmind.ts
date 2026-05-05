import type { GitManageWorktreeProviderPractice } from "./dependencies.js";
import { createHostExecutorGitManageWorktreeProvider } from "./dependencies.js";

export const deepmindGitManageWorktreePractice: GitManageWorktreeProviderPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini CLI git worktree practice with shell policy and repository ownership boundaries",
  },
  directCliSupport: true,
  sideEffectPolicy: "workspace-mutation",
  notes: [
    "Gemini-style practice keeps git effects inside shell policy and repository service ownership.",
    "Praxis translates that into a fixed git worktree action rather than a generic git.execute surface.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitManageWorktreeProvider(executor),
};
