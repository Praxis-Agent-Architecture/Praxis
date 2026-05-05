import type { GitAmendLastCommitProviderPractice } from "./dependencies.js";
import { createHostExecutorGitAmendLastCommitProvider } from "./dependencies.js";

export const anthropicGitAmendLastCommitPractice: GitAmendLastCommitProviderPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code git amend practice through permissioned shell/tool execution",
  },
  directCliSupport: true,
  sideEffectPolicy: "history-mutation",
  notes: [
    "Claude-style practice treats amend last commit as a permissioned Git history mutation.",
    "Praxis narrows that surface to fixed git commit --amend argv and keeps approval outside the baseTool.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitAmendLastCommitProvider(executor),
};
