import type { GitRevertCommitProviderPractice } from "./dependencies.js";
import { createHostExecutorGitRevertCommitProvider } from "./dependencies.js";

export const anthropicGitRevertCommitPractice: GitRevertCommitProviderPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code git revert practice through permissioned shell/tool execution",
  },
  directCliSupport: true,
  sideEffectPolicy: "history-mutation",
  notes: [
    "Claude-style practice treats revert commit as a permissioned Git history mutation.",
    "Praxis narrows that surface to fixed git revert argv and keeps approval outside the baseTool.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitRevertCommitProvider(executor),
};
