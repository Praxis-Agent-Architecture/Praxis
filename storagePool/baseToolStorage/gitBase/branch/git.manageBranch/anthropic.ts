import type { GitManageBranchProviderPractice } from "./dependencies.js";
import { createHostExecutorGitManageBranchProvider } from "./dependencies.js";

export const anthropicGitManageBranchPractice: GitManageBranchProviderPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code git branch practice through permissioned shell/tool execution",
  },
  directCliSupport: true,
  sideEffectPolicy: "history-mutation",
  notes: [
    "Claude-style practice treats branch creation, deletion, rename, and upstream changes as permissioned Git actions.",
    "Praxis narrows that surface to fixed git branch argv for list, create, delete, rename, and set-upstream.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitManageBranchProvider(executor),
};
