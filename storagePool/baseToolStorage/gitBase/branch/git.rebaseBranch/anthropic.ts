import type { GitRebaseBranchProviderPractice } from "./dependencies.js";
import { createHostExecutorGitRebaseBranchProvider } from "./dependencies.js";

export const anthropicGitRebaseBranchPractice: GitRebaseBranchProviderPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code git rebase practice through permissioned shell/tool execution",
  },
  directCliSupport: true,
  sideEffectPolicy: "workspace-mutation",
  notes: [
    "Claude-style practice treats rebase as a permissioned history mutation.",
    "Praxis narrows that surface to fixed git rebase argv for safe refs.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitRebaseBranchProvider(executor),
};
