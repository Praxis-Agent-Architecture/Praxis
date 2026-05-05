import type { GitCherryPickCommitProviderPractice } from "./dependencies.js";
import { createHostExecutorGitCherryPickCommitProvider } from "./dependencies.js";

export const anthropicGitCherryPickCommitPractice: GitCherryPickCommitProviderPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code git cherry-pick practice through permissioned shell/tool execution",
  },
  directCliSupport: true,
  sideEffectPolicy: "history-mutation",
  notes: [
    "Claude-style practice treats cherry-pick commit as a permissioned Git history mutation.",
    "Praxis narrows that surface to fixed git cherry-pick argv and keeps approval outside the baseTool.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitCherryPickCommitProvider(executor),
};
