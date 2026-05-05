import type { GitApplyStashChangesProviderPractice } from "./dependencies.js";
import { createHostExecutorGitApplyStashChangesProvider } from "./dependencies.js";

export const anthropicGitApplyStashChangesPractice: GitApplyStashChangesProviderPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code git stash apply practice through permissioned shell/tool execution",
  },
  directCliSupport: true,
  sideEffectPolicy: "workspace-mutation",
  notes: [
    "Claude-style practice treats stash apply as a write action behind explicit tool permission boundaries.",
    "Praxis narrows that surface to fixed git stash apply argv for one stash ref.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitApplyStashChangesProvider(executor),
};
