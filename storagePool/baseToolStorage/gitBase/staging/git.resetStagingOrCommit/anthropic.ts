import type { GitResetStagingOrCommitProviderPractice } from "./dependencies.js";
import { createHostExecutorGitResetStagingOrCommitProvider } from "./dependencies.js";

export const anthropicGitResetStagingOrCommitPractice: GitResetStagingOrCommitProviderPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code git reset practice through permissioned shell/tool execution",
  },
  directCliSupport: true,
  sideEffectPolicy: "history-mutation",
  notes: [
    "Claude-style practice treats reset as a high-risk write action behind explicit tool permission boundaries.",
    "Praxis narrows that surface to fixed git reset argv for unstage and commit reset intents.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitResetStagingOrCommitProvider(executor),
};
