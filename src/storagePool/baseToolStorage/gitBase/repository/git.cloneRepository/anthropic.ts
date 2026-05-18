import type { GitCloneRepositoryProviderPractice } from "./dependencies.js";
import { createHostExecutorGitCloneRepositoryProvider } from "./dependencies.js";

export const anthropicGitCloneRepositoryPractice: GitCloneRepositoryProviderPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code git clone practice through permissioned shell/tool execution",
  },
  directCliSupport: true,
  sideEffectPolicy: "remote-network",
  notes: [
    "Claude-style practice treats clone as a permissioned Git and filesystem operation that may use the network.",
    "Praxis narrows that surface to fixed git clone argv and keeps approval outside the baseTool.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitCloneRepositoryProvider(executor),
};
