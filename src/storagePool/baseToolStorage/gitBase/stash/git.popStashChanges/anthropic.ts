import type { GitPopStashChangesProviderPractice } from "./dependencies.js";
import { createHostExecutorGitPopStashChangesProvider } from "./dependencies.js";

export const anthropicGitPopStashChangesPractice: GitPopStashChangesProviderPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code git stash pop practice through permissioned shell/tool execution",
  },
  directCliSupport: true,
  sideEffectPolicy: "workspace-mutation",
  notes: [
    "Claude-style practice treats stash pop as a write action behind explicit tool permission boundaries.",
    "Praxis narrows that surface to fixed git stash pop argv for one stash ref.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitPopStashChangesProvider(executor),
};
