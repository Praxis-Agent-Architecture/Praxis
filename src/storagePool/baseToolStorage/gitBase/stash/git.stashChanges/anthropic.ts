import type { GitStashChangesProviderPractice } from "./dependencies.js";
import { createHostExecutorGitStashChangesProvider } from "./dependencies.js";

export const anthropicGitStashChangesPractice: GitStashChangesProviderPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code git stash practice through permissioned shell/tool execution",
  },
  directCliSupport: true,
  sideEffectPolicy: "workspace-mutation",
  notes: [
    "Claude-style practice treats stash push as a write action behind explicit tool permission boundaries.",
    "Praxis narrows that surface to fixed git stash push argv for repository-relative paths.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitStashChangesProvider(executor),
};
