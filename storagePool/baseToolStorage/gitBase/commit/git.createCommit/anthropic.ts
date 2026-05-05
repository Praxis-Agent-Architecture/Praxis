import type { GitCreateCommitProviderPractice } from "./dependencies.js";
import { createHostExecutorGitCreateCommitProvider } from "./dependencies.js";

export const anthropicGitCreateCommitPractice: GitCreateCommitProviderPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code git commit practice through permissioned shell/tool execution",
  },
  directCliSupport: true,
  sideEffectPolicy: "history-mutation",
  notes: [
    "Claude-style practice treats commit creation as a permissioned Git history mutation.",
    "Praxis narrows that surface to fixed git commit argv and keeps approval outside the baseTool.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitCreateCommitProvider(executor),
};
